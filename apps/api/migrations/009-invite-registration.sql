CREATE TABLE registration_invites (
 id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES labs(id), code_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 50),
 used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count>=0 AND used_count<=max_uses),
 created_at TEXT NOT NULL, revoked_at TEXT
) STRICT;
CREATE TABLE registration_receipts (
 request_key TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
 invite_id TEXT NOT NULL REFERENCES registration_invites(id), member_id TEXT NOT NULL REFERENCES members(id),
 response_json TEXT NOT NULL CHECK(json_valid(response_json)), created_at TEXT NOT NULL
) STRICT;
-- Shared, expiring admission slots bound expensive password work across processes.
CREATE TABLE registration_work (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL) STRICT;
