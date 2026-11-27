-- Contract 0.53 reshapes topic bodies. `context` is dropped because no reader ever
-- consumed it; decisions gain a server-assigned id so a patch can retire one entry
-- by id instead of matching text; every entry is clipped to the new 150-character
-- limit and a topic keeps at most 8 decisions. Ids are never reused, so the counter
-- column starts above the highest id this migration assigns.
-- Existing topics carry little data, so over-long text is truncated rather than
-- preserved elsewhere. Revision documents keep their 0.52 shape and are not
-- rewritten; history therefore starts from the first post-0.53 revision.
ALTER TABLE assistant_topics ADD COLUMN next_decision_id INTEGER NOT NULL DEFAULT 1 CHECK(next_decision_id>=1);

UPDATE assistant_topics SET
 summary = substr(summary, 1, 600),
 body_json = json_object(
  'decisions', json(COALESCE((
   SELECT json_group_array(json_object('id', 'd' || numbered.id, 'text', substr(numbered.text, 1, 150)))
   FROM (
    SELECT json_extract(entry.value, '$.text') AS text, ROW_NUMBER() OVER (ORDER BY entry.key) AS id
    FROM json_each(json_extract(assistant_topics.body_json, '$.decisions')) AS entry
    WHERE entry.key < 8
   ) AS numbered
  ), '[]')),
  'openQuestions', json(COALESCE((
   SELECT json_group_array(substr(entry.value, 1, 150))
   FROM json_each(json_extract(assistant_topics.body_json, '$.openQuestions')) AS entry
  ), '[]')),
  'next', json(COALESCE((
   SELECT json_group_array(substr(entry.value, 1, 150))
   FROM json_each(json_extract(assistant_topics.body_json, '$.next')) AS entry
  ), '[]')),
  'constraints', json(COALESCE((
   SELECT json_group_array(substr(entry.value, 1, 150))
   FROM json_each(json_extract(assistant_topics.body_json, '$.constraints')) AS entry
  ), '[]')),
  'notes', json(COALESCE(json_extract(assistant_topics.body_json, '$.notes'), '[]'))
 ),
 next_decision_id = 1 + (
  SELECT COUNT(*) FROM json_each(json_extract(assistant_topics.body_json, '$.decisions')) AS entry
  WHERE entry.key < 8
 );
