CREATE TABLE research_collections (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES members(id), lab_id TEXT NOT NULL REFERENCES labs(id),
 name TEXT NOT NULL, description TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('owner_private','task_scoped','lab_shared','public')),
 task_ids TEXT NOT NULL CHECK(json_valid(task_ids)), version INTEGER NOT NULL CHECK(version>0),
 status TEXT NOT NULL CHECK(status IN ('available','withdrawn')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX research_collections_scope ON research_collections(scope,lab_id,status,owner_id);
CREATE TABLE research_files (
 id TEXT PRIMARY KEY, collection_id TEXT NOT NULL REFERENCES research_collections(id),
 version INTEGER NOT NULL CHECK(version>0), status TEXT NOT NULL CHECK(status IN ('available','withdrawn'))
) STRICT;
CREATE INDEX research_files_collection ON research_files(collection_id,status);
CREATE TABLE research_file_versions (
 file_id TEXT NOT NULL REFERENCES research_files(id), version INTEGER NOT NULL CHECK(version>0),
 blob_key TEXT NOT NULL UNIQUE, document TEXT NOT NULL CHECK(json_valid(document)), PRIMARY KEY(file_id,version)
) STRICT;
CREATE TABLE research_file_pages (
 file_id TEXT NOT NULL, version INTEGER NOT NULL, page_number INTEGER NOT NULL CHECK(page_number BETWEEN 1 AND 200),
 text TEXT NOT NULL, PRIMARY KEY(file_id,version,page_number),
 FOREIGN KEY(file_id,version) REFERENCES research_file_versions(file_id,version)
) STRICT;
CREATE TABLE research_agent_bindings (
 agent_id TEXT PRIMARY KEY REFERENCES chat_contacts(id), owner_id TEXT NOT NULL REFERENCES members(id),
 version INTEGER NOT NULL CHECK(version>0), collection_ids TEXT NOT NULL CHECK(json_valid(collection_ids))
) STRICT;
CREATE TRIGGER research_file_versions_immutable_update BEFORE UPDATE ON research_file_versions BEGIN SELECT RAISE(ABORT,'Immutable research source version'); END;
CREATE TRIGGER research_file_versions_immutable_delete BEFORE DELETE ON research_file_versions BEGIN SELECT RAISE(ABORT,'Immutable research source version'); END;
CREATE TRIGGER research_file_pages_immutable_update BEFORE UPDATE ON research_file_pages BEGIN SELECT RAISE(ABORT,'Immutable research source text'); END;
CREATE TRIGGER research_file_pages_immutable_delete BEFORE DELETE ON research_file_pages BEGIN SELECT RAISE(ABORT,'Immutable research source text'); END;
