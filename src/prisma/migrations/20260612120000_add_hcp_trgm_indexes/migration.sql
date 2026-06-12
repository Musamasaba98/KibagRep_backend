-- Migration: add pg_trgm GIN indexes for fast ILIKE substring search on HcpRecord
-- The existing B-tree indexes on name/registration_no cannot speed up ILIKE '%term%'
-- because the leading % prevents index scan. GIN trigram indexes handle this.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hcp_name_trgm
  ON "HcpRecord" USING GIN (name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hcp_regno_trgm
  ON "HcpRecord" USING GIN (registration_no gin_trgm_ops);
