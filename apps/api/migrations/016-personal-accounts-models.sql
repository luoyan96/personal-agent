-- A public account owns an isolated internal space; this is not lab manager authority.
CREATE TABLE personal_spaces (
 lab_id TEXT PRIMARY KEY REFERENCES labs(id), owner_id TEXT NOT NULL UNIQUE REFERENCES members(id)
) STRICT;
CREATE TABLE registration_receipts_next (
 request_key TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
 invite_id TEXT REFERENCES registration_invites(id), member_id TEXT NOT NULL REFERENCES members(id),
 response_json TEXT NOT NULL CHECK(json_valid(response_json)), created_at TEXT NOT NULL
) STRICT;
INSERT INTO registration_receipts_next SELECT * FROM registration_receipts;
DROP TABLE registration_receipts;
ALTER TABLE registration_receipts_next RENAME TO registration_receipts;
-- Member and Contact IDs are globally stable. Preserve existing relationships,
-- including revoked state, without giving a public account laboratory membership.
CREATE INDEX chat_contact_owner ON chat_contacts(owner_id);
UPDATE chat_contact_requests SET relation_key=CASE
 WHEN relation_key LIKE 'human:%' THEN 'human:'||substr(relation_key,length('human:'||lab_id||':')+1)
 ELSE 'agent:'||requester_id||':'||target_contact_id END;
UPDATE chat_conversations SET scope_key=CASE
 WHEN scope_key LIKE 'direct:%' THEN 'direct:'||substr(scope_key,length('direct:'||lab_id||':')+1)
 WHEN scope_key LIKE 'agentdirect:%' THEN 'agentdirect:'||substr(scope_key,length('agentdirect:'||lab_id||':')+1)
 ELSE scope_key END;
CREATE TABLE personal_model_configurations (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), name TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('deepseek','qwen','doubao')), model TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), encrypted_api_key TEXT,
 version INTEGER NOT NULL CHECK(version>=1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX personal_model_owner ON personal_model_configurations(member_id);
-- A persistent state row also marks explicit personal selection. Clearing all
-- configurations never silently resumes spending a legacy laboratory credential.
CREATE TABLE personal_model_settings (
 member_id TEXT PRIMARY KEY REFERENCES members(id), default_configuration_id TEXT REFERENCES personal_model_configurations(id),
 version INTEGER NOT NULL CHECK(version>=1)
) STRICT;
