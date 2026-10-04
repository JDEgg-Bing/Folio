import { describe, expect, it } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { GFM } from '@lezer/markdown';
import { buildDecorations } from '../../src/renderer/editor/extensions/livePreview';
import { parsedState } from './parsedState';

const markdownExtension = markdown({ base: markdownLanguage, extensions: [GFM] });

function stateFor(source: string, cursor = 0): EditorState {
  return parsedState(EditorState.create({ doc: source, selection: EditorSelection.cursor(cursor), extensions: [markdownExtension] }));
}

function readDecorations(state: EditorState, ranges: readonly { from: number; to: number }[]) {
  const set = buildDecorations(state, ranges);
  const found: { from: number; to: number; className?: string }[] = [];
  set.between(0, state.doc.length, (from, to, value) => {
    found.push({ from, to, className: value.spec.class as string | undefined });
  });
  return found;
}

function markerRanges(state: EditorState, names: string[]) {
  const found: { from: number; to: number }[] = [];
  syntaxTree(state).iterate({ enter(node) {
    if (names.includes(node.name)) found.push({ from: node.from, to: node.to });
  } });
  return found;
}

function isHidden(decorations: ReturnType<typeof readDecorations>, range: { from: number; to: number }) {
  return decorations.some((item) => item.from === range.from && item.to >= range.to && item.className === undefined);
}

describe('live preview decorations', () => {
  it('uses the same heading classes for existing multiline setext syntax', () => {
    const source = 'First\ncontinued\n===\n\nSecond\n---\n\nBody';
    const state = stateFor(source, source.length);
    const decorations = readDecorations(state, [{ from: 0, to: state.doc.length }]);
    expect(decorations.filter((item) => item.className?.startsWith('cm-preview-h')).map((item) => item.className)).toEqual(['cm-preview-h1', 'cm-preview-h1', 'cm-preview-h2']);
    expect(state.doc.toString()).toBe(source);
  });
  it('styles multiple headings and sorts decorations with inline markup', () => {
    const source = '# First **bold**\n\n## Second *italic*';
    const state = stateFor(source, source.length);
    const decorations = readDecorations(state, [{ from: 0, to: state.doc.length }]);
    expect(decorations.filter((item) => item.className?.startsWith('cm-preview-h')).map((item) => item.className)).toEqual(['cm-preview-h1', 'cm-preview-h2']);
    expect(decorations.some((item) => item.className === 'cm-preview-strong')).toBe(true);
    expect(decorations.some((item) => item.className === 'cm-preview-emphasis')).toBe(true);
  });

  it('hides real nested emphasis markers while leaving active-line markers visible', () => {
    const source = '***nested***';
    const state = stateFor(source, 0);
    const markers = markerRanges(state, ['EmphasisMark']);
    const inactiveState = stateFor(source + '\nother', source.length + 1);
    const inactive = readDecorations(inactiveState, [{ from: 0, to: inactiveState.doc.length }]);
    for (const marker of markers) expect(isHidden(inactive, marker)).toBe(true);
    expect(inactive.some((item) => item.className === 'cm-preview-strong')).toBe(true);
    const active = readDecorations(state, [{ from: 0, to: state.doc.length }]);
    expect(markers.every((marker) => isHidden(active, marker))).toBe(false);
  });

  it('uses CodeMark nodes for variable-backtick inline code', () => {
    const source = '``code ` value``';
    const state = stateFor(source, 0);
    const markers = markerRanges(state, ['CodeMark']);
    expect(markers.map((range) => state.doc.sliceString(range.from, range.to))).toEqual(['``', '``']);
    const inactiveState = stateFor(source + '\nother', source.length + 1);
    const decorations = readDecorations(inactiveState, [{ from: 0, to: inactiveState.doc.length }]);
    for (const marker of markers) expect(isHidden(decorations, marker)).toBe(true);
    expect(decorations.some((item) => item.className === 'cm-preview-code')).toBe(true);
  });

  it('keeps heading, strong, emphasis and strike delimiters on the active line', () => {
    const source = '# **bold** *em* ~~gone~~';
    const state = stateFor(source, 0);
    const markers = markerRanges(state, ['HeaderMark', 'EmphasisMark', 'StrikethroughMark']);
    expect(markers.length).toBeGreaterThan(4);
    const active = readDecorations(state, [{ from: 0, to: state.doc.length }]);
    expect(markers.some((marker) => isHidden(active, marker))).toBe(false);
    const inactiveState = stateFor(source + '\nother', source.length + 1);
    const inactiveMarkers = markerRanges(inactiveState, ['HeaderMark', 'EmphasisMark', 'StrikethroughMark']);
    const inactive = readDecorations(inactiveState, [{ from: 0, to: inactiveState.doc.length }]);
    expect(inactiveMarkers.every((marker) => isHidden(inactive, marker))).toBe(true);
  });

  it('rebuilds for selection changes and multiple visible ranges', () => {
    const source = '# One\n\n**two**\n\n## Three';
    const state = stateFor(source, 0);
    const moved = state.update({ selection: EditorSelection.cursor(source.indexOf('two')) }).state;
    const firstRanges = [{ from: 0, to: 7 }, { from: 9, to: state.doc.length }];
    const before = readDecorations(state, firstRanges);
    const after = readDecorations(moved, firstRanges);
    expect(before).not.toEqual(after);
    expect(after.some((item) => item.className === 'cm-preview-strong')).toBe(true);
  });

  it('does not throw for malformed Markdown or several visible lines', () => {
    const source = '# Heading\n\n**\n[hello](\n```\n~~unfinished';
    const state = stateFor(source, source.length);
    expect(() => readDecorations(state, [{ from: 0, to: 8 }, { from: 10, to: state.doc.length }])).not.toThrow();
  });
});
