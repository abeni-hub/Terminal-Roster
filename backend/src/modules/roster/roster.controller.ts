import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { RosterService } from './roster.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

class UploadRosterDto {
  csvData!: string;
}

@ApiTags('Roster Assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roster')
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @Post('upload')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TRANSPORT_OFFICE_ADMIN)
  @ApiOperation({ summary: 'Upload weekly roster CSV (Admin only)' })
  @ApiBody({ type: UploadRosterDto })
  async uploadRoster(@Body() body: UploadRosterDto) {
    if (!body.csvData) {
      throw new BadRequestException('csvData string field is required');
    }
    return this.rosterService.uploadRosterCsv(body.csvData);
  }
}
