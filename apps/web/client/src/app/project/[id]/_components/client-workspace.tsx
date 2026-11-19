'use client';

import { useEditorEngine } from '@/components/store/editor';
import type { FrameData } from '@/components/store/editor/frames';
import { api } from '@/trpc/react';
import { ChatType, MessageContextType, type ChatMessage, type HighlightMessageContext } from '@onlook/models';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '../_hooks/use-chat';
import { useFrameReload } from './canvas/frame/use-frame-reload';
import { FrameComponent, type IFrameView } from './canvas/frame/view';

export const ClientWorkspace = observer(({ name }: { name: string }) => {
    const engine = useEditorEngine();
    const t = useTranslations('clientDesk');
    const conversation = engine.chat.conversation.current;
    const frame = engine.frames.getByBranchId(engine.branches.activeBranch.id)[0];
    const history = api.chat.message.getAll.useQuery({ conversationId: conversation?.id ?? '' }, { enabled: !!conversation });
    if (!conversation || !frame || !history.data) {
        return <main className="p-8" role="status">{history.isError ? t('failure') : t('loading')}</main>;
    }
    return <Workspace key={conversation.id + frame.frame.id} name={name} frame={frame}
        conversationId={conversation.id} initialMessages={history.data} />;
});

type WorkspaceProps = {
    name: string;
    frame: FrameData;
    conversationId: string;
    initialMessages: ChatMessage[];
};

const Workspace = observer(({ name, frame, conversationId, initialMessages }: WorkspaceProps) => {
    const t = useTranslations('clientDesk');
    const engine = useEditorEngine();
    const { messages, sendMessage, isStreaming, error } = useChat({ conversationId, projectId: engine.projectId, initialMessages });
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
    const storageKey = 'grunjee:desk:' + conversationId + ':' + frame.frame.id;

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
                if (highlight && oid) sessionStorage.setItem(storageKey, JSON.stringify({oid, text:highlight.displayName, page:check.page}));
                else sessionStorage.removeItem(storageKey);
                if (focus) composer.current?.focus();
            }
        } catch {
            if (token === sequence.current) { setMoved(true); setReady(false); }
        }
    }

    useEffect(() => {
        if (!reload.isPenpalConnected) { setReady(false); return; }
        let saved: { oid?: string, text?: string, page?: string } | null = null;
        try { saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null'); } catch { /* Start with the page. */ }
        void pick(saved?.oid ?? null, false, saved?.text, saved?.page);
        return () => { sequence.current++; };
    }, [reload.isPenpalConnected, storageKey]);

    useEffect(() => { thread.current?.scrollTo(0, thread.current.scrollHeight); }, [messages]);
    async function submit() {
        if (sending.current || isStreaming || !ready || moved || !draft.trim()) return;
        sending.current = true;
        setWorking(true);
        setFailed(false);
        try {
            const oid = selection?.oid;
            const fresh = oid ? await engine.chat.context.clientText(oid, frame.frame.branchId) : null;
            const check = await view.current?.clientPicker(oid ?? null, fresh?.displayName ?? null);
            if (!check?.matches || check.page !== pickedPage.current || (selection && fresh?.displayName !== selection.displayName)) {
                setMoved(true);
                return;
            }
            const context = await engine.chat.context.clientPageContext(frame, check.page, fresh);
            await sendMessage(draft.trim(), ChatType.EDIT, context);
            setDraft('');
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
                        </div>;
                    })}
                </div>
                <form className="space-y-2 border-t p-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                        <span>{moved ? t('moved') : selection?.displayName ?? t('whole')}</span>
                        {(selection || moved) && <button type="button" disabled={working} className="underline" onClick={() => void pick(null, true)}>{t('clear')}</button>}
                    </div>
                    <textarea ref={composer} aria-label={t('compose')} placeholder={t('compose')} rows={3} className="w-full rounded border bg-background p-3"
                        value={draft} onChange={event => setDraft(event.target.value)} maxLength={2500}
                        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
                    {(error || failed) && <p role="alert">{t('failure')}</p>}
                    {isStreaming || working ? <p role="status">{t('working')}</p> :
                        <button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={!ready || moved || !draft.trim()}>{t('send')}</button>}
                </form>
            </section>
            <section className="flex min-h-0 flex-col">
                <h2 className="border-b px-5 py-3 font-medium">{t('preview')} {checkpoint && <small className="font-mono">{checkpoint.slice(0, 7)}</small>}</h2>
                <div className="relative min-h-0 flex-1">
                    <div className="h-full" inert={!ready || working || isStreaming}>
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
