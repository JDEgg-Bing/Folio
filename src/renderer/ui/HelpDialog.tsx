import { useEffect, useRef, useState } from 'react';
import type { AppInfo } from '../../shared/desktopApi';
import type { PlatformService } from '../platform/PlatformService';
import { useModal } from './useModal';
const brandIcon = require('../../../assets/folio-mark.png');

export type HelpMode = 'welcome' | 'guide' | 'about' | 'feedback';
export const SAMPLE_DOCUMENT = `# 欢迎使用轻页

这是可编辑的示例文稿。按 Ctrl+S 保存到你选择的位置。

## 开始写作

将光标放进这一行，可以看到 **粗体**、*斜体* 和 \`行内代码\` 的 Markdown 标记；离开后会显示阅读样式。

- Ctrl+N：新建文稿
- Ctrl+O：打开文稿
- Ctrl+S：保存
- Ctrl+F：查找 / 替换
- Ctrl+Shift+O：显示或隐藏目录
- F1：使用指南

## 公式与表格

行内公式 $a^2+b^2=c^2$ 与下方公式均可编辑。

$$
E = mc^2
$$
{#eq:energy}

| 项目 | 说明 |
| --- | --- |
| 文稿 | 保存为 UTF-8 Markdown |
| 预览 | 点击公式或表格可编辑源码 |
| 导出 | PDF 和 Word 使用独立的正式文稿版式 |

公式引用：[@eq:energy]。

## 图片与文稿移动

通过“编辑 → 插入图片”或拖入本地图片添加插图。托管图片放在同目录 assets 文件夹中；点击预览图片旁的“裁剪”可调整保留区域，原图保留。移动或分享文稿时，请一起复制图片文件夹。相对路径引用的其他图片也需要一起移动。

在正文按 Ctrl+V 或使用“编辑 → 粘贴”，也可插入截图、复制图片和资源管理器中的图片文件。图片独占一行即可完整预览，下一行可以直接写文字；上下方向键移动时保留预览，点击图片可编辑源码。

## 保存与恢复

状态栏的“已修改”表示内容还没有保存到 Markdown 文件。恢复草稿只用于意外退出后的恢复，不能代替 Ctrl+S。

## 导出说明

“外观 / 排版”调整写作画面；PDF 和内置 Word 导出使用所选导出版式；Word 模板导出使用已确认的模板格式。字体缺失时会回退，Word 在另一台电脑打开时也可能重新排版。
`;

const titles: Record<HelpMode, string> = { welcome: '欢迎使用轻页', guide: '使用指南', about: '关于轻页', feedback: '问题反馈' };
export function HelpDialog({ mode, info, platform, onClose, onSample }: {
  mode: HelpMode; info: AppInfo | null; platform: PlatformService; onClose(): void; onSample(): void;
}) {
  const dialog = useModal();
  const [notice, setNotice] = useState('');
  const close = () => { dialog.current?.close(); onClose(); };
  const copy = async () => {
    try {
      await platform.copyFeedback(`Folio · 轻页 ${info?.version ?? ''}\n系统：${navigator.userAgent}\n\n操作步骤：\n1. \n\n预期结果：\n\n实际结果：\n\n是否可重复：\n\n请附相关截图；文稿内容可先匿名化。\n`);
      setNotice('问题记录模板已复制，可粘贴到提供安装包的发布渠道。');
    } catch { setNotice('复制失败，请重试。'); }
  };
  return <dialog ref={dialog} className="appearance-dialog help-dialog" aria-labelledby="help-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header className="appearance-header">{mode === 'welcome' && <img className="welcome-mark" src={brandIcon} alt="Folio"/>}<h1 id="help-title">{titles[mode]}</h1><p>Folio · 轻页{info ? ` ${info.version}` : ''} · 安静地写，清楚地表达。</p></header>
    <div className="appearance-body help-body">
      {mode === 'welcome' && <>
        <p className="welcome-intro">从一句话开始，也可以先打开示例试一试。</p>
        <ol className="welcome-steps">
          <li><strong>直接写 Markdown</strong><span>进入段落时编辑标记，离开后阅读成稿。</span></li>
          <li><strong>用 Ctrl+S 保存</strong><span>文稿保存在你选择的位置；恢复草稿为意外退出保留最近内容。</span></li>
          <li><strong>按需导出 PDF 或 Word</strong><span>先选择成稿版式。完整说明随时按 F1 查看。</span></li>
        </ol>
        <p className="template-help">本地写作，无需账号。已有的字体、模板与排版偏好会继续保留。</p>
      </>}
      {mode === 'guide' && <>
        <p>直接写 Markdown。光标进入段落时显示标记，离开后显示阅读样式；公式、图片与表格点击后可编辑源码。</p>
        <h2>常用快捷键</h2>
        <dl className="help-shortcuts">{[['新建', 'Ctrl+N'], ['打开', 'Ctrl+O'], ['保存', 'Ctrl+S'], ['另存为', 'Ctrl+Shift+S'], ['撤销 / 重做', 'Ctrl+Z / Ctrl+Y'], ['查找 / 替换', 'Ctrl+F'], ['文档目录', 'Ctrl+Shift+O'], ['导出 PDF', 'Ctrl+Shift+E'], ['全屏', 'F11'], ['使用指南', 'F1']].map(([label, keys]) => <div key={label}><dt>{label}</dt><dd>{keys}</dd></div>)}</dl>
        <h2>保存、恢复与外部修改</h2>
        <p>请用 Ctrl+S 保存。“已修改”和“未保存”表示文稿还未写入文件。本地恢复草稿在编辑时约每 600 毫秒更新，异常退出后会询问是否恢复；最后一小段输入可能丢失。正常选择“不保存”会清除草稿。</p>
        <p>其他程序修改文件后，切回应用会提示；保存时再次检查，默认取消覆盖。用“另存为”可保留两个版本。</p>
        <h2>图片附件与裁剪</h2><p>使用“编辑 → 插入图片…”或拖入图片，未保存的文稿会先询问保存位置。点击预览图片旁的“裁剪”，拖出保留区域或输入像素范围，再选择“应用裁剪”。也可以将光标放在图片 Markdown 语句中，选择“编辑 → 裁剪图片…”。结果保存为 assets 中的新 PNG，保留原图，支持 Ctrl+Z 撤销；动图会保存为静态图片。</p><p>如果看不到预览图片，请在“视图 → 文档预览 → 图片”开启图片预览，并将光标移出图片语句。移动或分享 .md 时，一起复制 assets 和已有的 .assets 等图片文件夹；其他相对路径图片也需要一起复制。单独发送 .md 不会携带图片。</p>
        <h2>屏幕与导出排版</h2><p>外观设置只调整写作画面。PDF 与内置 Word 导出共用所选正式文稿版式，主题和强调色不会进入成稿。Word 模板导出使用已确认的模板格式。导出完成不会自动保存 Markdown。</p>
        <p>在正文按 Ctrl+V 或使用“编辑 → 粘贴”，支持截图、复制图片及 Windows 资源管理器中的单张／多张图片。粘贴会替换选中的文字，可一次撤销；取消保存或导入失败保留正文。图片独占一行即可完整预览，下一行可以直接写文字，上下方向键和 Shift 扩选保持预览；点击图片本身可编辑源码。</p>
        <p>PDF 固定分页；Word 保留可编辑文字、表格和公式，但字体和分页受接收电脑及 Word 版本影响。缺少字体时使用回退字体。</p>
        <h2>Word 模板边界</h2><p>导入 DOCX / DOTX，核对正文与标题映射并确认冲突后使用。模板中的文字说明不会自动转成格式规则；特殊封面、复杂多节多栏、文本框和浮动布局不能完整重建。导出提示会列出图片、公式等处理诊断。</p>
      </>}
      {mode === 'about' && <>
        <h2>个人 Markdown 写作工具</h2><p>Windows 11 x64 为当前验收平台。支持中文写作、实时预览、目录、本地图片、公式、表格、内部引用、PDF 与 Word 导出。</p>
        <p>文稿与恢复草稿保存在本地。应用没有内置账号、云同步或遥测服务。自动更新暂未提供，升级请使用发布渠道提供的新安装包。</p>
        <p>旧版升级继续使用原设置与模板目录。应用名称：Folio · 轻页；版本：{info?.version ?? '读取中'}。</p>
        <p>第三方组件与许可证说明随安装包提供，在本地数据文件夹的“发布资料”中查看。</p>
      </>}
      {mode === 'feedback' && <>
        <p>请向提供安装包的发布渠道提交问题，包含版本、操作步骤、预期与实际结果。当前尚未配置专用反馈网址。</p>
        <button className="help-button" onClick={() => void copy()}>复制问题记录模板</button>
        <h2>本地数据位置</h2><p className="help-path">{info?.dataPath ?? '读取中'}</p>
        <p>这里保存设置、Word 模板和恢复草稿。卸载不会主动删除这些资料；删除前请先备份。恢复草稿可能包含未发布文稿，请自行选择要提交的内容。</p>
        <button className="help-button" onClick={() => void platform.revealDataFolder().catch(() => setNotice('无法打开文件夹，请复制上方路径到文件资源管理器。'))}>打开本地数据文件夹</button>
      </>}
      {notice && <p role="status">{notice}</p>}
    </div>
    <footer className="appearance-actions">{mode === 'welcome' || mode === 'guide' ? <button className="folio-button secondary-button" onClick={onSample}>打开示例文稿</button> : <span>{info?.version ? `版本 ${info.version}` : ''}</span>}<button className="folio-button primary" data-initial-focus onClick={close}>{mode === 'welcome' ? '开始写作' : '完成'}</button></footer>
  </dialog>;
}
