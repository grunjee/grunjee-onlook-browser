export const fields = [
  ['brand','Site name','Grunjee Labs'], ['title','Hero heading','Small studio.\nBig ideas.'],
  ['intro','Introduction','Independent design and development for people building something of their own.'],
  ['servicesTitle','Section title','What we do'], ['svc1','Service heading','Website design'],
  ['body1','Service description','Distinctive websites built around the way you work.'],
  ['svc2','Service heading','Custom software'], ['body2','Service description','Useful tools that make everyday work feel lighter.'],
  ['svc3','Service heading','System design'], ['body3','Service description','Bring the pieces of your business together.'],
  ['contact','Contact heading','Let’s work together.']
].map(([id,label,text])=>({id,label,text}));
const labels = {h1:'Page heading', h2:'Section heading', h3:'Heading', p:'Paragraph', li:'List item', figcaption:'Caption'};
const copy = x=>structuredClone(x);
export class Problem extends Error {constructor(message,status=400){super(message);this.status=status}}
export const fail=(message,status)=>{throw new Problem(message,status)};
const checkString=(s,max)=>typeof s==='string' && s.trim().length>0 && s.length<=max;
export function newSite(id,name,format,content,now) {
  return {id,name,format,head:1,live:1,reviewed:null,versions:[{n:1,base:1,at:now,items:copy(content),target:null,summary:'Original website'}],events:[],releases:[{n:1,time:now,kind:'Original'}],messages:[],question:null,lastTarget:null};
}
export function initial(now){return {serial:0,receipts:[],sites:[newSite('grunjee-labs','Grunjee Labs','studio',fields,now)]}}
export const revision=(s,n)=>s.versions.find(v=>v.n===n);
export function differences(a,b){return b.items.filter(f=>a.items.find(i=>i.id===f.id)?.text!==f.text).map(f=>({label:f.label,id:f.id,before:a.items.find(i=>i.id===f.id)?.text??'',after:f.text}))}
function pickTarget(s,body,items){
  if(body.target){const t=items.find(f=>f.id===body.target);if(!t)fail('That selection has moved. Choose the text again.',409);return t}
  const raw=body.text.toLowerCase();
  const match=items.filter(f=>raw.includes(f.text.toLowerCase()) || raw.includes(f.label.toLowerCase()));
  if(match.length===1)return match[0];
  const role=/\b(headline|hero heading|page title)\b/i.test(raw)?items.find(f=>f.id==='title'||f.tag==='h1'):null;
  if(role)return role;
  return items.find(f=>f.id===(s.question?.target||s.lastTarget));
}
export function replacement(note,old,exact=false) {
  const t=note.trim();
  if(exact)return t;
  const q=[...t.matchAll(/["“]([^"”]+)["”]/g)];if(q.length)return q.at(-1)[1].trim();
  const verbal=t.match(/^(?:(?:please\s+)?(?:replace|change|set|update|rename|rewrite|make)\b.+?\b(?:with|to|as|say|read)\s+|(?:use|say|write|set to|text:|replace with)\s+)([\s\S]+)$/i);
  if(verbal)return verbal[1].trim().replace(/^[:\s]+/,'');
  if(/\b(?:time|am|pm)\b/i.test(old)){
    const digits={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
    const words=t.toLowerCase().replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g,w=>digits[w]);
    const match=words.match(/\b(1[0-2]|[1-9])(?::([0-5]\d))?\s*(am|pm)?\b/i);
    if(match && /\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(old))return old.replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)\b/i,(_,period)=>match[1]+(match[2]?':'+match[2]:'')+' '+(match[3]||period).toUpperCase())
  }
  return null
}
export function transact(original,a,now=new Date().toISOString(),readSource){
  if(!a||!checkString(a.key,100))fail('This action needs a request ID.');
  if(original.receipts.includes(a.key))return original;
  if(a.serial!==original.serial)fail('This workspace changed in another tab. Its latest version has been loaded.',409);
  const state=copy(original);
  if(a.type==='create'){
    if(state.sites.filter(site=>site.format!=='bakery').length>=20)fail('This workspace holds up to 20 websites.');
    if(!checkString(a.name,72))fail('Enter a website name.');
    const parsed=a.sourceFile?readSource(a.sourceFile):null;const format=a.items||parsed?'imported':'studio';
    let items=copy(fields);
    if(a.items){
      if(!Array.isArray(a.items)||a.items.length===0||a.items.length>180)fail('Import between 1 and 180 text blocks.');
      items=a.items.map((b,i)=>{if(!Object.hasOwn(labels,b.tag)||!checkString(b.text,2500))fail('One of the text blocks could not be imported.');return {id:'txt-'+i,tag:b.tag,label:labels[b.tag],text:b.text.trim()}})
    }else if(parsed){items=parsed.items}else{items[0].text=a.name.trim()}
    const id=crypto.randomUUID();const added=newSite(id,a.name.trim(),format,items,now);if(parsed)added.source=parsed.source;state.sites.push(added);
  }else{
    const s=state.sites.find(site=>site.id===a.site);if(!s)fail('Website not found.',404);
    const head=revision(s,s.head),live=revision(s,s.live);
    const say=(who,text,target=null)=>s.messages.push({who,text,at:now,target});
    if(a.type==='edit'){
      if(!checkString(a.text,2500))fail('Write a change in 2,500 characters or less.');
      if(s.messages.length>=600)fail('This pilot conversation is full. Export your page or start a new website.');
      const t=pickTarget(s,a,head.items);
      const next=t?replacement(a.text,t.text,Boolean(a.exact)||(s.question?.kind==='words'&&t.id===s.question.target)):null;
      say('you',a.text,t?.id??null);
      if(!t){s.question={kind:'target',note:a.text,target:null};say('desk','Which text should change? Click it in the preview, then send the replacement wording.')}
      else if(!next){s.lastTarget=t.id;s.question={kind:'words',target:t.id};say('desk','What exact wording should replace “'+t.text+'”? Type it below.',t.id)}
      else if(next===t.text){s.question=null;say('desk','That wording already appears in the preview.',t.id)}
      else{
        const n=s.versions.length+1,items=head.items.map(f=>f.id===t.id?{...f,text:next}:f);
        s.versions.push({n,at:now,base:s.live,items,target:t.id,summary:t.label+' updated'});s.head=n;s.reviewed=null;s.lastTarget=t.id;s.question=null;
        say('desk','Version '+n+' is ready. Review the change beside your page.',t.id)
      }
    }else if(a.type==='review'){
      if(a.version!==s.head||s.head===s.live||head.base!==s.live)fail('Open the latest private preview before reviewing.',409);
      s.reviewed=s.head
    }else if(a.type==='publish'){
      if(a.version!==s.head||a.base!==s.live||s.reviewed!==s.head||s.head===s.live||head.base!==s.live)fail('Review the current version before publishing.',409);
      s.live=s.head;s.reviewed=null;s.releases.push({n:s.live,time:now,kind:'Published'});say('desk','Version '+s.live+' is published to this workspace’s site.')
    }else if(a.type==='restore'){
      if(a.base!==s.live||a.version===s.live||!s.releases.some(r=>r.n===a.version))fail('Choose an earlier published version.',409);
      const v=revision(s,a.version);const n=s.versions.length+1;
      s.versions.push({n,at:now,base:s.live,items:copy(v.items),target:null,summary:'Restored from version '+v.n});s.live=s.head=n;s.reviewed=null;s.question=null;s.lastTarget=null;
      s.releases.push({n,time:now,kind:'Restored'});say('desk','Restored the page from version '+v.n+'. Version '+n+' is now published.')
    }else fail('Unknown workspace action.')
  }
  state.serial++;state.receipts=[...state.receipts.slice(-127),a.key];return state
}
