CREATE TABLE assistant_greetings (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 welcome_message_id TEXT NOT NULL REFERENCES chat_messages(id),
 device_time_zone TEXT,
 last_greeting_date TEXT NOT NULL,
 next_daily_at TEXT NOT NULL
) STRICT;
CREATE INDEX assistant_greetings_due ON assistant_greetings(next_daily_at,member_id);
