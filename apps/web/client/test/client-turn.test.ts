import { expect, test } from "bun:test";
import type { BranchMessageContext, ChatMessage } from "@onlook/models";
import { canRunStep, finishState } from "../src/app/api/chat/client-turn";
import { getClientTextBlock } from "@onlook/parser";

const user: ChatMessage = {
  id: "request",
  role: "user",
  parts: [{ type: "text", text: "Actually, make it 7:30." }],
};
type Status = NonNullable<BranchMessageContext["clientDelivery"]>;
const status = (state: Status["state"]): Status => ({
  state,
  attempt: "a",
  usedTools: false,
});

test("Only a fresh or safely retryable native turn can start model work", () => {
  expect(canRunStep(undefined, user)).toBe(true);
  expect(canRunStep(status("retryable"), user)).toBe(true);
  for (const phase of ["running", "tools", "complete", "unconfirmed"] as const)
    expect(canRunStep(status(phase), user)).toBe(false);
  expect(finishState(true, false)).toBe("retryable");
  expect(finishState(true, true)).toBe("unconfirmed");
  expect(finishState(false, false, "stop")).toBe("complete");
});

test("A native tool continuation must match the expected assistant and tool results", () => {
  const delivery = {
    ...status("tools"),
    responseId: "assistant",
    toolCallIds: ["call"],
  };
  const reply: ChatMessage = {
    id: "assistant",
    role: "assistant",
    parts: [
      {
        type: "dynamic-tool",
        toolName: "edit",
        toolCallId: "call",
        state: "output-available",
        input: {},
        output: "done",
      },
    ],
  };
  expect(canRunStep(delivery, reply)).toBe(true);
  expect(canRunStep(delivery, { ...reply, id: "other" })).toBe(false);
  expect(canRunStep(delivery, { ...reply, parts: [] })).toBe(false);
  expect(canRunStep({ ...delivery, state: "running" }, reply)).toBe(false);
});

test("Committed wording comes from the selected static source node", async () => {
  const source =
    'export default function Page(){return <main><p data-oid="opening">8 AM</p><p data-oid="pickup">7:30 AM</p></main>}';
  expect(getClientTextBlock(source, "pickup")?.text).toBe("7:30 AM");
  expect(getClientTextBlock(source, "opening")?.text).toBe("8 AM");
  expect(getClientTextBlock(source, "missing")).toBeNull();
  expect(
    getClientTextBlock(source.replace("7:30 AM", "{customerName}"), "pickup"),
  ).toBeNull();
});
