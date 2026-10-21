CREATE TABLE feishu_library_sources (
 collection_id TEXT PRIMARY KEY REFERENCES research_collections(id),
 member_id TEXT NOT NULL REFERENCES members(id), lab_id TEXT NOT NULL REFERENCES labs(id),
 app_id TEXT NOT NULL, source_key TEXT NOT NULL, encrypted_source TEXT NOT NULL,
 UNIQUE(member_id,lab_id,app_id,source_key)
) STRICT;
