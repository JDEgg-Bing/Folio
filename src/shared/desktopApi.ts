export type EolStyle = 'LF' | 'CRLF';

export interface DocumentMetadata {
  id: string;
  displayName: string;
  displayPath: string | null;
  fileHandleId: string | null;
  eol: EolStyle;
  hadBom: boolean;
  dirty: boolean;
  mixedEol: boolean;
}

export interface OpenedDocument {
  text: string;
  fileHandleId: string;
  displayName: string;
  displayPath: string;
  eol: EolStyle;
  hadBom: boolean;
  mixedEol: boolean;
}

export interface SaveOptions { eol: EolStyle; hadBom: boolean }
export interface SavedDocument { fileHandleId: string; displayName: string; displayPath: string }
export interface DocumentDisplayState { dirty: boolean; title: string }
export interface RecoverySnapshot { text: string; fileHandleId: string | null; displayName: string; options: SaveOptions }
export interface RecoveryOutcome { document: OpenedDocument; updatedAt: string }
export interface AppInfo { name: string; version: string; dataPath: string; packaged: boolean; hasPendingFile: boolean }
export interface ManuscriptExportInput { text: string; fileHandleId: string | null; appearance: import('../renderer/preferences/WritingAppearance').WritingAppearance; suggestedName: string; templateId?: string }
export interface ManuscriptExportOutcome { displayName: string; diagnostics: string[] }

export interface DesktopAPI {
  onDecisionRequest(listener: (request: import('./interaction').DecisionRequest) => void): () => void;
  answerDecision(id: string, answer: string): void;
  wordTemplates: import('./wordTemplate').WordTemplateAPI;
  runMenuCommand(command: string): Promise<void>;
  exportDocx(input: ManuscriptExportInput): Promise<ManuscriptExportOutcome | null>;
  exportPdf(input: ManuscriptExportInput): Promise<ManuscriptExportOutcome | null>;
  openDocument(): Promise<OpenedDocument | null>;
  openPendingDocument(): Promise<OpenedDocument | null>;
  onOpenDocument(listener: () => void): () => void;
  ready(): void;
  writeRecovery(snapshot: RecoverySnapshot | null): Promise<void>;
  readRecovery(): Promise<RecoveryOutcome | null>;
  checkDocument(handle: string): Promise<boolean>;
  getAppInfo(): Promise<AppInfo>;
  revealDataFolder(): Promise<void>;
  copyFeedback(text: string): Promise<void>;
  saveDocument(fileHandleId: string, text: string, options: SaveOptions): Promise<void>;
  saveDocumentAs(text: string, options: SaveOptions, suggestedName?: string, previousHandleId?: string | null): Promise<SavedDocument | null>;
  resolveImage(handleId: string | null, destination: string): Promise<{ url: string; mime: string }>;
  importImages(handleId: string, tickets: string[]): Promise<{ destination: string; alt: string }[]>;
  onImageDrop(listener: (drop: ImageDrop) => void): () => void;
  setDocumentFeatures(features: Record<string, boolean>): void;
  onCommand(listener: (command: string) => void): () => void;
  confirmUnsavedChanges(): Promise<'save' | 'discard' | 'cancel'>;
  setDocumentState(state: DocumentDisplayState): void;
  completeClose(approved: boolean): void;
  onRequestClose(listener: () => void): () => void;
  showMessage(message: string): void;
}
export interface ImageDrop { id: string; phase: 'start' | 'ready'; x: number; y: number; tickets: string[]; error?: string }
