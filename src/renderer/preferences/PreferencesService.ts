import { normalizeDocumentFeatures, type DocumentFeatures } from './DocumentFeatures';
import { normalizeWritingAppearance, type WritingAppearance } from './WritingAppearance';
import { migrateLegacyAppearance, TYPOGRAPHY_PRESETS, type TypographyPresetId } from './typographyPresets';
import { normalizeAccentColor, type AccentColorId } from '../appearance/accentColors';

export interface PreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PREFERENCES_KEY = 'markdown-editor.preferences.v1';

export interface PreferencesSnapshot {
  readonly accentColor: AccentColorId;
  readonly writingAppearance: Readonly<WritingAppearance>;
  readonly documentFeatures: Readonly<DocumentFeatures>;
  readonly persistenceError: string | null;
}

/** The only persistence boundary. Documents and EditorState are never inputs. */
export class PreferencesService {
  private snapshot: PreferencesSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: PreferencesStorage) {
    let appearance: unknown;
    let features: unknown;
    let accent: unknown;
    let persistenceError: string | null = null;
    try {
      const raw = storage.getItem(PREFERENCES_KEY);
      if (raw) {
        const stored: unknown = JSON.parse(raw);
        if (stored && typeof stored === 'object' && 'version' in stored && 'writingAppearance' in stored) {
          if (stored.version === 1) appearance = migrateLegacyAppearance(stored.writingAppearance);
          else if (stored.version === 2 || stored.version === 3 || stored.version === 4) appearance = stored.writingAppearance;
          if ([1, 2, 3, 4].includes(stored.version as number) && 'documentFeatures' in stored) features = stored.documentFeatures;
          if (stored.version === 4 && 'accentColor' in stored) accent = stored.accentColor;
        }
      }
    } catch {
      persistenceError = '设置读取失败，已使用默认排版。';
    }
    this.snapshot = Object.freeze({ accentColor: normalizeAccentColor(accent), writingAppearance: Object.freeze(normalizeWritingAppearance(appearance)), documentFeatures: Object.freeze(normalizeDocumentFeatures(features)), persistenceError });
  }

  getSnapshot = (): PreferencesSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  updateWritingAppearance(patch: Partial<WritingAppearance>): void {
    const writingAppearance = Object.freeze(normalizeWritingAppearance({ ...this.snapshot.writingAppearance, ...patch }));
    let persistenceError: string | null = null;
    try {
      this.persist({ ...this.snapshot, writingAppearance });
    } catch {
      persistenceError = '排版已生效，但设置保存失败。再次调整可重试。';
    }
    this.snapshot = Object.freeze({ ...this.snapshot, writingAppearance, persistenceError });
    for (const listener of this.listeners) listener();
  }

  updateDocumentFeatures(patch: Partial<DocumentFeatures>): void {
    const documentFeatures = Object.freeze(normalizeDocumentFeatures({ ...this.snapshot.documentFeatures, ...patch }));
    let persistenceError: string | null = null;
    try { this.persist({ ...this.snapshot, documentFeatures }); }
    catch { persistenceError = '设置已生效，但保存失败。'; }
    this.snapshot = Object.freeze({ ...this.snapshot, documentFeatures, persistenceError });
    for (const listener of this.listeners) listener();
  }
  applyTypographyPreset(preset: TypographyPresetId): void {
    this.updateWritingAppearance({ ...TYPOGRAPHY_PRESETS[preset].appearance });
  }

  updateAccentColor(value: AccentColorId): void {
    const accentColor = normalizeAccentColor(value);
    let persistenceError: string | null = null;
    try { this.persist({ ...this.snapshot, accentColor }); }
    catch { persistenceError = '强调色已生效，但设置保存失败。再次选择可重试。'; }
    this.snapshot = Object.freeze({ ...this.snapshot, accentColor, persistenceError });
    for (const listener of this.listeners) listener();
  }

  private persist({ writingAppearance, documentFeatures, accentColor }: PreferencesSnapshot): void {
    this.storage.setItem(PREFERENCES_KEY, JSON.stringify({ version: 4, writingAppearance, documentFeatures, accentColor }));
  }
}

export function createLocalPreferences(): PreferencesService {
  // Access is deferred so a blocked localStorage getter also takes the error path.
  return new PreferencesService({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value)
  });
}
