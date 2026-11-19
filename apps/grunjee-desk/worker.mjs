const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
function uid(r){const u=r.headers.get('oai-authenticated-user-id');if(!u)fail('Sign in to open your workspace.',401);return encodeURIComponent(u)}
async function saved(env,name){const obj=await env.BUCKET.get('desk/v1/'+name+'.json');return {state:addBakery(obj?await obj.json():initial('2026-11-18T00:00:00Z')),etag:obj?.etag??null}}
function html(text,other={}){return new Response(text,{headers:{'content-type':'text/html;charset=UTF-8','cache-control':'no-store','x-content-type-options':'nosniff',...other}})}
export default {async fetch(request,env){
  try{const url=new URL(request.url),p=url.pathname;
    if(request.method==='GET'&&p==='/')return html(ASSETS.index);
    const files={'/desk.js':['text/javascript',ASSETS.js],'/desk.css':['text/css',ASSETS.css],'/render.mjs':['text/javascript',ASSETS.render],'/model.mjs':['text/javascript',ASSETS.model],'/mark.svg':['image/svg+xml',ASSETS.mark]};
    if(request.method==='GET'&&Object.hasOwn(files,p)){const [type,text]=files[p];return new Response(text,{headers:{'content-type':type,'x-content-type-options':'nosniff'}})}
    const read=p.match(/^\/(api\/preview|api\/export|api\/source|site|saved)\/([a-z0-9-]+)(?:\/([1-9]\d*))?$/);
    if(p!=='/api/action'&&p!=='/api/workspace'&&!read)return new Response('Page not found',{status:404});
    const user=uid(request);const {state,etag}=await saved(env,user);
    if(p==='/api/workspace'&&request.method==='GET')return json({...state,draftScope:user});
    if(p==='/api/action'&&request.method==='POST'){
      if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))fail('Use the editor to make this change.',403);
      const raw=await request.text();if(raw.length>490000)fail('This request is too large.',413);
      let action;try{action=JSON.parse(raw)}catch{fail('Invalid request.')}
      const next=transact(state,action,new Date().toISOString(),importSource);if(next===state)return json(next);
      const result=await env.BUCKET.put('desk/v1/'+user+'.json',JSON.stringify(next),{onlyIf:etag?{etagMatches:etag}:new Headers({'if-none-match':'*'}),httpMetadata:{contentType:'application/json'}});
      if(!result)fail('Another tab saved a change. Open the latest version and try again.',409);
      return json(next)
    }
    if(read&&request.method==='GET'){
      const [,route,siteId,num]=read,s=state.sites.find(s=>s.id===siteId);if(!s)fail('Website not found.',404);
      if(route==='site'&&num)fail('Page not found.',404);
      const v=revision(s,route==='site'?s.live:Number(num));if(!v)fail('Version not found.',404);
      if(route==='api/source'){
        if(!s.source)fail('No source component for this website.',404);
        return new Response(sourceFor(s,v),{headers:{'content-type':'text/plain;charset=utf-8','content-disposition':'attachment; filename="'+s.source.name+'"','cache-control':'no-store'}})
      }
      const key=url.searchParams.get('key')||'';
      if(route==='api/preview'&&!/^[\da-f-]{36}$/i.test(key))fail('Invalid preview request.');
      const script=route==='api/preview'?ASSETS.frame.replace('location.hash.slice(1)',JSON.stringify(key)):'';
      let document=s.format==='bakery'?bakeryDocument(s,v,script):pageDoc(s,v,{style:ASSETS.pageCss,asset:'',script});
      if(route==='saved'){
        const oid=url.searchParams.get('element');
        const matches=oid?v.items.filter(item=>item.id===oid):[];
        const marker=oid?'data-oid="'+esc(oid)+'"':'';
        const unique=matches.length===1 && document.split(marker).length===2;
        if(unique){
          document=document.replace(marker,'id="selected-text" '+marker)
            .replace('</head>','<style>#selected-text{outline:3px solid #148373;outline-offset:4px;scroll-margin-top:4rem}</style></head>');
        }
        const message=oid && !unique?' · The selected text moved. Showing the whole page.':'';
        const banner='<aside style="padding:10px 16px;background:#164c3e;color:white;font:14px system-ui">Saved preview · Version '+v.n+message+'</aside>';
        document=document.replace('<body>','<body>'+banner);
      }
      return html(document,route==='api/export'?{'content-disposition':'attachment; filename="'+s.id+'-v'+v.n+'.html"'}:{})
    }
    return json({error:'Method unavailable.'},405)
  }catch(e){return json({error:e instanceof Problem?e.message:'The workspace could not save or load this request. Try again.'},e instanceof Problem?e.status:500)}
}};
