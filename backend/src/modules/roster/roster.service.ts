import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class RosterService {
  constructor(private prisma: PrismaService) {}

  async uploadRosterCsv(csvContent: string): Promise<{ processed: number; errors: string[] }> {
    const lines = csvContent.split(/\r?\n/);
    const errors: string[] = [];
    let processedCount = 0;

    // Skip CSV header: plateNumber,routeCode,expiresAt
    const startIndex = lines[0].toLowerCase().includes('plate') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',');
      if (columns.length < 3) {
        errors.push(`Row ${i + 1}: Insufficient columns. Expected 3.`);
        continue;
      }

      const plateNumber = columns[0].trim();
      const routeCode = columns[1].trim();
      const expiresAtStr = columns[2].trim();

      // Validate inputs
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { plateNumber },
      });

      if (!vehicle) {
        errors.push(`Row ${i + 1}: Vehicle with plate number ${plateNumber} does not exist`);
        continue;
      }

      const route = await this.prisma.route.findUnique({
        where: { code: routeCode },
      });

      if (!route) {
        errors.push(`Row ${i + 1}: Route with code ${routeCode} does not exist`);
        continue;
      }

      const expiresAt = new Date(expiresAtStr);
      if (isNaN(expiresAt.getTime())) {
        errors.push(`Row ${i + 1}: Invalid expiry date format (${expiresAtStr})`);
        continue;
      }

      // Safe creation/update of weekly assignment
      await this.prisma.vehicleRouteAssignment.create({
        data: {
          vehicleId: vehicle.id,
          routeId: route.id,
          expiresAt,
        },
      });

      processedCount++;
    }

    if (processedCount === 0 && errors.length > 0) {
      throw new BadRequestException({
        message: 'All rows failed validation',
        errors,
      });
    }

    return {
      processed: processedCount,
      errors,
    };
  }
}
