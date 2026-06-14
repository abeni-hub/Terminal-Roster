import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ViolationsService } from './violations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Violation Tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('violations')
export class ViolationsController {
  constructor(private readonly violationsService: ViolationsService) {}

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.TRANSPORT_OFFICE_ADMIN, RoleName.SUPERVISOR, RoleName.AUDITOR)
  @ApiOperation({ summary: 'Get all recorded terminal violations (Admin/Supervisor/Auditor only)' })
  async findAll() {
    return this.violationsService.findAll();
  }

  @Post(':id/resolve')
  @Roles(RoleName.SUPER_ADMIN, RoleName.SUPERVISOR)
  @ApiOperation({ summary: 'Resolve a vehicle violation (Admin/Supervisor only)' })
  async resolve(@Param('id') id: string) {
    return this.violationsService.resolve(id);
  }
}
