import React, { useState } from "react";
import { AppState, ViewType, PartType, Language } from "../types";
import { TRANSLATIONS } from "../constants";
import { Download, Loader2, RefreshCw, Layers, Check, Plus, X, Send, ImagePlus, Paperclip, Camera, ImageDown, Zap, Wand2, RotateCcw } from "lucide-react";
import html2canvas from "html2canvas";
import { fileToBase64 } from "../utils/imageUtils";

interface CharacterSheetProps {
  data: AppState;
  selectedParts: string[]; // Changed from PartType[] to string[] to support custom IDs
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
}

const MiniPartUploader: React.FC<{
    onUpload: (base64: string | null) => void;
    label?: string;
}> = ({ onUpload, label = "ADD" }) => {
    const [isDragging, setIsDragging] = useState(false);

    const processFile = async (file: File) => {
        if (!file.type.startsWith("image/")) return;
        try {
            const base64 = await fileToBase64(file);
            onUpload(base64);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await processFile(e.dataTransfer.files[0]);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) await processFile(file);
                break;
            }
        }
    };

    const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            await processFile(e.target.files[0]);
        }
    };

    return (
        <div 
            className={`relative w-24 h-24 shrink-0 hide-on-print transition-all duration-200 ${isDragging ? 'scale-110' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
            tabIndex={0} 
        >
            <label 
                className={`
                    w-full h-full border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors
                    ${isDragging 
                        ? 'border-[#0F4C81] bg-blue-50 text-[#0F4C81]' 
                        : 'border-slate-300 hover:border-[#0F4C81] bg-slate-50 hover:bg-blue-50 text-slate-300 hover:text-[#0F4C81]'
                    }
                `}
                title="이미지 드래그 & 드롭 또는 붙여넣기"
            >
                <Plus size={32} />
                <span className="text-xs font-bold uppercase mt-1 text-center leading-tight whitespace-pre-line">{label}</span>
                <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={handleInputChange}
                />
            </label>
        </div>
    );
};

const ModificationInput: React.FC<{
    onSubmit: (text: string, image: string | null) => void;
    isLoading: boolean;
    placeholder?: string;
}> = ({ onSubmit, isLoading, placeholder }) => {
    const [text, setText] = useState("");
    const [image, setImage] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    const processFile = async (file: File) => {
        if (!file.type.startsWith("image/")) return;
        try {
            const base64 = await fileToBase64(file);
            setImage(base64);
        } catch (err) {
            console.error(err);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await processFile(e.dataTransfer.files[0]);
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) await processFile(file);
                return; 
            }
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            await processFile(e.target.files[0]);
        }
    };

    const handleSubmit = () => {
        if ((text.trim() || image) && !isLoading) {
            onSubmit(text, image);
            setText(""); 
            setImage(null);
        }
    };

    return (
        <div 
            className={`relative flex flex-col gap-2 rounded border transition-colors
                ${isDragging ? 'border-[#0F4C81] bg-blue-50' : 'border-slate-200 bg-slate-50'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onPaste={handlePaste}
        >
            {/* Image Preview Area */}
            {image && (
                <div className="p-2 border-b border-slate-200 bg-white/50">
                    <div className="relative w-fit inline-block">
                        <img src={image} className="h-16 w-auto rounded border border-slate-200 object-cover" alt="Attachment" />
                        <button 
                            onClick={() => setImage(null)}
                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5 hover:bg-red-700 shadow"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>
            )}

            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                className="w-full h-24 p-3 bg-transparent text-base text-slate-800 resize-none focus:outline-none placeholder:text-slate-400"
                onKeyDown={(e) => {
                    if(e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                    }
                }}
            />
            
            <div className="flex justify-between items-center px-2 pb-2">
                <label className="p-2 text-slate-400 hover:text-[#0F4C81] cursor-pointer rounded-full hover:bg-slate-200 transition-colors" title="이미지 첨부">
                    <ImagePlus size={18} />
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileSelect} />
                </label>
                
                <button 
                    onClick={handleSubmit}
                    disabled={isLoading || (!text.trim() && !image)}
                    className="p-2 bg-black text-white rounded hover:bg-[#0F4C81] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    title="요청 전송"
                >
                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
            </div>
            
            {isDragging && (
                <div className="absolute inset-0 bg-blue-50/90 border-2 border-[#0F4C81] border-dashed rounded flex flex-col items-center justify-center text-[#0F4C81] pointer-events-none z-10">
                    <Paperclip size={24} className="mb-2" />
                    <span className="font-bold text-sm">Drop Image Here</span>
                </div>
            )}
        </div>
    );
};

export const CharacterSheet: React.FC<CharacterSheetProps> = ({ data, selectedParts, showDetailSheets, onRegeneratePart, onRegenerateView, onManualPartUpload, onRemoveManualReference, onPartModification, onDeleteModification, onRemovePartCrop, onViewModification, onDeleteViewModification, processingView, onGenerateSheets, isProcessing, progress, globalStylePrompt, onStylePromptChange, onReset, language }) => {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);
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
        // Temporarily hide buttons for the screenshot
        element.classList.add("printing");
        
        try {
            const canvas = await html2canvas(element, { 
                backgroundColor: "#ffffff",
                scale: 1.5, // Reduced scale slightly for very large canvas
                useCORS: true
            });
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
        // Show the hidden container
        element.style.display = "block";
        
        try {
            const canvas = await html2canvas(element, { 
                backgroundColor: "#ffffff",
                scale: 2, 
                useCORS: true,
                windowWidth: 1800 // Wider for 4 views
            });
            const imageData = canvas.toDataURL("image/jpeg", 0.95);
            const link = document.createElement("a");
            link.href = imageData;
            link.download = "character_concept_clean_assets.jpg";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } finally {
            // Hide it again
            element.style.display = "none";
        }
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

  // Helper to check if any part has data. Since we filter by selectedParts, we just check if any selected part has data or if view data exists.
  const hasOriginals = views.some(v => data.views[v].originalImage);
  if (!hasOriginals) return null;

  return (
    <div className="w-full mt-8 flex flex-col items-center">
      <style>{`
        .printing .hide-on-print {
            display: none !important;
        }
        /* Simulated fill for single operation - 0 to 95% over 15s */
        @keyframes fill-progress {
            0% { width: 0%; }
            100% { width: 95%; }
        }
        .animate-fill-progress {
            animation: fill-progress 15s cubic-bezier(0.1, 0.4, 0.2, 1) forwards;
        }
      `}</style>
      
      <div className="w-full max-w-[1800px] flex justify-end gap-4 mb-6 flex-wrap">
        {/* Reset button removed from here as per request */}
        <button
            onClick={handleDownloadImagesOnly}
            className="flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-800 px-8 py-4 font-bold transition-colors uppercase text-lg tracking-wider shadow-lg border border-slate-200"
        >
            <Camera size={22} />
            {t.btn_clean_save}
        </button>
        <button
            onClick={handleDownloadSheet}
            className="flex items-center gap-3 bg-[#0F4C81] hover:bg-blue-900 text-white px-8 py-4 font-bold transition-colors uppercase text-lg tracking-wider shadow-xl"
        >
            <Download size={22} />
            {t.btn_full_save}
        </button>
      </div>

      <div
        id="character-sheet"
        className="w-full max-w-[1800px] bg-white text-slate-900 p-16 shadow-2xl relative"
        style={{ fontFamily: "'Rajdhani', 'Noto Sans KR', sans-serif" }}
      >
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 pointer-events-none z-0 opacity-5">
            <div className="w-full h-full" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>
        </div>

        {/* Header */}
        <div className="flex justify-between items-end border-b-8 border-[#0F4C81] pb-10 mb-16 relative z-10">
          <div>
            <h1 className="text-8xl font-black text-black tracking-tighter uppercase mb-2">
              CHARACTER <span className="text-[#0F4C81]">SHEET</span>
            </h1>
            <div className="flex items-center gap-4">
                <span className="bg-black text-white px-4 py-1 text-base font-bold uppercase tracking-widest">CHARSHEET AI V1.28</span>
                <span className="text-[#0F4C81] text-base uppercase tracking-widest font-bold">Created by Mookxy • snu07001@naver.com</span>
            </div>
          </div>
          <div className="text-right">
             <div className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">{t.header_theme}</div>
             <div className="text-4xl font-mono font-bold text-[#0F4C81]">Classic Blue 19-4052</div>
          </div>
        </div>

        {/* Main Content Layout */}
        <div className="relative z-10 flex flex-col gap-16">
            
            {/* Top Row: Original References - REFACTORED LAYOUT */}
            <div className="flex flex-col gap-10 items-center border-b border-dashed border-slate-200 pb-16">
                
                {/* Header Block: Title + Button + Style Input */}
                <div className="text-center flex flex-col items-center gap-6">
                     <div className="flex flex-col items-center">
                        <h3 className="font-black text-6xl uppercase tracking-tighter text-black">{t.main_ref}</h3>
                        <p className="text-[#0F4C81] text-lg uppercase tracking-widest mt-2 font-bold">{t.analysis_4view}</p>
                     </div>
                     
                     {/* Control Row: Button and Style Input */}
                     <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
                        {/* NEW RESET BUTTON */}
                        <button
                            onClick={onReset}
                            disabled={isProcessing}
                            className="px-6 py-5 font-bold text-lg uppercase tracking-wider transition-all border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 shadow-lg flex items-center gap-2"
                            title="전체 초기화"
                        >
                            <RotateCcw size={20} />
                            <span className="hidden md:inline">{t.reset}</span>
                        </button>

                        {/* Step 2 Trigger Button */}
                        <button
                            onClick={onGenerateSheets}
                            disabled={isProcessing}
                            className={`
                                px-8 py-5 rounded-none font-black text-lg uppercase tracking-wider transition-all border-none flex items-center justify-center gap-3 hide-on-print relative overflow-hidden shadow-xl
                                ${isProcessing 
                                    ? 'bg-slate-100 text-slate-400 min-w-[240px]' 
                                    : 'bg-[#0F4C81] text-white hover:bg-blue-900 hover:shadow-blue-500/30'
                                }
                            `}
                        >
                            <div className="relative z-10 flex items-center gap-2">
                                {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <Zap size={20} className="fill-white" />}
                                <span>{showDetailSheets ? t.btn_regen_sheet : t.btn_gen_sheet}</span>
                            </div>
                            
                            {/* Progress Bar inside Button */}
                            {isProcessing && (
                                <div className="absolute bottom-0 left-0 w-full h-1.5 bg-white/30">
                                    <div 
                                        className="h-full bg-white transition-all duration-500"
                                        style={{ width: `${progress}%` }}
                                    ></div>
                                </div>
                            )}
                        </button>

                        {/* Style Override Input */}
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-none px-5 py-4 focus-within:border-[#0F4C81] focus-within:bg-white transition-all shadow-sm hide-on-print">
                            <Wand2 size={20} className="text-slate-400 shrink-0" />
                            <input 
                                type="text" 
                                value={globalStylePrompt || ""}
                                onChange={(e) => onStylePromptChange && onStylePromptChange(e.target.value)}
                                placeholder={t.style_override}
                                className="bg-transparent border-none outline-none text-slate-700 placeholder:text-slate-400 text-base font-medium w-64 md:w-80"
                                disabled={isProcessing}
                            />
                        </div>
                     </div>

                     <p className="text-slate-400 text-sm font-medium hide-on-print">
                         {t.style_note}
                     </p>
                </div>

                {/* Images Row */}
                <div className="flex gap-8 overflow-x-auto pb-8 pt-4 items-start justify-center w-full px-4">
                    {/* Render User Uploaded "Original" if different from normalized Front */}
                    {data.views[ViewType.FRONT].userUploadedImage && 
                     data.views[ViewType.FRONT].userUploadedImage !== data.views[ViewType.FRONT].originalImage && (
                        <div className="flex flex-col gap-0 w-[280px] shrink-0 bg-white shadow-lg border border-slate-100">
                            <div className="relative w-full aspect-[3/4] p-4">
                                <img src={data.views[ViewType.FRONT].userUploadedImage!} className="w-full h-full object-contain mix-blend-multiply" alt="Original Input" />
                                <div className="absolute top-2 left-2 text-sm font-bold bg-[#0F4C81] text-white px-3 py-1 uppercase tracking-wide">{t.original}</div>
                                
                                <div className="absolute top-2 right-2 flex gap-2 hide-on-print z-20">
                                    <button
                                        onClick={() => handleDownloadImage(data.views[ViewType.FRONT].userUploadedImage!, 'original_upload')}
                                        className="bg-white hover:bg-slate-100 p-2 rounded-full shadow border border-slate-200 text-slate-700"
                                        title="원본 다운로드"
                                    >
                                        <ImageDown size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="p-4 bg-white border-t border-slate-100">
                                <h4 className="font-black text-xl mb-1">{t.source}</h4>
                                <p className="text-slate-500 font-bold text-sm">{t.user_upload}</p>
                            </div>
                        </div>
                    )}

                    {views.map(view => {
                        // If no image for Semi/Side/Back (Single view mode), skip rendering container
                        if (view !== ViewType.FRONT && !data.views[view].originalImage) return null;
                        
                        let labelName = 'VIEW';
                        if (view === ViewType.FRONT) labelName = 'FRONT';
                        else if (view === ViewType.SEMI_SIDE) labelName = '3/4 SIDE';
                        else if (view === ViewType.SIDE) labelName = 'SIDE';
                        else if (view === ViewType.BACK) labelName = 'BACK';

                        // Check if this specific view is regenerating
                        const isRegenerating = processingView === view;

                        return (
                            <div key={view} className="flex flex-col gap-0 w-[280px] shrink-0 bg-white shadow-lg border border-slate-100">
                                <div className="relative w-full aspect-[3/4] p-4 overflow-hidden">
                                    {data.views[view].originalImage ? (
                                        <>
                                            <img 
                                                src={data.views[view].originalImage!} 
                                                className={`w-full h-full object-contain mix-blend-multiply transition-all duration-700 ${isRegenerating ? 'opacity-30 blur-[2px]' : ''}`} 
                                                alt={view} 
                                            />
                                            
                                            {/* LOADING OVERLAY FOR VIEW REGENERATION */}
                                            {isRegenerating && (
                                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                                                        <div className="absolute inset-0 bg-white/50 backdrop-blur-sm"></div>
                                                        
                                                        <div className="relative flex flex-col items-center gap-4 bg-white px-6 py-4 shadow-xl border border-[#0F4C81] animate-fade-in-up">
                                                            <div className="flex items-center gap-3 text-[#0F4C81] font-bold uppercase tracking-widest text-xs">
                                                                <Loader2 size={16} className="animate-spin text-[#0F4C81]" />
                                                                <span>Regenerating...</span>
                                                            </div>
                                                            
                                                            {/* Gauge Bar - Simulated Progress for single op */}
                                                            <div className="w-48 h-1.5 bg-slate-200 overflow-hidden relative">
                                                                <div className="absolute top-0 left-0 h-full bg-[#0F4C81] animate-fill-progress"></div>
                                                            </div>
                                                        </div>
                                                </div>
                                            )}

                                            {!isRegenerating && (
                                                <div className="absolute top-2 right-2 flex gap-2 hide-on-print z-20">
                                                    <button
                                                        onClick={() => handleDownloadImage(data.views[view].originalImage!, `view_${view.toLowerCase()}`)}
                                                        className="bg-white hover:bg-slate-100 p-2 rounded-full shadow border border-slate-200 text-slate-700"
                                                        title="이미지 다운로드"
                                                    >
                                                        <ImageDown size={20} />
                                                    </button>
                                                    <button
                                                        onClick={() => onRegenerateView(view)}
                                                        className="bg-white hover:bg-slate-100 p-2 rounded-full shadow border border-slate-200 text-slate-700"
                                                        title="뷰 재생성"
                                                    >
                                                        <RefreshCw size={20} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300 text-base uppercase font-bold">{t.no_asset}</div>
                                    )}
                                </div>
                                
                                {/* Modification Input moved inside the card style or below */}
                                <div className="p-4 bg-white border-t border-slate-100">
                                    <h4 className="font-black text-xl mb-1">ANALYSIS</h4>
                                    <p className="text-slate-500 font-bold text-sm">{labelName}</p>
                                    
                                    <div className="mt-4 hide-on-print">
                                        <ModificationInput 
                                            onSubmit={(text, img) => onViewModification(view, text, img)}
                                            isLoading={isRegenerating} // Use specific view loading state
                                            placeholder={`Refine...`}
                                        />
                                        
                                        {/* Simplified Modification Stack */}
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
                                <button 
                                    onClick={() => handleCopyHex(color)}
                                    className="flex flex-col items-start gap-2"
                                    title="클릭하여 복사"
                                >
                                    <div
                                        className="w-24 h-24 shadow-inner"
                                        style={{ backgroundColor: color }}
                                    />
                                    <div className="w-full">
                                        <h4 className="font-black text-lg leading-none">{t.color}</h4>
                                        <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                            {copiedColor === color ? <Check size={12} className="text-green-500"/> : color}
                                        </span>
                                    </div>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Part Rows - ONLY RENDER IF showDetailSheets IS TRUE */}
            {showDetailSheets && visibleParts.map((partType) => {
                const sheet = data.generatedSheets[partType];
                const manualRefs = data.manualReferences[partType] || [];
                // Use translated label for display
                const label = t.parts[partType] || data.customParts.find(p => p.id === partType)?.label || "Custom Part";
                
                return (
                    <div key={partType} className="grid grid-cols-[300px_1fr_300px] gap-12 border-b border-slate-100 pb-16 last:border-0 group/row">
                        
                        {/* Label Column */}
                        <div className="text-right pt-8">
                            <h3 className="font-black text-4xl uppercase text-black break-keep leading-tight">{label.split(' / ')[0]}</h3>
                            <p className="text-[#0F4C81] text-base uppercase tracking-wider mt-2 font-bold">{label.split(' / ')[1] || "CUSTOM DETAIL"}</p>
                            
                            <div className="mt-8 flex flex-col items-end gap-3">
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.source_chips}</div>
                                <div className="flex gap-2 justify-end flex-wrap max-w-[280px]">
                                    
                                    {/* Manual Uploads List */}
                                    {manualRefs.map((refImg, index) => (
                                        <div key={`manual-${index}`} className="relative w-20 h-24 shrink-0 hide-on-print group/mini bg-white shadow-sm border border-slate-100 p-1">
                                            <div className="w-full h-16 relative overflow-hidden">
                                                <img src={refImg} className="w-full h-full object-cover" alt={`Manual Ref ${index}`} />
                                            </div>
                                            <div className="text-[8px] font-bold text-slate-400 mt-1">{t.manual}</div>
                                            <button 
                                                onClick={() => onRemoveManualReference(partType, index)}
                                                className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5 w-4 h-4 flex items-center justify-center opacity-0 group-hover/mini:opacity-100 transition-opacity z-10"
                                                title="이미지 삭제"
                                            >
                                                <X size={10} />
                                            </button>
                                        </div>
                                    ))}

                                    {/* Add Button */}
                                    <MiniPartUploader 
                                        onUpload={(b64) => onManualPartUpload(partType, b64)} 
                                        label={t.add}
                                    />

                                    {/* Auto Crops */}
                                    {views.map(v => {
                                        const crop = data.views[v].parts[partType]?.imgUrl;
                                        if (!crop) return null;
                                        
                                        let labelName = 'VIEW';
                                        if (v === ViewType.FRONT) labelName = 'FRONT';
                                        else if (v === ViewType.SEMI_SIDE) labelName = '3/4';
                                        else if (v === ViewType.SIDE) labelName = 'SIDE';
                                        else if (v === ViewType.BACK) labelName = 'BACK';

                                        return (
                                            <div key={v} className="w-20 h-24 bg-white shadow-sm border border-slate-100 p-1 relative group/crop hover:scale-110 transition-transform origin-top-right z-10">
                                                <div className="w-full h-16 relative">
                                                    <img src={crop} className="w-full h-full object-contain" alt="ref" />
                                                </div>
                                                <div className="text-[8px] font-bold text-slate-400 mt-1 uppercase">{labelName}</div>
                                                <button
                                                    onClick={() => onRemovePartCrop(v, partType)}
                                                    className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-0.5 w-4 h-4 flex items-center justify-center opacity-0 group-hover/crop:opacity-100 transition-opacity z-20 hide-on-print"
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Main Generated Image Column */}
                        <div className="relative w-full bg-white min-h-[500px] border border-slate-200 flex flex-col items-center justify-center overflow-hidden group/image shadow-inner p-8">
                            {/* Render Image (if exists) - Dimmed if loading */}
                            {sheet.imgUrl ? (
                                <img 
                                    src={sheet.imgUrl} 
                                    className={`w-full h-auto object-contain max-h-[800px] transition-all duration-700 ${sheet.isLoading ? 'opacity-30 grayscale-[50%] blur-[2px] scale-95' : ''}`} 
                                    alt={`${label} Sheet`} 
                                />
                            ) : (
                                !sheet.isLoading && (
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="text-slate-300 text-base uppercase tracking-widest font-bold">
                                            {t.no_asset}
                                        </div>
                                        <button 
                                            onClick={() => onRegeneratePart(partType)}
                                            className="text-base text-[#0F4C81] hover:underline hide-on-print font-bold"
                                        >
                                            {t.generate}
                                        </button>
                                    </div>
                                )
                            )}
                            
                            {/* Loading Overlay with Gauge Bar */}
                            {sheet.isLoading && (
                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
                                     {/* Background backdrop if no image */}
                                     {!sheet.imgUrl && <div className="absolute inset-0 bg-white/50 backdrop-blur-sm"></div>}
                                     
                                     <div className="relative flex flex-col items-center gap-4 bg-white/90 px-10 py-8 shadow-2xl border border-[#0F4C81] animate-fade-in-up">
                                          <div className="flex items-center gap-3 text-[#0F4C81] font-bold uppercase tracking-widest text-sm">
                                              <Loader2 size={20} className="animate-spin text-[#0F4C81]" />
                                              <span>{t.designing}</span>
                                          </div>
                                          
                                          {/* Gauge Bar - Simulated Progress for single op */}
                                          <div className="w-72 h-2 bg-slate-200 overflow-hidden relative">
                                               <div className="absolute top-0 left-0 h-full bg-[#0F4C81] animate-fill-progress"></div>
                                          </div>
                                          
                                          <p className="text-[10px] text-slate-400 font-medium tracking-wide">
                                              {t.analyzing_desc}
                                          </p>
                                     </div>
                                </div>
                            )}
                            
                            {/* Action Buttons Overlay (Always Visible Now) */}
                            {sheet.imgUrl && !sheet.isLoading && (
                                <div className="absolute top-4 right-4 flex gap-3 hide-on-print z-30">
                                    <button 
                                        onClick={() => handleDownloadImage(sheet.imgUrl!, `ref_${partType}_sheet`)}
                                        className="bg-white hover:bg-slate-100 text-slate-700 p-3 rounded-full shadow-lg border border-slate-200"
                                        title="이미지 저장"
                                    >
                                        <ImageDown size={24} />
                                    </button>
                                    <button 
                                        onClick={() => onRegeneratePart(partType)}
                                        className="bg-white hover:bg-slate-100 text-slate-700 p-3 rounded-full shadow-lg border border-slate-200"
                                        title="재생성"
                                    >
                                        <RefreshCw size={24} />
                                    </button>
                                </div>
                            )}
                            
                            {/* Technical Markings */}
                            <div className="absolute top-0 left-0 p-3 text-sm font-black text-black">FIG. {partType}</div>
                            <div className="absolute bottom-3 right-3 flex gap-2">
                                <div className="w-24 h-4 bg-black"></div>
                                <div className="w-6 h-4 bg-[#0F4C81]"></div>
                            </div>
                        </div>

                        {/* Notes / Modification Column */}
                        <div className="flex flex-col gap-6 pt-8 pr-8">
                             <div className="h-0.5 w-full bg-slate-200"></div>
                             
                             <div className="flex flex-col gap-3 hide-on-print">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t.refine_design}</label>
                                
                                <ModificationInput 
                                    onSubmit={(text, img) => onPartModification(partType, text, img)}
                                    isLoading={sheet.isLoading}
                                    placeholder={`"${label.split(" / ")[0]}" ${t.modify_request}`}
                                />

                                {/* Applied Modifications Stack */}
                                {sheet.modifications && sheet.modifications.length > 0 && (
                                    <div className="flex flex-col gap-2 mt-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <Layers size={12}/> {t.applied_changes} ({sheet.modifications.length})
                                        </label>
                                        <div className="flex flex-col gap-2">
                                            {sheet.modifications.map((mod, index) => (
                                                <div key={mod.id} className="group relative flex gap-3 items-start text-xs text-[#0F4C81] bg-blue-50 p-3 border-l-2 border-[#0F4C81]">
                                                    <div className="flex-shrink-0 font-bold text-[#0F4C81] mt-0.5">
                                                        {index + 1}.
                                                    </div>
                                                    <div className="flex flex-col gap-1 w-full">
                                                        <span className="font-medium leading-relaxed">{mod.prompt || "(No Text)"}</span>
                                                        {mod.image && (
                                                            <div className="mt-1">
                                                                <img src={mod.image} className="h-10 w-auto border border-slate-200 object-cover" alt={`Ref ${index + 1}`}/>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Delete Button */}
                                                    <button 
                                                        onClick={() => onDeleteModification(partType, mod.id)}
                                                        className="absolute top-2 right-2 text-red-400 hover:text-red-600 p-1 opacity-0 group-hover:opacity-100"
                                                        title="요청 삭제 및 재생성"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                             </div>

                             <div className="mt-auto text-sm text-slate-500 leading-relaxed font-medium">
                                 {partType === PartType.GLOVES && "Includes Dorsal & Palm views. Detailing material texture."}
                                 {partType === PartType.TOP && "Isolated A-Pose garment simulation. Seam & fold analysis."}
                                 {partType === PartType.BOTTOM && "Isolated garment. Stitching & pocket placement."}
                                 {partType === PartType.JACKET && "Outer layer isolation. Lining & closure mechanics."}
                                 {partType === PartType.FACE && "Expression Sheet: Front, 3/4, Profile."}
                                 {partType === PartType.HAIR && "Structure Analysis: Volume, flow, and hairline."}
                                 {partType === PartType.BAG && "Strap connection points, buckles, capacity visualization."}
                                 {partType === PartType.ACCESSORY && "Macro zoom on complex geometry. Scale reference."}
                                 {partType === PartType.SHOES && "Front, Side, Back, Sole detailing."}
                                 {partType === PartType.WEAPON && "Full form plus grip/edge magnification."}
                                 {!([PartType.GLOVES, PartType.TOP, PartType.BOTTOM, PartType.FACE, PartType.HAIR, PartType.JACKET, PartType.BAG, PartType.ACCESSORY, PartType.SHOES, PartType.WEAPON].includes(partType)) && partType.startsWith("custom_") && "Custom specific detailing requested."}
                                 {!([PartType.GLOVES, PartType.TOP, PartType.BOTTOM, PartType.FACE, PartType.HAIR, PartType.JACKET, PartType.BAG, PartType.ACCESSORY, PartType.SHOES, PartType.WEAPON].includes(partType)) && !partType.startsWith("custom_") && "Standard orthographic projection."}
                             </div>
                             
                             <div className="h-0.5 w-full bg-slate-200"></div>
                        </div>

                    </div>
                );
            })}

        </div>

        {/* Clean Export Layout (Hidden) - UPDATED FOR 4 VIEWS */}
        <div id="clean-export-container" style={{ display: 'none', width: '1800px', backgroundColor: 'white', padding: '40px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', borderBottom: '4px solid #000', paddingBottom: '20px' }}>
                <h1 style={{ fontSize: '48px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>{t.ref_asset_sheet}</h1>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{t.project_ref}</div>
             </div>

             {/* Base Views */}
             <div style={{ display: 'flex', gap: '20px', marginBottom: '40px', justifyContent: 'center' }}>
                {data.views[ViewType.FRONT].userUploadedImage && (
                    <div style={{ width: '280px', height: '420px', border: '1px solid #ddd' }}>
                        <img src={data.views[ViewType.FRONT].userUploadedImage!} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                )}
                {views.map(view => (
                    data.views[view].originalImage && (
                        <div key={view} style={{ width: '280px', height: '420px', border: '1px solid #ddd' }}>
                            <img src={data.views[view].originalImage!} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        </div>
                    )
                ))}
             </div>

             {/* Added Color Palette for Export */}
             {data.colorPalette && data.colorPalette.length > 0 && (
                 <div style={{ marginBottom: '40px', borderTop: '2px solid #eee', paddingTop: '30px' }}>
                     <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px', textTransform: 'uppercase', color: '#666' }}>{t.palette_title}</div>
                     <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                         {data.colorPalette.map((color, idx) => (
                             <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                 <div style={{ width: '80px', height: '80px', backgroundColor: color, border: '1px solid #ddd', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}></div>
                                 <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333', fontFamily: 'monospace' }}>{color}</div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}

             {/* Parts Grid - Only show selected items here as well */}
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                {showDetailSheets && visibleParts.map(partType => {
                    const sheet = data.generatedSheets[partType];
                    const label = t.parts[partType] || data.customParts.find(p => p.id === partType)?.label || "Custom Part";

                    if (!sheet || !sheet.imgUrl) return null;
                    return (
                        <div key={partType} style={{ border: '1px solid #eee', padding: '10px' }}>
                            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', color: '#666' }}>{label}</div>
                            <img src={sheet.imgUrl} style={{ width: '100%', height: 'auto', objectFit: 'contain' }} />
                        </div>
                    );
                })}
             </div>
        </div>
        
        {/* Footer */}
        <div className="mt-20 pt-8 border-t-4 border-[#0F4C81] flex justify-between items-center text-sm font-bold text-slate-500 uppercase tracking-widest relative z-10">
            <div>{t.confidential}</div>
            <div>{t.powered_by}</div>
        </div>
      </div>
    </div>
  );
};