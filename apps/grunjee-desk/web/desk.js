import {esc} from '/render.mjs';
import {differences,revision} from '/model.mjs';
const paths={flask:'M9 3h6m-5 0v7L4.5 19a1.4 1.4 0 0 0 1.2 2h12.6a1.4 1.4 0 0 0 1.2-2L14 10V3M7.5 15h9m-6 2.5h.1',lock:'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',chevron:'m9 5 7 7-7 7',history:'M3 5v5h5M3.6 10a8.5 8.5 0 1 1 .8 7M12 7v5l3 2',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z',chat:'M21 5v11H9l-6 4V5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1Z',panel:'M3 4h18v16H3zM3 9h18',monitor:'M3 4h18v13H3zM12 17v4m-4 0h8',phone:'M7 2h10v20H7zM11 18h2',file:'M6 3h8l4 4v14H6zM14 3v5h4',cursor:'m4 3 5 17 3-7 7-3Z',eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',x:'m6 6 12 12M18 6 6 18',send:'M12 19V5m-6 6 6-6 6 6',pencil:'m4 16-1 5 5-1L20 8l-4-4ZM13 7l4 4',check:'m4 12 5 5L20 6',upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',plus:'M12 5v14M5 12h14',text:'M3 5h18M12 5v15m-4 0h8'};
const icon=k=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[k]||paths.file)+'"/></svg>';
const $=s=>document.getElementById(s);
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
let draftScope='',readyVersion=null;let state,site,selected=null,mode='select',frameKey='',channel='',busy=false,toastTimer,requestToken;
const local=(k,v)=>{try{k='desk:'+draftScope+':'+k;if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch{}};
const current=()=>revision(site,site.head);
const live=()=>revision(site,site.live);
const id=()=>crypto.randomUUID();
function toast(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4400)}
function dlg(title,body){$('dlgTitle').textContent=title;$('dlgBody').innerHTML=body;if(!$('dialog').open)$('dialog').showModal()}
function close(){if($('dialog').open)$('dialog').close()}
$('closeDlg').onclick=close;
$('dialog').onclick=e=>{if(e.target===$('dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()}};
function chooseSite(siteId){
  site=state.sites.find(s=>s.id===siteId)||state.sites[0];local('gd.site',site.id);
  const url=new URL(location.href);url.searchParams.set('site',site.id);window.history.replaceState(null,'',url);
  selected=local('gd.target.'+site.id)||null;if(!current().items.some(b=>b.id===selected))selected=null;
  $('note').value=local('gd.draft.'+site.id)||'';requestToken=null;frameKey='';setFormHint();draw();
}
async function load(initial=false){const r=await fetch('/api/workspace',{cache:'no-store'});if(!r.ok)throw Error('The workspace could not be opened. Reload to try again.');const next=await r.json();draftScope=next.draftScope;if(!initial&&state?.serial===next.serial)return;state=next;if(initial||!site)chooseSite(new URLSearchParams(location.search).get('site')||local('gd.site')||'juniper-lane');else{site=state.sites.find(s=>s.id===site.id)||state.sites[0];draw()}}
async function act(data){
  if(busy)return false;
  busy=true;$('send').disabled=true;
  const fingerprint=JSON.stringify([site.id,state.serial,data]);if(requestToken?.fp!==fingerprint)requestToken={fp:fingerprint,key:id()};
  try{const r=await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...data,key:requestToken.key,serial:state.serial,site:site.id})});
    const res=await r.json();if(!r.ok){if(r.status===409){requestToken=null;await load();close()}throw Error(res.error||'The change could not be saved.')}
    state=res;requestToken=null;chooseAfter(data);return true
  }catch(e){toast(e.message||'Connection lost. Your draft is saved.');return false}
  finally{busy=false;setFormHint()}
}
function chooseAfter(a){const old=site.id;site=state.sites.find(x=>x.id===old);if(a.type==='create'){chooseSite(state.sites.at(-1).id);return}if(a.type==='edit'){$('note').value='';local('gd.draft.'+site.id,'');if(site.lastTarget)selected=site.lastTarget;local('gd.target.'+site.id,selected||'')}draw()}
function sendFrame(){const win=$('frame').contentWindow;if(win)win.postMessage({mode,target:selected,channel},'*')}
async function refreshFrame(){
  const k=site.id+'/'+site.head;if(frameKey===k){sendFrame();return}
  frameKey=k;readyVersion=null;if($('decide'))$('decide').disabled=true;channel=id();const currentChannel=channel;
  try{const r=await fetch('/api/preview/'+encodeURIComponent(site.id)+'/'+site.head+'?key='+channel);
    if(!r.ok)throw Error('Preview could not be opened.');const html=await r.text();if(channel===currentChannel)$('frame').srcdoc=html;
  }catch(e){if(channel===currentChannel){frameKey='';toast(e.message)}}
}
addEventListener('message',e=>{if(e.source!==$('frame').contentWindow||e.data?.channel!==channel)return;if(e.data.type==='ready'){readyVersion=frameKey;if($('decide'))$('decide').disabled=false;sendFrame()}if(e.data.type==='pick'&&mode==='select'&&current().items.some(x=>x.id===e.data.target))setPick(e.data.target,true)});
function setPick(target,focus=false){selected=target;local('gd.target.'+site.id,target||'');drawPicked();sendFrame();if(focus)$('note').focus({preventScroll:true})}
function drawPicked(){const b=current().items.find(e=>e.id===selected);$('picked').innerHTML=b?'<div class="chip">'+icon('cursor')+'<span>'+esc(b.label)+' · '+esc(b.text.slice(0,42))+'</span><button type="button" aria-label="Remove selection" id="unpick">'+icon('x')+'</button></div>':'';if(b)$('unpick').onclick=()=>setPick(null);setFormHint()}
function setFormHint(){
  const composing=Boolean($('note').value.trim());
  $('inputStatus').textContent=composing?'Draft saved on this device':'Enter to send';
  $('send').disabled=busy||!composing;
  const decision=$('decide');
  if(decision){
    decision.classList.toggle('secondary',composing);
    decision.classList.toggle('cta',!composing);
  }
}
function draw(){
  const h=current();$('siteName').textContent=site.name;$('viewLive').href='/site/'+site.id;$('version').textContent='Version '+h.n;
  const welcome='<div class="msg"><div class="by"><span class="botIcon">'+icon('flask')+'</span>Grunjee</div><div class="bubble">Click the text you want to edit, then tell me what it should say.</div></div>';
  const sampleTargets=[h.items.find(i=>i.id==='title')||h.items[0],h.items.find(i=>i.id==='intro')||h.items[1]].filter(Boolean);
  const suggestions='<div class="starter-q">Start with a selection</div>'+sampleTargets.map(x=>'<button class="pick-suggest" data-pick="'+esc(x.id)+'">'+icon('cursor')+esc(x.label)+'</button>').join('');
  const messages=site.messages.map(m=>'<div class="msg '+(m.who==='you'?'user':'')+'"><div class="by">'+(m.who==='you'?'You':'<span class="botIcon">'+icon('flask')+'</span>Grunjee')+'</div><div class="bubble">'+esc(m.text)+'</div></div>').join('');
  $('thread').innerHTML=welcome+(messages||suggestions);$('thread').querySelectorAll('[data-pick]').forEach(el=>el.onclick=()=>{setMode('select');setPick(el.dataset.pick,true)});if(messages)$('thread').scrollTop=$('thread').scrollHeight;
  const changed=differences(live(),h);$('decision').innerHTML=site.head!==site.live?'<div class="panel"><strong>Private preview · Version '+h.n+'</strong><p>'+changed.length+' text '+(changed.length===1?'change':'changes')+' since publication.</p><button class="cta" id="decide">'+icon(site.reviewed===h.n?'upload':'eye')+(site.reviewed===h.n?'Publish this version':'Review preview')+'</button></div>':'';
  if($('decide')){$('decide').disabled=readyVersion!==site.id+'/'+site.head;$('decide').onclick=()=>site.reviewed===h.n?publishDialog():reviewDialog();}drawPicked();refreshFrame()
}
function diffView(list){return list.map(x=>'<strong>'+esc(x.label)+'</strong><div class="diff old"><small>Before</small>'+esc(x.before)+'</div><div class="diff new"><small>After</small>'+esc(x.after)+'</div>').join('')||'<p>This version has the same wording as the published page.</p>'}
function reviewDialog(){const v=current();dlg('Review version '+v.n,diffView(differences(live(),v))+'<div class="dialog-actions"><button class="cta" id="confirm">'+icon('check')+'Mark as reviewed</button></div>');$('confirm').onclick=async()=>{if(await act({type:'review',version:v.n})){close();toast('Version '+v.n+' reviewed.')}}}
function publishDialog(){const v=site.head,b=site.live;dlg('Publish version '+v+'?','<p>The website link in this private workspace will show this exact version. You can restore a previous publication from History.</p><div class="dialog-actions"><button class="cta" id="confirm">'+icon('upload')+'Publish version '+v+'</button><button class="secondary" id="cancel">Cancel</button></div>');$('cancel').onclick=close;$('confirm').onclick=async()=>{if(await act({type:'publish',version:v,base:b})){close();toast('Version '+v+' published.')}}}
function history(){dlg('Version history',site.versions.slice().reverse().map(v=>'<div class="row"><div><strong>Version '+v.n+(v.n===site.live?' · Published':'')+'</strong><small>'+esc(v.summary)+'</small></div><button class="small-btn" data-ver="'+v.n+'">Inspect</button></div>').join('')+'<div class="dialog-actions"><a class="secondary" href="/api/export/'+site.id+'/'+site.head+'" download>Download current HTML</a>'+(site.source?'<a class="secondary" download href="/api/source/'+site.id+'/'+site.head+'">Download edited component</a>':'')+'</div>');$('dlgBody').querySelectorAll('[data-ver]').forEach(b=>b.onclick=()=>inspect(+b.dataset.ver))}
function inspect(n){const v=revision(site,n),old=revision(site,v.base);const available=s=>s.releases.some(r=>r.n===n)&&n!==s.live;dlg('Version '+n,'<p>'+esc(v.summary)+'</p>'+diffView(differences(old,v))+'<div class="dialog-actions"><a class="secondary" target="_blank" rel="noopener" href="/saved/'+site.id+'/'+n+'">Open this version</a>'+(available(site)?'<button class="secondary" id="restore">Restore this version</button>':'')+'</div>');if($('restore'))$('restore').onclick=()=>{const b=site.live;dlg('Restore version '+n+'?','<p>This replaces published version '+b+' with the saved page from version '+n+'. Your other versions stay in History.</p><button class="cta" id="confirm">Confirm restore</button>');$('confirm').onclick=async()=>{if(await act({type:'restore',version:n,base:b})){close();toast('Earlier page restored.')}}}}
function siteList(){dlg('Your websites',state.sites.map(s=>'<div class="row"><div><strong>'+esc(s.name)+'</strong><small>Version '+s.head+'</small></div><button class="small-btn" data-site="'+s.id+'">'+(s.id===site.id?'Current':'Open')+'</button></div>').join('')+'<div class="dialog-actions"><button class="cta" id="add">'+icon('plus')+'Add website</button></div>');$('dlgBody').querySelectorAll('[data-site]').forEach(b=>b.onclick=()=>{chooseSite(b.dataset.site);close()});$('add').onclick=addSite}
function addSite(){dlg('Add a website','<form id="newForm"><label class="field">Website name<input required maxlength="72" class="line-input" id="newName" placeholder="Your website"></label><label class="field">Website file (optional)<input class="line-input" type="file" accept=".html,.htm,.tsx,.jsx" id="htmlFile"></label><p>Import HTML, JSX, or TSX to edit static headings and paragraphs in a simplified preview. For React files, you can download the edited source. Leave empty to use the starter.</p><p role="alert" class="dialog-failure" id="importErr"></p><button class="cta">Create website</button></form>');
  $('newForm').onsubmit=async e=>{e.preventDefault();try{const file=$('htmlFile').files[0];let items,sourceFile;if(file&&/\.[jt]sx$/i.test(file.name)){sourceFile={name:file.name,code:await file.text()}}else if(file){if(file.size>600000)throw Error('Choose an HTML file smaller than 600 KB.');const html=await file.text();const t=document.createElement('template');t.innerHTML=html;t.content.querySelectorAll('script,style,template,form,input,textarea,[contenteditable],[hidden],noscript').forEach(x=>x.remove());items=[...t.content.querySelectorAll('h1,h2,h3,p,li,figcaption')].filter(x=>!x.querySelector('h1,h2,h3,p,li,figcaption')).map(x=>({tag:x.tagName.toLowerCase(),text:x.textContent.trim()})).filter(x=>x.text);if(!items.length)throw Error('The file contains no headings or paragraphs.');}
    if(await act({type:'create',name:$('newName').value,items,sourceFile})){close();toast('Website created.')}
  }catch(x){$('importErr').textContent=x.message}}}
function setMode(m){mode=m;$('select').setAttribute('aria-pressed',m==='select');$('browse').setAttribute('aria-pressed',m==='browse');$('hint').textContent=m==='select'?'Click text to select it':'Explore the page';sendFrame()}
$('select').onclick=()=>setMode('select');$('browse').onclick=()=>setMode('browse');$('history').onclick=history;$('sites').onclick=siteList;
for(const key of ['desktop','mobile'])$(key).onclick=()=>{document.querySelector('.paper').classList.toggle('narrow',key==='mobile');for(const k of ['desktop','mobile'])$(k).setAttribute('aria-pressed',k===key)};
$('editForm').onsubmit=async e=>{e.preventDefault();if(!site||busy)return;const text=$('note').value.trim();if(!text)return;await act({type:'edit',target:selected,text})};
$('note').addEventListener('input',()=>{if(site)local('gd.draft.'+site.id,$('note').value);setFormHint()});
$('note').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('editForm').requestSubmit()}});
addEventListener('focus',()=>{if(state&&!busy)load().catch(()=>{})});
load(true).catch(e=>{$('thread').innerHTML='<p>'+esc(e.message)+'</p><button class="secondary" id="reload">Reload workspace</button>';$('reload').onclick=()=>location.reload()});