import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  async generateReport(startDateStr: string, endDateStr: string, terminalId?: string) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date parameters');
    }

    // 1. Gather all matching dispatches
    const dispatches = await this.prisma.dispatchRecord.findMany({
      where: {
        dispatchTime: {
          gte: start,
          lte: end,
        },
        ...(terminalId ? { terminalId } : {}),
      },
    });

    const totalDispatches = dispatches.length;
    
    // Calculate total commissions
    const totalMunicipalComm = dispatches.reduce(
      (sum, d) => sum + Number(d.municipalCommission),
      0,
    );

    const totalPlatformComm = dispatches.reduce(
      (sum, d) => sum + Number(d.platformCommission),
      0,
    );

    // 2. Create the reconciliation record in database
    const report = await this.prisma.reconciliationReport.create({
      data: {
        startDate: start,
        endDate: end,
        terminalId,
        totalDispatches,
        totalMunicipalComm,
        totalPlatformComm,
        status: 'PENDING', // Settlement starts as pending
      },
    });

    return report;
  }

  async getReports() {
    return this.prisma.reconciliationReport.findMany({
      orderBy: { generatedAt: 'desc' },
    });
  }

  async settleReport(id: string) {
    return this.prisma.reconciliationReport.update({
      where: { id },
      data: { status: 'SETTLED' },
    });
  }
}
