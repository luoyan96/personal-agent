CREATE TABLE chat_contact_profiles (
 contact_id TEXT PRIMARY KEY REFERENCES chat_contacts(id), display_name TEXT,
 role TEXT NOT NULL CHECK(role IN ('human','coordinator','specialist','public_capability')),
 introduction TEXT NOT NULL DEFAULT '', capability_description TEXT NOT NULL DEFAULT '',
 personality TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1)
) STRICT;
INSERT INTO chat_contact_profiles(contact_id,role)
 SELECT id,CASE WHEN kind='human' THEN 'human' WHEN kind='public_agent' THEN 'public_capability'
 WHEN principal=owner_id THEN 'coordinator' ELSE 'specialist' END FROM chat_contacts;
CREATE TABLE chat_contact_requests (
 id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES labs(id), requester_id TEXT NOT NULL REFERENCES members(id),
 target_contact_id TEXT NOT NULL REFERENCES chat_contacts(id), decider_id TEXT NOT NULL REFERENCES members(id),
 relation_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','revoked')),
 version INTEGER NOT NULL CHECK(version>=1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX chat_contact_requests_actor ON chat_contact_requests(requester_id,decider_id,status);
-- Only pairs that actually existed before 014 are compatible accepted contacts.
-- New direct conversations cannot bypass the request/accept flow.
INSERT INTO chat_contact_requests
 SELECT 'legacy_'||c.id,c.lab_id,c.owner_id,peer.id,peer.owner_id,
 'human:'||c.lab_id||':'||CASE WHEN c.owner_id<peer.owner_id THEN c.owner_id||':'||peer.owner_id ELSE peer.owner_id||':'||c.owner_id END,
 'accepted',1,json_extract(c.document,'$.createdAt'),json_extract(c.document,'$.updatedAt')
 FROM chat_conversations c JOIN chat_members cm ON cm.conversation_id=c.id
 JOIN chat_contacts peer ON peer.id=cm.contact_id AND peer.kind='human' AND peer.owner_id<>c.owner_id
 WHERE c.kind='direct' ON CONFLICT(relation_key) DO NOTHING;
CREATE TABLE chat_memories (
 id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES labs(id), scope TEXT NOT NULL CHECK(scope IN ('private_agent','conversation')),
 scope_id TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES members(id), status TEXT NOT NULL CHECK(status IN ('active','revoked')),
 version INTEGER NOT NULL CHECK(version>=1), content TEXT NOT NULL, source TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX chat_memories_scope ON chat_memories(scope,scope_id,status);
CREATE TABLE chat_memory_revisions (
 memory_id TEXT NOT NULL REFERENCES chat_memories(id), version INTEGER NOT NULL,
 document TEXT NOT NULL CHECK(json_valid(document)), PRIMARY KEY(memory_id,version)
) STRICT;
