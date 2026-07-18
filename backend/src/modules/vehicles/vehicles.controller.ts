import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto, UpdateVehicleDto, BatchImportVehiclesDto } from './dto/vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName, ViolationType } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Register a vehicle' })
  async create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.create(createVehicleDto);
  }

  @Post('with-violation')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Register a vehicle and flag a violation simultaneously' })
  async registerWithViolation(
    @Body() body: { vehicle: CreateVehicleDto, violationDetails: string, violationType: ViolationType, severityScore?: number }
  ) {
    return this.vehiclesService.registerVehicleWithViolation(body);
  }

  @Post('batch-import')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Batch import vehicles from CSV data or JSON array' })
  async batchImport(@Body() batchImportDto: BatchImportVehiclesDto) {
    return this.vehiclesService.batchImport(batchImportDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all vehicles' })
  async findAll() {
    return this.vehiclesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vehicle by database ID' })
  async findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Get(':id/plate-history')
  @ApiOperation({ summary: 'Get vehicle plate history' })
  async getPlateHistory(@Param('id') id: string) {
    return this.vehiclesService.getPlateHistory(id);
  }

  @Get('plate/:plateNumber')
  @ApiOperation({ summary: 'Lookup vehicle by Plate Number' })
  async findByPlate(@Param('plateNumber') plateNumber: string) {
    return this.vehiclesService.findByPlate(plateNumber);
  }

  @Patch(':id')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Update vehicle record' })
  async update(@Param('id') id: string, @Body() updateVehicleDto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, updateVehicleDto);
  }

  @Delete(':id')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Delete vehicle (System Admin only)' })
  async remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
