const channel = location.hash.slice(1);
const protectedArea = 'form,input,textarea,select,button,[contenteditable]';
let selecting = true;
function tell(data) { parent.postMessage({...data,channel}, '*'); }
function matches(id) {
  return [...document.querySelectorAll('[data-oid]')].filter(el => getOid(el) === id && !el.closest(protectedArea) && !el.querySelector(protectedArea));
}
function setTarget(id) {
  document.querySelectorAll('.picked').forEach(el => el.classList.remove('picked'));
  if (!id) return;
  const found = matches(id);
  if (found.length === 1) found[0].classList.add('picked');
  else tell({type:'missing',target:id});
}
addEventListener('message', event => {
  if (event.source !== parent || event.data?.channel !== channel) return;
  selecting = event.data.mode === 'select';
  document.body.classList.toggle('selecting', selecting);
  setTarget(event.data.target);
  for (const el of document.querySelectorAll('[data-oid]')) {
    if (selecting && !el.closest(protectedArea)) el.tabIndex = 0;
    else el.removeAttribute('tabindex');
  }
});
function choose(event) {
  const element = event.target;
  if (!(element instanceof Element)) return;
  if (!selecting) {
    const anchor = element.closest('a[href^="#"]');
    if (event.type === 'click' && anchor) {
      event.preventDefault();
      document.getElementById(anchor.hash.slice(1))?.scrollIntoView();
    }
    return;
  }
  if (event.type === 'keydown' && !['Enter',' '].includes(event.key)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === 'submit' || element.closest(protectedArea)) return;
  const target = element.closest('[data-oid]');
  if (!target) return;
  const id = getOid(target);
  if (!id || matches(id).length !== 1) return;
  setTarget(id);
  tell({type:'pick',target:id});
}
for (const name of ['click','auxclick','submit','keydown']) document.addEventListener(name,choose,true);
tell({type:'ready'});
