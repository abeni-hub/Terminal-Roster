import { Module } from '@nestjs/common';
import { OverridesService } from './overrides.service';
import { OverridesController } from './overrides.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [OverridesController],
  providers: [OverridesService],
  exports: [OverridesService],
})
export class OverridesModule {}
