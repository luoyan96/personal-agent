CREATE TABLE personal_memory_settings (
 member_id TEXT PRIMARY KEY REFERENCES members(id), candidate_learning INTEGER NOT NULL DEFAULT 0 CHECK(candidate_learning IN (0,1)),
 time_zone TEXT NOT NULL DEFAULT 'Asia/Shanghai', quiet_hours_json TEXT CHECK(quiet_hours_json IS NULL OR json_valid(quiet_hours_json)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1)
) STRICT;
CREATE TABLE personal_memories (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), topic TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('general','topic')),
 status TEXT NOT NULL CHECK(status IN ('confirmed','candidate','revoked')), origin TEXT NOT NULL CHECK(origin IN ('explicit','feedback','inferred')),
 source_message_id TEXT REFERENCES chat_messages(id), content TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>=1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX personal_memory_confirmed_topic ON personal_memories(member_id,topic) WHERE status='confirmed';
CREATE INDEX personal_memory_owner ON personal_memories(member_id,status,updated_at);
CREATE TABLE personal_memory_revisions (
 memory_id TEXT NOT NULL REFERENCES personal_memories(id), version INTEGER NOT NULL, document TEXT NOT NULL CHECK(json_valid(document)), at TEXT NOT NULL,
 PRIMARY KEY(memory_id,version)
) STRICT;
CREATE TABLE personal_followups (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
 status TEXT NOT NULL CHECK(status IN ('active','paused','completed','cancelled')), version INTEGER NOT NULL CHECK(version>=1),
 due_at TEXT NOT NULL, next_at TEXT NOT NULL, fired_message_id TEXT REFERENCES chat_messages(id),
 document TEXT NOT NULL CHECK(json_valid(document)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX personal_followup_due ON personal_followups(status,next_at) WHERE fired_message_id IS NULL;
