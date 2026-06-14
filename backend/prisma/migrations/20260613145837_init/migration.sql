-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'TRANSPORT_OFFICE_ADMIN', 'TERMINAL_ADMIN', 'SUPERVISOR', 'DISPATCHER', 'AUDITOR', 'FINANCE_OFFICER', 'SYSTEM_SUPPORT');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('PENDING', 'DISPATCHED', 'SKIPPED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OverrideType" AS ENUM ('VEHICLE_SKIP', 'FORCE_DISPATCH', 'ROUTE_TEMPORARY_CHANGE');

-- CreateEnum
CREATE TYPE "ViolationType" AS ENUM ('ROUTE_HOPPING', 'UNAUTHORIZED_TERMINAL', 'DUPLICATE_CHECKIN', 'SUSPICIOUS_INTERVAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "pinHash" TEXT,
    "roleName" "RoleName" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_terminal_assignments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_terminal_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "base_fare_etb" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terminal_routes" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terminal_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "plate_number" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "owner_phone" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 12,
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_route_assignments" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_route_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "check_in_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "QueueStatus" NOT NULL DEFAULT 'PENDING',
    "sequence" INTEGER NOT NULL,
    "sync_id" TEXT,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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
    "is_reconciled" BOOLEAN NOT NULL DEFAULT false,
    "sync_id" TEXT,

    CONSTRAINT "dispatch_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "override_logs" (
    "id" TEXT NOT NULL,
    "queue_entry_id" TEXT NOT NULL,
    "supervisor_id" TEXT NOT NULL,
    "override_type" "OverrideType" NOT NULL,
    "reason" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signature" TEXT NOT NULL,

    CONSTRAINT "override_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_records" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "violation_type" "ViolationType" NOT NULL,
    "details" TEXT NOT NULL,
    "severity_score" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "violation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_bindings" (
    "id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "device_uuid" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ip_address" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_reports" (
    "id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "terminal_id" TEXT,
    "total_dispatches" INTEGER NOT NULL,
    "total_municipal_comm" DECIMAL(12,2) NOT NULL,
    "total_platform_comm" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_name_key" ON "terminals"("name");

-- CreateIndex
CREATE UNIQUE INDEX "terminals_code_key" ON "terminals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_terminal_assignments_user_id_terminal_id_key" ON "user_terminal_assignments"("user_id", "terminal_id");

-- CreateIndex
CREATE UNIQUE INDEX "routes_code_key" ON "routes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "terminal_routes_terminal_id_route_id_key" ON "terminal_routes"("terminal_id", "route_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_number_key" ON "vehicles"("plate_number");

-- CreateIndex
CREATE INDEX "vehicle_route_assignments_vehicle_id_route_id_idx" ON "vehicle_route_assignments"("vehicle_id", "route_id");

-- CreateIndex
CREATE UNIQUE INDEX "queue_entries_sync_id_key" ON "queue_entries"("sync_id");

-- CreateIndex
CREATE INDEX "queue_entries_terminal_id_route_id_status_check_in_time_idx" ON "queue_entries"("terminal_id", "route_id", "status", "check_in_time");

-- CreateIndex
CREATE INDEX "queue_entries_vehicle_id_status_idx" ON "queue_entries"("vehicle_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_records_sync_id_key" ON "dispatch_records"("sync_id");

-- CreateIndex
CREATE INDEX "dispatch_records_terminal_id_route_id_dispatch_time_idx" ON "dispatch_records"("terminal_id", "route_id", "dispatch_time");

-- CreateIndex
CREATE INDEX "dispatch_records_is_reconciled_dispatch_time_idx" ON "dispatch_records"("is_reconciled", "dispatch_time");

-- CreateIndex
CREATE UNIQUE INDEX "override_logs_queue_entry_id_key" ON "override_logs"("queue_entry_id");

-- CreateIndex
CREATE INDEX "violation_records_vehicle_id_violation_type_timestamp_idx" ON "violation_records"("vehicle_id", "violation_type", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "device_bindings_device_uuid_key" ON "device_bindings"("device_uuid");

-- AddForeignKey
ALTER TABLE "user_terminal_assignments" ADD CONSTRAINT "user_terminal_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_terminal_assignments" ADD CONSTRAINT "user_terminal_assignments_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_routes" ADD CONSTRAINT "terminal_routes_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terminal_routes" ADD CONSTRAINT "terminal_routes_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_route_assignments" ADD CONSTRAINT "vehicle_route_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_route_assignments" ADD CONSTRAINT "vehicle_route_assignments_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_dispatcher_id_fkey" FOREIGN KEY ("dispatcher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_logs" ADD CONSTRAINT "override_logs_queue_entry_id_fkey" FOREIGN KEY ("queue_entry_id") REFERENCES "queue_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "override_logs" ADD CONSTRAINT "override_logs_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_records" ADD CONSTRAINT "violation_records_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_bindings" ADD CONSTRAINT "device_bindings_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
