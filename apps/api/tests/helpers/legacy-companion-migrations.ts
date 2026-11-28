/** Use only when simulating a historical schema from a fully migrated fixture. */
export const rewindCompanionMigrations = `
  DROP TABLE IF EXISTS assistant_proactive_deliveries;
  DROP TABLE IF EXISTS assistant_proactive_settings;
  ALTER TABLE assistant_greetings DROP COLUMN last_daily_at;
  DROP TRIGGER assistant_relationship_withdraw;
  DROP TABLE assistant_topic_memory_sources;
  DROP TABLE assistant_relationship_memories;
  DELETE FROM schema_migrations WHERE version>=44;
`
