-- Personal-assistant memory: owner preferences plus private-assistant notes.
-- Conversation/group memory stays in chat_memories until group memory is built.
CREATE TABLE assistant_memories (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES members(id),
 lab_id TEXT REFERENCES labs(id),
 scope TEXT NOT NULL CHECK(scope IN ('personal','agent')),
 subject_id TEXT REFERENCES chat_contacts(id),
 type TEXT NOT NULL CHECK(type IN ('preference','decision','commitment','note')),
 status TEXT NOT NULL CHECK(status IN ('candidate','confirmed','revoked')),
 origin TEXT NOT NULL CHECK(origin IN ('explicit','feedback','inferred')),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('manual','message','task','conversation')),
 source_id TEXT,
 source_version INTEGER,
 source_label TEXT,
 summary TEXT NOT NULL,
 detail TEXT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 schema_version INTEGER NOT NULL DEFAULT 1,
 version INTEGER NOT NULL CHECK(version>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK((scope='personal' AND subject_id IS NULL) OR (scope='agent' AND subject_id IS NOT NULL))
) STRICT;
CREATE INDEX assistant_memory_owner ON assistant_memories(owner_id, scope, status, updated_at);
CREATE INDEX assistant_memory_subject ON assistant_memories(scope, subject_id, status);
-- One confirmed personal preference per topic; agent notes are not topic-unique.
CREATE UNIQUE INDEX assistant_memory_confirmed_topic ON assistant_memories(
 owner_id, json_extract(payload_json, '$.topic')
) WHERE scope='personal' AND type='preference' AND status='confirmed';

CREATE TABLE assistant_memory_revisions (
 memory_id TEXT NOT NULL REFERENCES assistant_memories(id),
 version INTEGER NOT NULL,
 document TEXT NOT NULL CHECK(json_valid(document)),
 at TEXT NOT NULL,
 PRIMARY KEY(memory_id,version)
) STRICT;

CREATE VIEW assistant_memory_index AS
SELECT id, scope, subject_id, type, summary, status, version,
 source_kind, source_id, source_version, updated_at
FROM assistant_memories;

-- Existing personal_memories and chat_memories remain authoritative for deployed
-- preference and conversation APIs. New assistant notes use this separate domain.
-- No old settings, ownership, revocations or histories are copied or removed.
