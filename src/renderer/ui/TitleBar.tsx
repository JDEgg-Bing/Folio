import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { APP_MENUS, type MenuAction, type MenuEntry } from '../../shared/appMenu';
import { PRODUCT_NAME } from '../../shared/product';
import type { DocumentFeatures } from '../preferences/DocumentFeatures';
import type { PlatformService } from '../platform/PlatformService';

interface Anchor { left: number; top: number; origin: number }
function anchorFor(button: HTMLElement): Anchor {
  const rect = button.getBoundingClientRect();
  const reservedWidth = button.dataset.menu === 'view' ? 462 : 260;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - reservedWidth));
  return { left, top: rect.bottom + 6, origin: rect.left + rect.width / 2 - left };
}
function menuButtons(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]')).filter(button => button.closest('[role="menu"]') === element);
}

function MenuSurface({ entries, label, features, onAction, onDismiss, onSwitch, submenu = false, focusOnMount = true, onBack }: {
  entries: readonly MenuEntry[]; label: string; features: Readonly<DocumentFeatures>;
  onAction: (action: MenuAction) => void; onDismiss: (restore: boolean) => void;
  onSwitch: (direction: number) => void; submenu?: boolean; focusOnMount?: boolean; onBack?: () => void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branchTop, setBranchTop] = useState(0);
  const [branchAbove, setBranchAbove] = useState(false);
  const branchButton = useRef<HTMLButtonElement | null>(null);
  const branchFocus = useRef(false);
  const typeahead = useRef({ text: '', time: 0 });
  useLayoutEffect(() => { if (focusOnMount) menuButtons(surface.current!)[0]?.focus(); }, []);
  const showBranch = (action: MenuAction, button: HTMLButtonElement, focus = false) => {
    const rect = button.getBoundingClientRect();
    const panel = surface.current!.getBoundingClientRect();
    const neededHeight = (action.children?.length ?? 0) * 30 + 16;
    setBranchTop(Math.max(0, Math.min(rect.top - panel.top - 8, window.innerHeight - panel.top - neededHeight - 8)));
    setBranchAbove(panel.right + 202 > window.innerWidth - 8);
    branchButton.current = button;
    branchFocus.current = focus;
    setBranch(action.id);
    if (focus) requestAnimationFrame(() => surface.current?.querySelector<HTMLButtonElement>('.product-submenu button')?.focus());
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.closest('[role="menu"]') !== surface.current) return;
    const buttons = menuButtons(surface.current!);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      setBranch(null); buttons[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (submenu) onBack?.(); else onDismiss(true);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation();
      if (submenu) { if (event.key === 'ArrowLeft') onBack?.(); return; }
      const action = entries.find(entry => entry.kind === 'item' && entry.id === buttons[index]?.dataset.command);
      if (event.key === 'ArrowRight' && action?.kind === 'item' && action.children) showBranch(action, buttons[index], true);
      else onSwitch(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Tab') {
      onDismiss(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && event.key !== ' ') {
      const now = Date.now();
      const text = (now - typeahead.current.time > 600 ? '' : typeahead.current.text) + event.key.toLocaleLowerCase();
      typeahead.current = { text, time: now };
      const next = [...buttons.slice(index + 1), ...buttons.slice(0, index + 1)].find(button => button.getAttribute('aria-label')?.toLocaleLowerCase().startsWith(text));
      if (next) { event.preventDefault(); next.focus(); }
    }
  };
  return <div ref={surface} className={`menu-surface${submenu ? ' is-submenu' : ''}`} role="menu" aria-label={label} onKeyDown={keyboard}>
    {entries.map((entry, index) => entry.kind === 'separator' ? <div className="menu-separator" role="separator" key={`separator-${index}`} /> :
      <div className="menu-row" key={entry.id}>
        <button type="button" className={`menu-command${branch === entry.id ? ' branch-active' : ''}`} role={entry.feature ? 'menuitemcheckbox' : 'menuitem'}
          aria-label={entry.label} aria-checked={entry.feature ? features[entry.feature] : undefined} aria-haspopup={entry.children ? 'menu' : undefined}
          aria-expanded={entry.children ? branch === entry.id : undefined} tabIndex={-1} data-command={entry.id}
          onPointerEnter={event => { if (entry.children) showBranch(entry, event.currentTarget); else setBranch(null); }}
          onClick={event => { if (entry.children) showBranch(entry, event.currentTarget, true); else onAction(entry); }}>
          <span className="menu-check" aria-hidden="true">{entry.feature && features[entry.feature] ? '✓' : ''}</span>
          <span className="menu-label">{entry.label}</span>
          {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
          {entry.children && <span className="menu-chevron" aria-hidden="true">›</span>}
        </button>
        {entry.children && branch === entry.id && <div className={`product-submenu${branchAbove ? ' opens-left' : ''}`} style={{ top: branchTop }}>
          <MenuSurface entries={entry.children} label={entry.label} features={features} onAction={onAction} onDismiss={onDismiss} onSwitch={onSwitch} submenu focusOnMount={branchFocus.current} onBack={() => { setBranch(null); branchButton.current?.focus(); }} />
        </div>}
      </div>)}
  </div>;
}

export function TitleBar({ title, dirty, features, platform, onError }: {
  title: string; dirty: boolean; features: Readonly<DocumentFeatures>; platform: PlatformService; onError: (message: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [focusedMenu, setFocusedMenu] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const priorFocus = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portal = useRef<HTMLDivElement>(null);
  const menuBar = useRef<HTMLElement>(null);
  const dismiss = (restore: boolean) => {
    if (open === null || closing) return;
    setClosing(true);
    if (restore) buttons.current[open]?.focus();
    closeTimer.current = setTimeout(() => { setOpen(null); setClosing(false); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 110);
  };
  const show = (index: number) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (open === null && document.activeElement instanceof HTMLElement && !menuBar.current?.contains(document.activeElement)) priorFocus.current = document.activeElement;
    setFocusedMenu(index); setAnchor(anchorFor(buttons.current[index]!)); setClosing(false); setOpen(index);
  };
  const switchMenu = (direction: number) => { if (open !== null) show((open + direction + APP_MENUS.length) % APP_MENUS.length); };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'F10' && !event.shiftKey || event.key === 'Alt' && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
        if (document.querySelector('dialog[open]')) return;
        event.preventDefault();
        if (open !== null) dismiss(true);
        else { if (document.activeElement instanceof HTMLElement) priorFocus.current = document.activeElement; buttons.current[0]?.focus(); setFocusedMenu(0); }
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [open, closing]);
  useEffect(() => {
    if (open === null) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuBar.current?.contains(event.target) && !portal.current?.contains(event.target)) dismiss(false);
    };
    const reposition = () => setAnchor(anchorFor(buttons.current[open]!));
    const blur = () => dismiss(false);
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('pointerdown', outside, true); window.removeEventListener('resize', reposition); window.removeEventListener('blur', blur); };
  }, [open, closing]);
  const execute = (action: MenuAction) => {
    // Native edit roles act on the original editor/input, never on a menu button.
    if (priorFocus.current?.isConnected) priorFocus.current.focus();
    dismiss(false);
    // Chromium's native undo command does not enter CodeMirror's history keymap.
    // Forward the existing shortcut to its focused surface; keep native input
    // roles for ordinary fields and all other edit commands.
    if ((action.role === 'undo' || action.role === 'redo') && priorFocus.current?.closest('.cm-editor')) {
      const redo = action.role === 'redo';
      priorFocus.current.dispatchEvent(new globalThis.KeyboardEvent('keydown', {
        key: redo ? 'y' : 'z', code: redo ? 'KeyY' : 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true
      }));
      return;
    }
    void platform.runMenuCommand(action.id).catch(() => onError('无法执行菜单操作，请重试。'));
  };
  return <>
    <header className="product-titlebar">
      <div className="titlebar-content">
        <div className="product-identity"><svg className="product-mark" viewBox="0 0 128 128" role="img" aria-label={PRODUCT_NAME}>
          <rect width="128" height="128" rx="24" fill="var(--accent)" />
          <path d="M38 22h38l20 20v58a6 6 0 0 1-6 6H38a6 6 0 0 1-6-6V28a6 6 0 0 1 6-6Z" fill="var(--brand-paper)" />
          <path d="M76 22v14a6 6 0 0 0 6 6h14Z" fill="var(--accent)" opacity=".38" />
          <path d="M44 78h40M44 89h27" fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
        </svg></div>
        <nav ref={menuBar} className="product-menubar" role="menubar" aria-label="应用菜单" onKeyDown={event => {
          const index = buttons.current.indexOf(document.activeElement as HTMLButtonElement);
          if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? APP_MENUS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + APP_MENUS.length) % APP_MENUS.length;
            setFocusedMenu(next); buttons.current[next]?.focus(); if (open !== null) show(next);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(Math.max(index, 0)); }
          else if (event.key === 'Escape') { event.preventDefault(); dismiss(false); priorFocus.current?.focus(); }
        }}>
          {APP_MENUS.map((menu, index) => <button key={menu.id} ref={element => { buttons.current[index] = element; }} type="button" role="menuitem" data-menu={menu.id} className={`menu-trigger${open === index && !closing ? ' is-active' : ''}`} aria-label={menu.label} aria-haspopup="menu" aria-expanded={open === index && !closing} aria-controls={`menu-${menu.id}`} tabIndex={focusedMenu === index ? 0 : -1}
            onPointerDown={event => { if (open === null && document.activeElement instanceof HTMLElement && !menuBar.current?.contains(document.activeElement)) priorFocus.current = document.activeElement; event.preventDefault(); }}
            onPointerEnter={() => { if (open !== null && !closing && open !== index) show(index); }}
            onFocus={() => setFocusedMenu(index)} onClick={() => { if (open === index && !closing) dismiss(true); else show(index); }}>{menu.label}</button>)}
        </nav>
        <div className="titlebar-document" title={`${title}${dirty ? ' · 已修改' : ''}`}><span>{title}</span>{dirty && <span className="titlebar-dirty" aria-label="已修改" />}</div>
      </div>
    </header>
    {open !== null && anchor && createPortal(<div ref={portal} id={`menu-${APP_MENUS[open].id}`} className={`product-menu${closing ? ' is-closing' : ''}`} aria-hidden={closing || undefined} style={{ left: anchor.left, top: anchor.top, transformOrigin: `${anchor.origin}px -6px` }}>
      <MenuSurface key={APP_MENUS[open].id} entries={APP_MENUS[open].entries} label={APP_MENUS[open].label} features={features} onAction={execute} onDismiss={dismiss} onSwitch={switchMenu} />
    </div>, document.body)}
  </>;
}
