-- Compression needs a stable short topic and an explicit conflict marker.
-- Existing rows keep a visible unclassified value until the model or owner names them.
ALTER TABLE assistant_memories ADD COLUMN topic TEXT NOT NULL DEFAULT '未分类';
ALTER TABLE assistant_memories ADD COLUMN conflict INTEGER NOT NULL DEFAULT 0 CHECK(conflict IN (0,1));

UPDATE assistant_memories
SET topic = COALESCE(json_extract(payload_json, '$.topic'), '未分类')
WHERE type='preference' AND topic='未分类';

DROP INDEX IF EXISTS assistant_memory_confirmed_topic;
CREATE UNIQUE INDEX assistant_memory_confirmed_topic ON assistant_memories(
 owner_id, topic
) WHERE scope='personal' AND type='preference' AND status='confirmed';
CREATE INDEX assistant_memory_topic ON assistant_memories(
 owner_id, scope, subject_id, type, topic, status
);

DROP VIEW IF EXISTS assistant_memory_index;
CREATE VIEW assistant_memory_index AS
SELECT id, scope, subject_id, type, topic, conflict, summary, status, version,
 source_kind, source_id, source_version, updated_at
FROM assistant_memories;
