import type { Branch } from '../../project';

export enum MessageContextType {
    FILE = 'file',
    HIGHLIGHT = 'highlight',
    IMAGE = 'image',
    ERROR = 'error',
    BRANCH = 'branch',
    AGENT_RULE = 'agent_rule',
}

type BaseMessageContext = {
    type: MessageContextType;
    content: string;
    displayName: string;
};

export type BranchMessageContext = BaseMessageContext & {
    type: MessageContextType.BRANCH;
    branch: Branch;
    clientDelivery?: {
        state: 'running' | 'tools' | 'complete' | 'retryable' | 'unconfirmed';
        attempt: string;
        responseId?: string;
        toolCallIds?: string[];
        usedTools: boolean;
    };
    clientPage?: {
        projectId: string;
        path: string;
        checkpoint?: string;
        selection?: { oid: string; text: string; sourcePath: string; start: number; end: number };
    };
};

export type FileMessageContext = BaseMessageContext & {
    type: MessageContextType.FILE;
    path: string;
    branchId: string;
};

export type HighlightMessageContext = BaseMessageContext & {
    type: MessageContextType.HIGHLIGHT;
    path: string;
    start: number;
    end: number;
    oid?: string;
    branchId: string;
};

export type ImageMessageContext = BaseMessageContext & {
    type: MessageContextType.IMAGE;
    mimeType: string;
    id?: string;
    source: 'external' | 'local';
    path?: string;
    branchId?: string;
};

export type ErrorMessageContext = BaseMessageContext & {
    type: MessageContextType.ERROR;
    branchId: string;
};

export type AgentRuleMessageContext = BaseMessageContext & {
    type: MessageContextType.AGENT_RULE;
    path: string;
};

export type MessageContext =
    | HighlightMessageContext
    | ImageMessageContext
    | ErrorMessageContext
    | AgentRuleMessageContext
    | BranchMessageContext
    | FileMessageContext;
