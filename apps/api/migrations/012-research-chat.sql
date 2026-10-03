CREATE TABLE chat_contacts (
 id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES labs(id), kind TEXT NOT NULL CHECK(kind IN ('human','personal_agent','public_agent')),
 owner_id TEXT NOT NULL REFERENCES members(id), principal TEXT NOT NULL, UNIQUE(lab_id,kind,principal)
) STRICT;
CREATE TABLE chat_conversations (
 id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES labs(id), owner_id TEXT NOT NULL REFERENCES members(id),
 kind TEXT NOT NULL CHECK(kind IN ('personal','direct','group')), scope_key TEXT UNIQUE, document TEXT NOT NULL CHECK(json_valid(document))
) STRICT;
CREATE TABLE chat_members (
 conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), contact_id TEXT NOT NULL REFERENCES chat_contacts(id),
 status TEXT NOT NULL CHECK(status IN ('invited','joined','declined','revoked')), version INTEGER NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','member')), PRIMARY KEY(conversation_id,contact_id)
) STRICT;
CREATE TABLE chat_messages (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), sequence INTEGER NOT NULL,
 document TEXT NOT NULL CHECK(json_valid(document)), UNIQUE(conversation_id,sequence)
) STRICT;
CREATE TABLE chat_turns (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), owner_id TEXT NOT NULL REFERENCES members(id),
 root_id TEXT NOT NULL, status TEXT NOT NULL, fence INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until INTEGER,
 request_json TEXT NOT NULL CHECK(json_valid(request_json)), document TEXT NOT NULL CHECK(json_valid(document))
) STRICT;
CREATE INDEX chat_turn_queue ON chat_turns(status,id);
CREATE TABLE chat_attempts (
 turn_id TEXT PRIMARY KEY REFERENCES chat_turns(id), root_id TEXT NOT NULL, started_at TEXT NOT NULL,
 usage_json TEXT CHECK(usage_json IS NULL OR json_valid(usage_json))
) STRICT;
CREATE TABLE chat_actions (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), owner_id TEXT NOT NULL REFERENCES members(id),
 turn_id TEXT NOT NULL REFERENCES chat_turns(id), document TEXT NOT NULL CHECK(json_valid(document))
) STRICT;
CREATE TABLE chat_plan_sources (
 plan_id TEXT PRIMARY KEY REFERENCES plans(id), turn_id TEXT NOT NULL REFERENCES chat_turns(id)
) STRICT;
CREATE TABLE chat_invitations (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), contact_id TEXT NOT NULL REFERENCES chat_contacts(id),
 invited_by TEXT NOT NULL REFERENCES members(id), document TEXT NOT NULL CHECK(json_valid(document)), UNIQUE(conversation_id,contact_id)
) STRICT;
CREATE TABLE chat_pages (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES members(id), fingerprint TEXT NOT NULL,
 expires_at INTEGER NOT NULL, entries TEXT NOT NULL CHECK(json_valid(entries))
) STRICT;
-- Derived drafts/tasks remain tied to source permissions. The recursive edge
-- walks only previously persisted plan inputs; it never grants new authority.
CREATE VIEW chat_resource_versions AS
 SELECT 'plan' kind,id,version,NULL task_id,owner_id,'available' status FROM plans
 UNION ALL SELECT 'task',id,version,id,NULL,status FROM tasks
 UNION ALL SELECT 'assignment',id,version,task_id,NULL,status FROM assignments
 UNION ALL SELECT 'run',id,version,task_id,NULL,status FROM execution_jobs WHERE kind='capability'
 UNION ALL SELECT 'deliverable',id,version,task_id,NULL,'available' FROM deliverables
 UNION ALL SELECT 'artifact',id,version,task_id,NULL,status FROM artifacts;
CREATE VIEW chat_invalid_plans AS
 WITH RECURSIVE inputs(plan_id,turn_id) AS (
  SELECT plan_id,turn_id FROM chat_plan_sources
  UNION
  SELECT i.plan_id,parent.turn_id FROM inputs i JOIN chat_turns t ON t.id=i.turn_id
   JOIN json_each(t.request_json,'$.context') ref
   JOIN chat_plan_sources parent ON parent.plan_id=json_extract(ref.value,'$.ref.id')
   WHERE json_extract(ref.value,'$.kind')='plan'
 )
 SELECT DISTINCT i.plan_id FROM inputs i JOIN chat_turns t ON t.id=i.turn_id
 WHERE EXISTS (
  SELECT 1 FROM json_each(t.request_json,'$.context') ref
  LEFT JOIN chat_resource_versions resource ON resource.kind=json_extract(ref.value,'$.kind') AND resource.id=json_extract(ref.value,'$.ref.id')
  LEFT JOIN task_access acl ON acl.task_id=resource.task_id AND acl.member_id=t.owner_id
  LEFT JOIN tasks source ON source.id=resource.task_id
  WHERE resource.id IS NULL OR resource.version!=json_extract(ref.value,'$.ref.version') OR resource.status IN ('revoked','cancelled')
   OR (resource.kind='plan' AND (resource.owner_id!=t.owner_id OR EXISTS(SELECT 1 FROM reuse_denials d WHERE d.target_kind='plan' AND d.target_id=resource.id AND d.member_id=t.owner_id)))
   OR (resource.task_id IS NOT NULL AND (COALESCE(acl.access,'')!='full' OR source.status='cancelled' OR EXISTS(SELECT 1 FROM reuse_denials d WHERE d.target_kind='task' AND d.target_id=resource.task_id AND d.member_id=t.owner_id)))
 );
