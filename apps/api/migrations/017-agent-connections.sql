-- A specialist remains the same Contact. The private binding is separate from
-- public/persisted strict Contact, message and turn documents.
CREATE TABLE agent_connections (
 contact_id TEXT PRIMARY KEY REFERENCES chat_contacts(id),
 owner_id TEXT NOT NULL REFERENCES members(id),
 protocol TEXT NOT NULL CHECK(protocol='chat_completions'),
 endpoint TEXT NOT NULL, model TEXT NOT NULL,
 configured INTEGER NOT NULL CHECK(configured IN (0,1)),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 allow_accepted_contacts INTEGER NOT NULL CHECK(allow_accepted_contacts IN (0,1)),
 encrypted_api_key TEXT, version INTEGER NOT NULL CHECK(version>=1),
 updated_at TEXT NOT NULL,
 last_probe_json TEXT CHECK(last_probe_json IS NULL OR json_valid(last_probe_json))
) STRICT;
CREATE INDEX agent_connection_owner ON agent_connections(owner_id);
