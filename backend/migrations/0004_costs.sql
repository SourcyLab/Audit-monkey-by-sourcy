CREATE TABLE tenant_costs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,period TEXT NOT NULL,category TEXT NOT NULL CHECK(category IN ('storage','infrastructure','llm','other')),amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),reference TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX tenant_costs_period ON tenant_costs(tenant_id,period);
ALTER TABLE audit_cases ADD COLUMN export_eligible INTEGER NOT NULL DEFAULT 0;
