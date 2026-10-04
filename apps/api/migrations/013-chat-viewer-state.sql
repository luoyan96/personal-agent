-- Actor preferences never live in the shared conversation document. Retain state
-- after revocation for audit/rejoin; service ACL hides it immediately meanwhile.
CREATE TABLE chat_viewer_states (
 conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 read_sequence INTEGER NOT NULL DEFAULT 0 CHECK(read_sequence >= 0),
 pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
 version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
 PRIMARY KEY(conversation_id,member_id)
) STRICT;
CREATE INDEX chat_viewer_states_member ON chat_viewer_states(member_id,conversation_id);
