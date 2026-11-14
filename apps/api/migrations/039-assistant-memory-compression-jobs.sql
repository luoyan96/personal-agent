-- Manual assistant-memory compression runs outside the HTTP request.
-- One queued/running job per owner+agent prevents duplicate manual clicks.
CREATE TABLE assistant_memory_compression_jobs (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL,
 subject_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER,
 result_json TEXT,
 failure TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX assistant_memory_compression_active
 ON assistant_memory_compression_jobs(owner_id, subject_id)
 WHERE status IN ('queued','running');
CREATE INDEX assistant_memory_compression_queue
 ON assistant_memory_compression_jobs(status, created_at);
