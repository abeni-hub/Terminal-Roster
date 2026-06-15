-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "vehicle_schedules" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_schedules_terminal_id_week_number_status_idx" ON "vehicle_schedules"("terminal_id", "week_number", "status");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_schedules_vehicle_id_week_number_key" ON "vehicle_schedules"("vehicle_id", "week_number");

-- AddForeignKey
ALTER TABLE "vehicle_schedules" ADD CONSTRAINT "vehicle_schedules_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_schedules" ADD CONSTRAINT "vehicle_schedules_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_schedules" ADD CONSTRAINT "vehicle_schedules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
