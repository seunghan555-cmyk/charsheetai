import React, { useState, useMemo } from "react";
import { AppState, ViewType, PartType, CharacterPart, BoundingBox, CharacterView, PoseType, Modification, CustomPart, Language } from "./types";
import { getInitialAppState, PART_LABELS, INITIAL_VIEW_STATE, POSE_LABELS, TRANSLATIONS } from "./constants";
import { ImageUploader } from "./components/ImageUploader";
import { CharacterSheet } from "./components/CharacterSheet";
import { analyzeCharacterImage, generateCompositeSheet, generateCharacterView, extractColorPalette, generateCharacterFromText } from "./services/geminiService";
import { cropImage } from "./utils/imageUtils";
import { Loader2, Wand2, RefreshCw, Layers, Check, Square, CheckSquare, Zap, Eye, Accessibility, Sparkles, FileImage, Type as TypeIcon, Info, AlertTriangle, Palette, Plus, Trash2, X, ShieldAlert, Globe } from "lucide-react";

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
                        {title}
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
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
};

// Removed dates as requested
const PATCH_NOTES = [
    { version: "v1.28", desc: "Feature: 다국어 지원 추가 (한국어, English, 日本語, 中文)." },
    { version: "v1.27", desc: "Bug Fix: 초기화 버튼(RESET) 즉시 동작하도록 수정 (확인 팝업 제거). 패치노트 UI 변경. 4면도 생성 전 저작권 확인 팝업 추가." },
    { version: "v1.26", desc: "UX 개선: 초기화 버튼 이동 및 접근성 개선. UI 디자인 미세 조정. 상세 도움말 팝업 추가." },
    { version: "v1.25", desc: "Rebranding: Charsheet AI로 명칭 변경. 기타(Custom) 파츠 입력 방식 개선 (직접 입력 후 추가)." },
    { version: "v1.24", desc: "Bug Fix: '새 프로젝트 시작' 버튼 상태 초기화 로직 수정." },
    { version: "v1.23", desc: "기능 개선: 기타 파츠 자동 크롭 인식률 향상. UI 버튼 크기 통일." },
    { version: "v1.20", desc: "Core Update: 4면도 생성 알고리즘 강화 (Gemini 2.5 Flash 적용). 반측면 뷰 추가." },
    { version: "v1.0", desc: "Initial Release." }
];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(getInitialAppState());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingView, setProcessingView] = useState<ViewType | null>(null); // Track which view is regenerating
  const [globalProgress, setGlobalProgress] = useState(0); // Actual progress percentage (0-100)
  
  const [isMultiView, setIsMultiView] = useState(false); // Default to Single View
  const [isSingleViewMode, setIsSingleViewMode] = useState(false); // Mode: Generate sheet from just 1 image
  const [isTextMode, setIsTextMode] = useState(false); // Mode: Generate from Text
  
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
  const [activeModal, setActiveModal] = useState<'usage' | 'patch' | null>(null);
  
  // Copyright Confirmation State
  const [showCopyrightWarning, setShowCopyrightWarning] = useState(false);

  // Controls the visibility of the detailed part rows (Step 2)
  const [showDetailSheets, setShowDetailSheets] = useState(false);
  
  // State for selecting which parts to generate
  // Initially Standard parts
  const [selectedParts, setSelectedParts] = useState<string[]>(Object.values(PartType));
  // State for selected pose
  const [targetPose, setTargetPose] = useState<PoseType>(PoseType.A_POSE);

  // Computed state to check if we have a full reference set
  const hasAllViews = useMemo(() => {
      // In Single View Mode, we only need the Front view
      if (isSingleViewMode) {
          return !!appState.views[ViewType.FRONT].originalImage;
      }
      // In Standard Mode, we need all 4 (Front, Semi, Side, Back)
      // Note: Semi-Side is now mandatory for the full sheet experience in V1.18
      return !!(appState.views[ViewType.FRONT].originalImage && 
                appState.views[ViewType.SEMI_SIDE].originalImage && 
                appState.views[ViewType.SIDE].originalImage && 
                appState.views[ViewType.BACK].originalImage);
  }, [appState.views, isSingleViewMode]);

  // Helper to update view state
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

  const handleUpload = (view: ViewType, base64: string) => {
    updateViewState(view, {
      originalImage: base64,
      userUploadedImage: base64, // Store the raw upload
      parts: INITIAL_VIEW_STATE(view).parts // Reset parts on new upload
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

  // RESET PROJECT - Removed window.confirm for immediate action
  const handleResetProject = () => {
    setAppState(getInitialAppState());
    setSelectedParts(Object.values(PartType));
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
  };

  // --- CUSTOM PARTS LOGIC ---
  const handleAddCustomPart = () => {
      if (!customPartInput.trim()) return;

      const newId = `custom_${Date.now()}`;
      const newPart: CustomPart = { id: newId, label: customPartInput.trim() };
      
      setAppState(prev => ({
          ...prev,
          customParts: [...prev.customParts, newPart],
          // Initialize empty sheet and refs for this new part
          generatedSheets: {
              ...prev.generatedSheets,
              [newId]: { partType: newId, imgUrl: null, isLoading: false, modifications: [] }
          },
          manualReferences: {
              ...prev.manualReferences,
              [newId]: []
          }
      }));
      // Automatically select the new part
      setSelectedParts(prev => [...prev, newId]);
      setCustomPartInput(""); // Reset input
  };

  const handleRemoveCustomPart = (id: string) => {
      setAppState(prev => ({
          ...prev,
          customParts: prev.customParts.filter(p => p.id !== id),
          // Clean up generated data (optional, but good for memory)
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

  // Phase 1: Analyze and Crop for a specific view
  const processViewAnalysis = async (view: ViewType, imageData: CharacterView) => {
    // Prefer the user's raw upload for analysis to get max fidelity crops.
    // Fallback to originalImage (which might be the generated/normalized one).
    const imageToAnalyze = imageData.userUploadedImage || imageData.originalImage;
    
    if (!imageToAnalyze) return null;

    try {
      // Pass custom labels to analysis
      const customLabels = appState.customParts.map(p => p.label);
      const analysis = await analyzeCharacterImage(imageToAnalyze, customLabels);
      
      if (!analysis) {
        console.warn(`Failed to analyze ${view} view.`);
        return null;
      }

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

      // Standard parts
      for (const mapping of partMappings) {
        if (mapping.coords && mapping.coords.length === 4 && mapping.coords.some(c => c > 0)) {
          const [ymin, xmin, ymax, xmax] = mapping.coords;
          const box: BoundingBox = { ymin, xmin, ymax, xmax };
          const croppedUrl = await cropImage(imageToAnalyze, box);

          newParts[mapping.type] = {
            type: mapping.type,
            label: PART_LABELS[mapping.type], // Use Canonical Label for internal structure
            box,
            imgUrl: croppedUrl,
          };
        }
      }

      // Custom parts from analysis result
      if (analysis.custom && analysis.custom.length > 0) {
          for (const customItem of analysis.custom) {
              // Find matching CustomPart definition by label
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

  const generatePart = async (pType: string, currentState: AppState, overrideModifications?: Modification[]) => {
    const crops: string[] = [];
    
    // 1. Add Auto-detected crops from views
    const viewsToCheck = isSingleViewMode 
        ? [ViewType.FRONT] 
        : [ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK];

    viewsToCheck.forEach(v => {
      const partData = currentState.views[v].parts[pType];
      if (partData?.imgUrl) {
        crops.push(partData.imgUrl);
      }
    });

    // 2. Add Manual References if exists
    const manualRefs = currentState.manualReferences[pType];
    if (manualRefs && manualRefs.length > 0) {
      crops.push(...manualRefs);
    }

    // 3. FALLBACK FOR CUSTOM PARTS (If analysis failed to crop, use full view context)
    if (crops.length === 0) {
        viewsToCheck.forEach(v => {
            const fullImg = currentState.views[v].originalImage;
            if (fullImg) {
                crops.push(fullImg);
            }
        });
    }

    if (crops.length === 0) {
        setAppState(prev => ({
            ...prev,
            generatedSheets: {
              ...prev.generatedSheets,
              [pType]: { 
                ...prev.generatedSheets[pType], 
                imgUrl: null, 
                isLoading: false 
              }
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

    // Use passed modifications or current state modifications
    const modificationsToUse = overrideModifications || currentState.generatedSheets[pType].modifications;

    // Determine correct label to pass
    // Internal label for prompting (Canonical English)
    let labelToPass = PART_LABELS[pType];
    if (!labelToPass) {
        // Find in custom parts
        const custom = currentState.customParts.find(c => c.id === pType);
        labelToPass = custom ? custom.label : "Custom Part";
    }

    // Pass partType to the service to handle specific prompting logic (gloves, etc)
    // Pass globalStylePrompt from the current state
    const compositeUrl = await generateCompositeSheet(crops, pType, labelToPass, modificationsToUse, currentState.globalStylePrompt);

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
      // Don't trigger if already loading
      if (appState.generatedSheets[part].isLoading) return;
      // Reuse existing modifications
      await generatePart(part, appState);
  };

  const handlePartModification = async (part: string, prompt: string, image: string | null) => {
      if (appState.generatedSheets[part].isLoading) return;
      
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

      // Update state with new prompt history
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

      // Trigger generation with new history
      await generatePart(part, appState, updatedModifications);
  };

  const handleDeleteModification = async (part: string, modId: string) => {
      if (appState.generatedSheets[part].isLoading) return;

      // Filter out the deleted modification
      const updatedModifications = appState.generatedSheets[part].modifications.filter(m => m.id !== modId);

      // Update state
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

      // Trigger re-generation with the cleaned history
      await generatePart(part, appState, updatedModifications);
  };

  // --- View Modification Handlers ---
  const handleViewModification = async (view: ViewType, prompt: string, image: string | null) => {
      if (isProcessing) return;

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

      // Update state first
      updateViewState(view, { modifications: updatedModifications });

      // Trigger regeneration using existing logic
      await handleRegenerateView(view, updatedModifications);
  };

  const handleDeleteViewModification = async (view: ViewType, modId: string) => {
      if (isProcessing) return;

      const updatedModifications = appState.views[view].modifications.filter(m => m.id !== modId);
      
      // Update state
      updateViewState(view, { modifications: updatedModifications });

      // Trigger regeneration
      await handleRegenerateView(view, updatedModifications);
  };

  const handleRegenerateView = async (view: ViewType, overrideModifications?: Modification[]) => {
      if (isProcessing) return;
      setIsProcessing(true);
      setProcessingView(view); // Mark this view as processing
      setErrorMsg(null);
      
      // Determine label safely
      let label = t.views[view] || 'VIEW';
      
      setStatusText(`${label} ${t.status_waiting.replace("대기중", "...")}`); // Simple fallback logic or just use localized status directly

      try {
          // If checking front view, prefer the user's raw upload to ensure we re-normalize from source
          // For Side/Back/Semi, we use the (potentially normalized) Front view as the source
          const sourceImage = view === ViewType.FRONT 
            ? (appState.views[ViewType.FRONT].userUploadedImage || appState.views[ViewType.FRONT].originalImage)
            : appState.views[ViewType.FRONT].originalImage;

          if (!sourceImage) {
              setErrorMsg(t.error_no_ref);
              setIsProcessing(false);
              setProcessingView(null);
              return;
          }

          const modsToUse = overrideModifications || appState.views[view].modifications;
          
          // Use Semi-Side as context if regenerating Side or Back
          const contextImage = (view === ViewType.SIDE || view === ViewType.BACK)
             ? appState.views[ViewType.SEMI_SIDE].originalImage
             : null;

          const newViewImage = await generateCharacterView(sourceImage, view, targetPose, modsToUse, contextImage);
          
          if (newViewImage) {
               updateViewState(view, {
                   originalImage: newViewImage,
                   // If regenerating Front, we keep the userUploadedImage as is. 
               });
          } else {
              setErrorMsg(t.error_view_fail);
          }

      } catch (error) {
          console.error(error);
          setErrorMsg(t.error_view_fail);
      } finally {
          setIsProcessing(false);
          setProcessingView(null);
          setStatusText(t.status_waiting);
      }
  };

  // --- TEXT GENERATION HANDLER ---
  const handleGenerateFromText = async () => {
      if (!textPrompt.trim()) {
          setErrorMsg(t.input_prompt);
          return;
      }
      
      setIsProcessing(true);
      setErrorMsg(null);
      setGlobalProgress(0); // Reset
      setStatusText(t.status_text_gen);

      try {
          // Start progress
          setGlobalProgress(10);
          const generatedImage = await generateCharacterFromText(textPrompt, textRefImage);
          setGlobalProgress(100);
          
          if (generatedImage) {
              // Set as Front View (Both Original and UserUploaded to act as source)
              updateViewState(ViewType.FRONT, {
                  originalImage: generatedImage,
                  userUploadedImage: generatedImage, // Treating generated image as source
                  parts: INITIAL_VIEW_STATE(ViewType.FRONT).parts
              });
              
              // Switch off text mode to show the result
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
    setIsProcessing(true);
    setErrorMsg(null);
    setGlobalProgress(0);
    setStatusText(t.status_ref_check);

    let currentViews = { ...appState.views };
    const frontImage = currentViews[ViewType.FRONT].originalImage;

    if (!frontImage) {
        setErrorMsg(t.error_no_ref);
        setIsProcessing(false);
        return;
    }

    try {
        setGlobalProgress(5); // Started

        // Step 1: Intermediate 3/4 View Generation (If not single view)
        let threeQuarterRef: string | null = null;
        if (!isSingleViewMode) {
             const needsSemi = !currentViews[ViewType.SEMI_SIDE].originalImage;
             
             if (needsSemi) {
                 setStatusText(t.status_3q);
                 // Use the RAW user upload if available for max detail, else the working image
                 const sourceFor3Q = currentViews[ViewType.FRONT].userUploadedImage || frontImage;
                 // Now we use generateCharacterView with SEMI_SIDE type
                 threeQuarterRef = await generateCharacterView(sourceFor3Q, ViewType.SEMI_SIDE, targetPose, []);
                 
                 if (threeQuarterRef) {
                     currentViews[ViewType.SEMI_SIDE] = { ...currentViews[ViewType.SEMI_SIDE], originalImage: threeQuarterRef };
                     setAppState(prev => ({ ...prev, views: { ...prev.views, [ViewType.SEMI_SIDE]: currentViews[ViewType.SEMI_SIDE] } }));
                 }
             } else {
                 threeQuarterRef = currentViews[ViewType.SEMI_SIDE].originalImage;
             }
        }
        setGlobalProgress(35); // 3/4 View Done

        // Step 2: Normalize Front View
        setStatusText(`${t.status_norm} (${POSE_LABELS[targetPose]})...`);
        
        // Pass any existing modifications for front view if they exist, AND the 3/4 view as context
        const normalizedFront = await generateCharacterView(
            frontImage, 
            ViewType.FRONT, 
            targetPose, 
            currentViews[ViewType.FRONT].modifications,
            threeQuarterRef
        );
        
        if (normalizedFront) {
             currentViews[ViewType.FRONT] = {
                 ...currentViews[ViewType.FRONT],
                 originalImage: normalizedFront, 
                 parts: INITIAL_VIEW_STATE(ViewType.FRONT).parts 
             };
             // Update intermediate state
             setAppState(prev => ({ ...prev, views: { ...prev.views, [ViewType.FRONT]: currentViews[ViewType.FRONT] } }));
        }
        setGlobalProgress(65); // Front Normalized

        // Step 3: Generate Missing Views (Skip if in Single View Mode)
        if (!isSingleViewMode) {
            const needsSide = !currentViews[ViewType.SIDE].originalImage;
            const needsBack = !currentViews[ViewType.BACK].originalImage;

            if (needsSide || needsBack) {
                setStatusText(t.status_4view);
                
                // Generate using RAW front image (or normalized if we just made it)
                const sourceForGeneration = currentViews[ViewType.FRONT].userUploadedImage || normalizedFront || frontImage;

                const [sideImg, backImg] = await Promise.all([
                    needsSide ? generateCharacterView(sourceForGeneration!, ViewType.SIDE, targetPose, [], threeQuarterRef) : Promise.resolve(null),
                    needsBack ? generateCharacterView(sourceForGeneration!, ViewType.BACK, targetPose, [], threeQuarterRef) : Promise.resolve(null)
                ]);

                if (sideImg) {
                    currentViews[ViewType.SIDE] = { ...currentViews[ViewType.SIDE], originalImage: sideImg };
                }
                if (backImg) {
                    currentViews[ViewType.BACK] = { ...currentViews[ViewType.BACK], originalImage: backImg };
                }
                
                // Final View State Update for this phase
                setAppState(prev => ({ ...prev, views: currentViews }));
                setIsMultiView(true); // Force show all views
            }
        }
        setGlobalProgress(90); // All Views Done
        
        // 4. Extract Color Palette Immediately (Requested feature)
        // We do this if it's not already extracted
        if (appState.colorPalette.length === 0) {
            setStatusText(t.status_palette);
            const rawFront = currentViews[ViewType.FRONT].userUploadedImage || normalizedFront || frontImage;
            if (rawFront) {
                const palette = await extractColorPalette(rawFront);
                setAppState(prev => ({ 
                    ...prev, 
                    views: currentViews, // Ensure we keep the views
                    colorPalette: palette 
                }));
            }
        }
        setGlobalProgress(100); // Palette Done

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
      if (selectedParts.length === 0) {
        setErrorMsg(t.error_select_part);
        return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setGlobalProgress(0);
    setStatusText(t.status_analyze);
    
    // DELAYED: Do not show detailed sheets immediately to avoid empty slots
    // setShowDetailSheets(true);

    let currentViews = { ...appState.views };

    try {
        setGlobalProgress(5);
        // In Single View Mode, only analyze Front. Otherwise all 4.
        const viewsToAnalyze = isSingleViewMode 
            ? [ViewType.FRONT] 
            : [ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK];

        // Perform analysis
        const analysisResults = await Promise.all(viewsToAnalyze.map(v => processViewAnalysis(v, currentViews[v])));

        // Update view parts
        analysisResults.forEach(res => {
            if (res) {
                currentViews[res.view] = {
                    ...currentViews[res.view],
                    parts: res.parts
                };
            }
        });
        
        setGlobalProgress(20); // Analysis Complete

        const detectedParts = new Set<string>();
        
        // 1. Check if any view has a crop for this part
        const viewsToCheck = isSingleViewMode 
            ? [ViewType.FRONT] 
            : [ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK];

        viewsToCheck.forEach(view => {
             const viewData = currentViews[view];
             if (viewData) {
                 Object.values(PartType).forEach(part => {
                     if (viewData.parts[part]?.imgUrl) {
                         detectedParts.add(part);
                     }
                 });
                 
                 // Also check for custom parts detection in the view parts
                 appState.customParts.forEach(cp => {
                     if (viewData.parts[cp.id]?.imgUrl) {
                         detectedParts.add(cp.id);
                     }
                 });
             }
        });

        // 2. Check if there are any manual references
        Object.keys(appState.manualReferences).forEach(key => {
            if (appState.manualReferences[key] && appState.manualReferences[key].length > 0) {
                detectedParts.add(key);
            }
        });

        // 3. Update Selected Parts to only those that exist
        // For custom parts, even if no crop is found, we want to allow generation using the full-body fallback.
        // So we explicitly add all selected custom parts to the 'detected' set to bypass the filter.
        appState.customParts.forEach(cp => {
            if (selectedParts.includes(cp.id)) {
                detectedParts.add(cp.id);
            }
        });

        const validPartsToGenerate = selectedParts.filter(p => detectedParts.has(p));
        setSelectedParts(validPartsToGenerate); // Update UI state

        if (validPartsToGenerate.length === 0) {
            setErrorMsg(t.error_no_part);
            setIsProcessing(false);
            setGlobalProgress(0);
            return;
        }

        // Update state with analysis
        setAppState(prev => ({ 
            ...prev, 
            views: currentViews
        }));
        
        // Temp state for generation
        const tempStateForGeneration: AppState = {
            ...appState,
            views: currentViews
        };

        // Generate Sheets using the Valid parts list with Progress Tracking
        setStatusText(t.status_sheet);
        
        const totalParts = validPartsToGenerate.length;
        let completedParts = 0;

        // Execute in parallel but track progress
        await Promise.all(validPartsToGenerate.map(async (pType) => {
            await generatePart(pType, tempStateForGeneration, undefined);
            completedParts++;
            // Calculate progress: Start at 20%, ends at 100%. Range is 80%.
            const currentProgress = 20 + ((completedParts / totalParts) * 80);
            setGlobalProgress(currentProgress);
        }));

        // NOW SHOW THE SHEETS after generation is complete
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

  // --- MAIN ACTION HANDLER ---
  const handleMainAction = () => {
      if (isTextMode) {
          handleGenerateFromText();
      } else if (hasAllViews) {
          handleGenerateSheets();
      } else {
          // Trigger the copyright warning before proceeding to generate views
          setShowCopyrightWarning(true);
      }
  };
  
  const confirmCopyrightAndGenerate = () => {
      setShowCopyrightWarning(false);
      handleGenerateViews();
  };

  const handleToggleSingleView = () => {
    const nextMode = !isSingleViewMode;
    setIsSingleViewMode(nextMode);
    
    if (nextMode) {
        // ENTERING SINGLE VIEW MODE
        setIsMultiView(false);
        setIsTextMode(false);
        
        // Reset Logic
        setAppState(prev => {
            const frontRaw = prev.views[ViewType.FRONT].userUploadedImage;
            return {
                ...prev,
                views: {
                    ...prev.views,
                    [ViewType.FRONT]: {
                        ...prev.views[ViewType.FRONT],
                        originalImage: frontRaw || prev.views[ViewType.FRONT].originalImage
                    },
                    [ViewType.SEMI_SIDE]: INITIAL_VIEW_STATE(ViewType.SEMI_SIDE),
                    [ViewType.SIDE]: INITIAL_VIEW_STATE(ViewType.SIDE),
                    [ViewType.BACK]: INITIAL_VIEW_STATE(ViewType.BACK)
                }
            };
        });
    }
  };

  const handleToggleTextMode = () => {
      const nextMode = !isTextMode;
      setIsTextMode(nextMode);
      if (nextMode) {
          setIsMultiView(false);
          setIsSingleViewMode(false);
          // Don't reset app state completely to keep uploaded images if any, but focus shifts
      }
  };
  
  // Handler for global style prompt changes
  const handleStylePromptChange = (val: string) => {
      setAppState(prev => ({
          ...prev,
          globalStylePrompt: val
      }));
  };

  return (
    <div className="min-h-screen bg-[#f4f4f4] text-slate-900 p-4 md:p-8 font-sans">
      <style>{`
        /* Removed loop animation, will use width transition for real progress */
        .progress-bar-fill {
            transition: width 0.5s ease-out;
        }
      `}</style>
      <div className="max-w-[1800px] mx-auto">
        
        {/* Header Section */}
        <div className="relative text-center mb-12 pt-10">
          
          {/* Language Selector (Top Right) */}
          <div className="absolute top-0 right-0 z-50 flex items-center gap-2">
              <Globe size={18} className="text-slate-400" />
              <select 
                  value={language}
                  onChange={(e) => {
                      setLanguage(e.target.value as Language);
                      // Update Status text immediately when language changes
                      setStatusText(TRANSLATIONS[e.target.value as Language].status_waiting);
                  }}
                  className="bg-transparent text-sm font-bold text-slate-600 hover:text-[#0F4C81] focus:outline-none cursor-pointer appearance-none uppercase"
              >
                  <option value={Language.KO}>한국어</option>
                  <option value={Language.EN}>English</option>
                  <option value={Language.JA}>日本語</option>
                  <option value={Language.ZH}>中文</option>
              </select>
          </div>

          <div className="flex items-center justify-center gap-4 mb-4">
              <Palette size={48} className="text-[#0F4C81]" />
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

          {/* Info Section: Usage & Patch Notes - CLICKABLE CARDS */}
          <div className="flex flex-col md:flex-row justify-center gap-4 max-w-3xl mx-auto text-left mb-10">
              
              {/* Usage Guide Button */}
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

              {/* Patch Notes Button */}
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
          </div>
        </div>

        {/* --- MODALS --- */}
        <Modal isOpen={activeModal === 'usage'} onClose={() => setActiveModal(null)} title={t.usage_guide}>
             <div className="space-y-8 text-slate-800">
                 {/* Usage Content simplified for translation or just kept simple */}
                 <p className="text-sm">{t.usage_desc}</p>
                 {/* (For brevity, full usage guide translation logic can be expanded, but main steps are clearer in UI now) */}
             </div>
        </Modal>

        <Modal isOpen={activeModal === 'patch'} onClose={() => setActiveModal(null)} title={t.patch_notes}>
             <div className="space-y-0 divide-y divide-slate-100">
                 {PATCH_NOTES.map((note, idx) => (
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

        {/* COPYRIGHT WARNING CONFIRMATION MODAL */}
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
            {/* Multi View Toggle */}
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

            {/* Single View Mode Toggle */}
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

            {/* Text Generation Mode Toggle */}
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

        {/* INPUT AREA: Swaps between Image Grid and Text Input */}
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
            /* Standard Image Upload Grid - UPDATED TO 4 COLUMNS */
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

        {/* Pose Selection - Only show if not all views generated yet AND not in Single View Mode AND not Text Mode */}
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

        {/* Part Selection Grid - Only Show if Views are Ready */}
        <div className={`max-w-[1400px] mx-auto mb-10 transition-all duration-500 ${hasAllViews ? 'opacity-100' : 'opacity-40 grayscale pointer-events-none'}`}>
            <h3 className="text-center text-slate-400 uppercase tracking-widest text-base font-bold mb-6">
                {t.part_select}
            </h3>
            {/* UPDATED GRID: 6 COLUMNS */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {/* Standard Parts */}
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

                {/* Custom Parts */}
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

                {/* "ETC" Add Button - REPLACED WITH DIRECT INPUT */}
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
          
          {/* Main Action Button - HIDDEN WHEN VIEWS ARE READY (STEP 1 DONE) */}
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
                                    <Loader2 className="animate-spin w-8 h-8" />
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
                        {/* Main Button Gauge Bar - ACTUAL PROGRESS */}
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

        {/* Result Section - Show when we have all views (Step 1 complete) */}
        {hasAllViews && (
            <div className="animate-fade-in-up">
                  <CharacterSheet 
                      data={appState} 
                      selectedParts={selectedParts} 
                      showDetailSheets={showDetailSheets}
                      onRegeneratePart={handleRegeneratePart}
                      onRegenerateView={(view) => handleRegenerateView(view)}
                      onManualPartUpload={handleAddManualReference}
                      onRemoveManualReference={handleRemoveManualReference}
                      onPartModification={handlePartModification}
                      onDeleteModification={handleDeleteModification}
                      onRemovePartCrop={handleRemovePartCrop}
                      onViewModification={handleViewModification}
                      onDeleteViewModification={handleDeleteViewModification}
                      processingView={processingView}
                      onGenerateSheets={handleGenerateSheets}
                      isProcessing={isProcessing}
                      progress={globalProgress}
                      // New props
                      globalStylePrompt={appState.globalStylePrompt}
                      onStylePromptChange={handleStylePromptChange}
                      onReset={handleResetProject}
                      language={language}
                  />
                  <div className="text-center mt-20 mb-20">
                     {/* Bottom Reset Button Removed */}
                  </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;
