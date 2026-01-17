
import React, { useState, useEffect, useRef } from "react";
import { AppState, ViewType, PartType, Language } from "../types";
import { TRANSLATIONS } from "../src/constants";
import { Download, Loader2, RefreshCw, Layers, Check, Plus, X, Send, ImagePlus, Paperclip, Camera, ImageDown, Zap, Wand2, RotateCcw, ZoomIn, MoveVertical, MoveHorizontal, Search, Coffee, SplitSquareHorizontal, ArrowLeftRight, Sparkles, ChevronsUp, CheckSquare, Square, SlidersHorizontal, Undo2, Redo2, FolderArchive } from "lucide-react";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import { fileToBase64 } from "../utils/imageUtils";
import { Mascot } from "./Mascot";

interface CharacterSheetProps {
  data: AppState;
  selectedParts: string[];
  showDetailSheets: boolean;
  onRegeneratePart: (part: string) => void;
  onRegenerateView: (view: ViewType) => void;
  onManualPartUpload: (part: string, base64: string | null) => void; 
  onRemoveManualReference: (part: string, index: number) => void;
  onPartModification: (part: string, prompt: string, image: string | null) => void;
  onDeleteModification: (part: string, id: string) => void;
  onRemovePartCrop: (view: ViewType, part: string) => void;
  onViewModification: (view: ViewType, prompt: string, image: string | null) => void;
  onDeleteViewModification: (view: ViewType, id: string) => void;
  processingView: ViewType | null; 
  onGenerateSheets: () => void;
  isProcessing: boolean;
  progress: number;
  globalStylePrompt?: string;
  onStylePromptChange?: (val: string) => void;
  onReset: () => void;
  language: Language;
  onOpenSupport: () => void;
  onSwapViewImage?: (view: ViewType, type: 'user' | 'generated') => void;
  onUpscalePart?: (part: string) => void; 
  onUpscaleView?: (view: ViewType) => void;
  upscalingView?: ViewType | null;
  upscalingPart?: string | null;
  upscalingParts?: string[]; // New: Array support for batch upscaling
  
  // Batch Operations (Views)
  processingViews?: ViewType[];
  upscalingViews?: ViewType[];
  selectedRefViews?: ViewType[];
  onToggleRefView?: (view: ViewType) => void;
  onBatchRegenerateViews?: (views: ViewType[]) => void;
  onBatchUpscaleViews?: (views: ViewType[]) => void;

  // New: Reference Balance Slider
  referenceBalance?: number;
  onReferenceBalanceChange?: (val: number) => void;

  // Local Undo/Redo Handlers
  onViewUndo?: (view: ViewType) => void;
  onViewRedo?: (view: ViewType) => void;
  onPartUndo?: (part: string) => void;
  onPartRedo?: (part: string) => void;

  // Batch Part Handlers
  onBatchUpscaleParts?: (parts: string[]) => void;
  onBatchRegenerateParts?: (parts: string[]) => void;
  onBatchUndoParts?: (parts: string[]) => void;
  onBatchRedoParts?: (parts: string[]) => void;
}

const ZoomOverlay: React.FC = () => (
    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 bg-black/5">
        <div className="bg-white/90 text-[#0F4C81] p-3 rounded-full shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300 backdrop-blur-sm border border-white/50">
            <ZoomIn size={24} />
        </div>
    </div>
);

// Reusable Zoomable Image Pane with its own independent controls
const ZoomablePane: React.FC<{ 
    src: string; 
    label?: string; 
    bgClass?: string;
    mixBlend?: boolean;
}> = ({ src, label, bgClass = "bg-slate-50", mixBlend = false }) => {
    const [zoom, setZoom] = useState(1);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (zoom > 1) {
            setIsDragging(true);
            setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && zoom > 1) {
            setPosition({ x: e.clientX - startPos.x, y: e.clientY - startPos.y });
        }
    };

    const handleMouseUp = () => setIsDragging(false);
    
    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = -e.deltaY * 0.001;
        setZoom(z => Math.min(Math.max(1, z + delta), 5));
    };

    useEffect(() => {
        if (zoom === 1) setPosition({ x: 0, y: 0 });
    }, [zoom]);

    const panRange = (zoom - 1) * 500; 

    return (
        <div 
            ref={containerRef}
            className={`relative w-full h-full overflow-hidden flex items-center justify-center p-0 cursor-crosshair ${bgClass}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onClick={e => e.stopPropagation()}
        >
            {label && (
                <div className="absolute top-4 left-4 bg-white/90 px-3 py-1 rounded-full shadow text-xs font-bold uppercase text-[#0F4C81] border border-slate-200 z-10 pointer-events-none">
                    {label}
                </div>
            )}

            <div className="absolute inset-0 opacity-5 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
            </div>

            <img 
                src={src} 
                className={`transition-transform duration-75 ease-out object-contain origin-center will-change-transform ${mixBlend ? 'mix-blend-multiply' : 'bg-white shadow-2xl border border-slate-100'}`} 
                alt="Zoomable" 
                draggable={false}
                style={{ 
                    transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
                    cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in',
                    maxWidth: '90%',
                    maxHeight: '80vh',
                }}
            />

            <div className="absolute inset-0 pointer-events-none">
                {zoom > 1 && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 h-1/3 bg-white/90 backdrop-blur shadow-xl border border-slate-200 rounded-full w-10 flex flex-col items-center justify-between py-4 pointer-events-auto animate-fade-in">
                        <MoveVertical size={14} className="text-slate-400" />
                        <input 
                            type="range" 
                            {...({ orient: "vertical" } as any)}
                            min={-panRange} 
                            max={panRange} 
                            value={-position.y} 
                            onChange={(e) => setPosition({ ...position, y: -parseFloat(e.target.value) })}
                            className="h-full w-1.5 accent-[#0F4C81] cursor-ns-resize appearance-none bg-slate-200 rounded-full my-2"
                            style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' } as any}
                        />
                    </div>
                )}

                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-4 flex flex-col gap-2 items-center pointer-events-auto">
                    {zoom > 1 && (
                        <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full border border-slate-200 shadow-md flex items-center gap-3 w-3/4 animate-fade-in-up">
                            <span className="text-[8px] font-bold text-slate-400">X</span>
                            <input 
                                type="range" 
                                min={-panRange} 
                                max={panRange} 
                                value={-position.x} 
                                onChange={(e) => setPosition({ ...position, x: -parseFloat(e.target.value) })}
                                className="w-full accent-[#0F4C81] h-1 bg-slate-200 rounded-lg appearance-none cursor-ew-resize"
                            />
                            <MoveHorizontal size={12} className="text-slate-400" />
                        </div>
                    )}

                    <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-xl border border-slate-200 shadow-lg flex items-center gap-3 w-full">
                        <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="text-slate-400 hover:text-[#0F4C81] p-1 rounded-full hover:bg-slate-100">
                            <ZoomIn size={16} className="transform rotate-180" />
                        </button>
                        <input 
                            type="range" 
                            min="1" 
                            max="5" 
                            step="0.1" 
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="w-full accent-[#0F4C81] cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
                        />
                        <button onClick={() => setZoom(Math.min(5, zoom + 0.5))} className="text-slate-400 hover:text-[#0F4C81] p-1 rounded-full hover:bg-slate-100">
                            <ZoomIn size={16} />
                        </button>
                        <span className="text-[#0F4C81] font-mono text-xs font-bold w-10 text-center">{Math.round(zoom * 100)}%</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const MagnifiedModal: React.FC<{ src: string; originalSrc: string | null; onClose: () => void; compareLabel: string }> = ({ src, originalSrc, onClose, compareLabel }) => {
    const [isComparing, setIsComparing] = useState(false);
    useEffect(() => { if (!originalSrc) setIsComparing(false); }, [originalSrc]);
    return (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-fade-in text-slate-900" onClick={onClose}>
             <div className="w-full p-4 flex justify-between items-center z-[110] relative bg-white border-b border-slate-200 shadow-sm">
                 <div className="flex gap-4 items-center">
                     <div className="flex items-center gap-2 text-slate-800"><Search size={20} className="text-[#0F4C81]" /><h3 className="font-black tracking-widest text-lg">IMAGE VIEWER</h3></div>
                     {originalSrc && (
                         <button onClick={(e) => { e.stopPropagation(); setIsComparing(!isComparing); }} className={`px-4 py-2 rounded-lg border transition-colors font-bold text-sm flex items-center gap-2 shadow-sm ${isComparing ? 'bg-[#0F4C81] border-[#0F4C81] text-white' : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'}`}>
                             <SplitSquareHorizontal size={18} /><span>{compareLabel || "Compare"}</span>
                         </button>
                     )}
                 </div>
                 <button onClick={onClose} className="bg-slate-100 hover:bg-red-50 hover:text-red-500 text-slate-500 p-2 rounded-full transition-colors"><X size={24} /></button>
             </div>
             <div className="flex-1 w-full h-full flex overflow-hidden relative bg-slate-100">
                 {isComparing && originalSrc && (<div className="w-1/2 h-full border-r border-slate-200 relative"><ZoomablePane src={originalSrc} label="ORIGINAL" bgClass="bg-slate-50" mixBlend={true} /></div>)}
                 <div className={`${isComparing ? 'w-1/2' : 'w-full'} h-full relative`}><ZoomablePane src={src} bgClass="bg-white" mixBlend={false} /></div>
             </div>
        </div>
    );
};

const MiniPartUploader: React.FC<{ onUpload: (base64: string | null) => void; label?: string; }> = ({ onUpload, label = "ADD" }) => {
    const [isDragging, setIsDragging] = useState(false);
    const processFile = async (file: File) => { if (!file.type.startsWith("image/")) return; try { const base64 = await fileToBase64(file); onUpload(base64); } catch (err) { console.error(err); } };
    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) { await processFile(e.target.files[0]); } };
    return (
        <div className={`relative w-24 h-24 shrink-0 hide-on-print transition-all duration-200 ${isDragging ? 'scale-110' : ''}`} onDragOver={(e) => {e.preventDefault(); setIsDragging(true);}} onDragLeave={(e) => {e.preventDefault(); setIsDragging(false);}} onDrop={async (e) => {e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files[0]) await processFile(e.dataTransfer.files[0]);}} tabIndex={0}>
            <label className={`w-full h-full border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${isDragging ? 'border-[#0F4C81] bg-blue-50 text-[#0F4C81]' : 'border-slate-300 hover:border-[#0F4C81] bg-slate-50 hover:bg-blue-50 text-slate-300 hover:text-[#0F4C81]'}`} title="이미지 드래그 & 드롭 또는 붙여넣기">
                <Plus size={32} /><span className="text-xs font-bold uppercase mt-1 text-center leading-tight whitespace-pre-line">{label}</span><input type="file" className="hidden" accept="image/*" onChange={handleInputChange}/>
            </label>
        </div>
    );
};

const ModificationInput: React.FC<{ onSubmit: (text: string, image: string | null) => void; isLoading: boolean; placeholder?: string; }> = ({ onSubmit, isLoading, placeholder }) => {
    const [text, setText] = useState("");
    const [image, setImage] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const processFile = async (file: File) => { if (!file.type.startsWith("image/")) return; try { const base64 = await fileToBase64(file); setImage(base64); } catch (err) { console.error(err); } };
    const handleSubmit = () => { if ((text.trim() || image) && !isLoading) { onSubmit(text, image); setText(""); setImage(null); } };
    return (
        <div className={`relative flex flex-col gap-2 rounded border transition-colors ${isDragging ? 'border-[#0F4C81] bg-blue-50' : 'border-slate-200 bg-slate-50'}`} onDragOver={(e) => {e.preventDefault(); setIsDragging(true);}} onDragLeave={(e) => {e.preventDefault(); setIsDragging(false);}} onDrop={async (e) => {e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files[0]) await processFile(e.dataTransfer.files[0]);}} onPaste={async (e) => { const items = e.clipboardData.items; for (let i = 0; i < items.length; i++) { if (items[i].type.indexOf("image") !== -1) { const file = items[i].getAsFile(); if (file) await processFile(file); return; } } }}>
            {image && (<div className="p-2 border-b border-slate-200 bg-white/50"><div className="relative w-fit inline-block"><img src={image} className="h-16 w-auto rounded border border-slate-200 object-cover" alt="Attachment" /><button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700 shadow"><X size={12} /></button></div></div>)}
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="w-full h-24 p-3 bg-transparent text-base text-slate-800 resize-none focus:outline-none placeholder:text-slate-400" onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }} />
            <div className="flex justify-between items-center px-2 pb-2">
                <label className="p-2 text-slate-400 hover:text-[#0F4C81] cursor-pointer rounded-full hover:bg-slate-200 transition-colors" title="이미지 첨부"><ImagePlus size={18} /><input type="file" className="hidden" accept="image/*" onChange={async (e) => { if (e.target.files && e.target.files[0]) await processFile(e.target.files[0]); }} /></label>
                <button onClick={handleSubmit} disabled={isLoading || (!text.trim() && !image)} className="p-2 bg-black text-white rounded hover:bg-[#0F4C81] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2" title="요청 전송">{isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
            </div>
            {isDragging && (<div className="absolute inset-0 bg-blue-50/90 border-2 border-[#0F4C81] border-dashed rounded flex flex-col items-center justify-center text-[#0F4C81] pointer-events-none z-10"><Paperclip size={24} className="mb-2" /><span className="font-bold text-sm">Drop Image Here</span></div>)}
        </div>
    );
};

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ 
    data, selectedParts, showDetailSheets, onRegeneratePart, onRegenerateView, onManualPartUpload, 
    onRemoveManualReference, onPartModification, onDeleteModification, onRemovePartCrop, 
    onViewModification, onDeleteViewModification, processingView, onGenerateSheets, 
    isProcessing, progress, globalStylePrompt, onStylePromptChange, onReset, language, 
    onOpenSupport, onSwapViewImage, onUpscalePart, onUpscaleView, upscalingView, upscalingPart, upscalingParts = [],
    // Batch Props
    processingViews = [], upscalingViews = [], selectedRefViews = [], onToggleRefView, onBatchRegenerateViews, onBatchUpscaleViews,
    // Ref Balance
    referenceBalance = 5, onReferenceBalanceChange,
    // Undo/Redo Handlers
    onViewUndo, onViewRedo, onPartUndo, onPartRedo,
    // Batch Part Handlers
    onBatchUpscaleParts, onBatchRegenerateParts, onBatchUndoParts, onBatchRedoParts
}) => {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
  const [magnifiedState, setMagnifiedState] = useState<{ src: string; originalSrc: string | null } | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const t = TRANSLATIONS[language];

  // Updated to 4 Views
  const views = [ViewType.FRONT, ViewType.SEMI_SIDE, ViewType.SIDE, ViewType.BACK];
  
  // Defined order for display - Face and Hair first usually, then standard parts, then custom parts
  const standardParts = Object.values(PartType);
  const customPartIds = data.customParts.map(cp => cp.id);
  const partOrder = [...standardParts, ...customPartIds];

  // Filter parts based on what the user has selected in App.tsx
  const visibleParts = partOrder.filter(part => selectedParts.includes(part));

  const handleDownloadSheet = async () => {
    const element = document.getElementById("character-sheet");
    if (element) {
        element.classList.add("printing");
        try {
            const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 1.5, useCORS: true });
            const imageData = canvas.toDataURL("image/jpeg", 0.9);
            const link = document.createElement("a");
            link.href = imageData;
            link.download = "character_concept_sheet_full.jpg";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } finally {
            element.classList.remove("printing");
        }
    }
  };

  const handleDownloadImagesOnly = async () => {
    const element = document.getElementById("clean-export-container");
    if (element) {
        element.style.display = "block";
        try {
            const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 2, useCORS: true, windowWidth: 1800 });
            const imageData = canvas.toDataURL("image/jpeg", 0.95);
            const link = document.createElement("a");
            link.href = imageData;
            link.download = "character_concept_clean_assets.jpg";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } finally {
            element.style.display = "none";
        }
    }
  };

  const handleDownloadZip = async () => {
      const zip = new JSZip();
      const viewsFolder = zip.folder("views");
      const partsFolder = zip.folder("parts");

      // 1. Add View Images
      views.forEach(view => {
          const viewData = data.views[view];
          if (viewData.originalImage) {
              try {
                  const base64Data = viewData.originalImage.split(',')[1];
                  if (base64Data) {
                      viewsFolder?.file(`${view}_view.png`, base64Data, { base64: true });
                  }
              } catch (e) {
                  console.error(`Failed to add ${view} to zip`, e);
              }
          }
      });

      // 2. Add Part Sheet Images
      // Iterate through ALL parts in data to avoid missing any potential generation, 
      // but strictly check if imgUrl exists.
      const allParts = [...Object.values(PartType), ...data.customParts.map(c => c.id)];
      
      allParts.forEach(partKey => {
          const sheet = data.generatedSheets[partKey];
          // Only add if imgUrl exists and is valid
          if (sheet && sheet.imgUrl && sheet.imgUrl.startsWith("data:image")) {
              try {
                  const parts = sheet.imgUrl.split(',');
                  // Ensure we have a valid split
                  if (parts.length < 2) return;
                  
                  const base64Data = parts[1];
                  if (base64Data) {
                      const rawLabel = t.parts[partKey] || data.customParts.find(p => p.id === partKey)?.label || partKey;
                      const cleanLabel = rawLabel.split('/')[0].trim().replace(/[^a-z0-9]/gi, '_').toLowerCase();
                      
                      // Using partKey (ID) in filename ensures uniqueness even if labels are same
                      partsFolder?.file(`${cleanLabel}_${partKey}.png`, base64Data, { base64: true });
                  }
              } catch (e) {
                  console.error(`Failed to add part ${partKey} to zip`, e);
              }
          }
      });

      try {
          const content = await zip.generateAsync({ type: "blob" });
          const link = document.createElement("a");
          link.href = URL.createObjectURL(content);
          link.download = "character_sheet_assets.zip";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      } catch (e) {
          console.error("Failed to generate zip", e);
          alert("ZIP generation failed.");
      }
  };

  const handleDownloadImage = (url: string, name: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyHex = (color: string) => {
      navigator.clipboard.writeText(color);
      setCopiedColor(color);
      setTimeout(() => setCopiedColor(null), 1500);
  };

  const updateResolution = (key: string, e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      const res = `${img.naturalWidth}x${img.naturalHeight}`;
      if (resolutions[key] !== res) {
          setResolutions(prev => ({ ...prev, [key]: res }));
      }
  };

  const hasOriginals = views.some(v => data.views[v].originalImage);
  if (!hasOriginals) return null;

  return (
    <div className="w-full mt-8 flex flex-col items-center">
      <style>{`
        .printing .hide-on-print { display: none !important; }
        @keyframes fill-progress { 0% { width: 0%; } 100% { width: 95%; } }
        .animate-fill-progress { animation: fill-progress 15s cubic-bezier(0.1, 0.4, 0.2, 1) forwards; }
      `}</style>

      {magnifiedState && (
          <MagnifiedModal src={magnifiedState.src} originalSrc={magnifiedState.originalSrc} onClose={() => setMagnifiedState(null)} compareLabel={t.btn_compare} />
      )}
      
      {/* ... (Clean Export Container is same as before) ... */}
      <div id="clean-export-container" style={{ display: "none", position: "absolute", top: 0, left: 0, width: "1800px", zIndex: -1000 }} className="bg-white p-8">
        <h1 className="text-4xl font-black mb-8 border-b-4 border-black pb-4">ASSET EXPORT - CLEAN</h1>
        <div className="flex gap-4 mb-8 items-start">
            {data.views[ViewType.FRONT].userUploadedImage && (
                <div className="flex flex-col gap-2 w-[350px]">
                    <img src={data.views[ViewType.FRONT].userUploadedImage!} className="w-full h-auto border border-slate-200" />
                    <span className="text-sm font-bold bg-slate-100 px-2 py-1 inline-block">SOURCE</span>
                </div>
            )}
            {views.map(view => {
                const img = data.views[view].originalImage;
                if (!img) return null;
                return (
                    <div key={view} className="flex flex-col gap-2 w-[350px]">
                        <img src={img} className="w-full h-auto border border-slate-200" />
                        <span className="text-sm font-bold bg-slate-100 px-2 py-1 inline-block">{t.view_labels[view]}</span>
                    </div>
                )
            })}
        </div>
        <div className="grid grid-cols-2 gap-8">
            {visibleParts.map(part => {
                const sheet = data.generatedSheets[part];
                if (!sheet.imgUrl) return null;
                return (
                    <div key={part} className="flex flex-col gap-2 break-inside-avoid">
                        <img src={sheet.imgUrl} className="w-full h-auto border border-slate-200" />
                        <span className="text-sm font-bold uppercase bg-slate-100 px-2 py-1 inline-block">{t.parts[part] || part}</span>
                    </div>
                )
            })}
        </div>
      </div>

      <div className="w-full max-w-[1800px] flex justify-end gap-4 mb-6 flex-wrap">
        <button onClick={handleDownloadZip} className="flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-800 px-8 py-4 font-bold transition-colors uppercase text-lg tracking-wider shadow-lg border border-slate-200">
            <FolderArchive size={22} />{t.btn_zip_save || "ZIP Export"}
        </button>
        <button onClick={handleDownloadImagesOnly} className="flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-800 px-8 py-4 font-bold transition-colors uppercase text-lg tracking-wider shadow-lg border border-slate-200">
            <Camera size={22} />{t.btn_clean_save}
        </button>
        <button onClick={handleDownloadSheet} className="flex items-center gap-3 bg-[#0F4C81] hover:bg-blue-900 text-white px-8 py-4 font-bold transition-colors uppercase text-lg tracking-wider shadow-xl">
            <Download size={22} />{t.btn_full_save}
        </button>
        <button onClick={onOpenSupport} className="flex items-center gap-3 bg-orange-100 hover:bg-orange-200 text-orange-800 px-8 py-4 font-bold transition-colors uppercase text-lg tracking-wider shadow-lg border border-orange-200">
            <Coffee size={22} />{t.buy_coffee}
        </button>
      </div>

      <div id="character-sheet" className="w-full max-w-[1800px] bg-white text-slate-900 p-16 shadow-2xl relative" style={{ fontFamily: "'Rajdhani', 'Noto Sans KR', sans-serif" }}>
        <div className="absolute inset-0 pointer-events-none z-0 opacity-5">
            <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>
        </div>

        <div className="flex justify-between items-end border-b-8 border-[#0F4C81] pb-10 mb-16 relative z-10">
          <div>
            <h1 className="text-8xl font-black text-black tracking-tighter uppercase mb-2">{t.header_title}</h1>
            <div className="flex items-center gap-4">
                <span className="bg-black text-white px-4 py-1 text-base font-bold uppercase tracking-widest">CHARSHEET AI V1.33</span>
                <span className="text-[#0F4C81] text-base uppercase tracking-widest font-bold">{t.powered_by}</span>
            </div>
          </div>
          <div className="text-right">
             <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{t.header_theme}</div>
             <div className="text-4xl font-mono font-bold text-[#0F4C81]">Classic Blue 19-4052</div>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-16">
            
            <div className="flex flex-col gap-10 items-center border-b border-dashed border-slate-200 pb-16">
                
                <div className="text-center flex flex-col items-center gap-6 w-full max-w-4xl mx-auto mb-4">
                     <div className="flex flex-col items-center mb-4">
                        <h3 className="font-black text-6xl uppercase tracking-tighter text-black">{t.main_ref}</h3>
                        <p className="text-[#0F4C81] text-lg uppercase tracking-widest mt-2 font-bold">{t.analysis_4view}</p>
                     </div>
                </div>

                {/* Unified Control Bar - RESTRUCTURED */}
                <div className="w-full max-w-[1600px] mx-auto mb-10 flex flex-col gap-6 hide-on-print">
                    
                    {/* Top: Reference Balance Slider (Full Width) */}
                    {onReferenceBalanceChange && (
                        <div className="w-full max-w-5xl mx-auto bg-white p-6 border border-slate-200 shadow-md rounded-2xl flex flex-col justify-center gap-4">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-widest">
                                    <SlidersHorizontal size={18} /> <span>{t.ref_balance_title}</span>
                                </div>
                                <div className="text-xs font-bold text-[#0F4C81] bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                                    {referenceBalance} / 10
                                </div>
                            </div>
                            
                            <div className="relative w-full px-2">
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="10" 
                                    step="1"
                                    value={referenceBalance}
                                    onChange={(e) => onReferenceBalanceChange(parseInt(e.target.value))}
                                    className="w-full accent-[#0F4C81] h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between w-full text-sm font-bold text-slate-500 uppercase tracking-widest mt-2">
                                    <span className={`${referenceBalance === 0 ? 'text-[#0F4C81]' : ''}`}>{t.ref_original} (10:0)</span>
                                    <span className={`${referenceBalance === 5 ? 'text-[#0F4C81]' : ''}`}>MIX (5:5)</span>
                                    <span className={`${referenceBalance === 10 ? 'text-[#0F4C81]' : ''}`}>{t.ref_generated} (0:10)</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Bottom Row: Reset -> Style -> Generate */}
                    <div className="w-full max-w-5xl mx-auto flex flex-col xl:flex-row gap-4 items-stretch h-auto xl:h-20">
                        
                        {/* Reset Button */}
                        <button onClick={onReset} disabled={isProcessing} className="h-16 xl:h-full px-8 bg-white border border-slate-200 text-slate-500 font-bold uppercase tracking-wider hover:bg-red-50 hover:text-red-600 hover:border-red-200 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 shrink-0" title={t.reset}>
                            <RotateCcw size={20} />
                            <span className="hidden md:inline">{t.reset}</span>
                        </button>

                        {/* Style Input (Expands) */}
                        <div className="flex-1 h-16 xl:h-full bg-slate-50 border border-slate-200 rounded-xl flex items-center px-6 gap-3 focus-within:bg-white focus-within:border-[#0F4C81] focus-within:shadow-md transition-all shadow-inner">
                             <Wand2 size={22} className="text-slate-400 shrink-0" />
                             <input 
                                type="text" 
                                value={globalStylePrompt || ""} 
                                onChange={(e) => onStylePromptChange && onStylePromptChange(e.target.value)} 
                                placeholder={t.style_override} 
                                className="bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 text-base font-bold w-full h-full" 
                                disabled={isProcessing} 
                             />
                        </div>

                        {/* Generate Button (Big & Right) */}
                        <button onClick={onGenerateSheets} disabled={isProcessing} className={`h-20 xl:h-full px-12 bg-[#0F4C81] text-white text-xl font-black uppercase tracking-widest shadow-xl hover:bg-blue-900 transition-all rounded-xl flex items-center justify-center gap-3 relative overflow-hidden group hover:scale-105 shrink-0 min-w-[280px] ${isProcessing ? 'cursor-not-allowed opacity-80' : ''}`}>
                             <div className="relative z-10 flex items-center gap-3">
                                {isProcessing ? <Loader2 size={28} className="animate-spin" /> : <Zap size={28} className="fill-white group-hover:scale-110 transition-transform" />}
                                <span>{showDetailSheets ? t.btn_regen_sheet : t.btn_gen_sheet}</span>
                             </div>
                             {isProcessing && (<div className="absolute bottom-0 left-0 w-full h-1.5 bg-white/30"><div className="h-full bg-white transition-all duration-500" style={{ width: `${progress}%` }}></div></div>)}
                        </button>

                    </div>
                    
                    <div className="text-center w-full max-w-5xl mx-auto -mt-2 space-y-1">
                         <p className="text-[#0F4C81] text-sm font-bold">{t.upscale_hint}</p>
                         <p className="text-slate-400 text-xs font-medium">{t.ref_balance_note}</p>
                         <p className="text-slate-400 text-xs font-medium">{t.style_ref_note}</p>
                    </div>

                </div>

                {/* BATCH ACTION BAR FOR VIEWS */}
                {selectedRefViews && onBatchRegenerateViews && onBatchUpscaleViews && selectedRefViews.length > 0 && (
                    <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-xl shadow-lg border border-slate-200 hide-on-print animate-fade-in-up">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{selectedRefViews.length} Selected</span>
                        <div className="h-4 w-px bg-slate-200 mx-2"></div>
                        <button onClick={() => onBatchUpscaleViews(selectedRefViews)} disabled={upscalingViews.length > 0} className="flex items-center gap-2 text-[#0F4C81] hover:text-blue-700 font-bold uppercase text-xs disabled:opacity-50">
                            <ChevronsUp size={16} /> {t.batch_upscale || "Upscale Selected"}
                        </button>
                        <div className="h-4 w-px bg-slate-200 mx-2"></div>
                        <button onClick={() => onBatchRegenerateViews(selectedRefViews)} disabled={processingViews.length > 0} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold uppercase text-xs disabled:opacity-50">
                            <RefreshCw size={16} /> {t.batch_regenerate || "Regenerate Selected"}
                        </button>
                    </div>
                )}

                {/* View Cards Section ... */}
                <div className="flex gap-8 overflow-x-auto pb-8 pt-4 items-start justify-center w-full px-4">
                    {/* ... Existing view rendering code ... */}
                    {data.views[ViewType.FRONT].userUploadedImage && 
                     data.views[ViewType.FRONT].userUploadedImage !== data.views[ViewType.FRONT].originalImage && (
                        <div className="flex flex-col gap-0 w-[280px] shrink-0 bg-white shadow-lg border border-slate-100">
                            <div className="relative w-full aspect-[3/4] p-4 group cursor-zoom-in" onClick={() => setMagnifiedState({ src: data.views[ViewType.FRONT].userUploadedImage!, originalSrc: null })}>
                                <img src={data.views[ViewType.FRONT].userUploadedImage!} className="w-full h-full object-contain mix-blend-multiply" alt="Original Input" />
                                <div className="absolute top-2 left-2 text-sm font-bold bg-[#0F4C81] text-white px-3 py-1 uppercase tracking-wide">{t.original}</div>
                                <ZoomOverlay />
                                <div className="absolute top-2 right-2 flex gap-2 hide-on-print z-20" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => handleDownloadImage(data.views[ViewType.FRONT].userUploadedImage!, 'original_upload')} className="bg-white hover:bg-slate-100 p-2 rounded-full shadow border border-slate-200 text-slate-700" title={t.btn_clean_save}>
                                        <ImageDown size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 bg-white border-t border-slate-100"><h4 className="font-black text-xl mb-1">{t.source}</h4><p className="text-slate-500 font-bold text-sm">{t.user_upload}</p></div>
                        </div>
                    )}

                    {views.map(view => {
                        const viewData = data.views[view];
                        if (view !== ViewType.FRONT && !viewData.originalImage) return null;
                        
                        let labelName = t.view_labels[view] || 'VIEW';
                        
                        const isRegenerating = processingViews.includes(view);
                        const isUpscaling = upscalingViews.includes(view);
                        const isLoading = isRegenerating || isUpscaling;
                        
                        const canSwap = !!(viewData.userUploadedImage && viewData.generatedImage);
                        const isShowingOriginal = viewData.originalImage === viewData.userUploadedImage;
                        const comparisonOriginal = viewData.userUploadedImage || data.views[ViewType.FRONT].userUploadedImage;
                        const resolution = resolutions[`view-${view}`] || "";
                        const isSelected = selectedRefViews?.includes(view);

                        const canUndo = viewData.history.undoStack.length > 0;
                        const canRedo = viewData.history.redoStack.length > 0;

                        return (
                            <div key={view} className={`flex flex-col gap-0 w-[280px] shrink-0 bg-white shadow-lg border transition-all duration-300 ${isSelected ? 'border-[#0F4C81] ring-2 ring-[#0F4C81]/20' : 'border-slate-100'}`}>
                                
                                {canSwap && onSwapViewImage && (
                                    <button onClick={() => onSwapViewImage(view, isShowingOriginal ? 'generated' : 'user')} className={`w-full py-3 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all border-b border-slate-100 ${isShowingOriginal ? 'bg-slate-800 text-white hover:bg-black' : 'bg-white text-[#0F4C81] hover:bg-slate-50'}`}>
                                        <ArrowLeftRight size={14} />{isShowingOriginal ? t.btn_use_generated : t.btn_use_original}
                                    </button>
                                )}

                                <div className="relative w-full aspect-[3/4] p-4 overflow-hidden group">
                                    {viewData.originalImage ? (
                                        <>
                                            <img src={viewData.originalImage!} className={`w-full h-full object-contain mix-blend-multiply transition-all duration-700 cursor-zoom-in ${isLoading ? 'opacity-30 blur-[2px]' : ''}`} alt={view} onClick={() => !isLoading && setMagnifiedState({ src: viewData.originalImage!, originalSrc: comparisonOriginal })} onLoad={(e) => updateResolution(`view-${view}`, e)} />
                                            {!isLoading && <ZoomOverlay />}
                                            
                                            {isLoading && (
                                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                                                        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm"></div>
                                                        <div className="relative flex flex-col items-center gap-4 bg-white px-6 py-4 shadow-xl border border-[#0F4C81] animate-fade-in-up">
                                                            <div className="flex items-center gap-3 text-[#0F4C81] font-bold uppercase tracking-widest text-xs">
                                                                <Mascot size={24} emotion="thinking" />
                                                                <span>{isUpscaling ? '업스케일 중...' : 'Regenerating...'}</span>
                                                            </div>
                                                            <div className="w-48 h-1.5 bg-slate-200 overflow-hidden relative"><div className="absolute top-0 left-0 h-full bg-[#0F4C81] animate-fill-progress"></div></div>
                                                        </div>
                                                </div>
                                            )}

                                            {!isLoading && (
                                                <>
                                                    {onToggleRefView && (
                                                        <div className="absolute top-2 left-2 z-30 hide-on-print" onClick={(e) => { e.stopPropagation(); onToggleRefView(view); }}>
                                                            <div className={`p-2 rounded-lg cursor-pointer transition-all shadow-sm ${isSelected ? 'bg-[#0F4C81] text-white' : 'bg-white text-slate-300 hover:text-[#0F4C81]'}`}>
                                                                {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="absolute top-2 right-2 flex flex-col gap-2 hide-on-print z-20" onClick={e => e.stopPropagation()}>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => handleDownloadImage(viewData.originalImage!, `view_${view.toLowerCase()}`)} className="bg-white hover:bg-slate-100 p-2 rounded-full shadow border border-slate-200 text-slate-700" title="이미지 다운로드">
                                                                <ImageDown size={20} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {onViewUndo && onViewRedo && (
                                                        <div className="absolute bottom-2 right-2 flex gap-1 z-30 hide-on-print" onClick={e => e.stopPropagation()}>
                                                            <button 
                                                                onClick={() => onViewUndo(view)} 
                                                                disabled={!canUndo || isLoading}
                                                                className="bg-white/80 hover:bg-white text-slate-700 p-2 rounded-full shadow-md border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm transition-all"
                                                                title="Undo"
                                                            >
                                                                <Undo2 size={16} />
                                                            </button>
                                                            <button 
                                                                onClick={() => onViewRedo(view)} 
                                                                disabled={!canRedo || isLoading}
                                                                className="bg-white/80 hover:bg-white text-slate-700 p-2 rounded-full shadow-md border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm transition-all"
                                                                title="Redo"
                                                            >
                                                                <Redo2 size={16} />
                                                            </button>
                                                        </div>
                                                    )}

                                                    {resolution && (
                                                        <div className="absolute bottom-2 left-2 z-20 hide-on-print pointer-events-none">
                                                            <span className="bg-black/60 backdrop-blur-sm text-white text-sm font-bold font-mono px-2 py-1 rounded shadow-sm border border-white/20">
                                                                {resolution}
                                                            </span>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 text-base font-bold">
                                            <Mascot size={40} emotion="sleepy" className="opacity-50 mb-2" />
                                            <span className="uppercase">{t.no_asset}</span>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="p-4 bg-white border-t border-slate-100">
                                    <h4 className="font-black text-xl mb-1">{t.analysis_label}</h4>
                                    <p className="text-slate-500 font-bold text-sm">{labelName}</p>
                                    
                                    <div className="mt-4 hide-on-print">
                                        <ModificationInput onSubmit={(text, img) => onViewModification(view, text, img)} isLoading={isLoading} placeholder={`Refine...`} />
                                        {data.views[view].modifications && data.views[view].modifications.length > 0 && (
                                            <div className="flex flex-col gap-1 mt-2 max-h-[100px] overflow-y-auto">
                                                {data.views[view].modifications.map((mod) => (
                                                    <div key={mod.id} className="text-[10px] text-[#0F4C81] flex justify-between items-center bg-blue-50 px-2 py-1">
                                                        <span className="truncate">{mod.prompt}</span>
                                                        <button onClick={() => onDeleteViewModification(view, mod.id)}><X size={10} /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Color Palette Section */}
            {data.colorPalette && data.colorPalette.length > 0 && (
                <div className="grid grid-cols-[300px_1fr] gap-10 items-start border-b border-dashed border-slate-200 pb-16">
                    <div className="text-right pr-6 pt-2">
                        <h3 className="font-black text-4xl uppercase text-black">{t.palette_title}</h3>
                        <p className="text-[#0F4C81] text-base uppercase tracking-wider mt-2 font-bold">{t.extracted_colors}</p>
                    </div>
                    <div className="flex flex-wrap gap-6">
                         {data.colorPalette.map((color, idx) => (
                            <div key={idx} className="group relative bg-white shadow-md p-2 hover:-translate-y-2 transition-transform">
                                <button onClick={() => handleCopyHex(color)} className="flex flex-col items-start gap-2" title="클릭하여 복사">
                                    <div className="w-24 h-24 shadow-inner" style={{ backgroundColor: color }} />
                                    <div className="w-full">
                                        <h4 className="font-black text-lg leading-none">{t.color}</h4>
                                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">{copiedColor === color ? <Check size={12} className="text-green-500"/> : color}</span>
                                    </div>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* BATCH ACTION BAR FOR PARTS (New) */}
            {showDetailSheets && visibleParts.length > 0 && (
                <div className="w-full max-w-[1600px] mx-auto mb-16 flex justify-center hide-on-print">
                    <div className="flex items-center gap-4 bg-white px-8 py-4 rounded-2xl shadow-xl border border-slate-200 animate-fade-in-up">
                        <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mr-2">PART ACTIONS ({visibleParts.length})</span>
                        
                        <div className="h-6 w-px bg-slate-200 mx-2"></div>
                        
                        <button 
                            onClick={() => onBatchUndoParts && onBatchUndoParts(visibleParts)}
                            className="flex items-center gap-2 text-slate-600 hover:text-[#0F4C81] font-bold uppercase text-xs disabled:opacity-50 transition-colors"
                            title={t.batch_parts_undo}
                        >
                            <Undo2 size={18} /> {t.batch_parts_undo || "Undo All"}
                        </button>

                        <button 
                            onClick={() => onBatchRedoParts && onBatchRedoParts(visibleParts)}
                            className="flex items-center gap-2 text-slate-600 hover:text-[#0F4C81] font-bold uppercase text-xs disabled:opacity-50 transition-colors"
                            title={t.batch_parts_redo}
                        >
                            <Redo2 size={18} /> {t.batch_parts_redo || "Redo All"}
                        </button>

                        <div className="h-6 w-px bg-slate-200 mx-2"></div>

                        <button 
                            onClick={() => onBatchUpscaleParts && onBatchUpscaleParts(visibleParts)} 
                            disabled={upscalingParts && upscalingParts.length > 0} 
                            className="flex items-center gap-2 text-[#0F4C81] hover:text-blue-700 font-bold uppercase text-xs disabled:opacity-50 transition-colors"
                        >
                            <ChevronsUp size={18} /> {t.batch_parts_upscale || "Upscale All"}
                        </button>
                        
                        <button 
                            onClick={() => onBatchRegenerateParts && onBatchRegenerateParts(visibleParts)} 
                            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold uppercase text-xs disabled:opacity-50 transition-colors"
                        >
                            <RefreshCw size={18} /> {t.batch_parts_regen || "Regen All"}
                        </button>
                    </div>
                </div>
            )}

            {/* Part Rows */}
            {showDetailSheets && visibleParts.map((partType) => {
                const sheet = data.generatedSheets[partType];
                const manualRefs = data.manualReferences[partType] || [];
                const label = t.parts[partType] || data.customParts.find(p => p.id === partType)?.label || "Custom Part";
                const resolution = resolutions[`part-${partType}`] || "";
                
                // Use array check for loading state
                const isPartUpscaling = upscalingParts ? upscalingParts.includes(partType) : (upscalingPart === partType);
                
                // Get the separate Original Crop from app state
                const originalCrop = data.originalParts?.[partType]?.imgUrl;

                const canPartUndo = sheet.history.undoStack.length > 0;
                const canPartRedo = sheet.history.redoStack.length > 0;

                return (
                    <div key={partType} className="grid grid-cols-[300px_1fr_300px] gap-12 border-b border-slate-100 pb-16 last:border-0 group/row">
                        <div className="text-right pt-8">
                            <h3 className="font-black text-4xl uppercase text-black break-keep leading-tight">{label.split(' / ')[0]}</h3>
                            <p className="text-[#0F4C81] text-base uppercase tracking-wider mt-2 font-bold">{label.split(' / ')[1] || "CUSTOM DETAIL"}</p>
                            <div className="mt-8 flex flex-col items-end gap-3">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.source_chips}</div>
                                <div className="flex gap-2 justify-end flex-wrap max-w-[280px]">
                                    {manualRefs.map((refImg, index) => (
                                        <div key={`manual-${index}`} className="relative w-20 h-24 shrink-0 hide-on-print group/mini bg-white shadow-sm border border-slate-100 p-1">
                                            <div className="w-full h-16 relative overflow-hidden cursor-zoom-in" onClick={() => setMagnifiedState({ src: refImg, originalSrc: data.views[ViewType.FRONT].userUploadedImage })}><img src={refImg} className="w-full h-full object-cover" alt={`Manual Ref ${index}`} /></div>
                                            <div className="text-[8px] font-bold text-slate-400 mt-1">{t.manual}</div>
                                            <div className="absolute inset-0 pointer-events-none"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/mini:opacity-100 transition-opacity"><div className="bg-white/80 p-1 rounded-full"><ZoomIn size={12} className="text-[#0F4C81]" /></div></div></div>
                                            <button onClick={() => onRemoveManualReference(partType, index)} className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 w-4 h-4 flex items-center justify-center opacity-0 group-hover/mini:opacity-100 transition-opacity z-20" title="이미지 삭제"><X size={10} /></button>
                                        </div>
                                    ))}
                                    <MiniPartUploader onUpload={(b64) => onManualPartUpload(partType, b64)} label={t.add} />
                                    
                                    {/* Original Chip - Conditional Rendering based on Balance < 10 */}
                                    {originalCrop && referenceBalance! < 10 && (
                                        <div className="w-20 h-24 bg-white shadow-sm border border-slate-100 p-1 relative group/crop hover:scale-110 transition-transform origin-top-right z-10 animate-fade-in">
                                            <div className="w-full h-16 relative cursor-zoom-in" onClick={() => setMagnifiedState({ src: originalCrop, originalSrc: data.views[ViewType.FRONT].userUploadedImage })}><img src={originalCrop} className="w-full h-full object-contain" alt="Original" /></div>
                                            <div className="text-[8px] font-bold text-[#0F4C81] mt-1 uppercase">ORIGINAL</div>
                                            <div className="absolute inset-0 pointer-events-none"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/crop:opacity-100 transition-opacity"><div className="bg-white/80 p-1 rounded-full"><ZoomIn size={12} className="text-[#0F4C81]" /></div></div></div>
                                        </div>
                                    )}

                                    {/* Render Normalized/Generated Views - Conditional Rendering based on Balance > 0 */}
                                    {referenceBalance! > 0 && views.map(v => {
                                        const crop = data.views[v].parts[partType]?.imgUrl;
                                        if (!crop) return null;
                                        let labelName = t.view_labels[v] || 'VIEW';
                                        return (
                                            <div key={v} className="w-20 h-24 bg-white shadow-sm border border-slate-100 p-1 relative group/crop hover:scale-110 transition-transform origin-top-right z-10 animate-fade-in">
                                                <div className="w-full h-16 relative cursor-zoom-in" onClick={() => setMagnifiedState({ src: crop, originalSrc: data.views[ViewType.FRONT].userUploadedImage })}><img src={crop} className="w-full h-full object-contain" alt="ref" /></div>
                                                <div className="text-[8px] font-bold text-slate-400 mt-1 uppercase">{labelName}</div>
                                                <div className="absolute inset-0 pointer-events-none"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/crop:opacity-100 transition-opacity"><div className="bg-white/80 p-1 rounded-full"><ZoomIn size={12} className="text-[#0F4C81]" /></div></div></div>
                                                <button onClick={() => onRemovePartCrop(v, partType)} className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5 w-4 h-4 flex items-center justify-center opacity-0 group-hover/crop:opacity-100 transition-opacity z-20 hide-on-print"><X size={10} /></button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="relative w-full bg-white min-h-[500px] border border-slate-200 flex flex-col items-center justify-center overflow-hidden group/image shadow-inner p-8">
                            {sheet.imgUrl ? (
                                <>
                                    <img src={sheet.imgUrl} className={`w-full h-auto object-contain max-h-[800px] transition-all duration-700 cursor-zoom-in ${sheet.isLoading ? 'opacity-30 grayscale-[50%] blur-[2px] scale-95' : ''}`} alt={`${label} Sheet`} onClick={() => !sheet.isLoading && setMagnifiedState({ src: sheet.imgUrl!, originalSrc: data.views[ViewType.FRONT].userUploadedImage })} onLoad={(e) => updateResolution(`part-${partType}`, e)} />
                                    {!sheet.isLoading && <ZoomOverlay />}
                                </>
                            ) : (
                                !sheet.isLoading && (
                                    <div className="flex flex-col items-center gap-2">
                                        <Mascot size={48} emotion="sleepy" className="opacity-50" />
                                        <div className="text-slate-300 text-base uppercase tracking-widest font-bold">{t.no_asset}</div>
                                        <button onClick={() => onRegeneratePart(partType)} className="text-base text-[#0F4C81] hover:underline hide-on-print font-bold">{t.generate}</button>
                                    </div>
                                )
                            )}
                            
                            {sheet.isLoading && (
                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                                     {!sheet.imgUrl && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm"></div>}
                                     <div className="relative flex flex-col items-center gap-4 bg-white/90 px-10 py-8 shadow-2xl border border-[#0F4C81] animate-fade-in-up">
                                          <div className="flex items-center gap-3 text-[#0F4C81] font-bold uppercase tracking-widest text-sm">
                                              <Mascot size={28} emotion="excited" />
                                              <span>{isPartUpscaling ? '업스케일 중...' : t.designing}</span>
                                          </div>
                                          <div className="w-72 h-2 bg-slate-200 overflow-hidden relative"><div className="absolute top-0 left-0 h-full bg-[#0F4C81] animate-fill-progress"></div></div>
                                          <p className="text-[10px] text-slate-400 font-medium tracking-wide">{t.analyzing_desc}</p>
                                     </div>
                                </div>
                            )}
                            
                            {sheet.imgUrl && !sheet.isLoading && (
                                <>
                                    {/* LOCAL UNDO/REDO BUTTONS - BOTTOM RIGHT INSIDE IMAGE */}
                                    {onPartUndo && onPartRedo && (
                                        <div className="absolute bottom-4 right-4 flex gap-2 z-30 hide-on-print" onClick={e => e.stopPropagation()}>
                                            <button 
                                                onClick={() => onPartUndo(partType)} 
                                                disabled={!canPartUndo || sheet.isLoading}
                                                className="bg-white/80 hover:bg-white text-slate-700 p-2.5 rounded-full shadow-md border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm transition-all"
                                                title="Undo"
                                            >
                                                <Undo2 size={20} />
                                            </button>
                                            <button 
                                                onClick={() => onPartRedo(partType)} 
                                                disabled={!canPartRedo || sheet.isLoading}
                                                className="bg-white/80 hover:bg-white text-slate-700 p-2.5 rounded-full shadow-md border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed backdrop-blur-sm transition-all"
                                                title="Redo"
                                            >
                                                <Redo2 size={20} />
                                            </button>
                                        </div>
                                    )}

                                    {/* PART UPSCALE BUTTON - MOVED DOWN to avoid FIG label overlap */}
                                    {onUpscalePart && (
                                        <div className="absolute top-12 left-4 flex items-center gap-2 hide-on-print z-30" onClick={e => e.stopPropagation()}>
                                            <button onClick={() => onUpscalePart(partType)} className="bg-white/90 hover:bg-[#0F4C81] hover:text-white p-3 rounded-xl shadow-lg border border-slate-200 text-[#0F4C81] transition-all backdrop-blur-sm" title={t.btn_upscale || "Upscale (4K)"}>
                                                <ChevronsUp size={24} />
                                            </button>
                                            {resolution && <span className="bg-black/60 backdrop-blur-sm text-white text-xs font-mono px-3 py-1.5 rounded-lg shadow border border-white/20">{resolution}</span>}
                                        </div>
                                    )}

                                    <div className="absolute top-4 right-4 flex gap-3 hide-on-print z-30" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => handleDownloadImage(sheet.imgUrl!, `ref_${partType}_sheet`)} className="bg-white hover:bg-slate-100 text-slate-700 p-3 rounded-full shadow-lg border border-slate-200" title="이미지 저장"><ImageDown size={24} /></button>
                                        <button onClick={() => onRegeneratePart(partType)} className="bg-white hover:bg-slate-100 text-slate-700 p-3 rounded-full shadow-lg border border-slate-200" title="재생성"><RefreshCw size={24} /></button>
                                    </div>
                                </>
                            )}
                            
                            <div className="absolute top-0 left-0 p-3 text-sm font-black text-black">FIG. {partType}</div>
                            <div className="absolute bottom-3 right-3 flex gap-2"><div className="w-24 h-4 bg-black"></div><div className="w-6 h-4 bg-[#0F4C81]"></div></div>
                        </div>

                        <div className="flex flex-col gap-6 pt-8 pr-8">
                             <div className="h-0.5 w-full bg-slate-200"></div>
                             <div className="flex flex-col gap-3 hide-on-print">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t.refine_design}</label>
                                <ModificationInput onSubmit={(text, img) => onPartModification(partType, text, img)} isLoading={sheet.isLoading} placeholder={`"${label.split(" / ")[0]}" ${t.modify_request}`} />
                                {sheet.modifications && sheet.modifications.length > 0 && (
                                    <div className="flex flex-col gap-2 mt-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Layers size={12}/> {t.applied_changes} ({sheet.modifications.length})</label>
                                        <div className="flex flex-col gap-2">
                                            {sheet.modifications.map((mod, index) => (
                                                <div key={mod.id} className="group relative flex gap-3 items-start text-xs text-[#0F4C81] bg-blue-50 p-3 border-l-2 border-[#0F4C81]">
                                                    <div className="flex-shrink-0 font-bold text-[#0F4C81] mt-0.5">{index + 1}.</div>
                                                    <div className="flex flex-col gap-1 w-full">
                                                        <span className="font-medium leading-relaxed">{mod.prompt || "(No Text)"}</span>
                                                        {mod.image && (<div className="mt-1 cursor-zoom-in relative group/thumb" onClick={() => setMagnifiedState({ src: mod.image!, originalSrc: null })}><img src={mod.image} className="h-10 w-auto border border-slate-200 object-cover" alt={`Ref ${index + 1}`}/><div className="absolute inset-0 bg-black/10 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity"><ZoomIn size={12} className="text-white"/></div></div>)}
                                                    </div>
                                                    <button onClick={() => onDeleteModification(partType, mod.id)} className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100" title="요청 삭제 및 재생성"><X size={14} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                             </div>
                             <div className="mt-auto text-sm text-slate-500 leading-relaxed font-medium">
                                 {partType === PartType.GLOVES && t.part_desc_gloves}
                                 {partType === PartType.TOP && t.part_desc_top}
                                 {/* ... other parts descriptions ... */}
                                 {![PartType.GLOVES, PartType.TOP].includes(partType as any) && t.part_desc_standard}
                             </div>
                             <div className="h-0.5 w-full bg-slate-200"></div>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};
