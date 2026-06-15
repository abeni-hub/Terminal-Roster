import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AssignmentStatus } from '@prisma/client';

// Government CSV format (tab or comma separated):
//  plate_number | assigned_terminal | assigned_route | week_number | valid_from | valid_until | status

@Injectable()
export class RosterService {
  constructor(private prisma: PrismaService) {}

  // ── Upload weekly schedule CSV from Transport Office ────────────────────────
  async uploadRosterCsv(
    csvContent: string,
  ): Promise<{ processed: number; errors: string[] }> {
    // Normalise: accept tab OR comma separated; collapse Windows line-endings
    const lines = csvContent
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n');

    const errors: string[] = [];
    let processedCount = 0;

    // Detect delimiter from header
    const header = lines[0] ?? '';
    const delimiter = header.includes('\t') ? '\t' : ',';

    // Skip header row
    const startIndex = header.toLowerCase().includes('plate') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(delimiter).map(c => c.trim());
      if (cols.length < 7) {
        errors.push(
          `Row ${i + 1}: Expected 7 columns (plate_number, assigned_terminal, assigned_route, ` +
          `week_number, valid_from, valid_until, status). Got ${cols.length}.`,
        );
        continue;
      }

      const [plateNumber, assignedTerminal, assignedRoute, weekStr, validFromStr, validUntilStr, statusStr] = cols;

      // ── Resolve Vehicle ─────────────────────────────────────────────────────
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { plateNumber },
      });
      if (!vehicle) {
        // Auto-create unknown vehicles with placeholder owner data
        // (transport office may upload before vehicles are manually registered)
        await this.prisma.vehicle.create({
          data: {
            plateNumber,
            ownerName:  'Pending Registration',
            ownerPhone: '+251900000000',
            capacity:   12,
          },
        });
        errors.push(
          `Row ${i + 1}: Vehicle ${plateNumber} auto-created – please update owner details.`,
        );
      }

      const resolvedVehicle = vehicle ?? (await this.prisma.vehicle.findUnique({ where: { plateNumber } }))!;

      // ── Resolve Terminal (by name, partial match) ────────────────────────────
      const terminal = await this.prisma.terminal.findFirst({
        where: { name: { contains: assignedTerminal, mode: 'insensitive' } },
      });
      if (!terminal) {
        errors.push(`Row ${i + 1}: Terminal "${assignedTerminal}" not found. Create it first.`);
        continue;
      }

      // ── Resolve Route (by destination name, preferring terminal-linked routes) ─
      const routeViaTerminal = await this.prisma.route.findFirst({
        where: {
          destination: { contains: assignedRoute, mode: 'insensitive' },
          terminals: { some: { terminalId: terminal.id } },
        },
      });

      // Fallback: find any route with matching destination
      const routeFallback = routeViaTerminal ?? await this.prisma.route.findFirst({
        where: { destination: { contains: assignedRoute, mode: 'insensitive' } },
      });

      if (!routeFallback) {
        errors.push(
          `Row ${i + 1}: Route with destination "${assignedRoute}" not found. Create it first.`,
        );
        continue;
      }

      // ── Parse dates (DD/MM/YYYY or YYYY-MM-DD) ────────────────────────────────
      const parseDate = (s: string): Date | null => {
        // DD/MM/YYYY
        const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmyMatch) {
          return new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}T00:00:00Z`);
        }
        // YYYY-MM-DD or ISO
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
      };

      const validFrom = parseDate(validFromStr);
      const validUntil = parseDate(validUntilStr);

      if (!validFrom) {
        errors.push(`Row ${i + 1}: Invalid valid_from date "${validFromStr}". Use DD/MM/YYYY or YYYY-MM-DD.`);
        continue;
      }
      if (!validUntil) {
        errors.push(`Row ${i + 1}: Invalid valid_until date "${validUntilStr}". Use DD/MM/YYYY or YYYY-MM-DD.`);
        continue;
      }

      const weekNumber = parseInt(weekStr, 10);
      if (isNaN(weekNumber)) {
        errors.push(`Row ${i + 1}: Invalid week_number "${weekStr}".`);
        continue;
      }

      const status: AssignmentStatus =
        statusStr.toUpperCase() === 'ACTIVE' ? AssignmentStatus.ACTIVE : AssignmentStatus.INACTIVE;

      // ── Upsert schedule row ───────────────────────────────────────────────────
      await this.prisma.vehicleSchedule.upsert({
        where:  { vehicleId_weekNumber: { vehicleId: resolvedVehicle.id, weekNumber } },
        create: {
          vehicleId:  resolvedVehicle.id,
          terminalId: terminal.id,
          routeId:    routeFallback.id,
          weekNumber,
          validFrom,
          validUntil,
          status,
        },
        update: {
          terminalId: terminal.id,
          routeId:    routeFallback.id,
          validFrom,
          validUntil,
          status,
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

    return { processed: processedCount, errors };
  }

  // ── Get weekly schedules (optionally filtered by terminal code and/or week) ──
  async getSchedules(params: { terminalCode?: string; weekNumber?: number }) {
    const { terminalCode, weekNumber } = params;

    const where: Record<string, any> = {};

    if (terminalCode) {
      const terminal = await this.prisma.terminal.findUnique({
        where: { code: terminalCode },
      });
      if (!terminal) {
        throw new BadRequestException(`Terminal with code "${terminalCode}" not found.`);
      }
      where.terminalId = terminal.id;
    }

    if (weekNumber) {
      where.weekNumber = weekNumber;
    }

    return this.prisma.vehicleSchedule.findMany({
      where,
      orderBy: [{ weekNumber: 'desc' }, { importedAt: 'desc' }],
      include: {
        vehicle:  { select: { plateNumber: true, ownerName: true, status: true } },
        terminal: { select: { name: true, code: true } },
        route:    { select: { code: true, origin: true, destination: true, baseFareETB: true } },
      },
    });
  }

  // ── Get all terminals (for the terminal selector dropdown) ──────────────────
  async getTerminals() {
    return this.prisma.terminal.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, location: true },
    });
  }
}
