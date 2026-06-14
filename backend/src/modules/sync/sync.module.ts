import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { FifoQueueModule } from '../fifo-queue/fifo-queue.module';
import { OverridesModule } from '../overrides/overrides.module';

@Module({
  imports: [FifoQueueModule, OverridesModule],
  controllers: [SyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
