CREATE TABLE installed_skills (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES members(id), version INTEGER NOT NULL,
  revision INTEGER NOT NULL, settings TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE installed_skill_versions (
  skill_id TEXT NOT NULL REFERENCES installed_skills(id), revision INTEGER NOT NULL,
  digest TEXT NOT NULL, package TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(skill_id,revision)
) STRICT;
CREATE INDEX installed_skills_owner ON installed_skills(owner_id);
CREATE TABLE installed_skill_uses (
  turn_id TEXT PRIMARY KEY REFERENCES chat_turns(id), skill_id TEXT NOT NULL REFERENCES installed_skills(id),
  caller_id TEXT NOT NULL REFERENCES members(id), revision INTEGER NOT NULL, selection TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
