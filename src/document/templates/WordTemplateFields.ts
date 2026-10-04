import type { Document, Element } from '@xmldom/xmldom';
import { attr, children, elements, W } from './WordXml';

/** Only replace known paragraph-role targets. Preserve switches and all unrelated field instructions. */
export function rebindStyleRef(doc: Document, targets: Map<string,string>, warnings:string[]): boolean {
  let changed=false;
  const rewrite=(code:string):string=>code.replace(/(\bSTYLEREF\s+)("[^"]+"|[^\s\\]+)(?=\s|$)/i,(all,prefix:string,token:string)=>{
    const target=token.replace(/^"|"$/g,''),replacement=targets.get(target.toLocaleLowerCase());
    if(!replacement){warnings.push('页眉页脚含无法关联到标题角色的 STYLEREF 字段；已保留，请在 Word 中核对。');return all;}
    if(replacement===target)return all;
    changed=true;return `${prefix}"${replacement}"`;
  });
  for(const field of elements(doc,'fldSimple')) {
    const code=attr(field,'instr'),next=rewrite(code);
    if(next!==code){field.setAttributeNS(W,'w:instr',next);field.setAttributeNS(W,'w:dirty','true');}
  }
  const stack:{nodes:Element[];begin:Element;instruction:boolean}[]=[];
  const walk=(node:Element)=>{
    if(node.namespaceURI===W && node.localName==='fldChar'){
      const type=attr(node,'fldCharType');
      if(type==='begin')stack.push({nodes:[],begin:node,instruction:true});
      if(type==='separate'||type==='end'){
        const top=stack.at(-1);
        if(top?.instruction){const code=top.nodes.map(n=>n.textContent||'').join(''),next=rewrite(code);if(next!==code && top.nodes.length){top.nodes[0].textContent=next;for(const n of top.nodes.slice(1))n.textContent='';top.begin.setAttributeNS(W,'w:dirty','true');}top.instruction=false;}
        if(type==='end')stack.pop();
      }
    }else if(node.namespaceURI===W && node.localName==='instrText' && stack.at(-1)?.instruction)stack.at(-1)!.nodes.push(node);
    for(const c of children(node))walk(c);
  };
  walk(doc.documentElement!);return changed;
}
