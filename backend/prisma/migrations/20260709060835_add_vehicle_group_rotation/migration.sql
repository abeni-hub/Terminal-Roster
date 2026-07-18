-- CreateTable
CREATE TABLE "vehicle_group_rotations" (
    "id" TEXT NOT NULL,
    "roster_id" TEXT NOT NULL,
    "vehicle_group_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "rotation_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_group_rotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_group_rotations_roster_id_vehicle_group_id_terminal_key" ON "vehicle_group_rotations"("roster_id", "vehicle_group_id", "terminal_id");

-- AddForeignKey
ALTER TABLE "vehicle_group_rotations" ADD CONSTRAINT "vehicle_group_rotations_roster_id_fkey" FOREIGN KEY ("roster_id") REFERENCES "rosters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_group_rotations" ADD CONSTRAINT "vehicle_group_rotations_vehicle_group_id_fkey" FOREIGN KEY ("vehicle_group_id") REFERENCES "vehicle_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_group_rotations" ADD CONSTRAINT "vehicle_group_rotations_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_group_rotations" ADD CONSTRAINT "vehicle_group_rotations_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "terminals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "roster_dispatcher_assignments_roster_id_dispatcher_id_route_id_" RENAME TO "roster_dispatcher_assignments_roster_id_dispatcher_id_route_key";

-- RenameIndex
ALTER INDEX "roster_vehicle_assignments_roster_id_vehicle_id_route_id_termin" RENAME TO "roster_vehicle_assignments_roster_id_vehicle_id_route_id_te_key";
