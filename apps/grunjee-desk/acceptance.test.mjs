import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../dist/server/index.js';
function setup(){
  const map=new Map(),host='https://test.invalid';const BUCKET={async get(k){const o=map.get(k);return o&&{etag:o.tag,json:()=>JSON.parse(o.data)}},async put(k,data,options){const old=map.get(k);if(options.onlyIf instanceof Headers?!!old:old?.tag!==options.onlyIf.etagMatches)return null;const tag=crypto.randomUUID();map.set(k,{tag,data});return{etag:tag}}};
  const call=(path,action,user='u1')=>worker.fetch(new Request(host+path,{headers:{'oai-authenticated-user-id':user,origin:host,'content-type':'application/json'},method:action?'POST':'GET',body:action?JSON.stringify(action):undefined}),{BUCKET});
  let serial=0;const keys=[];const action=async(type,props={},status=200)=>{const a={key:crypto.randomUUID(),site:'grunjee-labs',serial,type,...props};keys.push(a);const r=await call('/api/action',a);const result=await r.json();assert.equal(r.status,status,JSON.stringify(result.error));if(r.ok)serial=result.serial;return result};
  return {call,action,keys}
}
test('Review binds to a revision, publish serves it, and restore serves the prior content',async()=>{
 const {call,action}=setup();const first=await (await call('/site/grunjee-labs')).text();
 await action('edit',{target:'title',text:'Change this to "New headline"'});
 assert.equal(await(await call('/site/grunjee-labs')).text(),first);
 await action('publish',{version:2,base:1},409);await action('review',{version:2});await action('publish',{version:2,base:1});
 assert.match(await(await call('/site/grunjee-labs')).text(),/>New headline</);await action('restore',{version:1,base:2});assert.match(await(await call('/site/grunjee-labs')).text(),/Small studio./);
 await action('publish',{version:2,base:1},409);
});
test('A retry makes one edit, a stale tab cannot overwrite it, a different user has its own site',async()=>{
 const {call,action,keys}=setup();await action('edit',{target:'title',text:'set to test'});
 const again=await(await call('/api/action',keys[0])).json();assert.equal(again.serial,1);
 assert.equal((await call('/api/action',{...keys[0],key:'different'})).status,409);
 const other=await(await call('/api/workspace',null,'other')).json();assert.equal(other.sites[0].head,1);
 assert.equal((await call('/api/workspace',null,'')).status,401);
});
test('Clarification creates no version and its answer stays on the selected item',async()=>{
 const {action}=setup();let s=await action('edit',{target:'intro',text:'Make it friendlier'});assert.equal(s.sites[0].head,1);
 s=await action('edit',{text:'Good things happen here.'});assert.equal(s.sites[0].head,2);assert.equal(s.sites[0].versions[1].target,'intro');
});
test('Onlook parser maps duplicate JSX text to independent source ranges and preserves all other source',async()=>{
 const {call,action}=setup();const code='export default function Page(){return <main><section><h2>Hours</h2><p>8 AM</p></section><section><h2>Pickup</h2><p>8 AM</p></section></main>}';
 let s=await action('create',{name:'Source proof',sourceFile:{name:'page.tsx',code}});let site=s.sites.at(-1);const target=site.versions[0].items.filter(i=>i.text==='8 AM')[1].id;
 await action('edit',{site:site.id,target,text:'Make that seven'});const exportText=await(await call('/api/source/'+site.id+'/2')).text();
 assert.equal(exportText,code.replace('<h2>Pickup</h2><p>8 AM','<h2>Pickup</h2><p>7 AM'));
 assert.equal(await(await call('/api/source/'+site.id+'/1')).text(),code);
 assert.match(await(await call('/site/'+site.id)).text(),/>8 AM</);
});
test('Source export escapes JSX syntax, keeps dynamic expressions private from editing, and rejects invalid input',async()=>{
 const {call,action}=setup();const code='export default function Page(){return <><h1>Hello</h1><p>{name}</p><form><p>Secret</p></form></>}';
 const s=await action('create',{name:'Safe copy',sourceFile:{name:'home.jsx',code}});const site=s.sites.at(-1);const all=site.versions[0].items;assert.equal(all.length,1);
 await action('edit',{site:site.id,target:all[0].id,text:'use <hello> {world} & hi'});
 const out=await(await call('/api/source/'+site.id+'/2')).text();assert.match(out,/&lt;hello&gt; &#123;world&#125; &amp; hi/);assert.match(out,/<p>{name}<\/p>/);
 await action('create',{name:'Empty',sourceFile:{name:'x.tsx',code:'export const none=4'}},400)
});
test('Version history and compiled HTML exports work for imported text',async()=>{
 const {call,action}=setup();const s=await action('create',{name:'Own website',items:[{tag:'h1',text:'Original'}, {tag:'p',text:'Text'}]});const site=s.sites.at(-1);
 await action('edit',{site:site.id,target:'txt-0',text:'use New words'});
 assert.match(await(await call('/api/export/'+site.id+'/2')).text(),/>New words</);
 assert.match(await(await call('/saved/'+site.id+'/1')).text(),/>Original</);
 assert.equal((await call('/api/source/'+site.id+'/2')).status,404)
});

test('Juniper pickup edit survives a fresh read and changes exactly one source line', async () => {
  const { call, action } = setup();
  const key = crypto.randomUUID();
  const original = await (await call('/api/source/juniper-lane/1')).text();
  const baseline = await (await call('/site/juniper-lane')).text();
  await action('edit', { site: 'juniper-lane', target: 'pickup-time', text: 'Make that seven.' });

  const refreshed = await (await call('/api/workspace')).json();
  const site = refreshed.sites.find(s => s.id === 'juniper-lane');
  assert.equal(site.head, 2);
  assert.equal(site.live, 1);
  const updated = await (await call('/api/source/juniper-lane/2')).text();
  assert.equal(updated, original.replace('Saturday pickup: 8 AM', 'Saturday pickup: 7 AM'));
  const view = await (await call('/api/preview/juniper-lane/2?key=' + key)).text();
  assert.match(view, /data-oid="pickup-time">Saturday pickup: 7 AM</);
  assert.match(view, /data-oid="opening-time">Store opens: 8 AM</);
  assert.equal(await (await call('/site/juniper-lane')).text(), baseline);
  assert.equal(await (await call('/api/source/juniper-lane/1')).text(), original);
});

test('Clearing pickup selection drops its scope and preserves the original message context', async () => {
  const {action} = setup();
  const site = 'juniper-lane';
  const bakery = state => state.sites.find(s => s.id === site);
  let result = bakery(await action('edit', {site, scope:'element', target:'pickup-time', text:'Make that seven.'}));
  const snapshot = result.messages[0].context;
  assert.equal(snapshot.site, site);
  assert.equal(snapshot.page, '/');
  assert.equal(snapshot.oid, 'pickup-time');
  assert.equal(snapshot.text, 'Saturday pickup: 8 AM');
  assert.equal(snapshot.revision, 1);
  assert.ok(snapshot.section);
  result = bakery(await action('edit', {site, scope:'page', text:'Make that nine.'}));
  assert.equal(result.head, 2);
  assert.equal(result.lastTarget, null);
  assert.equal(result.messages.at(-2).context.scope, 'page');
  assert.deepEqual(result.messages[0].context, snapshot);
  assert.equal(result.question.kind, 'target');
  await action('edit', {site, scope:'element', target:'moved', text:'Make that nine.'},409);
});

test('One whole-page replacement updates both hours in one private revision', async () => {
  const {action,call} = setup();
  const site = 'juniper-lane';
  const state = await action('edit', {site, scope:'page', text:'Replace "8 AM" with "9 AM" across the whole page'});
  const bakery = state.sites.find(s => s.id === site);
  assert.equal(bakery.head, 2);
  assert.equal(bakery.live, 1);
  const changed = bakery.versions[1].items.filter(item => /9 AM/.test(item.text));
  assert.deepEqual(new Set(changed.map(item => item.id)), new Set(['opening-time','pickup-time']));
  assert.match(await (await call('/site/'+site)).text(), /Saturday pickup: 8 AM/);
});

test('A conversation reference opens its original wording and identifies a moved target', async () => {
  const {action,call} = setup();
  const site = 'juniper-lane';
  await action('edit', {site,scope:'element',target:'pickup-time',text:'Make that seven.'});
  const old = await (await call('/saved/juniper-lane/1?element=pickup-time')).text();
  assert.match(old, /id="selected-text" data-oid="pickup-time">Saturday pickup: 8 AM/);
  const moved = await (await call('/saved/juniper-lane/1?element=missing')).text();
  assert.match(moved, /The selected text moved/);
  assert.doesNotMatch(moved, /id="selected-text"/);
});
