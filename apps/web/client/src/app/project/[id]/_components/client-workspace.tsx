'use client';

import { useEditorEngine } from '@/components/store/editor';
import type { FrameData } from '@/components/store/editor/frames';
import { api } from '@/trpc/react';
import { getUserChatMessageFromString } from '../_hooks/use-chat/utils';
import { MessageContextType, type ChatMessage, type HighlightMessageContext } from '@onlook/models';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '../_hooks/use-chat';
import { useFrameReload } from './canvas/frame/use-frame-reload';
import { FrameComponent, type IFrameView } from './canvas/frame/view';

export const ClientWorkspace = observer(({ name }: { name: string }) => {
    const engine = useEditorEngine();
    const t = useTranslations('clientDesk');
    const account = api.user.get.useQuery();
    const conversation = engine.chat.conversation.current;
    const frame = engine.frames.getByBranchId(engine.branches.activeBranch.id)[0];
    const history = api.chat.message.getAll.useQuery({ conversationId: conversation?.id ?? '' }, { enabled: !!conversation });
    if (!account.data || !conversation || !frame || !history.data) {
        return <main className="p-8" role="status">{history.isError || account.isError ? t('failure') : t('loading')}</main>;
    }
    return <Workspace key={account.data.id + conversation.id + frame.frame.id} accountId={account.data.id} name={name} frame={frame}
        conversationId={conversation.id} initialMessages={history.data} />;
});

type WorkspaceProps = {
    name: string;
    accountId: string;
    frame: FrameData;
    conversationId: string;
    initialMessages: ChatMessage[];
};

type Pending = { id:string; text:string; previous?:string; oid?:string; wording?:string; page:string; checkpoint?:string };
function saved<T>(key:string): T | null {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function save(key:string, value:unknown) {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key,JSON.stringify(value));
}
const scopeOf = (m?:ChatMessage) => m?.metadata?.context.find(c=>c.type===MessageContextType.BRANCH && c.clientPage);
const Workspace = observer(({ name, accountId, frame, conversationId, initialMessages }: WorkspaceProps) => {
    const t = useTranslations('clientDesk');
    const engine = useEditorEngine();
    const { messages, setMessages, sendClientTurn, isStreaming, error } = useChat({ clientMode:true, conversationId, projectId: engine.projectId, initialMessages });
    const reload = useFrameReload();
    const view = useRef<IFrameView>(null);
    const composer = useRef<HTMLTextAreaElement>(null);
    const thread = useRef<HTMLDivElement>(null);
    const pickedPage = useRef<string | null>(null);
    const sequence = useRef(0);
    const sending = useRef(false);
    const [selection, setSelection] = useState<HighlightMessageContext | null>(null);
    const [ready, setReady] = useState(false);
    const [draft, setDraft] = useState('');
    const [moved, setMoved] = useState(false);
    const [working, setWorking] = useState(false);
    const [failed, setFailed] = useState(false);
    const storageKey = ['grunjee:desk',accountId,conversationId,frame.frame.id].join(':');
    const [pending,setPending] = useState<Pending | null>(null);
    const [held,setHeld] = useState(false);
    const [hydrated,setHydrated] = useState(false);
    const utils = api.useUtils();
    function release() {
        save(storageKey+':pending',null);
        setPending(null); setHeld(false); setFailed(false);
    }
    function accept() {
        release(); save(storageKey+':draft',null); setDraft('');
    }
    useEffect(() => {
        const attempt = saved<Pending>(storageKey+':pending');
        const row = scopeOf(initialMessages.find(m=>m.id===attempt?.id));
        if (attempt && row?.type===MessageContextType.BRANCH && row.clientDelivery?.state==='complete') accept();
        else {
            setPending(attempt); setDraft(attempt?.text ?? saved<string>(storageKey+':draft') ?? '');
            setFailed(!!attempt);
            setHeld(!!row && row.type===MessageContextType.BRANCH && row.clientDelivery?.state!=='retryable');
        }
        setHydrated(true);
    },[storageKey]);


    async function pick(oid: string | null, focus: boolean, previous?: string, previousPage?: string) {
        const token = ++sequence.current;
        setReady(false);
        try {
            const highlight = oid ? await engine.chat.context.clientText(oid, frame.frame.branchId) : null;
            if (token !== sequence.current) return;
            const check = await view.current?.clientPicker(oid, highlight?.displayName ?? null);
            if (token !== sequence.current) return;
            const valid = Boolean(check?.matches && (!previousPage || previousPage === check.page) && (!oid || (highlight && (!previous || previous === highlight.displayName))));
            setMoved(!valid);
            setSelection(valid ? highlight : null);
            setReady(Boolean(check));
            if (valid && check) {
                pickedPage.current = check.page;
                save(storageKey, {oid, text:highlight?.displayName, page:check.page});
                if (focus) composer.current?.focus();
            }
        } catch {
            if (token === sequence.current) { setMoved(true); setReady(false); }
        }
    }

    useEffect(() => {
        if (!reload.isPenpalConnected) { setReady(false); return; }
        const previous = saved<{oid?:string;text?:string;page?:string}>(storageKey);
        const last = initialMessages.findLast(m=>m.role==='user');
        const branch = scopeOf(last);
        const page = branch?.type===MessageContextType.BRANCH ? branch.clientPage : undefined;
        const committed = last?.metadata?.checkpoints.some(c=>c.branchId===frame.frame.branchId &&
            c.oid===engine.branches.getBranchDataById(frame.frame.branchId)?.sandbox.gitManager.commits?.[0]?.oid);
        const oid = previous ? previous.oid : page?.selection?.oid;
        const wording = committed && oid===page?.selection?.oid ? undefined : previous?.text ?? page?.selection?.text;
        void pick(oid ?? null,false,wording,previous?.page ?? page?.path);
        return () => { sequence.current++; };
    }, [reload.isPenpalConnected, storageKey]);

    useEffect(() => {
        if (!held || !pending || working || isStreaming) return;
        let cancelled = false;
        const check = async () => {
            try {
                const history = await utils.chat.message.getAll.fetch({conversationId},{staleTime:0});
                if (cancelled) return;
                const row = scopeOf(history.find(m=>m.id===pending.id));
                if (row?.type!==MessageContextType.BRANCH) return;
                if (row.clientDelivery?.state==='complete') {
                    setMessages(history); accept();
                    if (pending.oid) await pick(pending.oid,false,undefined,pending.page);
                } else if (row.clientDelivery?.state==='retryable') setHeld(false);
            } catch { /* The status button remains available offline. */ }
        };
        const timer=window.setTimeout(check,1200);
        window.addEventListener('focus',check);
        return () => {cancelled=true;window.clearTimeout(timer);window.removeEventListener('focus',check)};
    },[held,pending,working,isStreaming,conversationId]);

    useEffect(() => { thread.current?.scrollTo(0, thread.current.scrollHeight); }, [messages]);
    async function submit() {
        if (!hydrated || sending.current || isStreaming || !draft.trim() || (!pending && (!ready || moved))) return;
        sending.current = true; setWorking(true); setFailed(false);
        try {
            const history = await utils.chat.message.getAll.fetch({conversationId},{staleTime:0});
            const attempt = pending ?? saved<Pending>(storageKey+':pending');
            const stored = history.find(m=>m.id===attempt?.id);
            const recorded = scopeOf(stored);
            const delivery = recorded?.type===MessageContextType.BRANCH ? recorded.clientDelivery : null;
            if (delivery?.state==='complete') { setMessages(history); accept(); return; }
            if (delivery && delivery.state!=='retryable') { setMessages(history); setHeld(true); setFailed(true); return; }
            const last = history.findLast(m=>m.role==='user')?.id;
            const previous = messages.findLast(m=>m.role==='user')?.id;
            if (!stored && (attempt ? attempt.previous : previous)!==last) {
                setMessages(history); release(); setFailed(true); return;
            }
            const oid=attempt ? attempt.oid : selection?.oid;
            const fresh=oid ? await engine.chat.context.clientText(oid, frame.frame.branchId) : null;
            const check=await view.current?.clientPicker(oid??null,fresh?.displayName??null);
            if (!check?.matches || check.page!==(attempt?.page??pickedPage.current) ||
                fresh?.displayName!==(attempt ? attempt.wording : selection?.displayName) ||
                (attempt && attempt.checkpoint!==checkpoint)) {
                release(); setMoved(true); return;
            }
            const intent=attempt ?? {id:crypto.randomUUID(),text:draft.trim(),previous,oid,
                wording:fresh?.displayName,page:check.page,checkpoint};
            save(storageKey+':pending',intent); setPending(intent); setHeld(false);
            const turn=stored ?? getUserChatMessageFromString(intent.text,
                await engine.chat.context.clientPageContext(frame,check.page,fresh),conversationId,intent.id);
            await sendClientTurn(turn,history);
            const updated=await utils.chat.message.getAll.fetch({conversationId},{staleTime:0});
            const result=scopeOf(updated.find(m=>m.id===intent.id));
            if (result?.type===MessageContextType.BRANCH && result.clientDelivery?.state==='complete') {
                accept();
                if (oid) await pick(oid,false,undefined,check.page);
            } else {
                setHeld(result?.type===MessageContextType.BRANCH && result.clientDelivery?.state!=='retryable');
                setFailed(true);
            }
        } catch { setFailed(true); }
        finally { sending.current = false; setWorking(false); }
    }
    const checkpoint = engine.branches.getBranchDataById(frame.frame.branchId)?.sandbox.gitManager.commits?.[0]?.oid;
    return <main className="flex h-dvh flex-col bg-background text-foreground">
        <h1 className="border-b px-6 py-4 text-xl font-semibold">{name}</h1>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,32%)_minmax(0,1fr)]">
            <section className="flex min-h-0 flex-col border-r">
                <h2 className="border-b px-5 py-3 font-medium">{t('conversation')}</h2>
                <div ref={thread} className="flex-1 space-y-4 overflow-auto p-5" aria-live="polite">
                    <p className="text-sm text-muted-foreground">{t('hint')}</p>
                    {messages.map(message => {
                        const text = message.parts.map(part => part.type === 'text' ? part.text : '').join('');
                        if (!text) return null;
                        const branch = message.metadata?.context.find(c => c.type === MessageContextType.BRANCH && c.clientPage);
                        return <div key={message.id} className="whitespace-pre-wrap break-words">
                            <strong className="block text-sm">{message.role === 'user' ? t('you') : name}</strong>
                            {branch?.type === MessageContextType.BRANCH && <small>{branch.clientPage?.selection?.text ?? t('whole')}</small>}
                            <p>{text}</p>
                            {message.metadata?.checkpoints.filter(c=>c.branchId===frame.frame.branchId).map(c=>
                                <details key={c.oid} className="mt-1 text-sm"><summary>{t('revision')} {c.oid.slice(0,7)}</summary>
                                    {c.wording ? <><del className="block">{c.wording.before}</del><ins>{c.wording.after}</ins></> : <code>{c.oid}</code>}
                                </details>)}

                        </div>;
                    })}
                </div>
                <form className="space-y-2 border-t p-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                        <span>{moved ? t('moved') : selection?.displayName ?? t('whole')}</span>
                        {(selection || moved) && <button type="button" disabled={working || !!pending} className="underline" onClick={() => void pick(null, true)}>{t('clear')}</button>}
                    </div>
                    <textarea ref={composer} aria-label={t('compose')} placeholder={t('compose')} rows={3} className="w-full rounded border bg-background p-3"
                        readOnly={!!pending || working || !hydrated} value={draft} onChange={event => {
                            setDraft(event.target.value); save(storageKey+':draft',event.target.value);
                        }} maxLength={2500}
                        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
                    {(failed || (pending && error)) && <p role="alert">{held ? t('unconfirmed') : t('failure')}</p>}
                    {isStreaming || working ? <p role="status">{t('working')}</p> :
                        <button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={!hydrated || (!pending && (!ready || moved)) || !draft.trim()}>{pending ? t(held?'check':'retry') : t('send')}</button>}
                </form>
            </section>
            <section className="flex min-h-0 flex-col">
                <h2 className="border-b px-5 py-3 font-medium">{t('preview')} {checkpoint && <small className="font-mono">{checkpoint.slice(0, 7)}</small>}</h2>
                <div className="relative min-h-0 flex-1">
                    <div className="h-full" inert={!ready || working || isStreaming || !!pending}>
                        <FrameComponent key={reload.reloadKey} ref={view} frame={frame.frame} title={t('preview')}
                            style={{width:'100%',height:'100%'}} sandbox="allow-scripts allow-same-origin" allow=""
                            reloadIframe={reload.immediateReload} penpalTimeoutMs={reload.getPenpalTimeout()}
                            onConnectionFailed={reload.handleConnectionFailed} onConnectionSuccess={reload.handleConnectionSuccess}
                            onClientPick={oid => { if (oid) void pick(oid, true); else { sequence.current++; setSelection(null); setMoved(true); } }} />
                    </div>
                    {!ready && <div className="absolute inset-0 grid place-content-center bg-background/80" role="status">
                        {reload.isPenpalConnected ? t('unavailable') : t('loading')}
                    </div>}
                </div>
            </section>
        </div>
    </main>;
});
