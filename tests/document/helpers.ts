import { parser, GFM } from '@lezer/markdown';
import { documentSyntax } from '../../src/document/markdownSyntax';
import { DocumentStructureService } from '../../src/document/DocumentStructureService';
export function modelFor(source: string, complete = true) { return new DocumentStructureService().build({ length: source.length, read: (from, to) => source.slice(from, to) }, parser.configure([GFM, documentSyntax]).parse(source), 0, complete); }
