import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SyncService } from './sync.service';
import { BatchSyncDto } from './dto/sync.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Synchronization Engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('batch')
  @ApiOperation({ summary: 'Synchronize pending offline outbox transaction packets from browser IndexedDB' })
  async processBatchSync(@Body() dto: BatchSyncDto) {
    return this.syncService.processBatchSync(dto);
  }
}
