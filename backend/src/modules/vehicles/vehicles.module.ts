import { Module } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesController } from './vehicles.controller';
import { VehicleGroupsService } from './vehicle-groups.service';
import { VehicleGroupsController } from './vehicle-groups.controller';

@Module({
  controllers: [VehiclesController, VehicleGroupsController],
  providers: [VehiclesService, VehicleGroupsService],
  exports: [VehiclesService, VehicleGroupsService],
})
export class VehiclesModule {}
