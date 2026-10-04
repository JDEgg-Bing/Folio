import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { DocumentDisplayState, DocumentMetadata, OpenedDocument, RecoveryOutcome, AppInfo } from '../../shared/desktopApi';
import { createOpenedSession, createUntitledSession } from '../document/DocumentSession';
import { createEditorController, type EditorSnapshot } from '../editor/EditorController';
import { writeSaveSnapshot } from '../editor/saveSnapshot';
import type { PlatformService } from '../platform/PlatformService';
import { handleCloseRequest } from './closeFlow';
import { ErrorBanner } from '../ui/ErrorBanner';
import { AppearanceDialog } from '../ui/AppearanceDialog';
import type { PreferencesService } from '../preferences/PreferencesService';
import { writingTokens } from '../appearance/writingTokens';
import { DocumentOutline, currentHeading } from '../ui/DocumentOutline';
import type { DocumentModel } from '../../document/model';
import { userError } from '../../shared/chinese';
import type { ImageDrop } from '../../shared/desktopApi';
import type { DocumentFeatures } from '../preferences/DocumentFeatures';
import { resolveDocumentTitle } from '../document/DocumentTitle';
import { suggestedFilename } from '../document/filenameSuggestion';
import { StatusBar } from '../ui/StatusBar';
import { writingFonts } from '../appearance/writingFonts';
import { TitleBar } from '../ui/TitleBar';
import { accentTokens } from '../appearance/accentColors';
import { WordTemplateDialog } from '../ui/WordTemplateDialog';
import { HelpDialog, SAMPLE_DOCUMENT, type HelpMode } from '../ui/HelpDialog';
import { RecoveryDialog } from '../ui/RecoveryDialog';
import { DecisionDialog } from '../ui/DecisionDialog';
import type { DecisionRequest } from '../../shared/interaction';

export function App({ platform, preferences }: { platform: PlatformService; preferences: PreferencesService }) {
  const editorHost = useRef<HTMLDivElement>(null);
  const editor = useRef<ReturnType<typeof createEditorController> | null>(null);
  const metadata = useRef<DocumentMetadata>(createUntitledSession());
  const presented = useRef<DocumentDisplayState | null>(null);
  const runCommandRef = useRef<(command: string) => void>(() => undefined);
  const dropRef = useRef<(drop: ImageDrop) => void>(() => {});
  const pendingDrops = useRef(new Map<string, { documentId: string; bookmark: string; controller: ReturnType<typeof createEditorController> }>());
  const requestCloseRef = useRef<() => void>(() => undefined);
  const appearance = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    for (const [key, value] of Object.entries(accentTokens(appearance.accentColor))) root.setProperty(key, value);
    return () => { for (const key of Object.keys(accentTokens(appearance.accentColor))) root.removeProperty(key); };
  }, [appearance.accentColor]);
  const [structure, setStructure] = useState<DocumentModel | null>(null);
  const [readingPosition, setReadingPosition] = useState(0);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [wordTemplatesOpen, setWordTemplatesOpen] = useState(false);
  const [helpMode, setHelpMode] = useState<HelpMode | null>(null);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [decision, setDecision] = useState<DecisionRequest | null>(null);
  const decisions = useRef<DecisionRequest[]>([]);
  useEffect(() => platform.onDecisionRequest(request => {
    decisions.current.push(request);
    setDecision(current => current ?? decisions.current[0]);
  }), [platform]);
  const [recovery, setRecovery] = useState<RecoveryOutcome | null>(null);
  const recoveryEnabled = useRef(false);
  const recoveryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryRef = useRef<() => Promise<void>>(async () => {});
  const lastRecoveryState = useRef<{ doc: unknown; handle: string | null; dirty: boolean } | null>(null);
  const startup = useRef<Promise<[RecoveryOutcome | null, AppInfo]> | null>(null);
  const operationQueue = useRef(Promise.resolve());
  const externalOpenRef = useRef<() => Promise<void>>(async () => {});
  const [error, setError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const exporting = useRef(false);
  const [documentMetadata, setDocumentMetadata] = useState(metadata.current);
  const [editorSnapshot, setEditorSnapshot] = useState<EditorSnapshot>({ line: 1, column: 1, dirty: false, headingTitle: null, wordCount: 0 });

  const updateDocument = useCallback((next: DocumentMetadata) => {
    metadata.current = next;
    setDocumentMetadata(next);
    const state = { dirty: next.dirty, title: resolveDocumentTitle(editor.current?.getSnapshot().headingTitle ?? null, next) };
    if (presented.current?.dirty !== state.dirty || presented.current.title !== state.title) {
      platform.setDocumentState(state);
      presented.current = state;
    }
    if (recoveryEnabled.current) {
      const doc = editor.current?.getDocument();
      const prior = lastRecoveryState.current;
      if (!prior || prior.doc !== doc || prior.handle !== next.fileHandleId || prior.dirty !== next.dirty) {
        lastRecoveryState.current = { doc, handle: next.fileHandleId, dirty: next.dirty };
        // Throttle rather than debounce: continuous typing also produces a draft.
        if (recoveryTimer.current === null) recoveryTimer.current = setTimeout(() => {
          recoveryTimer.current = null;
          void recoveryRef.current().catch(() => setError('本地恢复草稿保存失败，请及时手动保存文稿。'));
        }, 600);
      }
    }
  }, [platform]);

  recoveryRef.current = async () => {
    if (!recoveryEnabled.current || !editor.current) return;
    const current = metadata.current;
    await platform.writeRecovery(editor.current.isDirty() ? { text: editor.current.getDocumentText(),
      fileHandleId: current.fileHandleId, displayName: current.displayName, options: { eol: current.eol, hadBom: current.hadBom } } : null);
  };
  const clearRecovery = useCallback(async () => {
    if (recoveryTimer.current !== null) clearTimeout(recoveryTimer.current);
    recoveryTimer.current = null;
    await platform.writeRecovery(null);
    lastRecoveryState.current = null;
  }, [platform]);
  const replaceCurrent = useCallback(async (replace: () => void) => {
    const approvedDoc = editor.current?.getDocument();
    recoveryEnabled.current = false;
    try {
      await clearRecovery();
      if (editor.current?.getDocument() !== approvedDoc) {
        setError('文稿在操作期间有新修改，已保留当前内容，请重试。');
        return false;
      }
      replace();
      return true;
    } catch { setError('无法更新恢复草稿，已保留当前文稿，请重试。'); return false; }
    finally {
      recoveryEnabled.current = true;
      updateDocument(metadata.current);
      void recoveryRef.current().catch(() => setError('本地恢复草稿更新失败，请及时手动保存文稿。'));
    }
  }, [clearRecovery, updateDocument]);

  useEffect(() => {
    if (!editorHost.current) return;
    const controller = createEditorController(editorHost.current, (snapshot) => {
      setEditorSnapshot(snapshot);
      const dirty = editor.current?.isDirty() ?? false;
      updateDocument({ ...metadata.current, dirty });
    }, setStructure, setReadingPosition);
    editor.current = controller;
    setStructure(controller.getStructure());
    presented.current = null;
    updateDocument(metadata.current);
    const removeCommand = platform.onCommand((command) => { runCommandRef.current(command); });
    const removeDrop = platform.onImageDrop(drop => dropRef.current(drop));
    const removeClose = platform.onCloseRequest(() => { requestCloseRef.current(); });
    const removeExternal = platform.onOpenDocument(() => {
      operationQueue.current = operationQueue.current.catch(() => {}).then(() => externalOpenRef.current());
    });
    controller.focus();
    return () => { removeCommand(); removeClose(); removeDrop(); removeExternal(); if (recoveryTimer.current !== null) clearTimeout(recoveryTimer.current); recoveryTimer.current = null; pendingDrops.current.clear(); controller.destroy(); editor.current = null; };
  }, [platform]);

  useEffect(() => {
    let alive = true;
    startup.current ??= Promise.all([platform.readRecovery(), platform.getAppInfo()]);
    void startup.current.then(([draft, info]) => {
      if (!alive) return;
      setAppInfo(info);
      if (draft) setRecovery(draft);
      else {
        recoveryEnabled.current = true;
        platform.ready();
        try { if (!info.hasPendingFile && !localStorage.getItem('folio.welcome.v1')) setHelpMode('welcome'); } catch { /* Help stays available from the menu. */ }
      }
    }).catch(() => {
      if (!alive) return;
      setError('恢复草稿无法读取，原文件未改动。请在“帮助 → 问题反馈”中查看本地数据文件夹。');
      // Keep the previous draft intact until an explicit save/discard action.
      recoveryEnabled.current = false;
      platform.ready();
      void platform.getAppInfo().then(info => { if (alive) setAppInfo(info); });
    });
    return () => { alive = false; };
  }, [platform]);

  useEffect(() => {
    const check = async () => {
      const handle = metadata.current.fileHandleId;
      if (!handle) return;
      try {
        if (await platform.checkDocument(handle) && metadata.current.fileHandleId === handle) setError('磁盘文件已被其他程序修改或删除。保存前会询问是否覆盖；可用“另存为”保留当前文稿，或“打开”读取磁盘版本。');
      } catch { if (metadata.current.fileHandleId === handle) setError('无法检查磁盘文件，请检查文件权限。当前文稿仍保留在编辑器中。'); }
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [platform]);

  const save = useCallback(async (as = false): Promise<boolean> => {
    const controller = editor.current;
    if (!controller) return false;
    const current = metadata.current;
    const snapshot = controller.captureSaveSnapshot();
    const suggestedName = suggestedFilename(controller.getSnapshot().headingTitle, current);
    try {
      const saved = await writeSaveSnapshot(snapshot, async (text) => {
        if (!as && current.fileHandleId) {
          await platform.saveDocument(current.fileHandleId, text, { eol: current.eol, hadBom: current.hadBom });
          return true;
        }
        const saved = await platform.saveDocumentAs(text, { eol: current.eol, hadBom: current.hadBom }, suggestedName, current.fileHandleId);
        if (!saved) return false;
        if (metadata.current.id === current.id) updateDocument({ ...current, ...saved });
        return true;
      }, (doc) => { if (metadata.current.id === current.id) controller.markSaved(doc); });
      if (!saved) return false;
      if (metadata.current.id !== current.id) return true;
      updateDocument({ ...metadata.current, dirty: controller.isDirty() });
      recoveryEnabled.current = true;
      setError(null);
      await recoveryRef.current().catch(() => setError('文稿已保存，但恢复草稿更新失败。'));
      return true;
    } catch (cause) {
      if (metadata.current.id !== current.id) return false;
      const message = userError(cause, 'save');
      setError(message);
      return false;
    }
  }, [platform, updateDocument]);

  const dirtyGuard = useCallback(async (): Promise<boolean> => {
    if (!editor.current?.isDirty()) return true;
    const decision = await platform.confirmUnsavedChanges();
    if (decision === 'cancel') return false;
    if (decision === 'discard') return true;
    const saved = await save();
    return saved && !editor.current?.isDirty();
  }, [platform, save]);

  const open = useCallback(async () => {
    if (!(await dirtyGuard())) return;
    const approvedDoc = editor.current?.getDocument();
    try {
      const opened = await platform.openDocument();
      if (!opened) return;
      if (editor.current?.getDocument() !== approvedDoc && !(await dirtyGuard())) return;
      await replaceCurrent(() => installDocument(opened));
    } catch (cause) {
      const message = userError(cause, 'open');
      setError(message);
    }
  }, [dirtyGuard, platform, replaceCurrent]);

  const installDocument = useCallback((opened: OpenedDocument) => {
    setExportNotice(null);
    editor.current?.loadDocument(opened.text);
    updateDocument(createOpenedSession(opened));
    editor.current?.focus();
    if (opened.mixedEol) setError(`此文档包含混合换行符，保存时将统一使用 ${opened.eol}。`);
    else setError(null);
  }, [updateDocument]);

  externalOpenRef.current = async () => {
    if (!(await dirtyGuard())) return;
    const approvedDoc = editor.current?.getDocument();
    try {
      const opened = await platform.openPendingDocument();
      if (opened) {
        if (editor.current?.getDocument() !== approvedDoc && !(await dirtyGuard())) return;
        await replaceCurrent(() => {
          setHelpMode(null); setAppearanceOpen(false); setWordTemplatesOpen(false);
          installDocument(opened);
        });
      }
    } catch (cause) { setError(userError(cause, 'open')); }
  };

  const exportManuscript = useCallback(async (format: 'pdf' | 'docx', templateId?: string) => {
    const name = format === 'pdf' ? 'PDF' : 'Word';
    const controller = editor.current;
    if (!controller || exporting.current) return false;
    exporting.current = true;
    setExportNotice(`正在导出 ${name}…`);
    try {
      const result = await (format === 'pdf' ? platform.exportPdf.bind(platform) : platform.exportDocx.bind(platform))({ text: controller.getDocumentText(), fileHandleId: metadata.current.fileHandleId,
        appearance: { ...preferences.getSnapshot().writingAppearance }, suggestedName: suggestedFilename(controller.getSnapshot().headingTitle, metadata.current), templateId });
      setExportNotice(result ? `${name} 已导出：${result.displayName}${result.diagnostics.length ? `。${result.diagnostics.join('；')}` : ''}` : null);
      if (result) setError(null);
      return !!result;
    } catch (cause) {
      setExportNotice(null);
      const message = cause instanceof Error ? cause.message : `无法导出 ${name}，请重试。`;
      if (format === 'docx') throw new Error(message);
      setError(message);
      return false;
    }
    finally { exporting.current = false; }
  }, [platform, preferences]);

  const runCommand = useCallback(async (command: string) => {
    if (recovery) return;
    if (document.querySelector('dialog[open]') && !(command === 'sample' && helpMode && !wordTemplatesOpen && !appearanceOpen)) return;
    if (command.startsWith('toggle:')) {
      const key = command.slice(7) as keyof DocumentFeatures;
      if (key in preferences.getSnapshot().documentFeatures) preferences.updateDocumentFeatures({ [key]: !preferences.getSnapshot().documentFeatures[key] });
      return;
    }
    switch (command) {
      case 'new':
        if (await dirtyGuard()) await replaceCurrent(() => { setExportNotice(null); editor.current?.createEmptyDocument(); updateDocument(createUntitledSession()); editor.current?.focus(); });
        break;
      case 'open': await open(); break;
      case 'save': await save(); break;
      case 'save-as': await save(true); break;
      case 'export-pdf': await exportManuscript('pdf'); break;
      case 'export-docx': case 'word-templates': setWordTemplatesOpen(true); break;
      case 'find': editor.current?.openSearch(); break;
      case 'appearance': setAppearanceOpen(true); break;
      case 'help': setHelpMode('guide'); break;
      case 'about': setHelpMode('about'); break;
      case 'feedback': setHelpMode('feedback'); break;
      case 'sample':
        if (await dirtyGuard()) await replaceCurrent(() => {
          editor.current?.restoreDocument(SAMPLE_DOCUMENT);
          updateDocument({ ...createUntitledSession(), dirty: true });
          setHelpMode(null); editor.current?.focus();
        });
        break;
    }
  }, [dirtyGuard, open, save, updateDocument, exportManuscript, recovery, replaceCurrent, helpMode, wordTemplatesOpen, appearanceOpen]);

  runCommandRef.current = command => {
    operationQueue.current = operationQueue.current.catch(() => {}).then(() => runCommand(command)).catch(() => setError('无法完成操作，请重试。'));
  };

  const requestClose = useCallback(async () => {
    await handleCloseRequest({
      isDirty: () => editor.current?.isDirty() ?? false,
      confirm: () => platform.confirmUnsavedChanges(),
      save,
      complete: async approved => {
        if (approved && recoveryEnabled.current) {
          const closingDoc = editor.current?.getDocument();
          recoveryEnabled.current = false;
          try {
            await clearRecovery();
            if (editor.current?.getDocument() !== closingDoc) {
              recoveryEnabled.current = true;
              await recoveryRef.current();
              platform.completeClose(false); return;
            }
          }
          catch { setError('无法清除恢复草稿，窗口保持打开。请检查本地数据文件夹。'); platform.completeClose(false); return; }
          finally { recoveryEnabled.current = true; }
        }
        platform.completeClose(approved);
      }
    });
  }, [platform, save, clearRecovery]);

  requestCloseRef.current = () => {
    operationQueue.current = operationQueue.current.catch(() => {}).then(async () => {
      if (recovery) { platform.completeClose(true); return; } // Keep the unresolved draft.
      await requestClose();
    }).catch(() => platform.completeClose(false));
  };
  useEffect(() => { editor.current?.configurePresentation(appearance.documentFeatures, platform, documentMetadata.fileHandleId); platform.setDocumentFeatures({ ...appearance.documentFeatures }); }, [appearance.documentFeatures, platform, documentMetadata.fileHandleId]);
  dropRef.current = async (drop) => {
    const controller = editor.current; if (!controller) return;
    if (drop.phase === 'start') {
      pendingDrops.current.set(drop.id, { documentId: metadata.current.id, bookmark: controller.beginImageInsertion(drop.x, drop.y), controller });
      return;
    }
    const pending = pendingDrops.current.get(drop.id); pendingDrops.current.delete(drop.id);
    if (!pending || pending.controller !== controller) return;
    const { documentId, bookmark } = pending;
    try {
      if (metadata.current.id !== documentId) return;
      if (drop.error) { setError(drop.error); return; }
      if (!metadata.current.fileHandleId && !await save()) return;
      if (metadata.current.id !== documentId || !metadata.current.fileHandleId) return;
      const handle = metadata.current.fileHandleId;
      const images = await platform.importImages(handle, drop.tickets);
      if (metadata.current.id === documentId) {
        if (metadata.current.fileHandleId === handle) controller.finishImageInsertion(bookmark, images);
        else setError('文档保存位置已改变，请重新拖入图片。');
      }
    } catch (cause) { setError(userError(cause, 'image')); }
    finally { if (editor.current === controller) controller.cancelImageInsertion(bookmark); }
  };

  return <main className="app-shell" style={writingTokens(appearance.writingAppearance)}>
    <style>{writingFonts(appearance.writingAppearance).css}</style>
    <TitleBar title={resolveDocumentTitle(editorSnapshot.headingTitle, documentMetadata)} dirty={documentMetadata.dirty} features={appearance.documentFeatures} platform={platform} onError={setError} />
    <ErrorBanner message={error} onDismiss={() => setError(null)} />
    {exportNotice && <div className="export-notice" role="status" aria-busy={exportNotice.startsWith('正在')}><span>{exportNotice}</span><button aria-label="关闭导出提示" onClick={() => setExportNotice(null)}>×</button></div>}
    <div className="document-pane">
      <div className="editor-region" ref={editorHost} />
      {appearance.documentFeatures.outlineVisible && <DocumentOutline headings={structure?.headings ?? []} active={currentHeading(structure?.headings ?? [], readingPosition)} onJump={position => editor.current?.jump(position)} onClose={() => preferences.updateDocumentFeatures({ outlineVisible: false })} />}
    </div>
    <StatusBar document={documentMetadata} snapshot={editorSnapshot} />
    {recovery && <RecoveryDialog recovery={recovery} onDecide={async restore => {
      if (restore) {
        const recovered = recovery.document;
        editor.current?.restoreDocument(recovered.text);
        const next = recovered.fileHandleId ? createOpenedSession(recovered) : createUntitledSession();
        recoveryEnabled.current = true;
        updateDocument({ ...next, dirty: true });
      } else { await clearRecovery(); recoveryEnabled.current = true; }
      setRecovery(null); platform.ready(); editor.current?.focus();
    }} />}
    {helpMode && <HelpDialog mode={helpMode} info={appInfo} platform={platform} onClose={() => {
      if (helpMode === 'welcome') { try { localStorage.setItem('folio.welcome.v1', 'seen'); } catch {} }
      setHelpMode(null); editor.current?.focus();
    }} onSample={() => { try { localStorage.setItem('folio.welcome.v1', 'seen'); } catch {} runCommandRef.current('sample'); }} />}
    {wordTemplatesOpen && <WordTemplateDialog api={platform.wordTemplates} onClose={() => { setWordTemplatesOpen(false); editor.current?.focus(); }} onExport={async templateId => {
      if (await exportManuscript('docx', templateId)) { setWordTemplatesOpen(false); editor.current?.focus(); }
    }} />}
    {appearanceOpen && <AppearanceDialog preferences={preferences} snapshot={appearance} onClose={() => {
      setAppearanceOpen(false);
      editor.current?.focus();
    }} />}
    {decision && <DecisionDialog key={decision.id} request={decision} onAnswer={answer => {
      platform.answerDecision(decision.id, answer);
      decisions.current.shift(); setDecision(decisions.current[0] ?? null);
    }} />}
  </main>;
}
