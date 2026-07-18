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
        include: { group: true }
      });
      if (!vehicle) {
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

      const resolvedVehicle = vehicle ?? (await this.prisma.vehicle.findUnique({ where: { plateNumber }, include: { group: true } }))!;

      // ── Resolve Terminal ──────────────────────────────────────────────────
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

      // ── Resolve Route ─────────────────────────────────────────────────────
      const routeViaTerminal = await this.prisma.route.findFirst({
        where: {
          OR: [
            { destinationTerminal: { name: { contains: assignedRoute, mode: 'insensitive' } } },
            { code: { equals: assignedRoute, mode: 'insensitive' } },
          ],
          sourceTerminalId: terminal.id,
        },
      });

      const routeFallback = routeViaTerminal ?? await this.prisma.route.findFirst({
        where: {
          OR: [
            { destinationTerminal: { name: { contains: assignedRoute, mode: 'insensitive' } } },
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

      // ── Parse dates ────────────────────────────────────────────────────────
      const parseDate = (s: string): Date | null => {
        const dmyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (dmyMatch) {
          return new Date(`${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}T00:00:00Z`);
        }
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

      // ── Upsert Roster ─────────────────────────────────────────────────────
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

      // ── Group assignment validation ────────────────────────────────────────
      if (resolvedVehicle.groupId) {
        const conflictingAssignment = await this.prisma.rosterVehicleAssignment.findFirst({
          where: {
            rosterId: roster.id,
            vehicle: {
              groupId: resolvedVehicle.groupId,
              id: { not: resolvedVehicle.id }
            },
            OR: [
              { terminalId: { not: terminal.id } },
              { routeId: { not: routeFallback.id } }
            ]
          },
          include: {
            vehicle: true,
            terminal: true,
            route: true
          }
        });
        if (conflictingAssignment) {
          errors.push(
            `Row ${i + 1}: Vehicle group constraint violation. Other vehicles in group "${resolvedVehicle.group?.name || 'Group'}" are already assigned to Route "${conflictingAssignment.route.code}" at "${conflictingAssignment.terminal.name}".`
          );
          continue;
        }
      }

      // ── Upsert RosterVehicleAssignment ────────────────────────────────────
      const existingAssignment = await this.prisma.rosterVehicleAssignment.findFirst({
        where: { rosterId: roster.id, vehicleId: resolvedVehicle.id },
      });

      if (existingAssignment) {
        await this.prisma.rosterVehicleAssignment.update({
          where: { id: existingAssignment.id },
          data: {
            routeId: routeFallback.id,
            terminalId: terminal.id,
          },
        });
      } else {
        await this.prisma.rosterVehicleAssignment.create({
          data: {
            rosterId: roster.id,
            vehicleId: resolvedVehicle.id,
            routeId: routeFallback.id,
            terminalId: terminal.id,
          },
        });
      }

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

  // ── Get weekly schedules ──────────────────────────────────────────────────
  async getSchedules(params: {
    terminalCode?: string;
    weekNumber?: number;
    vehicleGroupId?: string;
    userId?: string;
    userRole?: string;
  }) {
    const { terminalCode, weekNumber, vehicleGroupId, userId, userRole } = params;

    const where: Record<string, any> = {};

    if (userRole === 'DISPATCHER' && userId) {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (!activeRoster) {
        return [];
      }

      const dispatcherAssignments = await this.prisma.rosterDispatcherAssignment.findMany({
        where: {
          rosterId: activeRoster.id,
          dispatcherId: userId,
        },
        select: {
          routeId: true,
          terminalId: true,
        },
      });

      if (!dispatcherAssignments.length) {
        return [];
      }

      where.rosterId = activeRoster.id;
      where.OR = dispatcherAssignments.map((assignment) => ({
        routeId: assignment.routeId,
        terminalId: assignment.terminalId,
      }));
    } else {
      if (terminalCode) {
        where.terminal = {
          code: terminalCode,
        };
      }

      if (weekNumber) {
        where.roster = {
          weekNumber,
        };
      }

      if (vehicleGroupId) {
        where.vehicle = {
          groupId: vehicleGroupId,
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
        vehicle: {
          select: {
            plateNumber: true,
            ownerName: true,
            status: true,
            group: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        roster: true,
        terminal: true,
        route: {
          include: {
            sourceTerminal: true,
            destinationTerminal: true,
          },
        },
      },
    });

    return assignments.map((a) => ({
      id: a.id,
      weekNumber: a.roster.weekNumber,
      validFrom: a.roster.startDate,
      validUntil: a.roster.endDate,
      status: a.roster.isActive ? 'ACTIVE' : 'INACTIVE',
      importedAt: a.createdAt,
      vehicle: a.vehicle,
      terminal: {
        id: a.terminal.id,
        name: a.terminal.name,
        code: a.terminal.code,
      },
      route: {
        id: a.route.id,
        code: a.route.code,
        origin: a.route.sourceTerminal?.name ?? 'Unknown',
        destination: a.route.destinationTerminal?.name ?? 'Unknown',
        baseFareETB: a.route.baseFareETB,
      },
    }));
  }

  // ── Get all terminals ────────────────────────────────────────────────────
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

  // ── Get routes for a specific terminal (origin terminal) ─────────────────
  async getRoutesByTerminal(terminalId: string) {
    return this.prisma.route.findMany({
      where: {
        sourceTerminalId: terminalId,
        isActive: true,
      },
      include: {
        sourceTerminal: { select: { id: true, name: true, code: true } },
        destinationTerminal: { select: { id: true, name: true, code: true } },
      },
      orderBy: { code: 'asc' },
    });
  }

  // ── Get dispatchers assigned to a specific terminal ───────────────────────
  async getDispatchersByTerminal(terminalId: string) {
    const assignments = await this.prisma.userTerminalAssignment.findMany({
      where: { terminalId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            roleName: true,
            isActive: true,
          },
        },
      },
    });

    return assignments
      .filter((a) => a.user.roleName === 'DISPATCHER' && a.user.isActive)
      .map((a) => ({
        id: a.user.id,
        username: a.user.username,
        email: a.user.email,
        terminalId,
      }));
  }

  // ── Assign a dispatcher to a route (with terminal validation) ─────────────
  async assignDispatcher(data: {
    dispatcherId: string;
    terminalId: string;
    routeId: string;
    rosterId?: string;
  }) {
    // Find the roster (specific or active/latest)
    let activeRoster = data.rosterId
      ? await this.prisma.roster.findUnique({ where: { id: data.rosterId } })
      : await this.prisma.roster.findFirst({ where: { isActive: true } });

    if (!activeRoster) {
      activeRoster = await this.prisma.roster.findFirst({
        orderBy: { weekNumber: 'desc' },
      });
    }

    if (!activeRoster) {
      throw new BadRequestException(
        'No roster found. Please generate a roster first.',
      );
    }

    if (activeRoster.isFinalized) {
      throw new BadRequestException(
        'This roster has been finalized and cannot be modified.',
      );
    }

    // Validate dispatcher
    const dispatcher = await this.prisma.user.findUnique({
      where: { id: data.dispatcherId },
      include: { terminalAssignments: true },
    });
    if (!dispatcher || dispatcher.roleName !== 'DISPATCHER') {
      throw new BadRequestException('Invalid dispatcher user.');
    }

    // ── Validate dispatcher's terminal assignment matches requested terminal ─
    const dispatcherTerminalAssignment = dispatcher.terminalAssignments.find(
      (ta) => ta.terminalId === data.terminalId,
    );
    if (!dispatcherTerminalAssignment) {
      throw new BadRequestException(
        `Dispatcher "${dispatcher.username}" is not assigned to this terminal. ` +
        `Update the dispatcher's terminal assignment in User Management first.`,
      );
    }

    const terminal = await this.prisma.terminal.findUnique({
      where: { id: data.terminalId },
    });
    if (!terminal) {
      throw new BadRequestException('Terminal not found.');
    }

    // ── Validate route belongs to the terminal ─────────────────────────────
    const route = await this.prisma.route.findUnique({
      where: { id: data.routeId },
      include: { sourceTerminal: true },
    });
    if (!route) {
      throw new BadRequestException('Route not found.');
    }
    if (route.sourceTerminalId !== data.terminalId) {
      throw new BadRequestException(
        `Route "${route.code}" does not belong to terminal "${terminal.name}". ` +
        `Only routes originating from "${terminal.name}" can be assigned to its dispatchers.`,
      );
    }

    // Check for exact duplicate
    const exactMatch = await this.prisma.rosterDispatcherAssignment.findFirst({
      where: {
        rosterId: activeRoster.id,
        dispatcherId: dispatcher.id,
        routeId: route.id,
        terminalId: terminal.id,
      },
    });

    if (exactMatch) {
      return exactMatch;
    }

    return this.prisma.rosterDispatcherAssignment.create({
      data: {
        rosterId: activeRoster.id,
        dispatcherId: dispatcher.id,
        terminalId: terminal.id,
        routeId: route.id,
      },
    });
  }

  // ── Remove a dispatcher assignment ────────────────────────────────────────
  async removeDispatcherAssignment(assignmentId: string) {
    const assignment = await this.prisma.rosterDispatcherAssignment.findUnique({
      where: { id: assignmentId },
      include: { roster: true },
    });
    if (!assignment) {
      throw new BadRequestException('Assignment not found.');
    }
    if (assignment.roster.isFinalized) {
      throw new BadRequestException('Cannot remove assignment from a finalized roster.');
    }
    return this.prisma.rosterDispatcherAssignment.delete({ where: { id: assignmentId } });
  }

  // ── Get all dispatcher assignments on a roster ────────────────────────────
  async getDispatcherAssignments(rosterId?: string) {
    let targetRosterId = rosterId;
    if (!targetRosterId) {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (!activeRoster) return [];
      targetRosterId = activeRoster.id;
    }

    return this.prisma.rosterDispatcherAssignment.findMany({
      where: { rosterId: targetRosterId },
      include: {
        dispatcher: { select: { id: true, username: true, email: true } },
        terminal: { select: { id: true, name: true, code: true } },
        route: {
          select: { id: true, code: true, sourceTerminal: true, destinationTerminal: true }
        },
      },
    });
  }

  // ── Get the current dispatcher's own assignments ──────────────────────────
  async getMyDispatcherAssignments(dispatcherId: string) {
    const activeRoster = await this.prisma.roster.findFirst({
      where: { isActive: true },
      include: { _count: { select: { vehicleAssignments: true } } },
    });

    const assignments = activeRoster
      ? await this.prisma.rosterDispatcherAssignment.findMany({
          where: { rosterId: activeRoster.id, dispatcherId },
          include: {
            terminal: true,
            route: {
              include: { sourceTerminal: true, destinationTerminal: true },
            },
            roster: { select: { id: true, name: true, weekNumber: true, startDate: true, endDate: true, isActive: true } },
          },
        })
      : [];

    return {
      roster: activeRoster
        ? {
            id: activeRoster.id,
            name: (activeRoster as any).name,
            weekNumber: activeRoster.weekNumber,
            startDate: activeRoster.startDate,
            endDate: activeRoster.endDate,
            isActive: activeRoster.isActive,
          }
        : null,
      assignments: assignments.map((a) => ({
        id: a.id,
        terminal: {
          id: a.terminal.id,
          name: a.terminal.name,
          code: a.terminal.code,
          location: (a.terminal as any).location || null,
        },
        route: {
          id: a.route.id,
          code: a.route.code,
          origin: (a.route as any).origin || a.route.sourceTerminal?.name || '',
          destination: (a.route as any).destination || a.route.destinationTerminal?.name || '',
          baseFareETB: (a.route as any).baseFareETB || null,
        },
      })),
    };
  }

  // ── Swap routes between two dispatchers ──────────────────────────────────
  async swapRoutes(assignmentId1: string, assignmentId2: string) {
    const a1 = await this.prisma.rosterDispatcherAssignment.findUnique({ where: { id: assignmentId1 }, include: { roster: true } });
    const a2 = await this.prisma.rosterDispatcherAssignment.findUnique({ where: { id: assignmentId2 }, include: { roster: true } });

    if (!a1 || !a2) {
      throw new BadRequestException('One or both assignments not found.');
    }
    if (a1.rosterId !== a2.rosterId) {
      throw new BadRequestException('Assignments must belong to the same roster to swap.');
    }
    if (a1.roster.isFinalized || a2.roster.isFinalized) {
      throw new BadRequestException('Cannot swap routes on a finalized roster.');
    }

    return this.prisma.$transaction([
      this.prisma.rosterDispatcherAssignment.update({
        where: { id: a1.id },
        data: { routeId: a2.routeId },
      }),
      this.prisma.rosterDispatcherAssignment.update({
        where: { id: a2.id },
        data: { routeId: a1.routeId },
      }),
    ]);
  }

  // ── Bulk assign vehicles ──────────────────────────────────────────────────
  async bulkAssignVehicles(data: { vehicleIds: string[]; terminalId: string; routeId: string; rosterId: string }) {
    const { vehicleIds, terminalId, routeId, rosterId } = data;
    const roster = await this.prisma.roster.findUnique({ where: { id: rosterId } });
    if (!roster) throw new BadRequestException('Roster not found');
    if (roster.isFinalized) throw new BadRequestException('Cannot modify a finalized roster.');

    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!terminal) throw new BadRequestException('Terminal not found');

    const route = await this.prisma.route.findUnique({ where: { id: routeId } });
    if (!route) throw new BadRequestException('Route not found');

    for (const vehicleId of vehicleIds) {
      const vehicle = await this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        include: { group: true }
      });
      if (!vehicle || !vehicle.groupId) continue;

      const conflicting = await this.prisma.rosterVehicleAssignment.findFirst({
        where: {
          rosterId,
          vehicle: {
            groupId: vehicle.groupId,
            id: { notIn: vehicleIds }
          },
          OR: [
            { terminalId: { not: terminalId } },
            { routeId: { not: routeId } }
          ]
        },
        include: {
          vehicle: true,
          terminal: true,
          route: true
        }
      });

      if (conflicting) {
        throw new BadRequestException(
          `All vehicles in group "${vehicle.group?.name}" must be assigned to the same route and terminal for this week. ` +
          `Vehicle "${conflicting.vehicle.plateNumber}" in this group is already assigned to Route "${conflicting.route.code}" at "${conflicting.terminal.name}".`
        );
      }
    }

    let assignedCount = 0;
    for (const vehicleId of vehicleIds) {
      const existing = await this.prisma.rosterVehicleAssignment.findFirst({
        where: { rosterId, vehicleId }
      });
      
      if (existing) {
        await this.prisma.rosterVehicleAssignment.update({
          where: { id: existing.id },
          data: { terminalId, routeId }
        });
      } else {
        await this.prisma.rosterVehicleAssignment.create({
          data: { rosterId, vehicleId, terminalId, routeId }
        });
      }
      assignedCount++;
    }
    return { success: true, assignedCount };
  }

  // ── Assign vehicle to route with a violation flag ─────────────────────────
  async assignVehicleWithViolation(data: { vehicleId: string; terminalId: string; routeId: string }) {
    const activeRoster = await this.prisma.roster.findFirst({
      where: { isActive: true },
    });

    if (!activeRoster) {
      throw new BadRequestException('No active roster found.');
    }

    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!vehicle) throw new BadRequestException('Vehicle not found.');

    const route = await this.prisma.route.findUnique({ where: { id: data.routeId } });
    if (!route) throw new BadRequestException('Route not found.');

    const terminal = await this.prisma.terminal.findUnique({ where: { id: data.terminalId } });
    if (!terminal) throw new BadRequestException('Terminal not found.');

    if (vehicle.groupId) {
      const conflicting = await this.prisma.rosterVehicleAssignment.findFirst({
        where: {
          rosterId: activeRoster.id,
          vehicle: {
            groupId: vehicle.groupId,
            id: { not: vehicle.id }
          },
          OR: [
            { terminalId: { not: terminal.id } },
            { routeId: { not: route.id } }
          ]
        },
        include: {
          vehicle: true,
          terminal: true,
          route: true
        }
      });

      if (conflicting) {
        const vehicleGroup = await this.prisma.vehicleGroup.findUnique({ where: { id: vehicle.groupId } });
        throw new BadRequestException(
          `All vehicles in group "${vehicleGroup?.name}" must be assigned to the same route and terminal for this week. ` +
          `Vehicle "${conflicting.vehicle.plateNumber}" in this group is already assigned to Route "${conflicting.route.code}" at "${conflicting.terminal.name}".`
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.rosterVehicleAssignment.create({
        data: {
          rosterId: activeRoster.id,
          vehicleId: vehicle.id,
          routeId: route.id,
          terminalId: terminal.id,
        },
      });

      const violation = await tx.violationRecord.create({
        data: {
          vehicleId: vehicle.id,
          violationType: 'ROUTE_HOPPING',
          details: `Manually added to route ${route.code} (${terminal.name}) with a violation flag.`,
          severityScore: 50,
        },
      });

      return { assignment, violation };
    });
  }

  // ── Weekly Roster Generation with per-terminal round-robin rotation ────────
  async generateWeeklyRoster(data: {
    startDate: Date;
    endDate: Date;
    weekNumber: number;
    terminalId?: string;
    preview?: boolean;
  }) {
    const { startDate, endDate, weekNumber, terminalId, preview } = data;

    // 1. Check for existing roster
    const rosterExists = await this.prisma.roster.findFirst({
      where: { weekNumber },
    });

    if (rosterExists && rosterExists.isFinalized && !preview) {
      throw new BadRequestException('Roster for this week is already finalized.');
    }

    // 2. Get all active terminals (or just the one selected)
    const terminals = terminalId
      ? await this.prisma.terminal.findMany({ where: { id: terminalId, isActive: true } })
      : await this.prisma.terminal.findMany({ where: { isActive: true } });

    if (preview) {
      const previewResult = await this._buildRotationPlan(terminals, weekNumber, rosterExists?.id);
      return {
        preview: true,
        weekNumber,
        startDate,
        endDate,
        ...previewResult,
      };
    }

    // ── Real Generation ──────────────────────────────────────────────────────
    let roster = rosterExists;
    if (!roster) {
      roster = await this.prisma.roster.create({
        data: {
          name: `Week ${weekNumber} – ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
          weekNumber,
          startDate,
          endDate,
          isActive: false,
          isFinalized: false,
        },
      });
    } else {
      roster = await this.prisma.roster.update({
        where: { id: roster.id },
        data: { startDate, endDate },
      });
    }

    let assignedVehiclesCount = 0;
    let assignedGroupsCount = 0;

    // 3. For each terminal, compute rotation and assign groups
    for (const terminal of terminals) {
      // Get routes originating from this terminal
      const routes = await this.prisma.route.findMany({
        where: { sourceTerminalId: terminal.id, isActive: true },
        orderBy: { code: 'asc' },
      });

      if (routes.length === 0) continue;

      // Get all vehicle groups that have at least one active vehicle
      const vehicleGroups = await this.prisma.vehicleGroup.findMany({
        where: {
          vehicles: { some: { status: 'ACTIVE' } },
        },
        orderBy: { name: 'asc' },
        include: { vehicles: { where: { status: 'ACTIVE' } } },
      });

      if (vehicleGroups.length === 0) continue;

      // Find last rotation index for this terminal (from the most recent finalized roster)
      const lastRotation = await this.prisma.vehicleGroupRotation.findFirst({
        where: {
          terminalId: terminal.id,
          roster: { isFinalized: true, weekNumber: { lt: weekNumber } },
        },
        orderBy: { roster: { weekNumber: 'desc' } },
        select: { rotationIndex: true },
      });

      const nextRotationIndex = lastRotation ? lastRotation.rotationIndex + 1 : 0;
      const numRoutes = routes.length;

      // 4. Assign each group to a route via round-robin
      for (let gi = 0; gi < vehicleGroups.length; gi++) {
        const group = vehicleGroups[gi];
        const routeIndex = (gi + nextRotationIndex) % numRoutes;
        const route = routes[routeIndex];

        // Upsert VehicleGroupRotation record
        await this.prisma.vehicleGroupRotation.upsert({
          where: {
            rosterId_vehicleGroupId_terminalId: {
              rosterId: roster.id,
              vehicleGroupId: group.id,
              terminalId: terminal.id,
            },
          },
          update: { routeId: route.id, rotationIndex: nextRotationIndex },
          create: {
            rosterId: roster.id,
            vehicleGroupId: group.id,
            routeId: route.id,
            terminalId: terminal.id,
            rotationIndex: nextRotationIndex,
          },
        });

        assignedGroupsCount++;

        // 5. Create RosterVehicleAssignment for each vehicle in the group
        for (const vehicle of group.vehicles) {
          const existing = await this.prisma.rosterVehicleAssignment.findFirst({
            where: { rosterId: roster.id, vehicleId: vehicle.id },
          });

          if (!existing) {
            await this.prisma.rosterVehicleAssignment.create({
              data: {
                rosterId: roster.id,
                vehicleId: vehicle.id,
                routeId: route.id,
                terminalId: terminal.id,
              },
            });
            assignedVehiclesCount++;
          }
        }
      }

      // 6. Carry forward vehicles NOT in any group (from last assignment)
      const ungroupedVehicles = await this.prisma.vehicle.findMany({
        where: { status: 'ACTIVE', groupId: null },
      });

      for (const vehicle of ungroupedVehicles) {
        const existingAssignment = await this.prisma.rosterVehicleAssignment.findFirst({
          where: { rosterId: roster.id, vehicleId: vehicle.id },
        });
        if (existingAssignment) { assignedVehiclesCount++; continue; }

        const lastAssignment = await this.prisma.rosterVehicleAssignment.findFirst({
          where: { vehicleId: vehicle.id, NOT: { rosterId: roster.id } },
          orderBy: { createdAt: 'desc' },
        });

        if (lastAssignment) {
          await this.prisma.rosterVehicleAssignment.create({
            data: {
              rosterId: roster.id,
              vehicleId: vehicle.id,
              routeId: lastAssignment.routeId,
              terminalId: lastAssignment.terminalId,
            },
          });
          assignedVehiclesCount++;
        }
      }
    }

    // 7. Auto-assign dispatchers based on terminal assignments
    let assignedDispatchersCount = 0;
    const dispatchers = await this.prisma.user.findMany({
      where: { roleName: 'DISPATCHER', isActive: true },
      include: { terminalAssignments: true },
    });

    for (const dispatcher of dispatchers) {
      for (const termAssignment of dispatcher.terminalAssignments) {
        const targetTerminal = terminals.find((t) => t.id === termAssignment.terminalId);
        if (!targetTerminal) continue;

        const terminalRoute = await this.prisma.terminalRoute.findFirst({
          where: { terminalId: termAssignment.terminalId },
        });

        if (terminalRoute) {
          // Validate route belongs to terminal
          const route = await this.prisma.route.findFirst({
            where: { id: terminalRoute.routeId, sourceTerminalId: termAssignment.terminalId },
          });
          if (!route) continue;

          const exists = await this.prisma.rosterDispatcherAssignment.findFirst({
            where: {
              rosterId: roster.id,
              dispatcherId: dispatcher.id,
              routeId: terminalRoute.routeId,
              terminalId: termAssignment.terminalId,
            },
          });

          if (!exists) {
            await this.prisma.rosterDispatcherAssignment.create({
              data: {
                rosterId: roster.id,
                dispatcherId: dispatcher.id,
                routeId: terminalRoute.routeId,
                terminalId: termAssignment.terminalId,
              },
            });
            assignedDispatchersCount++;
          }
        }
      }
    }

    return { roster, assignedVehiclesCount, assignedGroupsCount, assignedDispatchersCount };
  }

  // ── Build rotation preview plan (no DB writes) ───────────────────────────
  private async _buildRotationPlan(
    terminals: any[],
    weekNumber: number,
    existingRosterId?: string,
  ) {
    const rotationPlan: any[] = [];
    let totalVehicles = 0;
    let totalGroups = 0;

    for (const terminal of terminals) {
      const routes = await this.prisma.route.findMany({
        where: { sourceTerminalId: terminal.id, isActive: true },
        orderBy: { code: 'asc' },
        include: { destinationTerminal: { select: { name: true } } },
      });

      if (routes.length === 0) continue;

      const vehicleGroups = await this.prisma.vehicleGroup.findMany({
        where: { vehicles: { some: { status: 'ACTIVE' } } },
        orderBy: { name: 'asc' },
        include: { vehicles: { where: { status: 'ACTIVE' }, select: { id: true, plateNumber: true } } },
      });

      if (vehicleGroups.length === 0) continue;

      const lastRotation = await this.prisma.vehicleGroupRotation.findFirst({
        where: {
          terminalId: terminal.id,
          roster: { isFinalized: true, weekNumber: { lt: weekNumber } },
        },
        orderBy: { roster: { weekNumber: 'desc' } },
        select: { rotationIndex: true },
      });

      const nextRotationIndex = lastRotation ? lastRotation.rotationIndex + 1 : 0;
      const numRoutes = routes.length;

      const terminalPlan: any[] = [];
      for (let gi = 0; gi < vehicleGroups.length; gi++) {
        const group = vehicleGroups[gi];
        const routeIndex = (gi + nextRotationIndex) % numRoutes;
        const route = routes[routeIndex];

        terminalPlan.push({
          groupId: group.id,
          groupName: group.name,
          vehicleCount: group.vehicles.length,
          routeId: route.id,
          routeCode: route.code,
          routeDestination: (route as any).destinationTerminal?.name ?? 'Unknown',
        });

        totalGroups++;
        totalVehicles += group.vehicles.length;
      }

      rotationPlan.push({
        terminalId: terminal.id,
        terminalName: terminal.name,
        terminalCode: terminal.code,
        rotationIndex: nextRotationIndex,
        assignments: terminalPlan,
      });
    }

    return {
      assignmentsCount: totalVehicles,
      groupsCount: totalGroups,
      rotationPlan,
    };
  }

  // ── Get rotation history for a terminal ─────────────────────────────────
  async getRotationHistory(terminalId: string) {
    return this.prisma.vehicleGroupRotation.findMany({
      where: { terminalId },
      include: {
        roster: { select: { id: true, name: true, weekNumber: true, isFinalized: true, isActive: true } },
        vehicleGroup: { select: { id: true, name: true } },
        route: {
          select: {
            id: true,
            code: true,
            destinationTerminal: { select: { name: true } },
          },
        },
      },
      orderBy: { roster: { weekNumber: 'desc' } },
    });
  }

  // ── Get all rosters ──────────────────────────────────────────────────────
  async getRosters() {
    return this.prisma.roster.findMany({
      orderBy: { weekNumber: 'desc' },
      include: {
        _count: {
          select: {
            vehicleAssignments: true,
            dispatcherAssignments: true,
          },
        },
        groupRotations: {
          include: {
            vehicleGroup: { select: { name: true } },
            route: { select: { code: true } },
            terminal: { select: { name: true, code: true } },
          },
        },
      },
    });
  }

  // ── Activate a roster ────────────────────────────────────────────────────
  async activateRoster(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.roster.updateMany({ data: { isActive: false } });
      return tx.roster.update({
        where: { id },
        data: { isActive: true },
      });
    });
  }

  // ── Finalize a roster ────────────────────────────────────────────────────
  async finalizeRoster(id: string) {
    return this.prisma.roster.update({
      where: { id },
      data: { isFinalized: true },
    });
  }

  // ── Publish a roster (finalize + activate in one operation) ───────────────
  async publishRoster(id: string) {
    const roster = await this.prisma.roster.findUnique({ where: { id } });
    if (!roster) throw new BadRequestException('Roster not found.');

    return this.prisma.$transaction(async (tx) => {
      // Deactivate all others
      await tx.roster.updateMany({ data: { isActive: false } });
      // Finalize and activate this one
      return tx.roster.update({
        where: { id },
        data: { isFinalized: true, isActive: true },
      });
    });
  }
}
