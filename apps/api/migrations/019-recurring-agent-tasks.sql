CREATE TABLE personal_followup_runs (
 id TEXT PRIMARY KEY, followup_id TEXT NOT NULL REFERENCES personal_followups(id), scheduled_at TEXT NOT NULL,
 message_id TEXT REFERENCES chat_messages(id), turn_id TEXT REFERENCES chat_turns(id),
 notification_id TEXT REFERENCES chat_messages(id), failure TEXT, finished_at TEXT,
 UNIQUE(followup_id,scheduled_at)
) STRICT;
CREATE INDEX personal_followup_run_history ON personal_followup_runs(followup_id,scheduled_at DESC,id);
CREATE INDEX personal_followup_run_pending ON personal_followup_runs(turn_id) WHERE finished_at IS NULL;
