import { isDeepStrictEqual } from "node:util";
import { verifyConversationAccess } from "@/server/api/routers/project/helper";
import { conversations, messages, toDbMessage } from "@onlook/db";
import { db } from "@onlook/db/src/client";
import {
  MessageContextType,
  type BranchMessageContext,
  type ChatMessage,
  type MessageContext,
} from "@onlook/models";
import { and, desc, eq } from "drizzle-orm";

type Delivery = NonNullable<BranchMessageContext["clientDelivery"]>;
export const clientBranch = (context: MessageContext[]) =>
  context.find(
    (c): c is BranchMessageContext =>
      c.type === MessageContextType.BRANCH && !!c.clientPage,
  );

export function canRunStep(stored: Delivery | undefined, tail: ChatMessage) {
  if (tail.role === "user") return !stored || stored.state === "retryable";
  if (
    tail.role !== "assistant" ||
    stored?.state !== "tools" ||
    tail.id !== stored.responseId
  )
    return false;
  const results = new Set(
    tail.parts.flatMap((p) =>
      "toolCallId" in p &&
      "state" in p &&
      (p.state === "output-available" || p.state === "output-error")
        ? [p.toolCallId]
        : [],
    ),
  );
  return (
    !!stored.toolCallIds?.length &&
    results.size === new Set(stored.toolCallIds).size &&
    stored.toolCallIds.every((id) => results.has(id))
  );
}

export function finishState(
  failed: boolean,
  usedTools: boolean,
  finishReason?: string,
): Delivery["state"] {
  if (failed || !["tool-calls", "stop"].includes(finishReason ?? ""))
    return usedTools ? "unconfirmed" : "retryable";
  return finishReason === "tool-calls" ? "tools" : "complete";
}

export async function claimClientTurn(
  userId: string,
  projectId: string,
  conversationId: string,
  thread: ChatMessage[],
  turn: ChatMessage,
) {
  const tail = thread.at(-1);
  const context = turn.metadata?.context ?? [];
  const branch = clientBranch(context);
  if (!tail || !branch?.clientPage) return null;
  await verifyConversationAccess(db, userId, conversationId);
  return db.transaction(async (tx) => {
    // Serialize admissions across tabs, including different requests based on the same history.
    const [conversation] = await tx
      .select({ projectId: conversations.projectId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for("update");
    if (
      conversation?.projectId !== projectId ||
      branch.clientPage?.projectId !== projectId ||
      branch.branch.projectId !== projectId
    )
      return null;
    const [latest] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          eq(messages.role, "user"),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    const previous = thread
      .slice(
        0,
        thread.findIndex((message) => message.id === turn.id),
      )
      .findLast((message) => message.role === "user");
    const existing = latest?.id === turn.id ? latest : null;
    const prior = latest && clientBranch(latest.context)?.clientDelivery;
    if (
      !existing &&
      (latest?.id !== previous?.id ||
        tail.role !== "user" ||
        (prior && ["running", "tools", "unconfirmed"].includes(prior.state)))
    )
      return null;
    if (
      existing &&
      (!prior ||
        !isDeepStrictEqual(existing.parts, turn.parts) ||
        !isDeepStrictEqual(
          clientBranch(existing.context)?.clientPage,
          branch.clientPage,
        ))
    )
      return null;
    const delivery = existing ? prior : undefined;
    if (!canRunStep(delivery, tail)) return null;
    const attempt = crypto.randomUUID();
    const state: Delivery = {
      state: "running",
      attempt,
      usedTools: delivery?.usedTools ?? false,
    };
    const replace = (items: MessageContext[], status: Delivery) =>
      items.map((c) =>
        c.type === MessageContextType.BRANCH && c.clientPage
          ? { ...c, clientDelivery: status }
          : c,
      );
    if (existing) {
      if (tail.role === "assistant") {
        await tx
          .update(messages)
          .set({ parts: tail.parts })
          .where(
            and(
              eq(messages.id, tail.id),
              eq(messages.conversationId, conversationId),
              eq(messages.role, "assistant"),
            ),
          );
      }
      await tx
        .update(messages)
        .set({ context: replace(existing.context, state) })
        .where(eq(messages.id, turn.id));
    } else {
      const inserted = await tx
        .insert(messages)
        .values({
          ...toDbMessage(turn, conversationId),
          context: replace(context, state),
          createdAt: new Date(),
          checkpoints: [],
        })
        .onConflictDoNothing()
        .returning({ id: messages.id });
      if (!inserted.length) return null;
    }
    return async (reply: ChatMessage | null, failed: boolean) => {
      await db.transaction(async (finish) => {
        const [row] = await finish
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, turn.id),
              eq(messages.conversationId, conversationId),
            ),
          )
          .for("update");
        const active = row && clientBranch(row.context)?.clientDelivery;
        if (!row || active?.state !== "running" || active.attempt !== attempt)
          return;
        const ids =
          reply?.parts.flatMap((p) =>
            "toolCallId" in p ? [p.toolCallId] : [],
          ) ?? [];
        const usedTools = state.usedTools || ids.length > 0;
        const status = finishState(
          failed,
          usedTools,
          reply?.metadata?.finishReason,
        );
        if (
          reply?.role === "assistant" &&
          (status === "tools" || status === "complete")
        ) {
          const response = toDbMessage(reply, conversationId);
          await finish
            .insert(messages)
            .values(response)
            .onConflictDoUpdate({
              target: messages.id,
              set: { parts: response.parts, usage: response.usage },
              setWhere: and(
                eq(messages.conversationId, conversationId),
                eq(messages.role, "assistant"),
              ),
            });
        }
        await finish
          .update(messages)
          .set({
            context: replace(row.context, {
              attempt,
              state: status,
              usedTools,
              responseId: reply?.id,
              toolCallIds: ids,
            }),
          })
          .where(eq(messages.id, turn.id));
        await finish
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, conversationId));
      });
    };
  });
}
