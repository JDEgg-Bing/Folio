import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PreferencesService, PreferencesSnapshot } from '../preferences/PreferencesService';
import { APPEARANCE_LIMITS, type NumericAppearanceKey } from '../preferences/WritingAppearance';
import { TYPOGRAPHY_PRESETS, type TypographyPresetId } from '../preferences/typographyPresets';
import { ACCENT_COLORS } from '../appearance/accentColors';
import { fontWarnings } from '../appearance/writingFonts';
import { useModal } from './useModal';

function NumericField({ setting, label, value, preferences }: { setting: NumericAppearanceKey; label: string; value: number; preferences: PreferencesService }) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { if (document.activeElement !== input.current) setDraft(String(value)); }, [value]);
  return <label className="appearance-field">{label}
    <input ref={input} type="number" {...APPEARANCE_LIMITS[setting]} value={draft} onChange={(event) => {
      setDraft(event.target.value);
      if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) preferences.updateWritingAppearance({ [setting]: event.target.valueAsNumber });
    }} onBlur={() => setDraft(String(preferences.getSnapshot().writingAppearance[setting]))} />
  </label>;
}

function FontField({ setting, label, value, choices, preferences }: {
  setting: 'chineseFontFamily' | 'latinFontFamily'; label: string; value: string; choices: string[]; preferences: PreferencesService;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (document.activeElement !== input.current) setDraft(value); }, [value]);
  return <label className="appearance-field">{label}
    <input ref={input} list={setting} value={draft} maxLength={200} spellCheck={false} onChange={(event) => {
      setDraft(event.target.value);
      if (event.target.value.trim()) preferences.updateWritingAppearance({ [setting]: event.target.value });
    }} onBlur={() => setDraft(preferences.getSnapshot().writingAppearance[setting])} />
    <datalist id={setting}>{choices.map((font) => <option key={font} value={font} />)}</datalist>
  </label>;
}

export function AppearanceDialog({ preferences, snapshot, onClose }: {
  preferences: PreferencesService; snapshot: PreferencesSnapshot; onClose: () => void;
}) {
  const dialog = useModal();
  const appearance = snapshot.writingAppearance;
  const [fontNotice, setFontNotice] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => { void fontWarnings(appearance).then(messages => { if (alive) setFontNotice(messages); }); }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [appearance.chineseFontFamily, appearance.latinFontFamily]);
  const close = () => { dialog.current?.close(); onClose(); };
  const number = (setting: NumericAppearanceKey, label: string) => <NumericField setting={setting} label={label} value={appearance[setting]} preferences={preferences} />;
  return <dialog className="appearance-dialog" ref={dialog} aria-labelledby="appearance-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="appearance-header">
      <h1 id="appearance-title">外观 / 排版</h1>
      <p>让文字呈现为你喜欢的样子。</p>
    </header>
    <div className="appearance-body">
    <fieldset className="appearance-group accent-group"><legend>强调色</legend>
      <div className="accent-options" role="group" aria-label="强调色">
        {ACCENT_COLORS.map(color => <button key={color.id} type="button" className="accent-option"
          aria-label={color.label} aria-pressed={snapshot.accentColor === color.id} title={color.label}
          style={{ '--swatch-light': color.light, '--swatch-dark': color.dark } as CSSProperties}
          onClick={() => preferences.updateAccentColor(color.id)}>
          <span className="accent-swatch" aria-hidden="true">{snapshot.accentColor === color.id ? '✓' : ''}</span>
          <span>{color.label}</span>
        </button>)}
      </div>
    </fieldset>
    <fieldset className="appearance-group"><legend>预设</legend>
      <label className="appearance-field">排版预设
        <select aria-label="排版预设" value={appearance.typographyPreset} onChange={(event) => preferences.applyTypographyPreset(event.target.value as TypographyPresetId)}>
          <option value="custom" disabled>自定义</option>
          {Object.entries(TYPOGRAPHY_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}
        </select>
      </label>
    </fieldset>
    <fieldset className="appearance-group"><legend>文字</legend>
      <FontField setting="chineseFontFamily" label="中文字体" value={appearance.chineseFontFamily} choices={['SimSun', 'NSimSun', 'Noto Serif CJK SC', 'Source Han Serif SC', 'Microsoft YaHei', 'Noto Sans CJK SC']} preferences={preferences} />
      <FontField setting="latinFontFamily" label="英文字体" value={appearance.latinFontFamily} choices={['Times New Roman', 'Segoe UI', 'Arial', 'Georgia']} preferences={preferences} />
      {number('fontSize', '正文字号（px）')}
      {fontNotice.length > 0 && <p className="appearance-error" role="status">{fontNotice.join('；')}</p>}
    </fieldset>
    <fieldset className="appearance-group"><legend>阅读节奏</legend>
      {number('lineHeight', '行距（倍）')}
      {number('paragraphSpacing', '段间距（行）')}
    </fieldset>
    <fieldset className="appearance-group"><legend>页面</legend>
      <label className="appearance-field">页面布局
        <select aria-label="页面布局" value={appearance.writingLayout} onChange={(event) => preferences.updateWritingAppearance({ writingLayout: event.target.value === 'centered' ? 'centered' : 'compact' })}>
          <option value="compact">紧凑 · 左侧对齐</option><option value="centered">居中 · 专注书写</option>
        </select>
      </label>
      {number('contentWidth', '正文宽度（px）')}
      {number('headingScale', '标题比例')}
    </fieldset>
    <details className="appearance-details"><summary>更多排版细节</summary>
      {number('listIndent', '列表缩进（px）')}
      {number('quoteIndent', '引用缩进（px）')}
      <label className="appearance-field">引用细线<input type="checkbox" checked={appearance.quoteBorder} onChange={(event) => preferences.updateWritingAppearance({ quoteBorder: event.target.checked })} /></label>
      <label className="appearance-field">行内代码<select aria-label="行内代码" value={appearance.inlineCodeStyle} onChange={(event) => preferences.updateWritingAppearance({ inlineCodeStyle: event.target.value === 'subtle' ? 'subtle' : 'plain' })}><option value="plain">仅字体</option><option value="subtle">轻底色</option></select></label>
    </details>
    <p className="template-help">这些设置调整写作画面。PDF 与内置 Word 使用所选导出版式，Word 模板使用已确认的模板格式；主题和强调色不进入成稿。</p>
    {snapshot.persistenceError && <p role="alert" className="appearance-error">{snapshot.persistenceError}</p>}
    </div>
    <footer className="appearance-actions"><span>调整即时生效</span><button className="folio-button primary" type="button" data-initial-focus onClick={close}>完成</button></footer>
  </dialog>;
}
