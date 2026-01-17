
import { GoogleGenAI, Type } from "@google/genai";
import { BoundingBox, GeminiPartAnalysis, PartType, ViewType, PoseType, Modification } from "../types";
import { PART_LABELS } from "../constants";
import { getApiKey } from "../utils/keyStorage";

// Helper to remove data:image/...;base64, prefix
const stripBase64Prefix = (base64: string) => {
  return base64.split(',')[1] || base64;
};

// Retrieve API key from local storage or fallback to env
const getEffectiveApiKey = () => {
  const storedKey = getApiKey();
  if (storedKey) return storedKey;
  return process.env.API_KEY;
};

export const testApiKeyConnection = async (key: string): Promise<boolean> => {
    try {
        const ai = new GoogleGenAI({ apiKey: key });
        // Lightweight call to test connection
        await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: { parts: [{ text: "Hello" }] },
        });
        return true;
    } catch (e) {
        console.warn("API Key Test Failed", e);
        return false;
    }
};

export const analyzeCharacterImage = async (
  base64Image: string,
  customLabels: string[] = [] // New optional param
): Promise<GeminiPartAnalysis | null> => {
  try {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) {
      console.error("No API KEY found");
      return null;
    }

    const ai = new GoogleGenAI({ apiKey });

    // Schema definition for strictly typed JSON output
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        face: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for the Face only (Chin to Hairline).",
        },
        hair: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for the Hair (Full volume including long hair).",
        },
        hat: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Hat/Helmet/Hair. Return [0,0,0,0] if not present.",
        },
        jacket: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Jacket/Coat/Outerwear. If the character is just wearing a shirt, return [0,0,0,0]. This is for the layer OVER the top.",
        },
        top: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Upper Body Clothing (Shirt/Inner Layer).",
        },
        bottom: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Lower Body Clothing.",
        },
        shoes: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Shoes/Boots. Return [0,0,0,0] if barefoot/not visible.",
        },
        gloves: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Gloves. If bare hands, return [0,0,0,0] unless they have specific markings.",
        },
        weapon: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Weapon/Held Item. STRICTLY return [0,0,0,0] if no weapon is visible.",
        },
        bag: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for Bag, Backpack, Pouch, or Holster. Return [0,0,0,0] if not present.",
        },
        accessory: {
          type: Type.ARRAY,
          items: { type: Type.NUMBER },
          description: "Bounding box [ymin, xmin, ymax, xmax] for distinctive accessories like Necklaces, Belts, Jewelry, Scanners, or Gadgets. Return [0,0,0,0] if none.",
        },
        // Dynamic custom parts
        custom: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    label: { type: Type.STRING },
                    box: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                }
            },
            description: "List of bounding boxes for the specifically requested CUSTOM parts. If a part is not found, return [0,0,0,0] for its box."
        }
      },
      required: ["face", "hair", "hat", "jacket", "top", "bottom", "shoes", "gloves", "weapon", "bag", "accessory"],
    };

    let customInstruction = "";
    if (customLabels && customLabels.length > 0) {
        customInstruction = `
        ADDITIONAL TASK:
        The user has also requested the following CUSTOM parts: ${JSON.stringify(customLabels)}.
        Please locate them in the image.
        For each custom label found, add an entry to the "custom" array in the JSON response with the matching "label" and its "box" [ymin, xmin, ymax, xmax].
        If a custom part is not visible, use [0,0,0,0].
        `;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", 
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png", 
              data: stripBase64Prefix(base64Image),
            },
          },
          {
            text: `Analyze this character image. Locate the bounding boxes for the requested parts.
            
            IMPORTANT:
            - If a part (like Weapon, Hat, Jacket, Gloves, or Bag) does NOT exist, you MUST return [0,0,0,0]. Do not guess.
            - For Jacket, only mark if there is a distinct outer layer (coat, jacket, cloak).
            - For Weapon, only select if holding an object.
            
            ${customInstruction}
            
            Return coordinates [ymin, xmin, ymax, xmax] on 0-1000 scale.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text) as GeminiPartAnalysis;
      return data;
    }
    
    return null;

  } catch (error) {
    console.error("Error analyzing image with Gemini:", error);
    return null;
  }
};

export const generateCharacterFromText = async (
    prompt: string,
    refImage: string | null
): Promise<string | null> => {
    try {
        const apiKey = getEffectiveApiKey();
        if (!apiKey) return null;
        
        const ai = new GoogleGenAI({ apiKey });

        const parts: any[] = [];
        
        // Add Reference Image if provided
        if (refImage) {
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: stripBase64Prefix(refImage),
                }
            });
        }

        parts.push({
            text: `Create a high-quality character concept art.
            
            CHARACTER DESCRIPTION:
            "${prompt}"
            
            REQUIREMENTS:
            - VIEW: Full-body FRONT View. Head to toe visible.
            - POSE: Standing A-Pose (Arms angled down 45 degrees, Legs together).
            - BACKGROUND: Pure White (Hex #FFFFFF).
            - STYLE: Concept Art / Character Design Sheet style. High definition.
            
            ${refImage ? "IMPORTANT: Use the attached image as a STYLE or COMPOSITION reference, but follow the text description for the character details." : ""}
            `
        });

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: { parts },
            config: {
                imageConfig: {
                    aspectRatio: "3:4"
                }
            }
        });

        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    const rawImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                    return rawImage;
                }
            }
        }
        return null;
    } catch (error) {
        console.warn("Failed to generate character from text", error);
        return null;
    }
};

export const generateCharacterView = async (
  frontViewBase64: string,
  targetView: ViewType,
  pose: PoseType = PoseType.A_POSE,
  modifications: Modification[] = [],
  additionalContextImage: string | null = null
): Promise<string | null> => {
  try {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) return null;

    const ai = new GoogleGenAI({ apiKey });
    
    // Strict leg instruction for ALL views/poses
    const legsInstruction = "Legs must be TIGHTLY CLOSED together. Feet touching. No gap between thighs or knees. Standing completely straight.";

    // Define pose instructions
    let poseInstruction = `Standing A-Pose (Arms angled down 45 degrees). ${legsInstruction}`;
    
    if (pose === PoseType.T_POSE) {
      if (targetView === ViewType.SIDE) {
        poseInstruction = `Static Side View.
        POSE: T-POSE.
        ORIENTATION: Character facing RIGHT (Profile).
        Arms extended horizontally to the sides (Standard T-Pose).
        Ensure clean rendering of the character profile.
        ${legsInstruction}`;
      } else {
        // Front/Back View T-Pose
        poseInstruction = `Static T-Pose (Arms extended straight out to the SIDES at 90 degrees). ${legsInstruction}`;
      }
    } else if (pose === PoseType.I_POSE) {
      poseInstruction = `Static I-Pose (Arms straight down by sides). ${legsInstruction}`;
    } else {
      // A-POSE
      poseInstruction = `Static A-Pose (Arms angled down 45 degrees). ${legsInstruction}`;
    }

    let viewDescription = "";
    if (targetView === ViewType.SIDE) {
      viewDescription = "Full-body SIDE view (profile). Facing Right.";
    } else if (targetView === ViewType.BACK) {
      viewDescription = "Full-body BACK view (rear).";
    } else if (targetView === ViewType.SEMI_SIDE) {
      viewDescription = "3/4 Semi-Side View (45 degree angle). Showing depth and volume.";
      
      // Apply the selected pose rotated 45 degrees
      if (pose === PoseType.T_POSE) {
          poseInstruction = `Standing T-Pose (Arms extended 90 degrees), body rotated 45 degrees relative to camera. ${legsInstruction}`;
      } else if (pose === PoseType.I_POSE) {
          poseInstruction = `Standing I-Pose (Arms straight down), body rotated 45 degrees relative to camera. ${legsInstruction}`;
      } else {
          // Default A-Pose
          poseInstruction = `Standing A-Pose (Arms angled down 45 degrees), body rotated 45 degrees relative to camera. ${legsInstruction}`;
      }
    } else if (targetView === ViewType.FRONT) {
      viewDescription = "Full-body FRONT view. Showing entire character from head to toe.";
    } else {
      return null;
    }

    // Build the content parts
    const contentParts: any[] = [
        {
          inlineData: {
            mimeType: "image/png",
            data: stripBase64Prefix(frontViewBase64),
          }
        }
    ];

    // Add additional context if provided (e.g., 3/4 view)
    if (additionalContextImage) {
        contentParts.push({
            inlineData: {
                mimeType: "image/png",
                data: stripBase64Prefix(additionalContextImage),
            }
        });
    }

    let modificationInstruction = "";

    // Process modification history
    if (modifications && modifications.length > 0) {
        modificationInstruction += `
        IMPORTANT USER REFINEMENT HISTORY (Apply sequentially to this view):
        The user has explicitly requested the following changes to be applied on top of the generated ${targetView} view.
        These are listed in chronological order (Steps 1 to ${modifications.length}):
        `;
        
        modifications.forEach((mod, index) => {
            modificationInstruction += `\n[STEP ${index + 1}] Request: "${mod.prompt}"`;
            
            if (mod.image) {
                // Attach the image to the payload
                contentParts.push({
                    inlineData: {
                        mimeType: "image/png",
                        data: stripBase64Prefix(mod.image),
                    }
                });
                modificationInstruction += ` (See attached reference image for Step ${index + 1})`;
            }
        });
        
        modificationInstruction += `\n
        INSTRUCTION:
        - The Goal is to generate the ${viewDescription}.
        - Apply these modifications cumulatively.
        - These requests OVERRIDE the fidelity to the original source images for the specific details mentioned.
        `;
    }

    const additionalContextInstruction = additionalContextImage 
        ? "NOTE: A 3/4 Semi-Side view has been provided as the SECOND image. Use this to better understand the character's volume, depth, and side details when generating the target view." 
        : "";

    contentParts.push({
        text: `Generate a ${viewDescription} of this exact character.
        
        REQUIREMENTS:
        - POSE: ${poseInstruction}. This is CRITICAL. The character must be in this specific pose.
        - STYLE: CRITICAL! You must MATCH THE ART STYLE of the original image EXACTLY.
          - If the input is a real photo (photorealistic), generate a PHOTOREALISTIC image.
          - If the input is 3D render, generate 3D render.
          - If the input is Anime/2D, generate Anime/2D.
        - FIDELITY: Maintain the EXACT costume details, colors, and textures of the provided image. Do not simplify or change design elements.
        - Background: Pure White (Hex #FFFFFF). Solid color. No shadows, no gradients.
        - Output: Single character image.
        - IF generating a FRONT view: Standardize the pose to the requested ${poseInstruction}. If the input is a close-up, extrapolate the body while keeping existing details 1:1.

        ${additionalContextInstruction}

        ${modificationInstruction}
        `
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: contentParts
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4" // Portrait for full body
        }
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const rawImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          return rawImage;
        }
      }
    }
    return null;

  } catch (error) {
    console.warn(`Failed to generate ${targetView} view`, error);
    return null;
  }
};

export const extractColorPalette = async (
  base64Image: string
): Promise<string[]> => {
  try {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) return [];
    
    const ai = new GoogleGenAI({ apiKey });
    
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        colors: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of 6-8 HEX color codes (e.g. #FF0000) representing the character's primary, secondary, and accent colors.",
        }
      }
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: stripBase64Prefix(base64Image)
            }
          },
          {
            text: "Analyze the image and extract the distinct color palette (Skin, Hair, Outfit Main, Outfit Secondary, Accents). Return 6-8 Hex codes."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data.colors || [];
    }
    return [];

  } catch (error) {
    console.warn("Failed to extract color palette", error);
    return [];
  }
};

export const generateCompositeSheet = async (
  crops: string[], // Array of base64 strings
  partType: string,
  partLabel: string, // New explicit label
  modifications: Modification[] = [],
  stylePrompt?: string 
): Promise<string | null> => {
  try {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) return null;
    if (crops.length === 0) return null;

    const ai = new GoogleGenAI({ apiKey });
    
    // Use the passed label, fallback to "Part" if something is wrong
    const labelToUse = partLabel || "Part";

    // Prepare contents: Text prompt + all image parts
    const contentParts = crops.map(crop => ({
      inlineData: {
        mimeType: "image/png",
        data: stripBase64Prefix(crop),
      }
    }));

    let specificInstruction = "";

    switch (partType) {
        case PartType.FACE:
            specificInstruction = `
            CRITICAL REQUIREMENT FOR FACE:
            - Focus purely on the character's facial features and expression.
            - HAIR STYLE CHANGE: The character MUST be BALD (No Hair). Remove all hair from the head to fully expose the skull shape, forehead, ears, and facial structure.
            - REMOVE the neck and body.
            - LAYOUT: Horizontal row. Order from LEFT to RIGHT: [Front View] [Semi-Side / 3/4 View (45 degree)] [Full Side View (Profile)].
            - Ensure high fidelity to the original eyes, nose, mouth style.
            `;
            break;
        case PartType.HAIR:
            specificInstruction = `
            CRITICAL REQUIREMENT FOR HAIR:
            - Focus purely on the hair structure and style.
            - Include the head shape for context but minimize facial details (use a mannequin or blank face if needed to emphasize hair).
            - LAYOUT: Horizontal row. Order from LEFT to RIGHT: [Front View] [Side View] [Back View].
            `;
            break;
        case PartType.JACKET:
            specificInstruction = `
            CRITICAL REQUIREMENT FOR JACKET/OUTERWEAR:
            - ISOLATE the jacket/coat/cloak completely. 
            - If it is open, show the inside lining in the breakdown.
            - REMOVE the character's head, hands, and legs.
            - Pose: Static A-Pose or T-Pose on a mannequin.
            - LAYOUT: Horizontal row. Order from LEFT to RIGHT: [Front View] [Side View] [Back View].
            - Do not include the inner shirt if possible, focus on the outer layer.
            `;
            break;
        case PartType.TOP:
        case PartType.BOTTOM:
            specificInstruction = `
            CRITICAL REQUIREMENT FOR CLOTHING:
            - ISOLATE the clothing item completely.
            - REMOVE the character's head, hands, legs, and feet.
            - Draw ONLY the ${labelToUse}.
            - Pose: Static, neutral A-Pose (symmetrical).
            - LAYOUT: Horizontal row. Order from LEFT to RIGHT: [Front View] [Side View] [Back View].
            - Do not include skin or body parts, just the fabric/armor.
            `;
            break;
        case PartType.GLOVES:
            specificInstruction = `
            CRITICAL REQUIREMENT FOR GLOVES:
            - You MUST generate both the PALM view and the BACK (Dorsal) view of the glove.
            - If the input only shows one side, infer the other side based on symmetry and functional design.
            - Isolate the glove. Do not show the rest of the arm or body.
            - LAYOUT: Horizontal row.
            `;
            break;
        case PartType.SHOES:
            specificInstruction = `
            - Show Front, Side, and Back views of the shoes.
            - Isolate the shoes. Do not show the legs above the ankle.
            - LAYOUT: Horizontal row. Order from LEFT to RIGHT: [Front View] [Side View] [Back View].
            `;
            break;
        case PartType.WEAPON:
            specificInstruction = `
            - Isolate the weapon completely.
            - Show the weapon in full view (Side view usually best) plus details.
            - Do not show the character's hands holding it.
            - LAYOUT: Wide Horizontal view.
            `;
            break;
        case PartType.BAG:
            specificInstruction = `
            CRITICAL REQUIREMENT FOR BAG/BACKPACK:
            - Isolate the bag completely from the character's back/body.
            - Show straps, buckles, and opening mechanisms clearly.
            - LAYOUT: Horizontal row. Order from LEFT to RIGHT: [Front/Outer View] [Side Profile View] [Inner/Wearer Side View].
            `;
            break;
        case PartType.ACCESSORY:
            specificInstruction = `
            CRITICAL REQUIREMENT FOR ACCESSORY:
            - Isolate this specific accessory (e.g., jewelry, belt, scanner, gadget, helmet).
            - Zoom in significantly to show fine details.
            - Show it from multiple angles if complex.
            - LAYOUT: Horizontal row or grid of detailed shots.
            `;
            break;
        default:
             // Default for custom parts
             specificInstruction = `
             CRITICAL REQUIREMENT FOR CUSTOM PART: "${labelToUse}"
             - NOTE: The user has provided FULL BODY IMAGES. You must LOCATE the "${labelToUse}" within these images yourself.
             - TASK: Identify and ISOLATE the specific item or body part described as "${labelToUse}".
             - Zoom in on this specific detail. Do not simply output the whole image again.
             - Show Front, Side, and Back views if applicable, or a detailed close-up.
             - Remove irrelevant surrounding body parts.
             - LAYOUT: Horizontal row. Order from LEFT to RIGHT: [Front View] [Side View] [Back View].
             `;
             break;
    }

    let modificationInstruction = "";
    
    // Process modification history
    if (modifications && modifications.length > 0) {
        modificationInstruction += `
        IMPORTANT USER REFINEMENT HISTORY (Apply sequentially):
        The user has explicitly requested the following changes to be applied on top of the original design.
        These are listed in chronological order (Steps 1 to ${modifications.length}):
        `;
        
        modifications.forEach((mod, index) => {
            modificationInstruction += `\n[STEP ${index + 1}] Request: "${mod.prompt}"`;
            
            if (mod.image) {
                // Attach the image to the payload
                contentParts.push({
                    inlineData: {
                        mimeType: "image/png",
                        data: stripBase64Prefix(mod.image),
                    }
                });
                modificationInstruction += ` (See attached reference image for Step ${index + 1})`;
            }
        });
        
        modificationInstruction += `\n
        INSTRUCTION:
        - Apply these modifications cumulatively. 
        - These requests OVERRIDE the fidelity to the original source images for the specific details mentioned. 
        - For all other details NOT mentioned in the history, maintain strict fidelity to the original character design.
        `;
    }

    // Determine style instruction
    let styleInstruction = `
      - STYLE: Match the source image style exactly.
          - If source is REAL PHOTO -> Output PHOTOREALISTIC.
          - If source is 2D/Anime -> Output 2D/Anime.
    `;
    
    if (stylePrompt && stylePrompt.trim()) {
        styleInstruction = `
        - STYLE OVERRIDE: The user has explicitly requested a specific style: "${stylePrompt}".
        - INSTRUCTION: Generate the sheet using this style (e.g., if "Sketch", use loose lines; if "3D", use rendering).
        - Maintain the structural design of the character, but change the rendering technique to match "${stylePrompt}".
        `;
    }

    contentParts.push({
      // @ts-ignore
      text: `You are a professional concept artist creating a design specification sheet for a 3D modeler.
      
      Target Part: ${labelToUse}
      
      ${specificInstruction}
      
      ${modificationInstruction}

      GENERAL RULES:
      - IMAGE RATIO: Wide Landscape (16:9). Do NOT generate square images.
      ${styleInstruction}
      - FIDELITY: The provided images are the ABSOLUTE GROUND TRUTH. Do not hallucinate details that contradict the source images, UNLESS explicitly instructed by the "USER REFINEMENT HISTORY" above.
      - Background: Pure White. Solid color. No shadows.
      - Layout: Cleanly arranged views horizontally.
      - If the source images provided do not contain this part (e.g. empty or black images), do not generate anything.
      `
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: contentParts
      },
      config: {
        imageConfig: {
            aspectRatio: "16:9"
        }
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const rawImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          return rawImage;
        }
      }
    }

    return null;

  } catch (error) {
    console.warn(`Failed to generate composite sheet for ${partType}`, error);
    return null;
  }
};

export const upscaleImage = async (
  base64Image: string,
  aspectRatio: string = "1:1"
): Promise<string | null> => {
  try {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) return null;

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: stripBase64Prefix(base64Image),
            }
          },
          {
            text: `Strictly upscale this image to 4K resolution. Increase pixel density and sharpness. 
            
            CRITICAL RULES:
            1. DO NOT change the art style, brush strokes, or aesthetic.
            2. DO NOT alter the character's design, colors, or composition.
            3. DO NOT add new elements or reimagine the image.
            4. Maintain 100% fidelity to the source image.
            5. The output must look EXACTLY like the input, but sharper and higher resolution.
            
            Task: Super-resolution and Denoising ONLY.`
          }
        ]
      },
      config: {
        imageConfig: {
          imageSize: "4K",
          aspectRatio: aspectRatio
        }
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const rawImage = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
          return rawImage;
        }
      }
    }
    return null;
  } catch (error) {
    console.warn("Failed to upscale image", error);
    return null;
  }
};
