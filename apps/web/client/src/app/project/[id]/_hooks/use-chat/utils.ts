import { getClientTextBlock } from '@onlook/parser';
import type { BranchMessageContext } from '@onlook/models';
import type { EditorEngine } from '@/components/store/editor/engine';
import { type ChatMessage, type GitMessageCheckpoint, type MessageContext, MessageCheckpointType } from "@onlook/models";
import { v4 as uuidv4 } from 'uuid';

export const prepareMessagesForSuggestions = (messages: ChatMessage[]) => {
    return messages.slice(-5).map((message) => ({
        role: message.role,
        content: message.parts.map((p) => {
            if (p.type === 'text') {
                return p.text;
            }
            return '';
        }).join(''),
    }));
};

export const getUserChatMessageFromString = (
    content: string,
    context: MessageContext[],
    conversationId: string,
    id?: string,
): ChatMessage => {
    return {
        id: id ?? uuidv4(),
        role: 'user',
        parts: [{ type: 'text', text: content }],
        metadata: {
            context,
            checkpoints: [],
            createdAt: new Date(),
            conversationId,
        },
    }
}

export async function createCheckpointsForAllBranches(
    editorEngine: EditorEngine,
    commitMessage: string,
    scope?: BranchMessageContext,
): Promise<GitMessageCheckpoint[]> {
    const checkpoints: GitMessageCheckpoint[] = [];

    for (const branch of editorEngine.branches.allBranches) {
        const branchData = editorEngine.branches.getBranchDataById(branch.id);
        if (!branchData || (scope && scope.branch.id !== branch.id)) {
            continue;
        }

        const git = branchData.sandbox.gitManager;
        if (scope && !(await git.getStatus())?.files.length) continue;
        const result = await git.createCommit(commitMessage);

        if (result.success) {
            const commits = branchData.sandbox.gitManager.commits;
            const latestCommit = commits?.[0];
            if (latestCommit) {
                const selected = scope?.clientPage?.selection;
                let wording;
                if (selected) {
                    const {sourcePath, oid} = selected;
                    const read = async (parent: boolean) => {
                        const content=await git.readCommittedFile(latestCommit.oid,sourcePath,parent);
                        return content ? getClientTextBlock(content,oid)?.text ?? null : null;
                    };
                    const [before, after] = await Promise.all([read(true),read(false)]);
                    if (before !== null && after !== null && before !== after) wording={before,after};
                }
                checkpoints.push({
                    ...(wording && {wording}),
                    type: MessageCheckpointType.GIT,
                    oid: latestCommit.oid,
                    branchId: branch.id,
                    createdAt: new Date(),
                });
            }
        }
    }

    return checkpoints;
}
