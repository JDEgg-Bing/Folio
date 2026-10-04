import type { DesktopAPI, DocumentDisplayState } from '../../shared/desktopApi';
import type { PlatformService } from './PlatformService';

export class ElectronPlatformService implements PlatformService {
  private readonly api: DesktopAPI;

  constructor(api?: DesktopAPI) {
    this.api = api ?? window.desktopAPI;
  }
  openDocument() { return this.api.openDocument(); }
  onDecisionRequest: PlatformService['onDecisionRequest'] = listener => this.api.onDecisionRequest(listener);
  answerDecision = (id: string, answer: string) => this.api.answerDecision(id, answer);
  openPendingDocument = () => this.api.openPendingDocument();
  onOpenDocument: PlatformService['onOpenDocument'] = listener => this.api.onOpenDocument(listener);
  ready = () => this.api.ready();
  writeRecovery: PlatformService['writeRecovery'] = snapshot => this.api.writeRecovery(snapshot);
  readRecovery = () => this.api.readRecovery();
  checkDocument = (handle: string) => this.api.checkDocument(handle);
  getAppInfo = () => this.api.getAppInfo();
  revealDataFolder = () => this.api.revealDataFolder();
  copyFeedback = (text: string) => this.api.copyFeedback(text);
  get wordTemplates() { return this.api.wordTemplates; }
  runMenuCommand(command: string) { return this.api.runMenuCommand(command); }
  exportDocx: PlatformService['exportDocx'] = input => this.api.exportDocx(input);
  exportPdf: PlatformService['exportPdf'] = input => this.api.exportPdf(input);
  saveDocument(handleId: string, text: string, options: { eol: 'LF' | 'CRLF'; hadBom: boolean }) {
    return this.api.saveDocument(handleId, text, options);
  }
  saveDocumentAs(text: string, options: { eol: 'LF' | 'CRLF'; hadBom: boolean }, suggestedName: string, previousHandleId?: string | null) {
    return this.api.saveDocumentAs(text, options, suggestedName, previousHandleId);
  }
  resolveImage(handleId: string | null, destination: string) { return this.api.resolveImage(handleId, destination); }
  importImages(handleId: string, tickets: string[]) { return this.api.importImages(handleId, tickets); }
  onImageDrop: PlatformService['onImageDrop'] = listener => this.api.onImageDrop(listener);
  setDocumentFeatures(features: Record<string, boolean>) { this.api.setDocumentFeatures(features); }
  showMessage(message: string) { this.api.showMessage(message); }
  onCommand(listener: (command: string) => void) { return this.api.onCommand(listener); }
  onCloseRequest(listener: () => void) { return this.api.onRequestClose(listener); }
  confirmUnsavedChanges() { return this.api.confirmUnsavedChanges(); }
  setDocumentState(state: DocumentDisplayState) { this.api.setDocumentState(state); }
  completeClose(approved: boolean) { this.api.completeClose(approved); }
}
