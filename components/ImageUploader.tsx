import React, { useState, useRef } from "react";
import { Upload, X } from "lucide-react";
import { fileToBase64 } from "../utils/imageUtils";
import { Language } from "../types";
import { TRANSLATIONS } from "../constants";

interface ImageUploaderProps {
  label: string;
  image: string | null;
  onUpload: (base64: string) => void;
  onClear: () => void;
  disabled?: boolean;
  language?: Language;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  label,
  image,
  onUpload,
  onClear,
  disabled,
  language = Language.KO
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = TRANSLATIONS[language];

  const processFiles = async (files: FileList | null) => {
    if (files && files[0]) {
      const file = files[0];
      if (!file.type.startsWith("image/")) return;
      
      try {
        const base64 = await fileToBase64(file);
        onUpload(base64);
      } catch (err) {
        console.error("Error reading file", err);
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    await processFiles(e.dataTransfer.files);
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (disabled) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
            try {
                const base64 = await fileToBase64(file);
                onUpload(base64);
            } catch (err) {
                console.error("Error reading pasted file", err);
            }
        }
        break; // Only take the first image
      }
    }
  };

  return (
    <div className="flex flex-col w-full bg-white shadow-xl hover:shadow-2xl transition-shadow duration-300">
      {/* Top Image Area (The Color Block) */}
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
        className={`relative w-full aspect-[3/4] overflow-hidden group outline-none 
        ${isDragging ? "bg-[#0F4C81]/10" : "bg-white"} 
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {image ? (
          <>
            <img
              src={image}
              alt={label}
              className="w-full h-full object-contain pointer-events-none"
            />
            <button
              onClick={(e) => {
                  e.stopPropagation();
                  onClear();
              }}
              className="absolute top-2 right-2 p-1.5 bg-black hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-md"
            >
              <X size={18} />
            </button>
          </>
        ) : (
          <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer p-4 bg-slate-50 border-b border-slate-100">
            <div className="flex flex-col items-center justify-center text-center">
              <Upload className={`w-10 h-10 mb-4 transition-colors ${isDragging ? 'text-[#0F4C81]' : 'text-slate-300'}`} />
              <p className="mb-2 text-base font-bold text-slate-400 uppercase tracking-widest">
                {isDragging ? t.drop_here : t.upload}
              </p>
            </div>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              onChange={handleFileChange}
              disabled={disabled}
            />
          </label>
        )}
      </div>

      {/* Bottom Label Area (The Pantone White Strip) */}
      <div className="p-4 bg-white border-t border-slate-100">
          <h3 className="text-black font-black text-xl uppercase leading-none mb-1">
          </h3>
          <p className="text-slate-500 font-bold text-sm tracking-wider">
             {label.toUpperCase()}
          </p>
      </div>
    </div>
  );
};