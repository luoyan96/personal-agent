CREATE TABLE personal_work_tasks (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES members(id),
 status TEXT NOT NULL CHECK(status IN ('proposed','active','completed','cancelled')),
 source_turn_id TEXT UNIQUE REFERENCES chat_turns(id),
 conversation_id TEXT REFERENCES chat_conversations(id),
 version INTEGER NOT NULL CHECK(version>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 document TEXT NOT NULL
) STRICT;
CREATE TABLE personal_work_participants (
 task_id TEXT NOT NULL REFERENCES personal_work_tasks(id),
 contact_id TEXT NOT NULL REFERENCES chat_contacts(id),
 status TEXT NOT NULL CHECK(status IN ('invited','accepted','declined','revoked')),
 PRIMARY KEY(task_id,contact_id)
) STRICT;
CREATE TABLE social_groups (
 conversation_id TEXT PRIMARY KEY REFERENCES chat_conversations(id),
 task_id TEXT UNIQUE REFERENCES personal_work_tasks(id)
) STRICT;
CREATE TABLE capability_publications (
 id TEXT PRIMARY KEY,
 contact_id TEXT NOT NULL UNIQUE REFERENCES chat_contacts(id),
 owner_id TEXT NOT NULL REFERENCES members(id),
 status TEXT NOT NULL CHECK(status IN ('published','withdrawn')),
 version INTEGER NOT NULL CHECK(version>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 document TEXT NOT NULL
) STRICT;
CREATE INDEX personal_work_owner ON personal_work_tasks(owner_id,updated_at);
CREATE INDEX personal_work_member ON personal_work_participants(contact_id,status,task_id);
CREATE INDEX capability_public_listing ON capability_publications(status,updated_at);
