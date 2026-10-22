import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { ApiError } from '../lib/api';
import type { RunSource, SubmitRunRequest, WorkloadDescriptor, WorkloadFixture, WorkloadId } from '../lib/types';

/**
 * The submit screen for the Phase 1 workload.
 *
 * The form is built from what the API says the workload is — the workload
 * descriptor and its fixtures are fetched, never hardcoded, so a second
 * workload in Phase 2 is a backend change and not a rewrite of this file.
 *
 * Client-side validation mirrors the server's boundary rules, so the operator
 * is told what is wrong before a request is made:
 *   - the goal is 1–2000 characters
 *   - the source kind is one the workload accepts
 *   - a file path is relative, has no `..`, no leading `/`, no NUL, and is short
 */

const MAX_TASK_LENGTH = 2000;
const MAX_PATH_LENGTH = 200;

interface FileEntry {
  readonly id: number;
  readonly path: string;
  readonly content: string;
}

export interface SubmitFormProps {
  readonly workload: WorkloadDescriptor | null;
  readonly fixtures: readonly WorkloadFixture[];
  readonly onSubmit: (request: SubmitRunRequest) => Promise<void>;
  readonly submitting: boolean;
  readonly error: ApiError | null;
}

interface FieldErrors {
  task?: string;
  source?: string;
  files?: string;
}

function validatePath(path: string): string | null {
  const trimmed = path.trim();
  if (trimmed === '') return 'A file needs a path.';
  if (trimmed.length > MAX_PATH_LENGTH) return `A path may be at most ${String(MAX_PATH_LENGTH)} characters.`;
  if (trimmed.startsWith('/')) return 'A path must be relative to the project root.';
  if (trimmed.split('/').includes('..')) return 'A path may not contain “..”.';
  if (trimmed.includes('\0')) return 'A path may not contain a null byte.';
  if (trimmed.includes('\\')) return 'Use forward slashes in a path.';
  return null;
}

export function SubmitForm({ workload, fixtures, onSubmit, submitting, error }: SubmitFormProps) {
  const [task, setTask] = useState('');
  const [sourceKind, setSourceKind] = useState<'fixture' | 'files'>('fixture');
  const [fixtureId, setFixtureId] = useState('');
  const [files, setFiles] = useState<readonly FileEntry[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [nextId, setNextId] = useState(1);

  const selectedFixture = useMemo(
    () => fixtures.find((fixture) => fixture.id === fixtureId) ?? null,
    [fixtureId, fixtures],
  );

  // Pre-fill the goal with the selected fixture's task, the way the demo
  // scenario expects. The operator can edit it; the field stays theirs.
  useEffect(() => {
    if (selectedFixture === null) return;
    setTask(selectedFixture.task);
  }, [selectedFixture]);

  useEffect(() => {
    if (fixtureId === '' && fixtures.length > 0) {
      const first = fixtures[0];
      if (first !== undefined) setFixtureId(first.id);
    }
  }, [fixtureId, fixtures]);

  const supportsFiles = workload === null || workload.sourceKinds.includes('files');

  const validate = (): { ok: boolean; source: RunSource | null } => {
    const next: FieldErrors = {};
    const trimmedTask = task.trim();
    if (trimmedTask.length === 0) {
      next.task = 'Describe what the agent should do.';
    } else if (trimmedTask.length > MAX_TASK_LENGTH) {
      next.task = `The goal may be at most ${String(MAX_TASK_LENGTH)} characters.`;
    }

    let source: RunSource | null = null;
    if (sourceKind === 'fixture') {
      if (fixtureId === '') {
        next.source = 'Choose a project fixture.';
      } else {
        source = { kind: 'fixture', fixtureId };
      }
    } else {
      const usable = files.filter((entry) => entry.path.trim() !== '' || entry.content.trim() !== '');
      if (usable.length === 0) {
        next.files = 'Add at least one file.';
      } else {
        const problem = usable.map((entry) => validatePath(entry.path)).find((issue) => issue !== null);
        if (problem !== undefined) {
          next.files = problem;
        } else {
          const empty = usable.find((entry) => entry.content.trim() === '');
          if (empty !== undefined) {
            next.files = 'Every file needs content.';
          } else {
            source = {
              kind: 'files',
              files: usable.map((entry) => ({ path: entry.path.trim(), content: entry.content })),
            };
          }
        }
      }
    }

    setErrors(next);
    return { ok: Object.keys(next).length === 0 && source !== null, source };
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const { ok, source } = validate();
    if (!ok || source === null || workload === null) return;
    // The workload descriptor reports its id as a string; the request type
    // narrows it to the one workload Phase 1 ships. The server is the
    // authority — an unknown id is rejected there with `invalid_workload`.
    await onSubmit({ workload: workload.id as WorkloadId, task: task.trim(), source });
  };

  const addFile = () => {
    setFiles((current) => [...current, { id: nextId, path: '', content: '' }]);
    setNextId((current) => current + 1);
  };

  const updateFile = (id: number, patch: Partial<Omit<FileEntry, 'id'>>) => {
    setFiles((current) => current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  };

  const removeFile = (id: number) => {
    setFiles((current) => current.filter((entry) => entry.id !== id));
  };

  const submitLabel = submitting ? 'Dispatching run…' : 'Dispatch run';

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <header className="form__head">
        <p className="eyebrow">New run</p>
        <h1 className="form__title">
          {workload === null ? 'Self-Healing Runner' : workload.name}
        </h1>
        {workload !== null && <p className="form__lede">{workload.description}</p>}
      </header>

      {workload !== null && (
        <div className="infobox">
          <div className="infobox__row">
            <span className="infobox__label">Success criterion</span>
            <span className="infobox__value">{workload.successCriterion}</span>
          </div>
          <div className="infobox__row">
            <span className="infobox__label">Agent tools</span>
            <span className="infobox__value">
              <span className="mono mono--inline">
                {workload.tools.map((tool) => tool.name).join(' · ')}
              </span>
            </span>
          </div>
          {selectedFixture !== null && (
            <div className="infobox__row">
              <span className="infobox__label">Allowed commands</span>
              <span className="infobox__value">
                <span className="mono mono--inline">
                  {selectedFixture.allowedCommands.join(' · ')}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label className="field__label" htmlFor="goal">
          Goal
          <span className="field__hint">What the agent should do, in plain language.</span>
        </label>
        <textarea
          id="goal"
          className={`input input--textarea${errors.task !== undefined ? ' input--invalid' : ''}`}
          value={task}
          onChange={(event) => setTask(event.target.value)}
          maxLength={MAX_TASK_LENGTH}
          rows={4}
          placeholder="The project's test suite is failing. Find the bug and make the suite pass."
          aria-invalid={errors.task !== undefined}
          aria-describedby={errors.task !== undefined ? 'goal-error' : 'goal-count'}
        />
        <div className="field__foot">
          {errors.task !== undefined ? (
            <span className="field__error" id="goal-error">
              {errors.task}
            </span>
          ) : (
            <span id="goal-count" className="field__counter">
              {task.trim().length} / {MAX_TASK_LENGTH}
            </span>
          )}
        </div>
      </div>

      <fieldset className="field">
        <legend className="field__label">Project source</legend>
        <div className="segmented" role="radiogroup" aria-label="Project source">
          <label className="segmented__option">
            <input
              type="radio"
              name="source-kind"
              value="fixture"
              checked={sourceKind === 'fixture'}
              onChange={() => setSourceKind('fixture')}
            />
            <span>Built-in fixture</span>
          </label>
          {supportsFiles && (
            <label className="segmented__option">
              <input
                type="radio"
                name="source-kind"
                value="files"
                checked={sourceKind === 'files'}
                onChange={() => setSourceKind('files')}
              />
              <span>Operator files</span>
            </label>
          )}
        </div>

        {sourceKind === 'fixture' && (
          <div className="field field--inset">
            <label className="field__label" htmlFor="fixture">
              Fixture
            </label>
            <select
              id="fixture"
              className={`input${errors.source !== undefined ? ' input--invalid' : ''}`}
              value={fixtureId}
              onChange={(event) => setFixtureId(event.target.value)}
              aria-invalid={errors.source !== undefined}
            >
              <option value="">Choose a fixture…</option>
              {fixtures.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.name} — {fixture.id}
                </option>
              ))}
            </select>
            {errors.source !== undefined && <span className="field__error">{errors.source}</span>}
            {selectedFixture !== null && (
              <p className="field__note">
                {selectedFixture.description} It ships{' '}
                <span className="mono mono--inline">{selectedFixture.files.length} files</span> and decides
                success with <span className="mono mono--inline">{selectedFixture.testCommand}</span>.
              </p>
            )}
          </div>
        )}

        {sourceKind === 'files' && (
          <div className="field field--inset">
            <div className="field__row">
              <span className="field__label">Files</span>
              <button className="button button--ghost" type="button" onClick={addFile}>
                Add file
              </button>
            </div>
            {files.length === 0 && (
              <p className="field__note">
                No files yet. The agent needs a project to read and a test suite to run.
              </p>
            )}
            <ul className="fileeditor">
              {files.map((entry) => (
                <li className="fileeditor__row" key={entry.id}>
                  <div className="fileeditor__head">
                    <input
                      className="input input--path"
                      value={entry.path}
                      onChange={(event) => updateFile(entry.id, { path: event.target.value })}
                      placeholder="calculator.py"
                      aria-label={`Path for file ${String(entry.id)}`}
                      maxLength={MAX_PATH_LENGTH}
                    />
                    <button
                      className="button button--ghost button--danger"
                      type="button"
                      onClick={() => removeFile(entry.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    className="input input--code"
                    value={entry.content}
                    onChange={(event) => updateFile(entry.id, { content: event.target.value })}
                    placeholder="def sum_range(start, end): …"
                    aria-label={`Content for file ${entry.path === '' ? String(entry.id) : entry.path}`}
                    rows={6}
                    spellCheck={false}
                  />
                </li>
              ))}
            </ul>
            {errors.files !== undefined && <span className="field__error">{errors.files}</span>}
          </div>
        )}
      </fieldset>

      {error !== null && (
        <p className="form__error" role="alert">
          {error.message}
          <span className="mono mono--code"> {error.code}</span>
        </p>
      )}

      <div className="form__actions">
        <button className="button button--primary" type="submit" disabled={submitting || workload === null}>
          {submitLabel}
        </button>
        <p className="form__note">
          The run executes inside a sealed sandbox. The console shows what ran and what was refused.
        </p>
      </div>
    </form>
  );
}
