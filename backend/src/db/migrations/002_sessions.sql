-- 002_sessions.sql
CREATE TABLE IF NOT EXISTS sessions (
  session_internal  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_external  TEXT    NOT NULL UNIQUE,
  name              TEXT    NOT NULL DEFAULT 'New session',
  created_at        TEXT    NOT NULL,
  updated_at        TEXT    NOT NULL,
  compacted_summary TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  message_internal  INTEGER PRIMARY KEY AUTOINCREMENT,
  message_external  TEXT    NOT NULL UNIQUE,
  session_internal  INTEGER NOT NULL REFERENCES sessions(session_internal) ON DELETE CASCADE,
  role              TEXT    NOT NULL CHECK (role IN ('user','assistant')),
  content           TEXT    NOT NULL,
  created_at        TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_internal, message_internal);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);
