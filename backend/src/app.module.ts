import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { TerminalsModule } from './modules/terminals/terminals.module';
import { RoutesModule } from './modules/routes/routes.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { RosterModule } from './modules/roster/roster.module';
import { FifoQueueModule } from './modules/fifo-queue/fifo-queue.module';
import { ViolationsModule } from './modules/violations/violations.module';
import { OverridesModule } from './modules/overrides/overrides.module';
import { SyncModule } from './modules/sync/sync.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TerminalsModule,
    RoutesModule,
    VehiclesModule,
    RosterModule,
    FifoQueueModule,
    ViolationsModule,
    OverridesModule,
    SyncModule,
    ReconciliationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
