CREATE TABLE audit_cases(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,updated_by TEXT NOT NULL);
CREATE TABLE case_members(case_id TEXT NOT NULL REFERENCES audit_cases(id) ON DELETE CASCADE,email TEXT NOT NULL,PRIMARY KEY(case_id,email));
CREATE INDEX audit_cases_owner ON audit_cases(owner_id);
CREATE INDEX case_members_email ON case_members(email);
