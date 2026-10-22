/**
 * Workload descriptors and fixtures — frozen by
 * `docs/architecture/02-phase1-design.md` §8.7.
 *
 * The frontend must not hardcode the workload, the fixtures or the tool list:
 * it fetches `/api/v1/workloads` and `/api/v1/fixtures` and builds the form
 * from them.
 */

export interface WorkloadToolDescriptor {
  readonly name: string;
  readonly description: string;
  /** The JSON Schema for the tool's arguments. */
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface WorkloadDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** The only source kind this workload accepts in Phase 1. */
  readonly sourceKinds: readonly ('fixture' | 'files')[];
  /** Limits the operator may choose from, and their defaults. */
  readonly limits: {
    readonly memoryBytes: readonly number[];
    readonly cpuSeconds: readonly number[];
    readonly wallClockMs: readonly number[];
  };
  /** The tools the model will be given. */
  readonly tools: readonly WorkloadToolDescriptor[];
  /** The objective success criterion, described for the operator. */
  readonly successCriterion: string;
}

export interface WorkloadFixture {
  readonly id: string;
  readonly workload: string;
  readonly name: string;
  readonly description: string;
  /** The task text pre-filled in the submit form. */
  readonly task: string;
  /** The project's files, so the operator can preview them. */
  readonly files: readonly { readonly path: string; readonly content: string }[];
  /** The commands the agent is permitted to run. */
  readonly allowedCommands: readonly string[];
  /** The command that decides success. */
  readonly testCommand: string;
}
