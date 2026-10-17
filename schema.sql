-- Cider Run Jump & Speed Contest database (Cloudflare D1).
-- Run once: Cloudflare dashboard > D1 > cider-run > Console, paste this file, Execute.
-- Safe to run again: every statement is "IF NOT EXISTS" / "OR IGNORE".

CREATE TABLE IF NOT EXISTS athletes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  bib         INTEGER NOT NULL UNIQUE,
  first       TEXT    NOT NULL,
  last        TEXT    NOT NULL,
  sex         TEXT    NOT NULL CHECK (sex IN ('M','F')),
  age         INTEGER NOT NULL CHECK (age BETWEEN 2 AND 110),
  email       TEXT,
  phone       TEXT,
  token       TEXT    NOT NULL UNIQUE,      -- private link to the athlete's results card
  s1 REAL, s2 REAL, s3 REAL,                -- sprint trials, seconds
  j1 REAL, j2 REAL, j3 REAL,                -- jump trials, inches
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- One row. rev goes up on every change to athletes or settings.
-- The public leaderboard reads only the snapshot row, so 100 phones refreshing
-- every few seconds cost one row read each instead of a scan of every athlete.
CREATE TABLE IF NOT EXISTS snapshot (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  rev      INTEGER NOT NULL DEFAULT 0,
  src_rev  INTEGER NOT NULL DEFAULT -1,
  body     TEXT    NOT NULL DEFAULT '{}'
);
INSERT OR IGNORE INTO snapshot (id, rev, src_rev, body) VALUES (1, 0, -1, '{}');

CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id  INTEGER,
  first       TEXT NOT NULL,
  last        TEXT,
  email       TEXT NOT NULL,
  phone       TEXT,
  note        TEXT,
  sent_to_crm TEXT,                         -- 'yes', 'no (not set up)', or the error
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS login_fails (
  ip     TEXT PRIMARY KEY,
  n      INTEGER NOT NULL,
  until  INTEGER NOT NULL
);
