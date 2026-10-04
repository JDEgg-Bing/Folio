import { describe, expect, it } from 'vitest';
import { parser, GFM } from '@lezer/markdown';
import { TreeFragment } from '@lezer/common';
import { EditorState } from '@codemirror/state';
import { createEditorExtensions } from '../../src/renderer/editor/createEditorState';
import { structureField } from '../../src/renderer/editor/documentStructure';
import { DocumentStructureService } from '../../src/document/DocumentStructureService';
import { documentSyntax } from '../../src/document/markdownSyntax';
import { semanticText, walkNodes, type DocumentNode } from '../../src/document/model';
import { documentTitleField } from '../../src/renderer/document/DocumentTitle';
import { currentHeading } from '../../src/renderer/ui/DocumentOutline';

const markdown = parser.configure([GFM, documentSyntax]);
import { modelFor } from './helpers';
function nodesOf(source: string, kind: DocumentNode['kind']) { const nodes: DocumentNode[] = []; walkNodes(modelFor(source).root, node => { if (node.kind === kind) nodes.push(node); }); return nodes; }

describe('semantic document structure', () => {
  it('models all ordinary blocks and their inline content with source ranges and parents', () => {
    const source = '# Title\n\nA **strong** *em* `code` paragraph.\n\n- item\n\n> quote\n\n---\n\n```js\nconst x = 1\n```';
    const model = modelFor(source), kinds: string[] = [];
    walkNodes(model.root, node => { kinds.push(node.kind); expect(node.to).toBeLessThanOrEqual(source.length); if (node.kind !== 'document') expect(node.parentId).toBeTruthy(); });
    expect(kinds).toEqual(expect.arrayContaining(['heading','paragraph','list','listItem','quote','rule','code','strong','emphasis','inlineCode']));
    expect(semanticText(model.headings[0])).toBe(' Title');
  });
  it('provides headings in reading order without inventing skipped levels', () => {
    const model = modelFor('# 标题\n\n### 小节\n\n## 章节');
    expect(model.headings.map(node => node.level)).toEqual([1,3,2]);
    expect(currentHeading(model.headings, 0)).toBe(model.headings[0].id);
    expect(currentHeading(model.headings, 12)).toBe(model.headings[1].id);
    expect(currentHeading([], 0)).toBeNull();
  });
  it.each(['$x^2$', '\\(x^2\\)', '$$\nx^2\n$$', '\\[\nx^2\n\\]', '$$x^2$$'])('recognizes formula %j', source => {
    const formulas = nodesOf(source, 'math'); expect(formulas).toHaveLength(1); expect(formulas[0].text).toBe('x^2');
  });
  it('excludes escaped delimiters, money and code from math/reference parsing', () => {
    const source = '\\$x$ and $20 and $30\n\n`$x$ [@eq:x]`\n\n```\n$$x$$\n[@eq:x]\n```';
    expect(nodesOf(source, 'math')).toHaveLength(0); expect(modelFor(source).references).toHaveLength(0);
  });
  it('keeps unclosed display formulas and their source intact', () => {
    const source = '$$\n\\frac{a}{b}'; expect(nodesOf(source, 'math')).toHaveLength(0);
    expect(nodesOf(source, 'raw').some(node => node.text === source)).toBe(true);
  });
  it('parses inline and reference-style images with Chinese paths and captions', () => {
    const model = modelFor('![示意](<附件目录/a b.png>)\n\n![引用图][asset]\n\n[asset]: <附件目录/c d.svg>');
    expect(model.images.map(node => node.destination)).toEqual(['附件目录/a b.png', '附件目录/c d.svg']);
    expect(model.images.map(node => node.text)).toEqual(['示意','引用图']);
  });
  it('models GFM alignment, rows, escaped pipes and cell inline nodes', () => {
    const source = '| 左 | 中 | 右 |\n| :--- | :---: | ---: |\n| **粗体** | a\\|b | $x$ |';
    const table = nodesOf(source, 'table')[0];
    expect(table.align).toEqual(['left','center','right']);
    expect(table.children.filter(node => node.kind === 'row')).toHaveLength(2);
    expect(nodesOf(source, 'math')).toHaveLength(1);
  });
  it('resolves four target types and numbers only explicit IDs', () => {
    const source = '[@eq:e] [@fig:f] [@tbl:t] [@sec:s]\n\n## 方法 {#sec:s}\n\n![图](a.png){#fig:f}\n\n![未编号](b.png)\n\n| a |\n| --- |\n| b |\n{#tbl:t}\n\n$$\nx=1\n$$\n{#eq:e}';
    const model = modelFor(source);
    expect(model.references.map(ref => ref.status)).toEqual(['resolved','resolved','resolved','resolved']);
    expect(model.references.map(ref => ref.target?.label)).toEqual(['(1)','图 1','表 1','方法']);
    expect(model.diagnostics).toEqual([]);
  });
  it('handles duplicate, missing, mismatched and orphan IDs without choosing ambiguous targets', () => {
    const source = '[@fig:f] [@eq:missing]\n\n![a](a.png){#fig:f}\n\n![b](b.png){#fig:f}\n\n## Wrong {#eq:x}\n\n{#tbl:orphan}';
    const model = modelFor(source);
    expect(model.references.map(ref => ref.status)).toEqual(['duplicate','missing']);
    expect(model.references[0].target).toBeUndefined();
    expect(model.diagnostics.map(item => item.code)).toEqual(expect.arrayContaining(['duplicate-id','missing-id','wrong-type','orphan-id']));
  });
  it('marks forward targets pending while parsing is incomplete', () => {
    expect(modelFor('[@fig:future]', false).references[0].status).toBe('pending');
    expect(modelFor('[@fig:future]').references[0].status).toBe('missing');
  });
  it('rejects invalid ID characters/length and leaves unrelated citations alone', () => {
    expect(modelFor('[@book] [@fig:bad/id] [@eq:' + 'x'.repeat(81) + ']').references).toEqual([]);
    expect(modelFor('[@sec:中文.方法-1]').references[0].id).toBe('sec:中文.方法-1');
  });
  it('reuses syntax subtrees and maps their semantic source ranges after edits', () => {
    const service = new DocumentStructureService(), source = '# First\n\nBody\n\n## Second', tree = markdown.parse(source);
    const before = service.build({ length: source.length, read: (from, to) => source.slice(from,to) }, tree);
    const afterSource = source.replace('Body','Body inserted');
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree), [{ fromA: 13, toA: 13, fromB: 13, toB: 22 }], 0);
    const after = service.build({ length: afterSource.length, read: (from,to) => afterSource.slice(from,to) }, markdown.parse(afterSource, fragments), 1);
    expect(after.headings[1].from).toBe(before.headings[1].from + 9);
    expect(semanticText(after.headings[1]).trim()).toBe('Second');
    expect(before.headings[1].from).toBe(source.indexOf('##'));
  });
  it('derives Document Title from the same semantic heading and excludes its target marker', () => {
    const state = EditorState.create({ doc: '# **科研** 标题 {#sec:title}\n\nBody', extensions: createEditorExtensions(() => {}) });
    expect(state.field(documentTitleField).title).toBe('科研 标题');
    expect(state.field(structureField).headings[0].referenceId).toBe('sec:title');
    expect(state.update({ selection: { anchor: 5 } }).state.field(structureField)).toBe(state.field(structureField));
  });
  it('models nested content and preserves ordered list start and escaped table text', () => {
    const source = '> ### 引用内标题\n>\n> 3. 内容\n>    - 子列表\n\n| a |\n| --- |\n| a\\|b |';
    const model = modelFor(source); expect(model.headings[0].level).toBe(3);
    const lists = nodesOf(source,'list'); expect(lists.map(node => node.ordered)).toEqual([true,false]); expect(lists[0].start).toBe(3);
    expect(semanticText(nodesOf(source,'cell').at(-1)!)).toContain('a|b');
  });
  it('requires adjacent ID syntax and keeps numbering sequences independent', () => {
    const source = '![a](a.png) {#fig:spaced}\n\n![a](a.png){#fig:one}\n\n![b](b.png){#fig:two}\n\n$$a$$\n{#eq:one}\n\n$$b$$\n{#eq:two}\n\n| a |\n| --- |\n| b |\n\n{#tbl:spaced}';
    const model = modelFor(source);
    expect(model.targets.has('fig:spaced')).toBe(false); expect(model.targets.has('tbl:spaced')).toBe(false);
    expect(model.targets.get('fig:two')?.[0].label).toBe('图 2'); expect(model.targets.get('eq:two')?.[0].label).toBe('(2)');
  });
});
