export const TEMPLATE_ROLES = {
  body: '正文', title: '文档主标题', heading1: '一级标题', heading2: '二级标题',
  heading3: '三级标题', heading4: '四级标题', heading5: '五级标题', heading6: '六级标题',
  figureCaption: '图题', tableCaption: '表题', quote: '引用', list: '列表',
  equation: '公式', tableText: '表格文字', code: '代码'
} as const;
export type TemplateRole = keyof typeof TEMPLATE_ROLES;
export interface TemplateCandidate {
  id: string; name: string; source: 'style' | 'sample'; styleId?: string;
  sample: string; examples?: string[]; count: number; bodyCount?: number; paragraph: string; run: string; summary: string;
}
export interface TemplateMapping {
  candidateId: string | null; confidence: 'high' | 'medium' | 'low'; reason: string;
  example?: string; alternatives?: string[]; needsConfirmation?: boolean; confirmedByUser?: boolean;
}
export interface WordTemplateProfile {
  version: 1; id: string; name: string; confirmed: boolean; warningsAccepted: boolean;
  analysisRevision?: number;
  review?: { originalId: string; previous: Record<TemplateRole, TemplateMapping>; suggestions: Record<TemplateRole, TemplateMapping> };
  candidates: TemplateCandidate[]; mappings: Record<TemplateRole, TemplateMapping>;
  page: { width: number; height: number; top: number; right: number; bottom: number; left: number; gutter?: number; summary: string };
  runningMatter: string[]; tableSummary: string; warnings: string[];
}
export interface TemplateLibrary { templates: WordTemplateProfile[]; defaultId: string | null }
export interface TemplateConfirmation {
  id: string; name: string; mappings: Record<TemplateRole, string | null>; warningsAccepted: boolean; makeDefault: boolean;
  confirmedRoles?: TemplateRole[];
}
export interface WordTemplateAPI {
  list(): Promise<TemplateLibrary>;
  import(requestId?: string): Promise<WordTemplateProfile | null>;
  reanalyze(id: string, requestId: string): Promise<WordTemplateProfile | null>;
  cancelAnalysis(requestId: string): Promise<void>;
  discardDraft(id: string): Promise<void>;
  confirm(value: TemplateConfirmation): Promise<WordTemplateProfile>;
  remove(id: string): Promise<void>;
  setDefault(id: string | null): Promise<void>;
}
