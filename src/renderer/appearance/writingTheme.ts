import { defaultHighlightStyle, HighlightStyle, syntaxTree } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view';

// Remove renderer-like heading styling at its source, including setext H1/H2.
export const writingHighlightStyle = HighlightStyle.define([...defaultHighlightStyle.specs.map((style) =>
  style.tag === tags.heading ? { ...style, fontWeight: 'inherit', textDecoration: 'none' } : style
), { tag: [tags.list, tags.quote, tags.contentSeparator], color: 'inherit' }, { tag: [tags.link, tags.url], color: 'var(--accent)' }]);

const headingStyles = Object.fromEntries(Array.from({ length: 6 }, (_, index) => {
  const level = index + 1;
  const prefix = `--writing-heading-${level}`;
  return [`.cm-line.cm-preview-h${level}`, {
    fontSize: `var(${prefix}-size)`, fontWeight: `var(${prefix}-weight)`,
    lineHeight: 'var(--writing-heading-line-height)',
    paddingTop: `var(${prefix}-before)`, paddingBottom: `var(${prefix}-after)`
  }];
}));

/** View-only line layout; source blank lines and code remain intact. */
export function documentPresentation(state: EditorState, visibleRanges: readonly { from: number; to: number }[]) {
  const classes = new Map<number, Set<string>>();
  const codeLines = new Set<number>();
  const active = state.doc.lineAt(state.selection.main.head).number;
  const add = (line: number, name: string) => {
    if (!classes.has(line)) classes.set(line, new Set());
    classes.get(line)!.add(name);
  };
  for (const range of visibleRanges) {
    syntaxTree(state).iterate({ from: range.from, to: range.to, enter(node) {
      // Only the first source line of a top-level prose paragraph is indented.
      // Soft-wrapped lines inherit CSS text-indent; source continuations do not.
      if (node.name === 'Paragraph' && node.node.parent?.name === 'Document') {
        const content = state.doc.sliceString(node.from, node.to);
        const nonProse = node.node.getChildren('Image').concat(node.node.getChildren('InlineMath'), node.node.getChildren('TargetAttribute'));
        let remainder = content;
        for (const child of nonProse.sort((a, b) => b.from - a.from)) {
          remainder = remainder.slice(0, child.from - node.from) + remainder.slice(child.to - node.from);
        }
        if (remainder.trim() && !node.node.getChild('Image')) add(state.doc.lineAt(node.from).number, 'cm-writing-paragraph');
      }
      const className = node.name === 'ListItem' ? 'cm-writing-list' : node.name === 'Blockquote' ? 'cm-writing-quote'
        : node.name === 'FencedCode' || node.name === 'CodeBlock' ? 'cm-writing-code' : null;
      if (!className) return;
      const first = state.doc.lineAt(Math.max(range.from, node.from)).number;
      const last = state.doc.lineAt(Math.min(range.to, node.to)).number;
      for (let number = first; number <= last; number++) {
        add(number, className);
        if (className === 'cm-writing-quote' && number === active) add(number, 'cm-writing-quote-active');
        if (className === 'cm-writing-code') codeLines.add(number);
      }
    } });
    for (let number = state.doc.lineAt(range.from).number; number <= state.doc.lineAt(range.to).number; number++) {
      if (number !== active && !codeLines.has(number) && !state.doc.line(number).text.trim()) add(number, 'cm-writing-gap');
    }
  }
  return Decoration.set([...classes].map(([number, names]) => Decoration.line({ class: [...names].join(' ') }).range(state.doc.line(number).from)), true);
}

export const writingTheme = [
  EditorView.theme({
    '&': { height: '100%', fontSize: 'var(--writing-font-size)', backgroundColor: 'var(--bg)', color: 'var(--text)' },
    '.cm-scroller': { fontFamily: 'var(--writing-font-family)', lineHeight: 'var(--writing-line-height)', overflow: 'auto', padding: '0 var(--writing-page-gutter)' },
    '.cm-content': {
      flex: '0 0 auto', width: 'min(100%, var(--writing-content-width))', maxWidth: '100%',
      marginLeft: 'var(--writing-content-margin-start)', marginRight: 'auto',
      padding: 'calc(var(--editor-top-inset, 0px) + var(--writing-page-block-padding)) 0 var(--writing-page-block-padding)', caretColor: 'var(--accent)'
    },
    ...headingStyles,
    '.cm-line[class*="cm-preview-h"], .cm-line[class*="cm-preview-h"] span': { textDecoration: 'none' },
    '.cm-line[class*="cm-preview-h"] span': { fontWeight: 'inherit', textDecoration: 'none' },
    '.cm-content .cm-preview-strong': { fontWeight: 'var(--writing-strong-weight)' },
    '.cm-content .cm-preview-emphasis': { fontStyle: 'italic' },
    '.cm-content .cm-preview-code': {
      padding: '0', borderRadius: '0', background: 'var(--writing-code-background)',
      fontFamily: 'var(--writing-code-font-family)', fontSize: 'var(--writing-code-font-size)', fontWeight: '400'
    },
    '.cm-line.cm-writing-gap': { height: 'var(--writing-paragraph-spacing)', lineHeight: 'var(--writing-paragraph-spacing)', minHeight: '2px', padding: '0' },
    '.cm-line.cm-writing-paragraph': { textIndent: '2em', textAlign: 'var(--writing-paragraph-align)', textAlignLast: 'start', textJustify: 'auto', overflowWrap: 'break-word' },
    '.cm-line.cm-writing-list': { paddingLeft: 'var(--writing-list-indent)', textIndent: 'calc(var(--writing-list-indent) * -0.6)' },
    '.cm-line.cm-writing-quote': { marginLeft: 'var(--writing-quote-indent)', paddingLeft: '8px', borderLeft: 'var(--writing-quote-border)' },
    '.cm-line.cm-writing-quote:not(.cm-writing-quote-active)': { borderLeft: 'var(--writing-quote-preview-border)', color: 'var(--writing-quote-preview-color)' },
    '.cm-line.cm-writing-code': { fontFamily: 'var(--writing-code-font-family)', fontSize: 'var(--writing-code-font-size)', background: 'transparent' },
    '.cm-line.cm-writing-code span': { color: 'inherit' },
    '.cm-line.cm-writing-rule': { height: '10px', lineHeight: '0', borderBottom: '1px solid var(--writing-rule-color)', color: 'var(--text)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-search': { padding: '8px', background: 'var(--surface)', color: 'var(--text)' }
  }),
  ViewPlugin.fromClass(class {
    decorations;
    constructor(view: EditorView) { this.decorations = documentPresentation(view.state, view.visibleRanges); }
    update(update: import('@codemirror/view').ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        this.decorations = documentPresentation(update.state, update.view.visibleRanges);
      }
    }
  }, { decorations: (plugin) => plugin.decorations })
];
