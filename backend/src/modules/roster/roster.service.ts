import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

// Government CSV format (tab or comma separated):
//  plate_number | assigned_terminal | assigned_route | week_number | valid_from | valid_until | status

@Injectable()
export class RosterService {
  constructor(private prisma: PrismaService) {}

  // ── Upload weekly schedule CSV from Transport Office ────────────────────────
  async uploadRosterCsv(
    csvContent: string,
  ): Promise<{ processed: number; errors: string[] }> {
    // Strip UTF-8 Byte Order Mark (BOM) if present
    const cleanCsv = csvContent.replace(/^\uFEFF/, '').trim();

    // Normalise: accept tab OR comma separated; collapse Windows line-endings
    const lines = cleanCsv
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

      // ── Resolve Terminal (by name contains OR code equals, case-insensitive) ──
      const terminal = await this.prisma.terminal.findFirst({
        where: {
          OR: [
            { name: { contains: assignedTerminal, mode: 'insensitive' } },
            { code: { equals: assignedTerminal, mode: 'insensitive' } },
          ],
        },
      });
      if (!terminal) {
        errors.push(`Row ${i + 1}: Terminal "${assignedTerminal}" not found. Create it first.`);
        continue;
      }

      // ── Resolve Route (by destination contains OR code equals, preferring terminal-linked routes) ─
      const routeViaTerminal = await this.prisma.route.findFirst({
        where: {
          OR: [
            { destination: { contains: assignedRoute, mode: 'insensitive' } },
            { code: { equals: assignedRoute, mode: 'insensitive' } },
          ],
          terminals: { some: { terminalId: terminal.id } },
        },
      });

      // Fallback: find any route with matching destination/code
      const routeFallback = routeViaTerminal ?? await this.prisma.route.findFirst({
        where: {
          OR: [
            { destination: { contains: assignedRoute, mode: 'insensitive' } },
            { code: { equals: assignedRoute, mode: 'insensitive' } },
          ],
        },
      });

      if (!routeFallback) {
        errors.push(
          `Row ${i + 1}: Route "${assignedRoute}" not found. Create it first.`,
        );
        continue;
      }

      // ── Parse dates (DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD) ─────────────────
      const parseDate = (s: string): Date | null => {
        // DD/MM/YYYY or DD-MM-YYYY
        const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
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

      // ── Upsert Roster for the week ──────────────────────────────────────────
      let roster = await this.prisma.roster.findFirst({
        where: { weekNumber },
      });

      if (!roster) {
        roster = await this.prisma.roster.create({
          data: {
            name: `Week ${weekNumber} – ${validFrom.toLocaleDateString()} to ${validUntil.toLocaleDateString()}`,
            weekNumber,
            startDate: validFrom,
            endDate: validUntil,
            isActive: statusStr.toUpperCase() === 'ACTIVE',
          },
        });
      } else {
        roster = await this.prisma.roster.update({
          where: { id: roster.id },
          data: {
            startDate: validFrom,
            endDate: validUntil,
            isActive: statusStr.toUpperCase() === 'ACTIVE' ? true : roster.isActive,
          },
        });
      }

      // ── Upsert RosterVehicleAssignment ──────────────────────────────────────
      await this.prisma.rosterVehicleAssignment.upsert({
        where: {
          rosterId_vehicleId: {
            rosterId: roster.id,
            vehicleId: resolvedVehicle.id,
          },
        },
        create: {
          rosterId: roster.id,
          vehicleId: resolvedVehicle.id,
          routeId: routeFallback.id,
        },
        update: {
          routeId: routeFallback.id,
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
  async getSchedules(params: {
    terminalCode?: string;
    weekNumber?: number;
    userId?: string;
    userRole?: string;
  }) {
    const { terminalCode, weekNumber, userId, userRole } = params;

    const where: Record<string, any> = {};

    if (userRole === 'DISPATCHER' && userId) {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (!activeRoster) {
        return [];
      }
      const assignment = await this.prisma.rosterDispatcherAssignment.findFirst({
        where: {
          rosterId: activeRoster.id,
          dispatcherId: userId,
        },
      });
      if (!assignment) {
        return [];
      }
      where.routeId = assignment.routeId;
      where.rosterId = activeRoster.id;
    } else {
      if (terminalCode) {
        where.route = {
          terminals: {
            some: {
              terminal: {
                code: terminalCode,
              },
            },
          },
        };
      }

      if (weekNumber) {
        where.roster = {
          weekNumber,
        };
      }
    }

    const assignments = await this.prisma.rosterVehicleAssignment.findMany({
      where,
      orderBy: [
        { roster: { weekNumber: 'desc' } },
        { createdAt: 'desc' },
      ],
      include: {
        vehicle: { select: { plateNumber: true, ownerName: true, status: true } },
        roster: true,
        route: {
          include: {
            terminals: {
              include: {
                terminal: true,
              },
            },
          },
        },
      },
    });

    return assignments.map((a) => {
      const firstTerminalLink = a.route.terminals[0];
      const firstTerminal = firstTerminalLink?.terminal ?? { id: '', name: 'Unknown', code: 'UNK', location: '' };
      return {
        id: a.id,
        weekNumber: a.roster.weekNumber,
        validFrom: a.roster.startDate,
        validUntil: a.roster.endDate,
        status: a.roster.isActive ? 'ACTIVE' : 'INACTIVE',
        importedAt: a.createdAt,
        vehicle: a.vehicle,
        terminal: {
          id: firstTerminal.id,
          name: firstTerminal.name,
          code: firstTerminal.code,
        },
        route: {
          id: a.route.id,
          code: a.route.code,
          origin: a.route.origin,
          destination: a.route.destination,
          baseFareETB: a.route.baseFareETB,
        },
      };
    });
  }

  // ── Get all terminals (for the terminal selector dropdown) ──────────────────
  async getTerminals(params?: { userId?: string; userRole?: string }) {
    if (params?.userRole === 'DISPATCHER' && params.userId) {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (!activeRoster) return [];
      const assignment = await this.prisma.rosterDispatcherAssignment.findFirst({
        where: {
          rosterId: activeRoster.id,
          dispatcherId: params.userId,
        },
        include: { terminal: true },
      });
      if (!assignment) return [];
      return [{
        id: assignment.terminal.id,
        name: assignment.terminal.name,
        code: assignment.terminal.code,
        location: assignment.terminal.location,
      }];
    }
    return this.prisma.terminal.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, location: true },
    });
  }

  // ── Assign a dispatcher to a terminal and route on the active roster ───────
  async assignDispatcher(data: {
    dispatcherId: string;
    terminalId: string;
    routeId: string;
  }) {
    let activeRoster = await this.prisma.roster.findFirst({
      where: { isActive: true },
    });

    if (!activeRoster) {
      activeRoster = await this.prisma.roster.findFirst({
        orderBy: { weekNumber: 'desc' },
      });
    }

    if (!activeRoster) {
      throw new BadRequestException(
        'No active or recent roster found. Please upload a schedule CSV first.',
      );
    }

    const dispatcher = await this.prisma.user.findUnique({
      where: { id: data.dispatcherId },
    });
    if (!dispatcher || dispatcher.roleName !== 'DISPATCHER') {
      throw new BadRequestException('Invalid dispatcher user.');
    }

    const terminal = await this.prisma.terminal.findUnique({
      where: { id: data.terminalId },
    });
    if (!terminal) {
      throw new BadRequestException('Terminal not found.');
    }

    const route = await this.prisma.route.findUnique({
      where: { id: data.routeId },
    });
    if (!route) {
      throw new BadRequestException('Route not found.');
    }

    return this.prisma.rosterDispatcherAssignment.upsert({
      where: {
        rosterId_dispatcherId: {
          rosterId: activeRoster.id,
          dispatcherId: dispatcher.id,
        },
      },
      create: {
        rosterId: activeRoster.id,
        dispatcherId: dispatcher.id,
        terminalId: terminal.id,
        routeId: route.id,
      },
      update: {
        terminalId: terminal.id,
        routeId: route.id,
      },
    });
  }

  // ── Get all dispatcher assignments on the active roster ────────────────────
  async getDispatcherAssignments() {
    const activeRoster = await this.prisma.roster.findFirst({
      where: { isActive: true },
    });
    if (!activeRoster) return [];

    return this.prisma.rosterDispatcherAssignment.findMany({
      where: { rosterId: activeRoster.id },
      include: {
        dispatcher: { select: { id: true, username: true, email: true } },
        terminal: { select: { id: true, name: true, code: true } },
        route: { select: { id: true, code: true, origin: true, destination: true } },
      },
    });
  }
}
