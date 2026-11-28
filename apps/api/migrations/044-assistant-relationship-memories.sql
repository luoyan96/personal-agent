CREATE TABLE assistant_relationship_memories (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES members(id),
 assistant_id TEXT NOT NULL REFERENCES chat_contacts(id),
 conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
 message_id TEXT NOT NULL REFERENCES chat_messages(id),
 kind TEXT NOT NULL CHECK(kind IN ('open_thread','experience')),
 subject TEXT,
 text TEXT,
 status TEXT NOT NULL CHECK(status IN ('active','resolved','forgotten','expired')),
 proactive INTEGER NOT NULL DEFAULT 0 CHECK(proactive IN (0,1)),
 source_suppressed INTEGER NOT NULL DEFAULT 0 CHECK(source_suppressed IN (0,1)),
 version INTEGER NOT NULL CHECK(version>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 CHECK((subject IS NOT NULL AND text IS NOT NULL) = (status IN ('active','resolved'))),
 CHECK(status = 'active' OR proactive = 0)
) STRICT;
CREATE INDEX assistant_relationship_owner ON assistant_relationship_memories(owner_id, assistant_id, status, updated_at);
CREATE INDEX assistant_relationship_source ON assistant_relationship_memories(owner_id, message_id, status);
CREATE INDEX assistant_relationship_expiry ON assistant_relationship_memories(status, expires_at);
CREATE UNIQUE INDEX assistant_relationship_dedupe ON assistant_relationship_memories(owner_id, message_id);

CREATE TABLE assistant_topic_memory_sources (
 topic_id TEXT NOT NULL REFERENCES assistant_topics(id),
 message_id TEXT NOT NULL REFERENCES chat_messages(id),
 PRIMARY KEY(topic_id, message_id)
) STRICT;

-- Automatic recall never uses a withdrawn source. Keep only a tombstone so an
-- already-running curator or retry cannot learn that source again.
CREATE TRIGGER assistant_relationship_withdraw AFTER INSERT ON chat_message_retractions BEGIN
 UPDATE assistant_relationship_memories SET subject=NULL,text=NULL,status='forgotten',proactive=0,source_suppressed=1,version=version+1,updated_at=NEW.created_at
 WHERE message_id=NEW.message_id AND status IN ('active','resolved','expired');
END;
