import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { OverridesService } from './overrides.service';
import { CreateOverrideDto } from './dto/override.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Queue Overrides')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('overrides')
export class OverridesController {
  constructor(private readonly overridesService: OverridesService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.SUPERVISOR)
  @ApiOperation({ summary: 'Submit a supervisor queue override bypass (Supervisor only)' })
  async createOverride(@Body() dto: CreateOverrideDto) {
    return this.overridesService.createOverride(dto);
  }

  @Get()
  @Roles(RoleName.SUPER_ADMIN, RoleName.AUDITOR, RoleName.FINANCE_OFFICER)
  @ApiOperation({ summary: 'List all override audit trails (Auditors / Admins only)' })
  async getOverrideLogs() {
    return this.overridesService.getOverrideLogs();
  }
}
