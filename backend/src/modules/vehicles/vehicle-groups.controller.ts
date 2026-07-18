import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { VehicleGroupsService } from './vehicle-groups.service';
import {
  CreateVehicleGroupDto,
  UpdateVehicleGroupDto,
  BulkImportVehiclesToGroupDto,
} from './dto/vehicle-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Vehicle Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vehicle-groups')
export class VehicleGroupsController {
  constructor(private readonly vehicleGroupsService: VehicleGroupsService) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  @Post()
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Create a vehicle group (name + optional description only)' })
  async create(@Body() dto: CreateVehicleGroupDto) {
    return this.vehicleGroupsService.createGroup(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all vehicle groups with their vehicles' })
  async findAll() {
    return this.vehicleGroupsService.findAllGroups();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific vehicle group' })
  async findOne(@Param('id') id: string) {
    return this.vehicleGroupsService.findOneGroup(id);
  }

  @Patch(':id')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Update a vehicle group name or description' })
  async update(@Param('id') id: string, @Body() dto: UpdateVehicleGroupDto) {
    return this.vehicleGroupsService.updateGroup(id, dto);
  }

  @Delete(':id')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Delete a vehicle group' })
  async remove(@Param('id') id: string) {
    return this.vehicleGroupsService.deleteGroup(id);
  }

  // ─── Vehicle membership ────────────────────────────────────────────────────

  @Post(':id/vehicles')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Add existing vehicles (by ID) to a group' })
  async addVehicles(@Param('id') groupId: string, @Body() body: { vehicleIds: string[] }) {
    return this.vehicleGroupsService.addVehiclesToGroup(groupId, body.vehicleIds);
  }

  @Delete(':id/vehicles')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Remove vehicles from a group' })
  async removeVehicles(@Param('id') groupId: string, @Body() body: { vehicleIds: string[] }) {
    return this.vehicleGroupsService.removeVehiclesFromGroup(groupId, body.vehicleIds);
  }

  // ─── Bulk import ───────────────────────────────────────────────────────────

  @Post(':id/bulk-import')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({
    summary: 'Bulk import vehicles into a group',
    description:
      'Accepts CSV (plate,owner,phone,capacity,status) or a JSON vehicles array. ' +
      'Existing plates are updated and assigned to this group; new plates are created.',
  })
  async bulkImport(@Param('id') groupId: string, @Body() dto: BulkImportVehiclesToGroupDto) {
    return this.vehicleGroupsService.bulkImportToGroup(groupId, dto);
  }

  // ─── Move / swap ───────────────────────────────────────────────────────────

  @Post('move')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Move vehicles to a target group' })
  async moveVehicles(@Body() body: { vehicleIds: string[]; targetGroupId: string }) {
    return this.vehicleGroupsService.moveVehicles(body.vehicleIds, body.targetGroupId);
  }

  @Post('swap')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Swap groups between two vehicles' })
  async swapVehicles(@Body() body: { vehicleId1: string; vehicleId2: string }) {
    return this.vehicleGroupsService.swapVehiclesGroups(body.vehicleId1, body.vehicleId2);
  }
}
