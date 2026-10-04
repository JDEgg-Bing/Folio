import type { DocumentDisplayState, OpenedDocument, SavedDocument, SaveOptions, ImageDrop } from '../../shared/desktopApi';

export interface PlatformService {
  onDecisionRequest: import('../../shared/desktopApi').DesktopAPI['onDecisionRequest'];
  answerDecision: import('../../shared/desktopApi').DesktopAPI['answerDecision'];
  wordTemplates: import('../../shared/wordTemplate').WordTemplateAPI;
  runMenuCommand(command: string): Promise<void>;
  exportDocx(input: import('../../shared/desktopApi').ManuscriptExportInput): Promise<import('../../shared/desktopApi').ManuscriptExportOutcome | null>;
  exportPdf(input: import('../../shared/desktopApi').ManuscriptExportInput): Promise<import('../../shared/desktopApi').ManuscriptExportOutcome | null>;
  openDocument(): Promise<OpenedDocument | null>;
  openPendingDocument: import('../../shared/desktopApi').DesktopAPI['openPendingDocument'];
  onOpenDocument: import('../../shared/desktopApi').DesktopAPI['onOpenDocument'];
  ready: import('../../shared/desktopApi').DesktopAPI['ready'];
  writeRecovery: import('../../shared/desktopApi').DesktopAPI['writeRecovery'];
  readRecovery: import('../../shared/desktopApi').DesktopAPI['readRecovery'];
  checkDocument: import('../../shared/desktopApi').DesktopAPI['checkDocument'];
  getAppInfo: import('../../shared/desktopApi').DesktopAPI['getAppInfo'];
  revealDataFolder: import('../../shared/desktopApi').DesktopAPI['revealDataFolder'];
  copyFeedback: import('../../shared/desktopApi').DesktopAPI['copyFeedback'];
  saveDocument(handleId: string, text: string, options: SaveOptions): Promise<void>;
  saveDocumentAs(text: string, options: SaveOptions, suggestedName: string, previousHandleId?: string | null): Promise<SavedDocument | null>;
  resolveImage(handleId: string | null, destination: string): Promise<{ url: string; mime: string }>;
  importImages(handleId: string, tickets: string[]): Promise<{ destination: string; alt: string }[]>;
  onImageDrop(listener: (drop: ImageDrop) => void): () => void;
  setDocumentFeatures(features: Record<string, boolean>): void;
  showMessage(message: string): void;
  onCommand(listener: (command: string) => void): () => void;
  onCloseRequest(listener: () => void): () => void;
  confirmUnsavedChanges(): Promise<'save' | 'discard' | 'cancel'>;
  setDocumentState(state: DocumentDisplayState): void;
  completeClose(approved: boolean): void;
}
