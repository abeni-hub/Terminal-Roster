-- Addis Ababa Terminal Digital Roster System (AATDRS)
-- Database Partitioning Strategy Setup (PostgreSQL range partitioning by Month)

-- 1. DISPATCH RECORDS PARTITIONING
-- Drop existing non-partitioned table if it exists and recreate as partitioned
DROP TABLE IF EXISTS "dispatch_records" CASCADE;

CREATE TABLE "dispatch_records" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "dispatcher_id" TEXT NOT NULL,
    "dispatch_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fare_charged_etb" DECIMAL(10,2) NOT NULL,
    "municipal_commission" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "platform_commission" DECIMAL(10,2) NOT NULL DEFAULT 1.00,
    "is_reconciled" BOOLEAN NOT NULL DEFAULT FALSE,
    "sync_id" TEXT,
    PRIMARY KEY ("id", "dispatch_time")
) PARTITION BY RANGE ("dispatch_time");

-- Create default indexes on parent table (indexes automatically propagate to partitions)
CREATE INDEX "dispatch_records_terminal_route_idx" ON "dispatch_records"("terminal_id", "route_id", "dispatch_time");
CREATE INDEX "dispatch_records_reconciled_idx" ON "dispatch_records"("is_reconciled", "dispatch_time");
CREATE UNIQUE INDEX "dispatch_records_sync_id_unique_idx" ON "dispatch_records"("sync_id", "dispatch_time");

-- 2. AUDIT LOGS PARTITIONING
DROP TABLE IF EXISTS "audit_logs" CASCADE;

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ip_address" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id", "timestamp")
) PARTITION BY RANGE ("timestamp");

CREATE INDEX "audit_logs_user_idx" ON "audit_logs"("user_id", "timestamp");

-- 3. VIOLATION RECORDS PARTITIONING
DROP TABLE IF EXISTS "violation_records" CASCADE;

CREATE TABLE "violation_records" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "violation_type" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "severity_score" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT FALSE,
    "resolved_at" TIMESTAMP(3),
    PRIMARY KEY ("id", "timestamp")
) PARTITION BY RANGE ("timestamp");

CREATE INDEX "violation_records_vehicle_idx" ON "violation_records"("vehicle_id", "violation_type", "timestamp");

-- Helper function to generate partitions for a specific month
CREATE OR REPLACE FUNCTION create_aatdrs_partitions_for_month(target_date DATE) RETURNS void AS $$
DECLARE
    partition_suffix TEXT;
    start_date TIMESTAMP;
    end_date TIMESTAMP;
BEGIN
    partition_suffix := to_char(target_date, 'YYYY_MM');
    start_date := date_trunc('month', target_date);
    end_date := start_date + INTERVAL '1 month';

    -- Create Dispatch Records partition
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS "dispatch_records_%s" PARTITION OF "dispatch_records" FOR VALUES FROM (%L) TO (%L);',
        partition_suffix, start_date, end_date
    );

    -- Create Audit Logs partition
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS "audit_logs_%s" PARTITION OF "audit_logs" FOR VALUES FROM (%L) TO (%L);',
        partition_suffix, start_date, end_date
    );

    -- Create Violation Records partition
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS "violation_records_%s" PARTITION OF "violation_records" FOR VALUES FROM (%L) TO (%L);',
        partition_suffix, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;

-- Initialize partitions for current and next 2 months (June, July, August 2026)
SELECT create_aatdrs_partitions_for_month('2026-06-01'::DATE);
SELECT create_aatdrs_partitions_for_month('2026-07-01'::DATE);
SELECT create_aatdrs_partitions_for_month('2026-08-01'::DATE);
