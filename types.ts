
export enum ViewType {
  FRONT = 'FRONT',
  SEMI_SIDE = 'SEMI_SIDE',
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
  ES = 'ES',
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface CharacterPart {
  type: string;
  label: string;
  box: BoundingBox;
  imgUrl: string | null;
}

export interface Modification {
  id: string;
  prompt: string;
  image: string | null;
  timestamp: number;
}

export interface ViewHistoryItem {
    originalImage: string | null;
    generatedImage: string | null;
    modifications: Modification[];
}

export interface PartHistoryItem {
    imgUrl: string | null;
    modifications: Modification[];
}

export interface HistoryState<T> {
    undoStack: T[];
    redoStack: T[];
}

export interface CharacterView {
  id: ViewType;
  label: string;
  originalImage: string | null;
  userUploadedImage: string | null;
  generatedImage: string | null;
  parts: Record<string, CharacterPart | null>;
  modifications: Modification[];
  history: HistoryState<ViewHistoryItem>;
}

export interface GeneratedPartSheet {
  partType: string;
  imgUrl: string | null;
  isLoading: boolean;
  modifications: Modification[];
  history: HistoryState<PartHistoryItem>;
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
  generatedSheets: Record<string, GeneratedPartSheet>;
  manualReferences: Record<string, string[]>;
  customParts: CustomPart[];
  colorPalette: string[];
  globalStylePrompt: string;
  originalParts: Record<string, CharacterPart | null>;
}

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
  custom?: {
      label: string;
      box: number[];
  }[];
}
