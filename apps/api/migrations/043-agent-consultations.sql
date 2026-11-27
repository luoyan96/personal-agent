CREATE TABLE agent_consultations (
  contact_id TEXT PRIMARY KEY REFERENCES chat_contacts(id),
  mode TEXT NOT NULL CHECK(mode IN ('closed','free')),
  version INTEGER NOT NULL CHECK(version>=1)
) STRICT;

-- Existing Agent relationships do not opt owners into visitor consultations.
UPDATE chat_contact_requests
SET status='revoked', version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE status IN ('pending','accepted') AND target_contact_id IN (
  SELECT id FROM chat_contacts WHERE kind='personal_agent'
);
