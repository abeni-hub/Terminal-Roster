import { Controller, Post, Get, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';

class GenerateReportDto {
  startDate!: string;
  endDate!: string;
  terminalId?: string;
}

@ApiTags('Financial Reconciliation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post('generate')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Generate municipal/platform commission reconciliation report' })
  async generate(@Body() dto: GenerateReportDto) {
    return this.reconciliationService.generateReport(dto.startDate, dto.endDate, dto.terminalId);
  }

  @Get('reports')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get all generated reports (Admin/Planner only)' })
  async getReports() {
    return this.reconciliationService.getReports();
  }

  @Post(':id/settle')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Settle outstanding commissions' })
  async settle(@Param('id') id: string) {
    return this.reconciliationService.settleReport(id);
  }
}
