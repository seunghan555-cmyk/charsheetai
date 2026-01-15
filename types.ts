
export enum ViewType {
  FRONT = 'FRONT',
  SEMI_SIDE = 'SEMI_SIDE', // New: 3/4 View
  SIDE = 'SIDE',
  BACK = 'BACK',
}

export enum PoseType {
  A_POSE = 'A_POSE',
  T_POSE = 'T_POSE',
  I_POSE = 'I_POSE',
}

export enum PartType {
  FACE = 'FACE',
  HAIR = 'HAIR',
  HAT = 'HAT',
  JACKET = 'JACKET',
  TOP = 'TOP',
  BOTTOM = 'BOTTOM',
  SHOES = 'SHOES',
  GLOVES = 'GLOVES',
  WEAPON = 'WEAPON',
  BAG = 'BAG',
  ACCESSORY = 'ACCESSORY',
}

export enum Language {
  KO = 'KO',
  EN = 'EN',
  JA = 'JA',
  ZH = 'ZH',
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface CharacterPart {
  type: string; // Changed to string to support custom parts
  label: string;
  box: BoundingBox;
  imgUrl: string | null; // The cropped image data URL
}

export interface Modification {
  id: string;
  prompt: string;
  image: string | null;
  timestamp: number;
}

export interface CharacterView {
  id: ViewType;
  label: string;
  originalImage: string | null; // Base64 or Object URL (This is the "working" image, potentially normalized)
  userUploadedImage: string | null; // The raw original user upload
  parts: Record<string, CharacterPart | null>; // Changed key to string
  modifications: Modification[]; // History of user refinements for this specific view
}

export interface GeneratedPartSheet {
  partType: string; // Changed to string
  imgUrl: string | null; // The single composite AI-generated image
  isLoading: boolean;
  modifications: Modification[]; // Stack of user requests
}

export interface CustomPart {
    id: string;
    label: string;
}

export interface AppState {
  views: {
    [ViewType.FRONT]: CharacterView;
    [ViewType.SEMI_SIDE]: CharacterView;
    [ViewType.SIDE]: CharacterView;
    [ViewType.BACK]: CharacterView;
  };
  generatedSheets: Record<string, GeneratedPartSheet>; // Changed key to string
  manualReferences: Record<string, string[]>; // Stores manual uploads for specific parts (Array). Key string.
  customParts: CustomPart[]; // New: List of custom parts created by user
  colorPalette: string[];
  globalStylePrompt: string; // New: User defined style override
}

// Response schema from Gemini
export interface GeminiPartAnalysis {
  face?: number[];
  hair?: number[];
  hat?: number[];
  jacket?: number[];
  top?: number[];
  bottom?: number[];
  shoes?: number[];
  gloves?: number[];
  weapon?: number[];
  bag?: number[];
  accessory?: number[];
  // New: Array of custom detected parts
  custom?: {
      label: string;
      box: number[];
  }[];
}