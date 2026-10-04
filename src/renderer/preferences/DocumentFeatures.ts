export const DEFAULT_DOCUMENT_FEATURES = Object.freeze({ outlineVisible: false, mathPreview: true, imagePreview: true, tablePreview: true, referencePreview: true });
export type DocumentFeatures = { -readonly [K in keyof typeof DEFAULT_DOCUMENT_FEATURES]: boolean };
export function normalizeDocumentFeatures(value: unknown): DocumentFeatures {
  const result: DocumentFeatures = { ...DEFAULT_DOCUMENT_FEATURES };
  if (value && typeof value === 'object') for (const key of Object.keys(result) as (keyof DocumentFeatures)[]) {
    const setting = (value as Record<string, unknown>)[key]; if (typeof setting === 'boolean') result[key] = setting;
  }
  return result;
}
