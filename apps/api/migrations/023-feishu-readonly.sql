CREATE TABLE feishu_oauth_states (
 state_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), lab_id TEXT NOT NULL REFERENCES labs(id),
 session_hash TEXT NOT NULL, app_id TEXT NOT NULL, verifier TEXT NOT NULL, expires_at TEXT NOT NULL
) STRICT;
CREATE TABLE feishu_connections (
 member_id TEXT PRIMARY KEY REFERENCES members(id), lab_id TEXT NOT NULL REFERENCES labs(id), app_id TEXT NOT NULL,
 open_id TEXT NOT NULL, tenant_key TEXT NOT NULL, display_name TEXT NOT NULL, encrypted_token TEXT NOT NULL,
 expires_at TEXT NOT NULL, version TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE feishu_previews (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), lab_id TEXT NOT NULL REFERENCES labs(id),
 connection_version TEXT NOT NULL, encrypted_document TEXT NOT NULL, expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX feishu_previews_owner ON feishu_previews(member_id, expires_at);
