// backend/src/contracts/sessions.ts

export interface SessionSummary {
  readonly sessionExternal: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly messageCount: number;
}

export interface SessionDetail {
  readonly sessionExternal: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly compactedSummary: string | null;
  readonly messages: readonly MessageDetail[];
}

export interface MessageDetail {
  readonly messageExternal: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly createdAt: string;
}

export interface CreateSessionResponse {
  readonly sessionExternal: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface ListSessionsResponse {
  readonly sessions: readonly SessionSummary[];
}

export interface GetSessionResponse {
  readonly sessionExternal: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly compactedSummary: string | null;
  readonly messages: readonly MessageDetail[];
}

export interface RenameSessionResponse {
  readonly sessionExternal: string;
  readonly name: string;
  readonly updatedAt: string;
}

export interface CompactSessionResponse {
  readonly compactedCount: number;
  readonly keptCount: number;
  readonly summary: string;
}

export interface SendMessageResponse {
  readonly messageExternal: string;
  readonly runId: string;
}