import { penpalParent } from '../index';
import { getOid } from '../helpers/ids';

const privateArea = 'form,input,textarea,select,button,[contenteditable],[hidden],[aria-hidden="true"]';
const textBlock = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,span,a';
let installed = false;

function lookup(oid: string) {
    if (!oid || oid.length > 200) return null;
    const nodes = document.querySelectorAll<HTMLElement>(`[data-oid="${CSS.escape(oid)}"]`);
    const el = nodes[0];
    if (nodes.length !== 1 || !el || !el.matches(textBlock) || el.closest(privateArea) ||
        el.children.length || !el.getClientRects().length) return null;
    return el;
}

function intercept(event: Event) {
    if (event instanceof KeyboardEvent && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click' && event.type !== 'keydown') return;
    const target = event.target;
    const block = target instanceof Element ? target.closest<HTMLElement>('[data-oid]') : null;
    const oid = block && getOid(block);
    if (!oid || !lookup(oid)) document.querySelector('[data-grunjee-selected]')?.removeAttribute('data-grunjee-selected');
    void penpalParent?.onClientPick(oid && lookup(oid) ? oid : null);
}

// Source wording comes from the editor. The guest never sends input values or DOM text.
export function clientPicker(oid: string | null, sourceText: string | null) {
    if (!installed) {
        installed = true;
        for (const name of ['pointerdown','mousedown','click','auxclick','submit','keydown','beforeinput']) {
            window.addEventListener(name, intercept, true);
        }
        for (const el of document.querySelectorAll<HTMLElement>('[data-oid]')) {
            const id = getOid(el);
            if (id && lookup(id)) el.tabIndex = 0;
        }
        const style = document.createElement('style');
        style.textContent = '[data-grunjee-selected]{outline:3px solid #148373!important;outline-offset:3px}';
        document.head.append(style);
    }
    document.querySelectorAll('[data-grunjee-selected]').forEach(el => el.removeAttribute('data-grunjee-selected'));
    if (!oid) return {page: location.pathname, matches: true};
    const el = lookup(oid);
    const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
    const matches = !!el && !!sourceText && normalize(el.innerText) === normalize(sourceText);
    if (matches) el.setAttribute('data-grunjee-selected', '');
    return {page: location.pathname, matches};
}
