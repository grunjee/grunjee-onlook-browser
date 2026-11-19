export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function pageBody(site,v,asset='/fold.webp'){
  const f=id=>v.items.find(i=>i.id===id);
  const item=(id,tag,cls='')=>'<'+tag+' class="'+cls+'" data-oid="'+esc(id)+'" data-label="'+esc(f(id)?.label)+'">'+esc(f(id)?.text)+'</'+tag+'>';
  if(site.format==='imported')return '<main class="imported">'+v.items.map(b=>item(b.id,b.tag==='li'?'p':b.tag)).join('')+'</main>';
  return '<header class="paperhead"><a class="wordmark" href="#top"><i class="aster" aria-hidden="true">✳</i>'+item('brand','span')+'</a><nav><a href="#services">Services</a><a href="#contact">Contact</a></nav></header>'+
  '<main id="top"><section class="hero" style="background-image:url('+esc(asset)+')"><div class="hero-copy">'+item('title','h1')+item('intro','p')+'</div></section>'+
  '<section class="services" id="services"><div class="sectionline">'+item('servicesTitle','h2')+'<i></i></div><div class="cards">'+[1,2,3].map((n)=>'<article><div class="glyph g'+n+'" aria-hidden="true"><b></b><i></i></div>'+item('svc'+n,'h3')+item('body'+n,'p')+'</article>').join('')+'</div></section>'+
  '<footer id="contact">'+item('contact','h2')+'<a href="#top">Back to top</a></footer></main>'
}
export function pageDoc(site,v,{style,script='',asset='/fold.webp'}){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>'+esc(site.name)+' · Version '+v.n+'</title><style>'+style+'</style></head><body>'+pageBody(site,v,asset)+(script?'<script>'+script+'</script>':'')+'</body></html>'
}
