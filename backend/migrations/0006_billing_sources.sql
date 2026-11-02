ALTER TABLE tenants ADD COLUMN quote_period TEXT;
CREATE UNIQUE INDEX tenant_cost_source ON tenant_costs(tenant_id,period,category,reference);
