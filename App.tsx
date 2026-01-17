
import React, { useState, useMemo, useRef, useEffect } from "react";
import { AppState, ViewType, PartType, CharacterPart, BoundingBox, CharacterView, PoseType, Modification, CustomPart, Language, ViewHistoryItem, PartHistoryItem } from "./types";
import { getInitialAppState, PART_LABELS, INITIAL_VIEW_STATE, POSE_LABELS, TRANSLATIONS } from "./src/constants";
import { ImageUploader } from "./components/ImageUploader";
import { CharacterSheet } from "./components/CharacterSheet";
import { analyzeCharacterImage, generateCompositeSheet, generateCharacterView, extractColorPalette, generateCharacterFromText, upscaleImage, testApiKeyConnection } from "./services/geminiService";
import { cropImage } from "./utils/imageUtils";
import { Loader2, Wand2, RefreshCw, Layers, Check, Square, CheckSquare, Zap, Eye, Accessibility, Sparkles, FileImage, Type as TypeIcon, Info, AlertTriangle, Palette, Plus, Trash2, X, ShieldAlert, Globe, Coffee, Heart, Key, ExternalLink } from "lucide-react";
import { Mascot } from "./components/Mascot";
import { saveApiKey, getApiKey, clearApiKey, hasApiKey } from "./utils/keyStorage";

// Modal Component
const Modal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}> = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
            <div className="bg-white w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-scale-in rounded-lg" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h2 className="text-xl font-black uppercase tracking-widest text-[#0F4C81] flex items-center gap-2">
                        <Mascot size={28} /> {title}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-red-500">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-8 overflow-y-auto">
                    {children}
                </div>
                <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
                    <button onClick={onClose} className="px-6 py-2 bg-slate-800 text-white font-bold rounded hover:bg-black transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(getInitialAppState());
  
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Concurrency Support
  const [processingViews, setProcessingViews] = useState<ViewType[]>([]); 
  const [upscalingViews, setUpscalingViews] = useState<ViewType[]>([]);
  // Changed from single part string to array for batch support
  const [upscalingParts, setUpscalingParts] = useState<string[]>([]);
  const [globalProgress, setGlobalProgress] = useState(0); 
  
  const [isMultiView, setIsMultiView] = useState(false); 
  const [isSingleViewMode, setIsSingleViewMode] = useState(false); 
  const [isTextMode, setIsTextMode] = useState(false); 
  
  // Selection state for Batch View Operations
  const [selectedViewIds, setSelectedViewIds] = useState<ViewType[]>([ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK]);

  // Reference Balance State (0 = Original Only, 10 = Generated Only, 5 = Both)
  const [referenceBalance, setReferenceBalance] = useState<number>(5);

  // Language State
  const [language, setLanguage] = useState<Language>(Language.KO);
  const t = TRANSLATIONS[language];

  // Text Mode States
  const [textPrompt, setTextPrompt] = useState("");
  const [textRefImage, setTextRefImage] = useState<string | null>(null);

  // Custom Part Input State
  const [customPartInput, setCustomPartInput] = useState("");

  const [statusText, setStatusText] = useState(t.status_waiting);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Modal State
  const [activeModal, setActiveModal] = useState<'usage' | 'patch' | 'coffee' | 'apikey' | null>(null);
  
  // Copyright Confirmation State
  const [showCopyrightWarning, setShowCopyrightWarning] = useState(false);

  // API Key State (Internal for Modal)
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<string | null>(null);
  
  // API Key Status for UI (Reactive)
  const [hasKeyConfigured, setHasKeyConfigured] = useState(false);

  // Controls the visibility of the detailed part rows (Step 2)
  const [showDetailSheets, setShowDetailSheets] = useState(false);
  
  // State for selecting which parts to generate
  const [selectedParts, setSelectedParts] = useState<string[]>(Object.values(PartType));
  const [targetPose, setTargetPose] = useState<PoseType>(PoseType.A_POSE);

  useEffect(() => {
      // Check for existing API key on load
      const existingKey = getApiKey();
      if (existingKey) {
          setApiKeyInput(existingKey);
          setHasKeyConfigured(true);
      } else {
          setHasKeyConfigured(false);
      }
  }, []);

  const hasAllViews = useMemo(() => {
      if (isSingleViewMode) {
          return !!appState.views[ViewType.FRONT].originalImage;
      }
      return !!(appState.views[ViewType.FRONT].originalImage && 
                appState.views[ViewType.SEMI_SIDE].originalImage && 
                appState.views[ViewType.SIDE].originalImage && 
                appState.views[ViewType.BACK].originalImage);
  }, [appState.views, isSingleViewMode]);

  // Helper to enforce API Key presence
  const verifyApiKey = (): boolean => {
      if (!hasApiKey() && !process.env.API_KEY) {
          alert(t.no_key_warning);
          setActiveModal('apikey');
          return false;
      }
      return true;
  };

  // --- LOCAL HISTORY MANAGEMENT ---
  const HISTORY_LIMIT = 10;

  const recordViewHistory = (view: ViewType) => {
      setAppState(prev => {
          const viewData = prev.views[view];
          const newItem: ViewHistoryItem = {
              originalImage: viewData.originalImage,
              generatedImage: viewData.generatedImage,
              modifications: viewData.modifications
          };
          
          let newUndo = [...viewData.history.undoStack, newItem];
          if (newUndo.length > HISTORY_LIMIT) {
              newUndo = newUndo.slice(newUndo.length - HISTORY_LIMIT);
          }

          return {
              ...prev,
              views: {
                  ...prev.views,
                  [view]: {
                      ...viewData,
                      history: {
                          undoStack: newUndo,
                          redoStack: [] // Clear redo on new action
                      }
                  }
              }
          };
      });
  };

  const recordPartHistory = (part: string) => {
      setAppState(prev => {
          const sheet = prev.generatedSheets[part];
          const newItem: PartHistoryItem = {
              imgUrl: sheet.imgUrl,
              modifications: sheet.modifications
          };

          let newUndo = [...sheet.history.undoStack, newItem];
          if (newUndo.length > HISTORY_LIMIT) {
              newUndo = newUndo.slice(newUndo.length - HISTORY_LIMIT);
          }

          return {
              ...prev,
              generatedSheets: {
                  ...prev.generatedSheets,
                  [part]: {
                      ...sheet,
                      history: {
                          undoStack: newUndo,
                          redoStack: []
                      }
                  }
              }
          };
      });
  };

  const handleViewUndo = (view: ViewType) => {
      setAppState(prev => {
          const viewData = prev.views[view];
          const undoStack = viewData.history.undoStack;
          if (undoStack.length === 0) return prev;

          const previousState = undoStack[undoStack.length - 1];
          const newUndoStack = undoStack.slice(0, undoStack.length - 1);

          // Current state becomes redo item
          const redoItem: ViewHistoryItem = {
              originalImage: viewData.originalImage,
              generatedImage: viewData.generatedImage,
              modifications: viewData.modifications
          };

          return {
              ...prev,
              views: {
                  ...prev.views,
                  [view]: {
                      ...viewData,
                      originalImage: previousState.originalImage,
                      generatedImage: previousState.generatedImage,
                      modifications: previousState.modifications,
                      history: {
                          undoStack: newUndoStack,
                          redoStack: [...viewData.history.redoStack, redoItem]
                      }
                  }
              }
          };
      });
  };

  const handleViewRedo = (view: ViewType) => {
      setAppState(prev => {
          const viewData = prev.views[view];
          const redoStack = viewData.history.redoStack;
          if (redoStack.length === 0) return prev;

          const nextState = redoStack[redoStack.length - 1];
          const newRedoStack = redoStack.slice(0, redoStack.length - 1);

          // Current state becomes undo item
          const undoItem: ViewHistoryItem = {
              originalImage: viewData.originalImage,
              generatedImage: viewData.generatedImage,
              modifications: viewData.modifications
          };

          return {
              ...prev,
              views: {
                  ...prev.views,
                  [view]: {
                      ...viewData,
                      originalImage: nextState.originalImage,
                      generatedImage: nextState.generatedImage,
                      modifications: nextState.modifications,
                      history: {
                          undoStack: [...viewData.history.undoStack, undoItem],
                          redoStack: newRedoStack
                      }
                  }
              }
          };
      });
  };

  const handlePartUndo = (part: string) => {
      setAppState(prev => {
          const sheet = prev.generatedSheets[part];
          const undoStack = sheet.history.undoStack;
          if (undoStack.length === 0) return prev;

          const previousState = undoStack[undoStack.length - 1];
          const newUndoStack = undoStack.slice(0, undoStack.length - 1);

          const redoItem: PartHistoryItem = {
              imgUrl: sheet.imgUrl,
              modifications: sheet.modifications
          };

          return {
              ...prev,
              generatedSheets: {
                  ...prev.generatedSheets,
                  [part]: {
                      ...sheet,
                      imgUrl: previousState.imgUrl,
                      modifications: previousState.modifications,
                      history: {
                          undoStack: newUndoStack,
                          redoStack: [...sheet.history.redoStack, redoItem]
                      }
                  }
              }
          };
      });
  };

  const handlePartRedo = (part: string) => {
      setAppState(prev => {
          const sheet = prev.generatedSheets[part];
          const redoStack = sheet.history.redoStack;
          if (redoStack.length === 0) return prev;

          const nextState = redoStack[redoStack.length - 1];
          const newRedoStack = redoStack.slice(0, redoStack.length - 1);

          const undoItem: PartHistoryItem = {
              imgUrl: sheet.imgUrl,
              modifications: sheet.modifications
          };

          return {
              ...prev,
              generatedSheets: {
                  ...prev.generatedSheets,
                  [part]: {
                      ...sheet,
                      imgUrl: nextState.imgUrl,
                      modifications: nextState.modifications,
                      history: {
                          undoStack: [...sheet.history.undoStack, undoItem],
                          redoStack: newRedoStack
                      }
                  }
              }
          };
      });
  };

  const updateViewState = (view: ViewType, updates: Partial<CharacterView>) => {
    setAppState(prev => ({
      ...prev,
      views: {
        ...prev.views,
        [view]: { ...prev.views[view], ...updates }
      }
    }));
  };

  const togglePartSelection = (part: string) => {
    setSelectedParts(prev => 
      prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
    );
  };

  const toggleViewSelection = (view: ViewType) => {
      setSelectedViewIds(prev => 
        prev.includes(view) ? prev.filter(v => v !== view) : [...prev, view]
      );
  };

  const handleUpload = (view: ViewType, base64: string) => {
    updateViewState(view, {
      originalImage: base64,
      userUploadedImage: base64, 
      parts: INITIAL_VIEW_STATE(view).parts 
    });
  };

  const handleSwapViewImage = (view: ViewType, type: 'user' | 'generated') => {
      setAppState(prev => {
          const viewData = prev.views[view];
          const targetImage = type === 'user' ? viewData.userUploadedImage : viewData.generatedImage;
          
          if (!targetImage) return prev; 

          return {
              ...prev,
              views: {
                  ...prev.views,
                  [view]: {
                      ...viewData,
                      originalImage: targetImage
                  }
              }
          };
      });
  };

  const handleAddManualReference = (part: string, base64: string | null) => {
    if (!base64) return;
    setAppState(prev => ({
      ...prev,
      manualReferences: {
        ...prev.manualReferences,
        [part]: [...(prev.manualReferences[part] || []), base64]
      }
    }));
  };

  const handleRemoveManualReference = (part: string, index: number) => {
    setAppState(prev => ({
      ...prev,
      manualReferences: {
        ...prev.manualReferences,
        [part]: prev.manualReferences[part].filter((_, i) => i !== index)
      }
    }));
  };

  const handleRemovePartCrop = (view: ViewType, part: string) => {
    setAppState(prev => ({
      ...prev,
      views: {
        ...prev.views,
        [view]: {
          ...prev.views[view],
          parts: {
            ...prev.views[view].parts,
            [part]: null
          }
        }
      }
    }));
  };

  const handleClear = (view: ViewType) => {
    updateViewState(view, INITIAL_VIEW_STATE(view));
  };

  const handleResetProject = () => {
    setAppState(getInitialAppState());
    setSelectedParts(Object.values(PartType));
    setSelectedViewIds([ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK]);
    setShowDetailSheets(false);
    setIsMultiView(false);
    setIsSingleViewMode(false);
    setIsTextMode(false);
    setTextPrompt("");
    setTextRefImage(null);
    setCustomPartInput("");
    setErrorMsg(null);
    setIsProcessing(false);
    setGlobalProgress(0);
    setStatusText(t.status_waiting);
    setReferenceBalance(5); // Reset balance
  };

  const handleToggleSingleView = () => {
    if (isSingleViewMode) {
      setIsSingleViewMode(false);
    } else {
      setIsSingleViewMode(true);
      setIsMultiView(false);
      setIsTextMode(false);
    }
  };

  const handleToggleTextMode = () => {
    if (isTextMode) {
      setIsTextMode(false);
    } else {
      setIsTextMode(true);
      setIsMultiView(false);
      setIsSingleViewMode(false);
    }
  };

  const handleStylePromptChange = (val: string) => {
    setAppState(prev => ({
      ...prev,
      globalStylePrompt: val
    }));
  };

  // --- CUSTOM PARTS LOGIC ---
  const handleAddCustomPart = () => {
      if (!customPartInput.trim()) return;

      const newId = `custom_${Date.now()}`;
      const newPart: CustomPart = { id: newId, label: customPartInput.trim() };
      
      setAppState(prev => ({
          ...prev,
          customParts: [...prev.customParts, newPart],
          generatedSheets: {
              ...prev.generatedSheets,
              [newId]: { partType: newId, imgUrl: null, isLoading: false, modifications: [], history: { undoStack: [], redoStack: [] } }
          },
          manualReferences: {
              ...prev.manualReferences,
              [newId]: []
          }
      }));
      setSelectedParts(prev => [...prev, newId]);
      setCustomPartInput(""); 
  };

  const handleRemoveCustomPart = (id: string) => {
      setAppState(prev => ({
          ...prev,
          customParts: prev.customParts.filter(p => p.id !== id),
          generatedSheets: Object.fromEntries(Object.entries(prev.generatedSheets).filter(([k]) => k !== id)),
          manualReferences: Object.fromEntries(Object.entries(prev.manualReferences).filter(([k]) => k !== id))
      }));
      setSelectedParts(prev => prev.filter(p => p !== id));
  };

  const handleCustomPartLabelChange = (id: string, newLabel: string) => {
      setAppState(prev => ({
          ...prev,
          customParts: prev.customParts.map(p => p.id === id ? { ...p, label: newLabel } : p)
      }));
  };

  // --- API Key Handlers ---
  const handleSaveApiKey = () => {
      saveApiKey(apiKeyInput);
      setApiKeyStatus(null);
      setHasKeyConfigured(true);
      alert("API Key Saved Locally!");
  };

  const handleClearApiKey = () => {
      clearApiKey();
      setApiKeyInput("");
      setApiKeyStatus(null);
      setHasKeyConfigured(false);
  };

  const handleTestConnection = async () => {
      setApiKeyStatus("testing");
      const success = await testApiKeyConnection(apiKeyInput);
      setApiKeyStatus(success ? "success" : "fail");
  };

  // Phase 1: Analyze and Crop for a specific view
  const processViewAnalysis = async (view: ViewType, imageData: CharacterView) => {
    const imageToAnalyze = imageData.originalImage;
    if (!imageToAnalyze) return null;

    try {
      const customLabels = appState.customParts.map(p => p.label);
      const analysis = await analyzeCharacterImage(imageToAnalyze, customLabels);
      if (!analysis) return null;

      const newParts = { ...imageData.parts };
      const partMappings: { type: string; coords?: number[] }[] = [
        { type: PartType.FACE, coords: analysis.face },
        { type: PartType.HAIR, coords: analysis.hair },
        { type: PartType.HAT, coords: analysis.hat },
        { type: PartType.JACKET, coords: analysis.jacket },
        { type: PartType.TOP, coords: analysis.top },
        { type: PartType.BOTTOM, coords: analysis.bottom },
        { type: PartType.SHOES, coords: analysis.shoes },
        { type: PartType.GLOVES, coords: analysis.gloves },
        { type: PartType.WEAPON, coords: analysis.weapon },
        { type: PartType.BAG, coords: analysis.bag },
        { type: PartType.ACCESSORY, coords: analysis.accessory },
      ];

      for (const mapping of partMappings) {
        if (mapping.coords && mapping.coords.length === 4 && mapping.coords.some(c => c > 0)) {
          const [ymin, xmin, ymax, xmax] = mapping.coords;
          const box: BoundingBox = { ymin, xmin, ymax, xmax };
          const croppedUrl = await cropImage(imageToAnalyze, box);

          newParts[mapping.type] = {
            type: mapping.type,
            label: PART_LABELS[mapping.type],
            box,
            imgUrl: croppedUrl,
          };
        }
      }

      if (analysis.custom && analysis.custom.length > 0) {
          for (const customItem of analysis.custom) {
              const matchingPart = appState.customParts.find(cp => cp.label.trim().toLowerCase() === customItem.label.trim().toLowerCase());
              if (matchingPart && customItem.box && customItem.box.length === 4 && customItem.box.some(c => c > 0)) {
                  const [ymin, xmin, ymax, xmax] = customItem.box;
                  const box: BoundingBox = { ymin, xmin, ymax, xmax };
                  const croppedUrl = await cropImage(imageToAnalyze, box);
                  
                  newParts[matchingPart.id] = {
                      type: matchingPart.id,
                      label: matchingPart.label,
                      box,
                      imgUrl: croppedUrl
                  };
              }
          }
      }
      return { view, parts: newParts };
    } catch (err) {
      console.error(`Error processing ${view}:`, err);
      return null;
    }
  };

  const analyzeSingleImage = async (imageToAnalyze: string) => {
      try {
          const customLabels = appState.customParts.map(p => p.label);
          const analysis = await analyzeCharacterImage(imageToAnalyze, customLabels);
          if (!analysis) return null;

          const parts: Record<string, CharacterPart> = {};
          const partMappings: { type: string; coords?: number[] }[] = [
            { type: PartType.FACE, coords: analysis.face },
            { type: PartType.HAIR, coords: analysis.hair },
            { type: PartType.HAT, coords: analysis.hat },
            { type: PartType.JACKET, coords: analysis.jacket },
            { type: PartType.TOP, coords: analysis.top },
            { type: PartType.BOTTOM, coords: analysis.bottom },
            { type: PartType.SHOES, coords: analysis.shoes },
            { type: PartType.GLOVES, coords: analysis.gloves },
            { type: PartType.WEAPON, coords: analysis.weapon },
            { type: PartType.BAG, coords: analysis.bag },
            { type: PartType.ACCESSORY, coords: analysis.accessory },
          ];

          for (const mapping of partMappings) {
            if (mapping.coords && mapping.coords.length === 4 && mapping.coords.some(c => c > 0)) {
              const [ymin, xmin, ymax, xmax] = mapping.coords;
              const box: BoundingBox = { ymin, xmin, ymax, xmax };
              const croppedUrl = await cropImage(imageToAnalyze, box);
              parts[mapping.type] = { type: mapping.type, label: PART_LABELS[mapping.type], box, imgUrl: croppedUrl };
            }
          }

          if (analysis.custom && analysis.custom.length > 0) {
              for (const customItem of analysis.custom) {
                  const matchingPart = appState.customParts.find(cp => cp.label.trim().toLowerCase() === customItem.label.trim().toLowerCase());
                  if (matchingPart && customItem.box && customItem.box.length === 4 && customItem.box.some(c => c > 0)) {
                      const [ymin, xmin, ymax, xmax] = customItem.box;
                      const box: BoundingBox = { ymin, xmin, ymax, xmax };
                      const croppedUrl = await cropImage(imageToAnalyze, box);
                      parts[matchingPart.id] = { type: matchingPart.id, label: matchingPart.label, box, imgUrl: croppedUrl };
                  }
              }
          }
          return parts;
      } catch(e) {
          console.error("Error analyzing single image", e);
          return null;
      }
  }

  const generatePart = async (pType: string, currentState: AppState, overrideModifications?: Modification[]) => {
    const crops: string[] = [];
    
    // Logic driven by referenceBalance (0-10)
    // 0 = Original Only, 10 = Generated Only
    
    // 1. ORIGINAL CROP (from User Upload) - Include if balance < 10
    if (referenceBalance < 10) {
        const originalCrop = currentState.originalParts[pType]?.imgUrl;
        if (originalCrop) {
            crops.push(originalCrop);
        } else {
            // Fallback to full upload if crop failed but upload exists
            // NOTE: We keep this fallback logic here for generation purposes if the part was somehow detected but crop failed?
            // Actually, if detection failed (no crop), we shouldn't be here because of the filter logic in handleGenerateSheets.
            // But if we are here (manual override?), this might be useful.
            const fullUpload = currentState.views[ViewType.FRONT].userUploadedImage;
            if (fullUpload) crops.push(fullUpload);
        }
    }

    // 2. Generated/Analyzed Views - Include if balance > 0
    if (referenceBalance > 0) {
        const viewsToCheck = isSingleViewMode 
            ? [ViewType.FRONT] 
            : [ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK];

        viewsToCheck.forEach(v => {
          const partData = currentState.views[v].parts[pType];
          if (partData?.imgUrl) {
            crops.push(partData.imgUrl);
          }
        });
    }

    // 3. Manual References - Always included
    const manualRefs = currentState.manualReferences[pType];
    if (manualRefs && manualRefs.length > 0) {
      crops.push(...manualRefs);
    }

    if (crops.length === 0) {
        setAppState(prev => ({
            ...prev,
            generatedSheets: {
              ...prev.generatedSheets,
              [pType]: { ...prev.generatedSheets[pType], imgUrl: null, isLoading: false }
            }
        }));
        return;
    }

    setAppState(prev => ({
      ...prev,
      generatedSheets: {
        ...prev.generatedSheets,
        [pType]: { ...prev.generatedSheets[pType], isLoading: true }
      }
    }));

    const modificationsToUse = overrideModifications || currentState.generatedSheets[pType].modifications;
    let labelToPass = PART_LABELS[pType];
    if (!labelToPass) {
        const custom = currentState.customParts.find(c => c.id === pType);
        labelToPass = custom ? custom.label : "Custom Part";
    }

    // Add balance context to style prompt if mixing (1-9)
    let effectiveStylePrompt = currentState.globalStylePrompt;
    if (referenceBalance > 0 && referenceBalance < 10) {
        const balanceNote = `NOTE: Use a blend of reference styles. Original Image Weight: ${10 - referenceBalance}/10. Generated Views Weight: ${referenceBalance}/10.`;
        effectiveStylePrompt = effectiveStylePrompt ? `${effectiveStylePrompt}. ${balanceNote}` : balanceNote;
    }

    const compositeUrl = await generateCompositeSheet(crops, pType, labelToPass, modificationsToUse, effectiveStylePrompt);

    setAppState(prev => ({
      ...prev,
      generatedSheets: {
        ...prev.generatedSheets,
        [pType]: { 
          ...prev.generatedSheets[pType], 
          imgUrl: compositeUrl,
          isLoading: false
        }
      }
    }));
  };

  const handleRegeneratePart = async (part: string) => {
      if (!verifyApiKey()) return;
      if (appState.generatedSheets[part].isLoading) return;
      recordPartHistory(part); // Record before action
      await generatePart(part, appState);
  };
  
  const handleUpscalePart = async (part: string) => {
      if (!verifyApiKey()) return;
      if (appState.generatedSheets[part].isLoading) return;
      const currentImage = appState.generatedSheets[part].imgUrl;
      if (!currentImage) return;

      recordPartHistory(part); // Record before action
      setUpscalingParts(prev => [...prev, part]);
      setAppState(prev => ({
          ...prev,
          generatedSheets: {
              ...prev.generatedSheets,
              [part]: { ...prev.generatedSheets[part], isLoading: true }
          }
      }));

      try {
          const upscaledUrl = await upscaleImage(currentImage, "16:9");
          if (upscaledUrl) {
              setAppState(prev => ({
                  ...prev,
                  generatedSheets: {
                      ...prev.generatedSheets,
                      [part]: { ...prev.generatedSheets[part], imgUrl: upscaledUrl, isLoading: false }
                  }
              }));
          } else {
              setAppState(prev => ({
                  ...prev,
                  generatedSheets: { ...prev.generatedSheets, [part]: { ...prev.generatedSheets[part], isLoading: false } }
              }));
          }
      } catch (e) {
          console.error("Upscale failed", e);
          setAppState(prev => ({
              ...prev,
              generatedSheets: { ...prev.generatedSheets, [part]: { ...prev.generatedSheets[part], isLoading: false } }
          }));
      } finally {
          setUpscalingParts(prev => prev.filter(p => p !== part));
      }
  };

  // --- Batch Part Operations ---
  const handleBatchUpscaleParts = async (parts: string[]) => {
      if (!verifyApiKey()) return;
      const validParts = parts.filter(p => 
          appState.generatedSheets[p].imgUrl && 
          !appState.generatedSheets[p].isLoading &&
          !upscalingParts.includes(p)
      );
      
      if (validParts.length === 0) return;

      setUpscalingParts(prev => [...prev, ...validParts]);
      
      // Set loading state for all batch items
      setAppState(prev => {
          const newSheets = { ...prev.generatedSheets };
          validParts.forEach(p => {
              newSheets[p] = { ...newSheets[p], isLoading: true };
          });
          return { ...prev, generatedSheets: newSheets };
      });

      // Parallel execution
      await Promise.all(validParts.map(async (part) => {
          try {
              // Record history first
              recordPartHistory(part);
              const currentImage = appState.generatedSheets[part].imgUrl!;
              const upscaled = await upscaleImage(currentImage, "16:9");
              
              setAppState(prev => ({
                  ...prev,
                  generatedSheets: {
                      ...prev.generatedSheets,
                      [part]: { 
                          ...prev.generatedSheets[part], 
                          imgUrl: upscaled || prev.generatedSheets[part].imgUrl, 
                          isLoading: false 
                      }
                  }
              }));
          } catch (e) {
              console.error(e);
              setAppState(prev => ({
                  ...prev,
                  generatedSheets: {
                      ...prev.generatedSheets,
                      [part]: { ...prev.generatedSheets[part], isLoading: false }
                  }
              }));
          } finally {
              setUpscalingParts(prev => prev.filter(p => p !== part));
          }
      }));
  };

  const handleBatchRegenerateParts = async (parts: string[]) => {
      if (!verifyApiKey()) return;
      const validParts = parts.filter(p => !appState.generatedSheets[p].isLoading);
      if (validParts.length === 0) return;

      validParts.forEach(p => recordPartHistory(p));
      await Promise.all(validParts.map(p => generatePart(p, appState)));
  };

  const handleBatchUndoParts = (parts: string[]) => {
      parts.forEach(p => handlePartUndo(p));
  };

  const handleBatchRedoParts = (parts: string[]) => {
      parts.forEach(p => handlePartRedo(p));
  };

  // --- Batch Upscale Views ---
  const handleBatchUpscaleViews = async (targetViews: ViewType[]) => {
      if (!verifyApiKey()) return;
      // Filter out views that are already upscaling or have no image
      const validTargets = targetViews.filter(v => 
          !upscalingViews.includes(v) && 
          appState.views[v].originalImage
      );

      if (validTargets.length === 0) return;

      // Update state to show loading for these views
      setUpscalingViews(prev => [...prev, ...validTargets]);

      // Execute in parallel
      await Promise.all(validTargets.map(async (view) => {
          try {
              const currentImage = appState.views[view].originalImage;
              if (!currentImage) return;

              recordViewHistory(view); // Record history before replacing image

              // Views are portrait 3:4
              const upscaledUrl = await upscaleImage(currentImage, "3:4");
              
              if (upscaledUrl) {
                  updateViewState(view, {
                      originalImage: upscaledUrl,
                      generatedImage: upscaledUrl
                  });
              }
          } catch (e) {
              console.error(`View upscale failed for ${view}`, e);
          } finally {
              setUpscalingViews(prev => prev.filter(v => v !== view));
          }
      }));
  };

  // --- Batch Regenerate Views ---
  const handleBatchRegenerateViews = async (targetViews: ViewType[]) => {
      if (!verifyApiKey()) return;
      // Filter valid targets
      const validTargets = targetViews.filter(v => !processingViews.includes(v));
      if (validTargets.length === 0) return;

      setProcessingViews(prev => [...prev, ...validTargets]);

      // Execute in parallel
      await Promise.all(validTargets.map(async (view) => {
          try {
              // Same logic as handleRegenerateView but localized
              const sourceImage = view === ViewType.FRONT 
                ? (appState.views[ViewType.FRONT].userUploadedImage || appState.views[ViewType.FRONT].originalImage)
                : appState.views[ViewType.FRONT].originalImage;

              if (!sourceImage) return;

              const contextImage = (view === ViewType.SIDE || view === ViewType.BACK)
                 ? appState.views[ViewType.SEMI_SIDE].originalImage
                 : null;

              recordViewHistory(view); // Record history before replacing image

              const newViewImage = await generateCharacterView(sourceImage, view, targetPose, appState.views[view].modifications, contextImage);
              
              if (newViewImage) {
                   updateViewState(view, {
                       originalImage: newViewImage,
                       generatedImage: newViewImage
                   });
              }
          } catch (e) {
              console.error(`View regen failed for ${view}`, e);
          } finally {
              setProcessingViews(prev => prev.filter(v => v !== view));
          }
      }));
  };

  const handlePartModification = async (part: string, prompt: string, image: string | null) => {
      if (!verifyApiKey()) return;
      if (appState.generatedSheets[part].isLoading) return;
      
      recordPartHistory(part); // Record before action
      const newModification: Modification = {
          id: Date.now().toString(),
          prompt,
          image,
          timestamp: Date.now()
      };

      const updatedModifications = [
          ...appState.generatedSheets[part].modifications,
          newModification
      ];

      setAppState(prev => ({
          ...prev,
          generatedSheets: {
              ...prev.generatedSheets,
              [part]: {
                  ...prev.generatedSheets[part],
                  modifications: updatedModifications
              }
          }
      }));

      await generatePart(part, appState, updatedModifications);
  };

  const handleDeleteModification = async (part: string, modId: string) => {
      if (!verifyApiKey()) return;
      if (appState.generatedSheets[part].isLoading) return;
      recordPartHistory(part); // Record before action
      const updatedModifications = appState.generatedSheets[part].modifications.filter(m => m.id !== modId);
      setAppState(prev => ({
          ...prev,
          generatedSheets: {
              ...prev.generatedSheets,
              [part]: {
                  ...prev.generatedSheets[part],
                  modifications: updatedModifications
              }
          }
      }));
      await generatePart(part, appState, updatedModifications);
  };

  // --- View Modification Handlers ---
  const handleViewModification = async (view: ViewType, prompt: string, image: string | null) => {
      if (!verifyApiKey()) return;
      // Don't block globally if other views are processing, just check this view
      if (processingViews.includes(view)) return;

      recordViewHistory(view); // Record before action
      const newModification: Modification = {
          id: Date.now().toString(),
          prompt,
          image,
          timestamp: Date.now()
      };

      const updatedModifications = [
          ...appState.views[view].modifications,
          newModification
      ];

      updateViewState(view, { modifications: updatedModifications });
      
      // FIX: Don't rely on appState for the immediate regeneration call.
      setProcessingViews(prev => [...prev, view]);
      
      try {
          const sourceImage = view === ViewType.FRONT 
            ? (appState.views[ViewType.FRONT].userUploadedImage || appState.views[ViewType.FRONT].originalImage)
            : appState.views[ViewType.FRONT].originalImage;

          if (sourceImage) {
              const contextImage = (view === ViewType.SIDE || view === ViewType.BACK)
                 ? appState.views[ViewType.SEMI_SIDE].originalImage
                 : null;

              const newViewImage = await generateCharacterView(sourceImage, view, targetPose, updatedModifications, contextImage);
              
              if (newViewImage) {
                   updateViewState(view, {
                       originalImage: newViewImage,
                       generatedImage: newViewImage
                   });
              }
          }
      } finally {
          setProcessingViews(prev => prev.filter(v => v !== view));
      }
  };

  const handleDeleteViewModification = async (view: ViewType, modId: string) => {
      if (!verifyApiKey()) return;
      if (processingViews.includes(view)) return;
      recordViewHistory(view); // Record before action

      const updatedModifications = appState.views[view].modifications.filter(m => m.id !== modId);
      updateViewState(view, { modifications: updatedModifications });
      
      // Trigger regen manually to avoid state race condition
      setProcessingViews(prev => [...prev, view]);
      try {
          const sourceImage = view === ViewType.FRONT 
            ? (appState.views[ViewType.FRONT].userUploadedImage || appState.views[ViewType.FRONT].originalImage)
            : appState.views[ViewType.FRONT].originalImage;

          if (sourceImage) {
              const contextImage = (view === ViewType.SIDE || view === ViewType.BACK)
                 ? appState.views[ViewType.SEMI_SIDE].originalImage
                 : null;

              const newViewImage = await generateCharacterView(sourceImage, view, targetPose, updatedModifications, contextImage);
              
              if (newViewImage) {
                   updateViewState(view, {
                       originalImage: newViewImage,
                       generatedImage: newViewImage
                   });
              }
          }
      } finally {
          setProcessingViews(prev => prev.filter(v => v !== view));
      }
  };

  // --- TEXT GENERATION HANDLER ---
  const handleGenerateFromText = async () => {
      if (!verifyApiKey()) return;
      if (!textPrompt.trim()) {
          setErrorMsg(t.input_prompt);
          return;
      }
      
      setIsProcessing(true);
      setErrorMsg(null);
      setGlobalProgress(0); 
      setStatusText(t.status_text_gen);

      try {
          setGlobalProgress(10);
          const generatedImage = await generateCharacterFromText(textPrompt, textRefImage);
          setGlobalProgress(100);
          
          if (generatedImage) {
              // We reset front view, so clear history for front view? or record it?
              // Usually text generation starts fresh, so just set it.
              updateViewState(ViewType.FRONT, {
                  originalImage: generatedImage,
                  userUploadedImage: generatedImage,
                  parts: INITIAL_VIEW_STATE(ViewType.FRONT).parts,
                  history: { undoStack: [], redoStack: [] } // Reset history on new char
              });
              setIsTextMode(false);
          } else {
              setErrorMsg("Error Generating Image.");
          }
      } catch (error) {
          console.error(error);
          setErrorMsg("Error Generating Image.");
      } finally {
          setIsProcessing(false);
          setStatusText(t.status_waiting);
          setGlobalProgress(0);
      }
  };

  // --- PHASE 1: GENERATE REFERENCE VIEWS ---
  const handleGenerateViews = async () => {
    if (!verifyApiKey()) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setGlobalProgress(0);
    setStatusText(t.status_ref_check);

    let currentViews = { ...appState.views };
    const frontSource = currentViews[ViewType.FRONT].userUploadedImage || currentViews[ViewType.FRONT].originalImage;

    if (!frontSource) {
        setErrorMsg(t.error_no_ref);
        setIsProcessing(false);
        return;
    }

    try {
        setGlobalProgress(5); 

        // Step 1: Intermediate 3/4 View Generation
        let threeQuarterRef: string | null = null;
        if (!isSingleViewMode) {
             setStatusText(t.status_3q);
             threeQuarterRef = await generateCharacterView(frontSource, ViewType.SEMI_SIDE, targetPose, []);
             
             if (threeQuarterRef) {
                 recordViewHistory(ViewType.SEMI_SIDE);
                 currentViews[ViewType.SEMI_SIDE] = { 
                     ...currentViews[ViewType.SEMI_SIDE], 
                     originalImage: threeQuarterRef, 
                     generatedImage: threeQuarterRef 
                 };
                 setAppState(prev => ({ ...prev, views: { ...prev.views, [ViewType.SEMI_SIDE]: currentViews[ViewType.SEMI_SIDE] } }));
             }
        }
        setGlobalProgress(35); 

        // Step 2: Normalize Front View
        setStatusText(`${t.status_norm} (${POSE_LABELS[targetPose]})...`);
        const normalizedFront = await generateCharacterView(
            frontSource, 
            ViewType.FRONT, 
            targetPose, 
            currentViews[ViewType.FRONT].modifications,
            threeQuarterRef
        );
        
        if (normalizedFront) {
             recordViewHistory(ViewType.FRONT);
             currentViews[ViewType.FRONT] = {
                 ...currentViews[ViewType.FRONT],
                 originalImage: normalizedFront, 
                 generatedImage: normalizedFront, 
                 parts: INITIAL_VIEW_STATE(ViewType.FRONT).parts 
             };
             setAppState(prev => ({ ...prev, views: { ...prev.views, [ViewType.FRONT]: currentViews[ViewType.FRONT] } }));
        }
        setGlobalProgress(65); 

        // Step 3: Generate Missing Views
        if (!isSingleViewMode) {
            setStatusText(t.status_4view);
            const sourceForGeneration = normalizedFront || frontSource;

            const [sideImg, backImg] = await Promise.all([
                generateCharacterView(sourceForGeneration, ViewType.SIDE, targetPose, [], threeQuarterRef),
                generateCharacterView(sourceForGeneration, ViewType.BACK, targetPose, [], threeQuarterRef)
            ]);

            if (sideImg) {
                recordViewHistory(ViewType.SIDE);
                currentViews[ViewType.SIDE] = { 
                    ...currentViews[ViewType.SIDE], 
                    originalImage: sideImg, 
                    generatedImage: sideImg 
                };
            }
            if (backImg) {
                recordViewHistory(ViewType.BACK);
                currentViews[ViewType.BACK] = { 
                    ...currentViews[ViewType.BACK], 
                    originalImage: backImg, 
                    generatedImage: backImg
                };
            }
            setAppState(prev => ({ ...prev, views: currentViews }));
            setIsMultiView(true);
        }
        setGlobalProgress(90); 
        
        if (appState.colorPalette.length === 0) {
            setStatusText(t.status_palette);
            const rawFront = normalizedFront || frontSource;
            if (rawFront) {
                const palette = await extractColorPalette(rawFront);
                setAppState(prev => ({ 
                    ...prev, 
                    views: currentViews, 
                    colorPalette: palette 
                }));
            }
        }
        setGlobalProgress(100); 

    } catch (e) {
        console.error(e);
        setErrorMsg(t.error_view_fail);
    } finally {
        setIsProcessing(false);
        setStatusText(t.status_waiting);
        setGlobalProgress(0);
    }
  };

  // --- PHASE 2: ANALYZE AND GENERATE SHEETS ---
  const handleGenerateSheets = async () => {
      if (!verifyApiKey()) return;
      if (selectedParts.length === 0) {
        setErrorMsg(t.error_select_part);
        return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setGlobalProgress(0);
    setStatusText(t.status_analyze);
    
    let currentViews = { ...appState.views };
    // Keep track of separate original parts crops
    let newOriginalParts: Record<string, CharacterPart | null> = { ...appState.originalParts };

    try {
        setGlobalProgress(5);
        const viewsToAnalyze = isSingleViewMode 
            ? [ViewType.FRONT] 
            : [ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK];

        // 1. Analyze Active Views (Normalized/Generated)
        const analysisResults = await Promise.all(viewsToAnalyze.map(v => processViewAnalysis(v, currentViews[v])));

        analysisResults.forEach(res => {
            if (res) {
                currentViews[res.view] = {
                    ...currentViews[res.view],
                    parts: res.parts
                };
            }
        });

        // 2. Analyze Original User Upload (If distinct from Active Front)
        const frontView = currentViews[ViewType.FRONT];
        if (frontView.userUploadedImage && frontView.userUploadedImage !== frontView.originalImage) {
            const rawParts = await analyzeSingleImage(frontView.userUploadedImage);
            if (rawParts) {
                newOriginalParts = { ...newOriginalParts, ...rawParts };
            }
        }

        setGlobalProgress(20); 

        // Detect parts present in EITHER the generated views OR the original parts analysis
        const detectedParts = new Set<string>();
        const viewsToCheck = isSingleViewMode 
            ? [ViewType.FRONT] 
            : [ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK];

        // Check generated views
        viewsToCheck.forEach(view => {
             const viewData = currentViews[view];
             if (viewData) {
                 Object.values(PartType).forEach(part => {
                     if (viewData.parts[part]?.imgUrl) detectedParts.add(part);
                 });
                 appState.customParts.forEach(cp => {
                     if (viewData.parts[cp.id]?.imgUrl) detectedParts.add(cp.id);
                 });
             }
        });

        // Check original image analysis
        Object.keys(newOriginalParts).forEach(partId => {
            if (newOriginalParts[partId]?.imgUrl) detectedParts.add(partId);
        });

        // Check manual references (Always include if user manually added a ref)
        Object.keys(appState.manualReferences).forEach(key => {
            if (appState.manualReferences[key] && appState.manualReferences[key].length > 0) detectedParts.add(key);
        });

        // Filter selected parts: Only keep parts that were actually DETECTED or have MANUAL refs.
        // We REMOVED the logic that blindly trusted 'selectedParts' just because a User Upload exists.
        const validPartsToGenerate = selectedParts.filter(p => detectedParts.has(p));
        setSelectedParts(validPartsToGenerate); 

        if (validPartsToGenerate.length === 0) {
            setErrorMsg(t.error_no_part);
            setIsProcessing(false);
            setGlobalProgress(0);
            return;
        }

        setAppState(prev => ({ 
            ...prev, 
            views: currentViews,
            originalParts: newOriginalParts
        }));
        
        const tempStateForGeneration: AppState = {
            ...appState,
            views: currentViews,
            originalParts: newOriginalParts
        };

        setStatusText(t.status_sheet);
        const totalParts = validPartsToGenerate.length;
        let completedParts = 0;

        await Promise.all(validPartsToGenerate.map(async (pType) => {
            recordPartHistory(pType); // Record before generation
            await generatePart(pType, tempStateForGeneration, undefined);
            completedParts++;
            const currentProgress = 20 + ((completedParts / totalParts) * 80);
            setGlobalProgress(currentProgress);
        }));

        setShowDetailSheets(true);

    } catch (e) {
        console.error(e);
        setErrorMsg(t.error_sheet);
    } finally {
        setIsProcessing(false);
        setStatusText(t.status_waiting);
        setGlobalProgress(0);
    }
  };

  const handleMainAction = () => {
      if (!verifyApiKey()) return;
      if (isTextMode) {
          handleGenerateFromText();
      } else if (hasAllViews) {
          handleGenerateSheets();
      } else {
          setShowCopyrightWarning(true);
      }
  };
  
  const confirmCopyrightAndGenerate = () => {
      setShowCopyrightWarning(true); // Re-show if needed or just proceed
      handleGenerateViews();
      setShowCopyrightWarning(false);
  };

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-slate-900 p-4 md:p-8 font-sans">
      <style>{`
        .progress-bar-fill {
            transition: width 0.5s ease-out;
        }
      `}</style>
      <div className="max-w-[1800px] mx-auto">
        
        {/* Header Section */}
        <div className="relative text-center mb-12 pt-10">
          
          <div className="absolute top-0 right-0 z-50 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Globe size={18} className="text-slate-400" />
                <select 
                    value={language}
                    onChange={(e) => {
                        setLanguage(e.target.value as Language);
                        setStatusText(TRANSLATIONS[e.target.value as Language].status_waiting);
                    }}
                    className="bg-transparent text-sm font-bold text-slate-600 hover:text-[#0F4C81] focus:outline-none cursor-pointer appearance-none uppercase"
                >
                    <option value={Language.KO}>한국어</option>
                    <option value={Language.EN}>English</option>
                    <option value={Language.JA}>日本語</option>
                    <option value={Language.ZH}>中文</option>
                    <option value={Language.ES}>Español</option>
                </select>
              </div>
          </div>

          <div className="flex items-center justify-center gap-4 mb-4">
              <Mascot size={64} emotion="happy" />
              <h1 className="text-6xl md:text-8xl font-black text-[#1a1a1a] tracking-tighter font-[Rajdhani] uppercase leading-none">
                CharSheet <span className="text-[#0F4C81]">AI</span>
              </h1>
          </div>
          <p className="text-slate-500 font-bold tracking-widest uppercase text-sm md:text-base mb-2">
             {t.desc}
          </p>
          <div className="w-24 h-2 bg-[#0F4C81] mx-auto mb-8"></div>

          {/* Copyright Warning Banner */}
          <div className="bg-white border-l-4 border-[#0F4C81] p-4 max-w-2xl mx-auto mb-8 flex items-start gap-3 shadow-md text-left animate-fade-in">
              <AlertTriangle size={20} className="text-[#0F4C81] shrink-0 mt-0.5" />
              <div>
                  <h3 className="text-[#0F4C81] font-bold text-sm uppercase tracking-wider mb-1">{t.copyright_title}</h3>
                  <p className="text-slate-600 text-xs leading-relaxed font-medium">
                      {t.copyright_msg}
                  </p>
              </div>
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto text-left mb-10">
              
              {/* API Key Button (New Location) */}
              <button
                  onClick={() => setActiveModal('apikey')}
                  className={`
                      flex-1 bg-white p-6 shadow-md border-b-4 hover:-translate-y-1 transition-all text-left group
                      ${!hasKeyConfigured ? 'border-red-400 hover:border-red-600' : 'border-slate-200 hover:border-[#0F4C81]'}
                  `}
              >
                  <div className="flex items-center gap-2 mb-3">
                      <Key size={14} className={`${!hasKeyConfigured ? 'text-red-500' : 'text-[#0F4C81]'} group-hover:scale-110 transition-transform`} />
                      <span className={`text-xs font-bold uppercase tracking-widest ${!hasKeyConfigured ? 'text-red-500' : 'text-slate-400 group-hover:text-[#0F4C81]'}`}>
                          {t.api_settings_title}
                      </span>
                      {!hasKeyConfigured && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>}
                  </div>
                  <h3 className={`font-bold text-lg mb-1 ${!hasKeyConfigured ? 'text-red-600' : 'text-slate-800'}`}>
                      {t.api_settings_title}
                  </h3>
                  <p className={`text-xs font-medium ${!hasKeyConfigured ? 'text-red-400' : 'text-slate-500'}`}>
                      {!hasKeyConfigured ? t.no_key_warning.split('\n')[0] : t.api_settings_desc}
                  </p>
              </button>

              <button 
                  onClick={() => setActiveModal('usage')}
                  className="flex-1 bg-white p-6 shadow-md border-b-4 border-slate-200 hover:border-[#0F4C81] hover:-translate-y-1 transition-all text-left group"
              >
                  <div className="flex items-center gap-2 mb-3">
                      <Info size={14} className="text-[#0F4C81] group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest group-hover:text-[#0F4C81]">{t.usage_guide}</span>
                  </div>
                  <h3 className="font-bold text-lg mb-1 text-slate-800">{t.usage_guide}</h3>
                  <p className="text-xs text-slate-500 font-medium">{t.usage_desc}</p>
              </button>

              <button 
                  onClick={() => setActiveModal('patch')}
                  className="flex-1 bg-white p-6 shadow-md border-b-4 border-slate-200 hover:border-[#0F4C81] hover:-translate-y-1 transition-all text-left group"
              >
                  <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={14} className="text-[#0F4C81] fill-[#0F4C81] group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest group-hover:text-[#0F4C81]">Update Log</span>
                  </div>
                  <h3 className="font-bold text-lg mb-1 text-slate-800">{t.patch_notes}</h3>
                  <p className="text-xs text-slate-500 font-medium">{t.patch_desc}</p>
              </button>

              <button 
                  onClick={() => setActiveModal('coffee')}
                  className="flex-1 bg-white p-6 shadow-md border-b-4 border-orange-200 hover:border-orange-400 hover:-translate-y-1 transition-all text-left group"
              >
                  <div className="flex items-center gap-2 mb-3">
                      <Coffee size={14} className="text-orange-500 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest group-hover:text-orange-500">Support</span>
                  </div>
                  <h3 className="font-bold text-lg mb-1 text-slate-800">{t.buy_coffee}</h3>
                  <p className="text-xs text-slate-500 font-medium whitespace-pre-line">Dev Support</p>
              </button>
          </div>
        </div>

        {/* --- MODALS --- */}
        <Modal isOpen={activeModal === 'usage'} onClose={() => setActiveModal(null)} title={t.usage_guide}>
             <div className="space-y-8 text-slate-800">
                 {t.usage_steps && t.usage_steps.map((step: any, index: number) => (
                    <div key={index} className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-[#0F4C81] text-white flex items-center justify-center font-bold flex-shrink-0">
                            {index + 1}
                        </div>
                        <div>
                             <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                             <p className="text-sm text-slate-600 leading-relaxed mb-2">
                                 {step.desc}
                             </p>
                             {step.bullets && step.bullets.length > 0 && (
                                 <ul className="list-disc pl-4 text-xs text-slate-500 space-y-1">
                                     {step.bullets.map((bullet: string, bIdx: number) => (
                                         <li key={bIdx}>{bullet}</li>
                                     ))}
                                 </ul>
                             )}
                        </div>
                    </div>
                 ))}
             </div>
        </Modal>

        <Modal isOpen={activeModal === 'patch'} onClose={() => setActiveModal(null)} title={t.patch_notes}>
             <div className="space-y-0 divide-y divide-slate-100">
                 {t.patch_notes_list && t.patch_notes_list.map((note: any, idx: number) => (
                     <div key={idx} className="py-4 hover:bg-slate-50 px-2 rounded transition-colors">
                         <div className="flex justify-between items-center mb-1">
                             <span className={`font-bold text-lg ${idx === 0 ? 'text-[#0F4C81]' : 'text-slate-700'}`}>
                                 {note.version}
                             </span>
                         </div>
                         <p className="text-sm text-slate-600 font-medium leading-relaxed">
                             {note.desc}
                         </p>
                     </div>
                 ))}
             </div>
        </Modal>

        <Modal isOpen={activeModal === 'coffee'} onClose={() => setActiveModal(null)} title={t.coffee_modal_title}>
             <div className="flex flex-col items-center text-center p-4">
                 <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-6">
                     <Coffee size={40} className="text-orange-600" />
                 </div>
                 <h3 className="text-2xl font-black text-slate-800 mb-4">{t.buy_coffee}</h3>
                 <p className="text-slate-600 leading-relaxed whitespace-pre-line mb-8 font-medium">
                     {t.coffee_modal_body}
                 </p>
                 
                 <a 
                    href={language === Language.KO ? "https://aq.gy/f/cTOja" : "https://paypal.me/mookxy"} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-full py-4 mb-8 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg transition-transform hover:-translate-y-1 flex items-center justify-center gap-3 text-lg"
                 >
                    <Coffee size={24} />
                    <span>{t.btn_coffee_link}</span>
                 </a>

                 <div className="w-full bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-slate-500">
                     <Heart size={16} className="inline-block mr-2 text-red-500 fill-red-500" />
                     Thank you for your support!
                 </div>
             </div>
        </Modal>

        {/* API KEY MODAL */}
        <Modal isOpen={activeModal === 'apikey'} onClose={() => setActiveModal(null)} title={t.api_settings_title}>
            <div className="flex flex-col gap-6">
                
                {/* Guide Section */}
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                        <Key size={18} className="text-[#0F4C81]" />
                        API Key 발급 가이드
                    </h3>
                    <div className="flex flex-col gap-2 mb-4">
                        {t.api_guide_steps && t.api_guide_steps.map((step: string, idx: number) => (
                            <p key={idx} className="text-sm text-slate-600 leading-relaxed">{step}</p>
                        ))}
                    </div>
                    <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-bold text-white bg-slate-800 px-4 py-2 rounded hover:bg-black transition-colors"
                    >
                        <ExternalLink size={16} />
                        {t.api_guide_link}
                    </a>
                </div>

                <div className="bg-blue-50 p-4 border border-blue-100 rounded text-sm text-[#0F4C81] font-medium flex gap-3">
                    <ShieldAlert className="shrink-0" size={20} />
                    <p>{t.api_key_desc}</p>
                </div>

                <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Google Gemini API Key</label>
                    <input 
                        type="password" 
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder={t.api_key_placeholder}
                        className="w-full p-4 border border-slate-300 rounded focus:border-[#0F4C81] outline-none font-mono text-sm"
                    />
                </div>

                <div className="flex gap-4 items-center">
                    <button 
                        onClick={handleSaveApiKey}
                        className="px-6 py-3 bg-[#0F4C81] text-white font-bold rounded hover:bg-blue-900 transition-colors shadow-sm flex items-center gap-2"
                    >
                        <Check size={18} /> {t.btn_save_key}
                    </button>
                    <button 
                        onClick={handleTestConnection}
                        disabled={!apiKeyInput}
                        className="px-6 py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50"
                    >
                        {apiKeyStatus === "testing" ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
                        {t.btn_test_conn}
                    </button>
                    <button 
                        onClick={handleClearApiKey}
                        className="px-4 py-3 text-red-500 font-bold rounded hover:bg-red-50 transition-colors ml-auto flex items-center gap-2"
                    >
                        <Trash2 size={18} /> {t.btn_delete_key}
                    </button>
                </div>

                {apiKeyStatus === "success" && (
                    <div className="p-3 bg-green-50 text-green-700 border border-green-200 rounded font-bold text-center animate-fade-in flex items-center justify-center gap-2">
                        <Check size={18} /> {t.conn_success}
                    </div>
                )}
                {apiKeyStatus === "fail" && (
                    <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded font-bold text-center animate-fade-in flex items-center justify-center gap-2">
                        <X size={18} /> {t.conn_fail}
                    </div>
                )}
            </div>
        </Modal>

        {/* COPYRIGHT WARNING */}
        {showCopyrightWarning && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                <div className="bg-white w-full max-w-lg shadow-2xl rounded-xl overflow-hidden animate-scale-in">
                    <div className="bg-red-50 p-6 border-b border-red-100 flex items-center gap-4">
                        <div className="p-3 bg-red-100 rounded-full">
                            <ShieldAlert size={32} className="text-red-600" />
                        </div>
                        <h2 className="text-xl font-black text-red-700 uppercase tracking-tight">{t.modal_copyright_title}</h2>
                    </div>
                    
                    <div className="p-8">
                        <p className="text-slate-600 text-sm leading-relaxed mb-6 whitespace-pre-line">
                            {t.modal_copyright_body}
                        </p>
                        
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={confirmCopyrightAndGenerate}
                                className="w-full py-4 bg-[#0F4C81] hover:bg-blue-900 text-white font-bold rounded-lg transition-colors text-lg shadow-lg flex items-center justify-center gap-2"
                            >
                                <Check size={20} />
                                {t.modal_confirm}
                            </button>
                            <button 
                                onClick={() => setShowCopyrightWarning(false)}
                                className="w-full py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-600 font-bold rounded-lg transition-colors"
                            >
                                {t.modal_cancel}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Mode Toggles */}
        <div className="flex justify-center gap-4 mb-10 flex-wrap">
            <button
                onClick={() => {
                    if (isSingleViewMode) setIsSingleViewMode(false);
                    if (isTextMode) setIsTextMode(false);
                    setIsMultiView(!isMultiView);
                }}
                disabled={isSingleViewMode || isTextMode}
                className={`
                    flex items-center gap-4 px-6 py-3 transition-all shadow-md
                    ${isMultiView && !isSingleViewMode && !isTextMode
                        ? 'bg-[#0F4C81] text-white' 
                        : (isSingleViewMode || isTextMode) ? 'opacity-30 cursor-not-allowed bg-slate-200 text-slate-400' : 'bg-white text-slate-500 hover:text-[#0F4C81]'
                    }
                `}
            >
                <Layers size={20} />
                <span className="font-bold uppercase tracking-widest text-sm">
                    {isMultiView ? t.view_multi : t.view_all}
                </span>
            </button>

             <button
                onClick={handleToggleSingleView}
                className={`
                    flex items-center gap-4 px-6 py-3 transition-all shadow-md
                    ${isSingleViewMode 
                        ? 'bg-[#0F4C81] text-white' 
                        : 'bg-white text-slate-500 hover:text-[#0F4C81]'
                    }
                `}
            >
                <FileImage size={20} />
                <span className="font-bold uppercase tracking-widest text-sm">
                    {t.mode_single}
                </span>
                {isSingleViewMode && <Check size={16} />}
            </button>

            <button
                onClick={handleToggleTextMode}
                className={`
                    flex items-center gap-4 px-6 py-3 transition-all shadow-md
                    ${isTextMode
                        ? 'bg-[#0F4C81] text-white' 
                        : 'bg-white text-slate-500 hover:text-[#0F4C81]'
                    }
                `}
            >
                <TypeIcon size={20} />
                <span className="font-bold uppercase tracking-widest text-sm">
                    {t.mode_text}
                </span>
                {isTextMode && <Check size={16} />}
            </button>
        </div>

        {/* INPUT AREA */}
        {isTextMode ? (
             <div className="max-w-4xl mx-auto mb-16 animate-fade-in bg-white p-8 shadow-xl border-t-8 border-[#0F4C81]">
                 <div className="flex flex-col md:flex-row gap-8">
                     <div className="flex-1 flex flex-col gap-4">
                         <label className="text-[#0F4C81] font-bold uppercase tracking-widest text-lg flex items-center gap-2">
                             <TypeIcon size={20} /> {t.input_prompt}
                         </label>
                         <textarea
                            value={textPrompt}
                            onChange={(e) => setTextPrompt(e.target.value)}
                            placeholder={t.input_placeholder}
                            className="w-full h-64 p-4 bg-slate-50 border border-slate-200 focus:border-[#0F4C81] focus:outline-none resize-none text-lg leading-relaxed placeholder:text-slate-400 text-slate-800"
                         />
                     </div>
                     <div className="w-full md:w-auto flex flex-col gap-4">
                         <label className="text-slate-500 font-bold uppercase tracking-widest text-lg flex items-center gap-2">
                             <Sparkles size={20} /> {t.style_ref}
                         </label>
                         <div className="w-full md:w-64">
                             <ImageUploader 
                                label=""
                                image={textRefImage}
                                onUpload={setTextRefImage}
                                onClear={() => setTextRefImage(null)}
                                disabled={isProcessing}
                                language={language}
                             />
                         </div>
                         <p className="text-xs text-slate-400 leading-tight">
                             {t.drag_style}
                         </p>
                     </div>
                 </div>
             </div>
        ) : (
            <div className={`
                grid gap-8 mb-16 transition-all duration-500 ease-in-out
                ${(isMultiView && !isSingleViewMode) ? 'grid-cols-1 md:grid-cols-4' : 'grid-cols-1 max-w-2xl mx-auto'}
            `}>
            <ImageUploader
                label={t.views[ViewType.FRONT]}
                image={appState.views[ViewType.FRONT].originalImage}
                onUpload={(b64) => handleUpload(ViewType.FRONT, b64)}
                onClear={() => handleClear(ViewType.FRONT)}
                disabled={isProcessing}
                language={language}
            />
            
            {(isMultiView && !isSingleViewMode) && (
                <div className="animate-fade-in">
                    <ImageUploader
                        label={t.views[ViewType.SEMI_SIDE]}
                        image={appState.views[ViewType.SEMI_SIDE].originalImage}
                        onUpload={(b64) => handleUpload(ViewType.SEMI_SIDE, b64)}
                        onClear={() => handleClear(ViewType.SEMI_SIDE)}
                        disabled={isProcessing}
                        language={language}
                    />
                </div>
            )}

            {(isMultiView && !isSingleViewMode) && (
                <div className="animate-fade-in">
                    <ImageUploader
                        label={t.views[ViewType.SIDE]}
                        image={appState.views[ViewType.SIDE].originalImage}
                        onUpload={(b64) => handleUpload(ViewType.SIDE, b64)}
                        onClear={() => handleClear(ViewType.SIDE)}
                        disabled={isProcessing}
                        language={language}
                    />
                </div>
            )}
            
            {(isMultiView && !isSingleViewMode) && (
                <div className="animate-fade-in">
                    <ImageUploader
                        label={t.views[ViewType.BACK]}
                        image={appState.views[ViewType.BACK].originalImage}
                        onUpload={(b64) => handleUpload(ViewType.BACK, b64)}
                        onClear={() => handleClear(ViewType.BACK)}
                        disabled={isProcessing}
                        language={language}
                    />
                </div>
            )}
            </div>
        )}

        {/* Pose Selection */}
        {!hasAllViews && !isSingleViewMode && !isTextMode && (
            <div className="max-w-3xl mx-auto mb-10 text-center animate-fade-in">
                 <h3 className="text-slate-400 uppercase tracking-widest text-base font-bold mb-6">
                    {t.pose_select}
                 </h3>
                 <div className="flex justify-center gap-4 flex-wrap">
                     {Object.values(PoseType).map(pose => (
                         <button
                            key={pose}
                            onClick={() => setTargetPose(pose)}
                            disabled={isProcessing}
                            className={`
                                flex items-center gap-2 px-6 py-3 transition-all shadow-sm border
                                ${targetPose === pose 
                                    ? 'bg-[#0F4C81] text-white border-[#0F4C81]' 
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-[#0F4C81] hover:text-[#0F4C81]'
                                }
                            `}
                         >
                             <Accessibility size={20} />
                             {t.poses[pose]}
                         </button>
                     ))}
                 </div>
            </div>
        )}

        {/* Part Selection */}
        <div className={`max-w-[1400px] mx-auto mb-10 transition-all duration-500 ${hasAllViews ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
            <h3 className="text-center text-slate-400 uppercase tracking-widest text-base font-bold mb-6">
                {t.part_select}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {Object.values(PartType).map((part) => (
                    <button
                        key={part}
                        onClick={() => togglePartSelection(part)}
                        disabled={isProcessing}
                        className={`
                            flex items-center justify-between px-4 py-4 border text-sm font-bold uppercase tracking-wider transition-all shadow-sm
                            ${selectedParts.includes(part)
                                ? "bg-[#0F4C81] border-[#0F4C81] text-white transform scale-105 shadow-lg"
                                : "bg-white border-slate-200 text-slate-400 hover:border-[#0F4C81] hover:text-[#0F4C81]"
                            }
                        `}
                    >
                        <span>{t.parts[part].split(" / ")[0]}</span>
                        {selectedParts.includes(part) ? <CheckSquare size={16} className="text-white"/> : <Square size={16} />}
                    </button>
                ))}

                {appState.customParts.map((part) => (
                    <div 
                        key={part.id} 
                        className={`
                            relative flex items-center justify-between px-4 py-4 border transition-all shadow-sm group
                            ${selectedParts.includes(part.id)
                                ? "bg-[#0F4C81] border-[#0F4C81] text-white shadow-lg"
                                : "bg-white border-slate-200 text-slate-400 hover:border-[#0F4C81]"
                            }
                        `}
                    >
                        <div className="flex-1 flex items-center gap-2 overflow-hidden">
                             <div onClick={() => togglePartSelection(part.id)} className="cursor-pointer">
                                {selectedParts.includes(part.id) ? <CheckSquare size={16} className="text-white shrink-0"/> : <Square size={16} className="shrink-0"/>}
                             </div>
                             <input 
                                type="text"
                                value={part.label}
                                onChange={(e) => handleCustomPartLabelChange(part.id, e.target.value)}
                                className={`w-full bg-transparent border-b border-transparent focus:border-white outline-none text-sm font-bold uppercase ${selectedParts.includes(part.id) ? "text-white placeholder:text-blue-200" : "text-slate-600 focus:border-[#0F4C81]"}`}
                                placeholder="파츠명 입력"
                                onClick={(e) => e.stopPropagation()} 
                             />
                        </div>
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveCustomPart(part.id);
                            }}
                            className={`p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${selectedParts.includes(part.id) ? "hover:bg-blue-700 text-white" : "hover:bg-slate-100 text-red-500"}`}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}

                <div className="relative flex items-center gap-2 px-2 py-2 border border-dashed border-slate-300 bg-slate-50 hover:bg-white transition-all h-full">
                    <input
                        type="text"
                        value={customPartInput}
                        onChange={(e) => setCustomPartInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomPart()}
                        placeholder={t.custom_part}
                        className="w-full bg-transparent outline-none text-sm font-bold text-slate-600 placeholder:text-slate-400 px-2"
                        disabled={isProcessing}
                    />
                    <button
                        onClick={handleAddCustomPart}
                        disabled={isProcessing || !customPartInput.trim()}
                        className="p-2 bg-[#0F4C81] text-white rounded hover:bg-blue-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        <Plus size={16} />
                    </button>
                </div>
            </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col items-center justify-center gap-4 mb-20">
          {errorMsg && (
            <div className="text-[#0F4C81] bg-white px-6 py-3 border-l-4 border-[#0F4C81] mb-2 font-bold text-lg shadow-md">
                {errorMsg}
            </div>
          )}
          
          {!hasAllViews && (
            <>
                <button
                    onClick={handleMainAction}
                    disabled={isProcessing}
                    className={`
                        group relative px-16 py-6 font-black text-2xl tracking-widest transition-all uppercase w-full md:w-auto shadow-2xl
                        ${isProcessing 
                            ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                            : "bg-black text-white hover:bg-[#0F4C81]"
                        }
                    `}
                >
                    <div className="flex flex-col items-center justify-center w-full">
                        <div className="flex items-center gap-6">
                            {isProcessing ? (
                                <>
                                    <Mascot size={32} emotion="thinking" />
                                    {statusText}
                                </>
                            ) : isTextMode ? (
                                <>
                                    <Wand2 className="w-8 h-8 fill-white group-hover:scale-110 transition-transform" />
                                    {t.btn_generate_text}
                                </>
                            ) : (
                                <>
                                    <Eye className="w-8 h-8 group-hover:scale-110 transition-transform" />
                                    {isSingleViewMode ? t.btn_analyze_single : t.btn_generate_views}
                                </>
                            )}
                        </div>
                        {isProcessing && (
                            <div className="w-64 h-1.5 bg-white/20 rounded-full overflow-hidden relative mt-4">
                                <div 
                                    className="absolute top-0 left-0 h-full bg-white/90 rounded-full progress-bar-fill shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                                    style={{ width: `${globalProgress}%` }}
                                ></div>
                            </div>
                        )}
                    </div>
                </button>
                
                {isTextMode && (
                    <p className="text-[#0F4C81] text-base font-bold uppercase tracking-widest mt-2">
                        {t.step0}
                    </p>
                )}
                {!isTextMode && (
                    <p className="text-slate-500 text-base font-bold uppercase tracking-widest mt-2">
                        {isSingleViewMode ? t.step1_single : t.step1_multi}
                    </p>
                )}
            </>
          )}

          {hasAllViews && (
              <p className="text-[#0F4C81] text-base font-bold uppercase tracking-widest mt-2 animate-bounce">
                  {t.hint_bottom}
              </p>
          )}
        </div>

        {/* Result Section */}
        {hasAllViews && (
            <div className="animate-fade-in-up">
                  <CharacterSheet 
                      data={appState} 
                      selectedParts={selectedParts} 
                      showDetailSheets={showDetailSheets}
                      onRegeneratePart={handleRegeneratePart}
                      onRegenerateView={(view) => handleBatchRegenerateViews([view])}
                      onManualPartUpload={handleAddManualReference}
                      onRemoveManualReference={handleRemoveManualReference}
                      onPartModification={handlePartModification}
                      onDeleteModification={handleDeleteModification}
                      onRemovePartCrop={handleRemovePartCrop}
                      onViewModification={handleViewModification}
                      onDeleteViewModification={handleDeleteViewModification}
                      processingView={null} // Deprecated, using processingViews array
                      onGenerateSheets={handleGenerateSheets}
                      isProcessing={isProcessing}
                      progress={globalProgress}
                      globalStylePrompt={appState.globalStylePrompt}
                      onStylePromptChange={handleStylePromptChange}
                      onReset={handleResetProject}
                      language={language}
                      onOpenSupport={() => setActiveModal('coffee')}
                      onSwapViewImage={handleSwapViewImage}
                      onUpscalePart={handleUpscalePart}
                      onUpscaleView={(view) => handleBatchUpscaleViews([view])}
                      upscalingView={null} // Deprecated
                      upscalingPart={null} // Deprecated in favor of upscalingParts array, pass null or manage locally
                      upscalingParts={upscalingParts} // Pass array for batch support
                      
                      // Batch Props
                      processingViews={processingViews}
                      upscalingViews={upscalingViews}
                      selectedRefViews={selectedViewIds}
                      onToggleRefView={toggleViewSelection}
                      onBatchRegenerateViews={handleBatchRegenerateViews}
                      onBatchUpscaleViews={handleBatchUpscaleViews}
                      
                      // Ref Balance
                      referenceBalance={referenceBalance}
                      onReferenceBalanceChange={setReferenceBalance}

                      // Undo/Redo Handlers (Passed Down)
                      onViewUndo={handleViewUndo}
                      onViewRedo={handleViewRedo}
                      onPartUndo={handlePartUndo}
                      onPartRedo={handlePartRedo}

                      // Batch Part Handlers
                      onBatchUpscaleParts={handleBatchUpscaleParts}
                      onBatchRegenerateParts={handleBatchRegenerateParts}
                      onBatchUndoParts={handleBatchUndoParts}
                      onBatchRedoParts={handleBatchRedoParts}
                  />
                  <div className="text-center mt-20 mb-20"></div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;
