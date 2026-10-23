/**
 * One typed store per table, wired together once at startup.
 */

import type { Database } from '../sqlite.ts';
import { createRunStore, type RunStore } from './runs.ts';
import { createEventStore, type EventStore } from './events.ts';
import { createToolCallStore, type ToolCallStore } from './toolCalls.ts';
import { createSandboxLifecycleStore, type SandboxLifecycleStore } from './sandbox.ts';
import { createEgressStore, type EgressStore } from './egress.ts';
import { createResourceStore, type ResourceStore } from './resources.ts';
import { createArtifactStore, type ArtifactStore } from './artifacts.ts';
import { createReportStore, type ReportStore } from './reports.ts';
import { createSessionStore, type SessionStore } from './sessions.ts';
import { createMessageStore, type MessageStore } from './sessions.ts';

export interface Stores {
  readonly runs: RunStore;
  readonly events: EventStore;
  readonly toolCalls: ToolCallStore;
  readonly sandbox: SandboxLifecycleStore;
  readonly egress: EgressStore;
  readonly resources: ResourceStore;
  readonly artifacts: ArtifactStore;
  readonly reports: ReportStore;
  readonly sessions: SessionStore;
  readonly messages: MessageStore;
}

export function createStores(db: Database): Stores {
  return {
    runs: createRunStore(db),
    events: createEventStore(db),
    toolCalls: createToolCallStore(db),
    sandbox: createSandboxLifecycleStore(db),
    egress: createEgressStore(db),
    resources: createResourceStore(db),
    artifacts: createArtifactStore(db),
    reports: createReportStore(db),
    sessions: createSessionStore(db),
    messages: createMessageStore(db),
  };
}
