// The build injects Onlook's getAstFromContent implementation and its Babel parser here.
function importSource(file, useFixtureIds=false){
  if(!file||typeof file.name!=='string'||!/^[a-zA-Z0-9._-]{1,100}\.[jt]sx$/.test(file.name)||typeof file.code!=='string'||!file.code.length||file.code.length>180000)fail('Choose a JSX or TSX component under 180 KB.');
  const ast=getAstFromContent(file.code);if(!ast)fail('This component could not be parsed. Choose a valid JSX or TSX file.');
  const items=[],ranges=[];const stack=[ast.program];
  const skip=new Set(['script','style','input','textarea','form','select','template','noscript']);
  while(stack.length){
    const node=stack.pop();if(!node||typeof node!=='object')continue;
    if(node.type==='JSXElement'){
      const open=node.openingElement,name=open.name?.name;
      if(skip.has(name)||open.attributes.some(a=>['hidden','contentEditable','dangerouslySetInnerHTML'].includes(a.name?.name)))continue;
      const child=node.children.length===1&&node.children[0];
      if(Object.hasOwn(labels,name)&&child?.type==='JSXText'&&child.value.trim()&&child.value.trim().length<=2500){
        const fixed=useFixtureIds && open.attributes.find(a=>a.name?.name==='data-oid')?.value?.value;
        if(useFixtureIds && (!/^[a-z][a-z0-9-]*$/.test(fixed || '') || items.some(item=>item.id===fixed)))fail('The bakery fixture needs unique element IDs.');
        const id=fixed || 'src-'+child.start,text=child.value.trim();items.push({id,tag:name,label:labels[name],text});ranges.push({id,start:child.start,end:child.end,original:text});
        continue
      }
    }
    for(const v of Object.values(node)){if(Array.isArray(v)){for(const n of v)if(n?.type)stack.push(n)}else if(v?.type)stack.push(v)}
  }
  if(!items.length||items.length>180)fail('Choose a component with 1 to 180 static headings or paragraphs. Computed copy stays in the source.');
  const offsets=new Map(ranges.map(r=>[r.id,r.start]));
  items.sort((a,b)=>offsets.get(a.id)-offsets.get(b.id));
  return {items,source:{name:file.name,code:file.code,ranges}}
}
function sourceFor(s,v){
  let out=s.source.code;const items=new Map(v.items.map(i=>[i.id,i.text]));
  for(const r of [...s.source.ranges].sort((a,b)=>b.start-a.start)){
    const text=items.get(r.id);if(text===r.original||text==null)continue;
    const value=text.replace(/[&<>{}]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','{':'&#123;','}':'&#125;'}[c]));
    out=out.slice(0,r.start)+value+out.slice(r.end)
  }
  return out
}
