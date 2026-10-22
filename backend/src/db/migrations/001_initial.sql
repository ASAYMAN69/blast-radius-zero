-- 001_initial — the whole Phase 1 schema (§9.2).
--
-- Additive and re-runnable where practical (§9.4): every CREATE uses
-- IF NOT EXISTS. A migration that has been applied is never edited.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  applied_at  TEXT    NOT NULL,
  checksum    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id                TEXT    PRIMARY KEY,              -- external id: run_<ULID>
  status            TEXT    NOT NULL,                 -- queued|running|succeeded|failed|cancelled
  phase             TEXT    NOT NULL,                 -- see RunPhase
  workload          TEXT    NOT NULL,
  goal              TEXT    NOT NULL,
  source_kind       TEXT    NOT NULL,                 -- fixture|files
  source_ref        TEXT    NOT NULL,                 -- fixture id, or a digest of the file set
  provider          TEXT    NOT NULL,                 -- bwrap|vultr-vm|standin
  sandbox_id        TEXT,
  verdict           TEXT,                             -- contained|contained-with-denials|violated|incomplete
  error_code        TEXT,
  error_message     TEXT,                             -- generic, safe to show
  model_claim       TEXT,
  model_explanation TEXT,
  test_passed       INTEGER,                          -- 0|1|NULL (NULL = not measured)
  test_total        INTEGER,
  test_failures     INTEGER,
  iterations        INTEGER NOT NULL DEFAULT 0,
  tool_calls        INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  denied_attempts   INTEGER NOT NULL DEFAULT 0,
  broker_token_hash TEXT    NOT NULL,                 -- sha256 of the per-run token; never the token
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  started_at        TEXT,
  finished_at       TEXT,
  wall_clock_ms     INTEGER
);

CREATE TABLE IF NOT EXISTS run_events (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at           TEXT    NOT NULL,
  type         TEXT    NOT NULL,
  phase        TEXT    NOT NULL,
  label        TEXT    NOT NULL,
  detail_json  TEXT    NOT NULL                       -- JSON object, no secrets
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,   -- internal; never exposed
  run_id        TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,                    -- per-run ordinal, exposed
  tool_name     TEXT    NOT NULL,
  arguments_json TEXT   NOT NULL,                    -- redacted
  ok            INTEGER NOT NULL,                    -- 0|1
  error_code    TEXT,
  error_message TEXT,
  exit_code     INTEGER,
  signal        TEXT,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  stdout        TEXT    NOT NULL DEFAULT '',
  stderr        TEXT    NOT NULL DEFAULT '',
  bytes         INTEGER,
  outcome       TEXT    NOT NULL                     -- ok|non-zero-exit|killed|timed-out|refused
);

CREATE TABLE IF NOT EXISTS sandbox_lifecycle (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at         TEXT    NOT NULL,
  action     TEXT    NOT NULL,                       -- create|write|exec|destroy|probe
  provider   TEXT    NOT NULL,
  sandbox_id TEXT,
  ok         INTEGER NOT NULL,                       -- 0|1
  detail     TEXT,                                   -- generic; no provider raw text
  -- The containment probe result, stored as JSON on the 'probe' action.
  measurement_json TEXT
);

CREATE TABLE IF NOT EXISTS egress_attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at          TEXT    NOT NULL,
  capability  TEXT    NOT NULL,                      -- fetch|file_out|credential
  url         TEXT,
  host        TEXT,
  verdict     TEXT    NOT NULL,                      -- allowed|denied
  reason      TEXT    NOT NULL,                      -- machine code
  origin      TEXT    NOT NULL,                      -- agent|containment-probe
  bytes       INTEGER,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS resource_samples (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  at            TEXT    NOT NULL,
  wall_clock_ms INTEGER NOT NULL,
  memory_bytes  INTEGER,
  cpu_ms        INTEGER,
  process_count INTEGER
);

CREATE TABLE IF NOT EXISTS artifacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT    NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  kind       TEXT    NOT NULL,                       -- text|file
  content    TEXT,
  bytes      INTEGER NOT NULL DEFAULT 0,
  sha256     TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS blast_radius_reports (
  run_id        TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  report_version TEXT   NOT NULL,
  generated_at  TEXT   NOT NULL,
  verdict       TEXT   NOT NULL,
  report_json   TEXT   NOT NULL                      -- the full BlastRadiusReport
);

CREATE INDEX IF NOT EXISTS idx_run_events_run_seq      ON run_events (run_id, seq);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run_seq      ON tool_calls (run_id, seq);
CREATE INDEX IF NOT EXISTS idx_egress_attempts_run_at  ON egress_attempts (run_id, at);
CREATE INDEX IF NOT EXISTS idx_resource_samples_run_at ON resource_samples (run_id, at);
CREATE INDEX IF NOT EXISTS idx_runs_created_at         ON runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_status             ON runs (status);
CREATE INDEX IF NOT EXISTS idx_lifecycle_run_at        ON sandbox_lifecycle (run_id, at);
