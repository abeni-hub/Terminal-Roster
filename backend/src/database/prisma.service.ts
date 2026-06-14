import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const rawUrl = process.env.DATABASE_URL ?? '';
    // pg.Pool doesn't understand Prisma-only query params (e.g. ?schema=public).
    // Strip them so the pg driver receives a clean connection string.
    const pgUrl = rawUrl.split('?')[0];
    const pool = new Pool({ connectionString: pgUrl });
    const adapter = new PrismaPg(pool, { schema: 'public' });
    super({ adapter });
    this.pool = pool;
    console.log('DATABASE_URL (pg):', pgUrl);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}