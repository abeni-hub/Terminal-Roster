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
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get all recorded terminal violations (Admin/Planner only)' })
  async findAll() {
    return this.violationsService.findAll();
  }

  @Post(':id/resolve')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Resolve a vehicle violation (Admin/Planner only)' })
  async resolve(@Param('id') id: string) {
    return this.violationsService.resolve(id);
  }
}
