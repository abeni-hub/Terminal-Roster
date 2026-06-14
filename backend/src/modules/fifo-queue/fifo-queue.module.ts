import { Module } from '@nestjs/common';
import { FifoQueueService } from './fifo-queue.service';
import { FifoQueueController } from './fifo-queue.controller';

@Module({
  controllers: [FifoQueueController],
  providers: [FifoQueueService],
  exports: [FifoQueueService],
})
export class FifoQueueModule {}
