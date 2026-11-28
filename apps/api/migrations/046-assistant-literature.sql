CREATE TABLE personal_research_directions (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 directions TEXT NOT NULL CHECK(json_valid(directions) AND json_type(directions)='array'),
 version INTEGER NOT NULL CHECK(version>=2)
) STRICT;

CREATE TABLE lab_research_directions (
 lab_id TEXT PRIMARY KEY REFERENCES labs(id),
 directions TEXT NOT NULL CHECK(json_valid(directions) AND json_type(directions)='array'),
 version INTEGER NOT NULL CHECK(version>=2)
) STRICT;

-- A batch belongs to one account even when its direction is shared by a group.
CREATE TABLE assistant_literature_batches (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES members(id),
 scope_key TEXT NOT NULL,
 turn_id TEXT NOT NULL UNIQUE REFERENCES chat_turns(id),
 message_id TEXT NOT NULL UNIQUE REFERENCES chat_messages(id),
 input_message_id TEXT NOT NULL REFERENCES chat_messages(id),
 items TEXT NOT NULL CHECK(json_valid(items) AND json_type(items)='array'),
 created_at TEXT NOT NULL
) STRICT;
CREATE INDEX assistant_literature_owner_feed ON assistant_literature_batches(owner_id,scope_key,created_at DESC,id DESC);
