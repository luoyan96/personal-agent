CREATE TABLE im_identities (
 contact_id TEXT PRIMARY KEY REFERENCES chat_contacts(id), lab_id TEXT NOT NULL REFERENCES labs(id),
 user_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
 profile_version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE im_conversations (
 conversation_id TEXT PRIMARY KEY REFERENCES chat_conversations(id), lab_id TEXT NOT NULL REFERENCES labs(id),
 im_conversation_id TEXT NOT NULL UNIQUE, group_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')), synced_version INTEGER NOT NULL DEFAULT 0, members_hash TEXT,
 updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE im_token_leases (
 member_id TEXT NOT NULL REFERENCES members(id), platform_id INTEGER NOT NULL CHECK(platform_id IN (3,5)),
 session_hash TEXT NOT NULL REFERENCES sessions(token_hash), expires_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('issuing','ready','revoking')), operation_id TEXT, operation_until INTEGER,
 PRIMARY KEY(member_id,platform_id)
) STRICT;
CREATE TABLE im_message_outbox (
 message_id TEXT PRIMARY KEY REFERENCES chat_messages(id),
 status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','uncertain','denied','mirrored')),
 lease_until INTEGER, attempts INTEGER NOT NULL DEFAULT 0, server_message_id TEXT, operation_id TEXT, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX im_message_outbox_pending ON im_message_outbox(status,updated_at);
-- New research messages only: old private history is never automatically broadcast.
CREATE TRIGGER im_queue_research_message AFTER INSERT ON chat_messages BEGIN
 INSERT INTO im_message_outbox(message_id,status,updated_at) VALUES (NEW.id,'pending',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TABLE im_callback_receipts (
 event_key TEXT PRIMARY KEY, body_hash TEXT NOT NULL, received_at TEXT NOT NULL,
 research_message_id TEXT REFERENCES chat_messages(id)
) STRICT;
