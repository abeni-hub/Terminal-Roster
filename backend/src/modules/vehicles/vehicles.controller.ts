import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.TRANSPORT_OFFICE_ADMIN, RoleName.TERMINAL_ADMIN)
  @ApiOperation({ summary: 'Register a vehicle' })
  async create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.create(createVehicleDto);
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

  @Get('plate/:plateNumber')
  @ApiOperation({ summary: 'Lookup vehicle by Plate Number' })
  async findByPlate(@Param('plateNumber') plateNumber: string) {
    return this.vehiclesService.findByPlate(plateNumber);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TRANSPORT_OFFICE_ADMIN, RoleName.TERMINAL_ADMIN)
  @ApiOperation({ summary: 'Update vehicle record' })
  async update(@Param('id') id: string, @Body() updateVehicleDto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, updateVehicleDto);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete vehicle (Super Admin only)' })
  async remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
