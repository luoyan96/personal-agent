-- Keep the existing morning greeting for accounts with no explicit policy.
CREATE TABLE assistant_proactive_settings (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 mode TEXT NOT NULL CHECK(mode IN ('off','greeting','contextual')),
 learn_from_chat INTEGER NOT NULL DEFAULT 0 CHECK(learn_from_chat IN (0,1)),
 version INTEGER NOT NULL CHECK(version>=1)
) STRICT;

ALTER TABLE assistant_greetings ADD COLUMN last_daily_at TEXT;

CREATE TABLE assistant_proactive_deliveries (
 member_id TEXT NOT NULL REFERENCES members(id),
 context_key TEXT,
 local_date TEXT NOT NULL,
 recorded_at TEXT NOT NULL,
 source_message_id TEXT REFERENCES chat_messages(id),
 message_id TEXT PRIMARY KEY REFERENCES chat_messages(id),
 UNIQUE(member_id,context_key),
 CHECK((context_key IS NULL) = (source_message_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX assistant_proactive_context_day ON assistant_proactive_deliveries(member_id,local_date) WHERE context_key IS NOT NULL;
CREATE INDEX assistant_proactive_recent ON assistant_proactive_deliveries(member_id,recorded_at DESC) WHERE context_key IS NOT NULL;
