export enum MessageCheckpointType {
    GIT = 'git',
}

interface BaseMessageCheckpoint {
    type: MessageCheckpointType;
    createdAt: Date;
}

export interface GitMessageCheckpoint extends BaseMessageCheckpoint {
    type: MessageCheckpointType.GIT;
    oid: string;
    wording?: { before:string; after:string };
    branchId?: string; // Optional for backwards compatibility with old checkpoints
}

export type MessageCheckpoints = GitMessageCheckpoint;
