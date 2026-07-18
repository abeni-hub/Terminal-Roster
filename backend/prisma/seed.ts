import 'dotenv/config';
import {
  PrismaClient,
  RoleName,
  VehicleStatus,
  QueueStatus,
  OverrideType,
  ViolationType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

const rawUrl  = process.env.DATABASE_URL ?? '';
const pgUrl   = rawUrl.split('?')[0];
const pool    = new Pool({ connectionString: pgUrl });
const adapter = new PrismaPg(pool, { schema: 'public' });
const prisma  = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding AATDRS (3-role system)...');

  // ── 0. CLEAN ──────────────────────────────────────────────────────────────
  await prisma.reconciliationReport.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.overrideLog.deleteMany({});
  await prisma.queueEntry.deleteMany({});
  await prisma.dispatchRecord.deleteMany({});
  await prisma.violationRecord.deleteMany({});
  await prisma.deviceBinding.deleteMany({});
  await prisma.rosterDispatcherAssignment.deleteMany({});
  await prisma.rosterVehicleAssignment.deleteMany({});
  await prisma.roster.deleteMany({});
  await prisma.terminalRoute.deleteMany({});
  await prisma.userTerminalAssignment.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.vehicleGroup.deleteMany({});
  await prisma.route.deleteMany({});
  await prisma.terminal.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await (prisma as any).settings?.deleteMany({});
  console.log('  ✔ Existing data cleared.');

  // ── 1. USERS (3 — one per role) ──────────────────────────────────────────
  const hash = (pw: string) => bcrypt.hash(pw, 10);

  const [sysAdmin, planner, dispatcher] = await Promise.all([
    prisma.user.create({
      data: {
        username:     'system_admin',
        email:        'admin@aatdrs.gov.et',
        passwordHash: await hash('Admin@1234'),
        pinHash:      await hash('112233'),
        roleName:     RoleName.SYSTEM_ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        username:     'planner_kebede',
        email:        'kebede.planner@aatdrs.gov.et',
        passwordHash: await hash('Planner@1234'),
        pinHash:      await hash('445566'),
        roleName:     RoleName.MUNICIPAL_PLANNER,
      },
    }),
    prisma.user.create({
      data: {
        username:     'dispatcher_abebe',
        email:        'abebe@aatdrs.gov.et',
        passwordHash: await hash('Disp@1234'),
        pinHash:      await hash('998877'),
        roleName:     RoleName.DISPATCHER,
      },
    }),
  ]);
  console.log('  ✔ Users seeded (3).');

  // ── 2. TERMINALS ──────────────────────────────────────────────────────────
  const [megenagna, merkato, kaliti, piassa, bole, saris, aratKilo] = await Promise.all([
    prisma.terminal.create({ data: { name: 'Megenagna Taxi Terminal', code: 'MEG-01', location: '9.0223,38.8021' } }),
    prisma.terminal.create({ data: { name: 'Merkato Taxi Terminal',  code: 'MRK-02', location: '9.0357,38.7469' } }),
    prisma.terminal.create({ data: { name: 'Kaliti Taxi Terminal',   code: 'KAL-03', location: '8.9502,38.7936' } }),
    prisma.terminal.create({ data: { name: 'Piassa Taxi Terminal',   code: 'PIA-04', location: '9.0374,38.7573' } }),
    prisma.terminal.create({ data: { name: 'Bole Taxi Terminal',     code: 'BOL-05', location: '8.9892,38.7884' } }),
    prisma.terminal.create({ data: { name: 'Saris Taxi Terminal',    code: 'SAR-06', location: '8.9511,38.7612' } }),
    prisma.terminal.create({ data: { name: 'Arat Kilo Taxi Terminal',code: 'ARA-07', location: '9.0366,38.7630' } }),
  ]);
  console.log('  ✔ Terminals seeded (5).');

  // Assign dispatcher to Megenagna
  await prisma.userTerminalAssignment.create({
    data: { userId: dispatcher.id, terminalId: megenagna.id },
  });
  console.log('  ✔ Dispatcher assigned to Megenagna.');

  // ── 3. ROUTES ─────────────────────────────────────────────────────────────
  const [routeMegBole, routeMegPiassa, routeMrkPiassa, routeKalSaris, routePiaAratKilo] =
    await Promise.all([
      prisma.route.create({ data: { code: 'R-001', sourceTerminalId: megenagna.id, destinationTerminalId: bole.id,      baseFareETB: 15.00 } }),
      prisma.route.create({ data: { code: 'R-002', sourceTerminalId: megenagna.id, destinationTerminalId: piassa.id,    baseFareETB: 20.00 } }),
      prisma.route.create({ data: { code: 'R-003', sourceTerminalId: merkato.id,   destinationTerminalId: piassa.id,    baseFareETB: 18.00 } }),
      prisma.route.create({ data: { code: 'R-004', sourceTerminalId: kaliti.id,    destinationTerminalId: saris.id,     baseFareETB: 12.00 } }),
      prisma.route.create({ data: { code: 'R-005', sourceTerminalId: piassa.id,    destinationTerminalId: aratKilo.id, baseFareETB: 10.00 } }),
    ]);
  console.log('  ✔ Routes seeded (5).');

  // ── 4. TERMINAL → ROUTE LINKS ─────────────────────────────────────────────
  await prisma.terminalRoute.createMany({
    data: [
      { terminalId: megenagna.id, routeId: routeMegBole.id     },
      { terminalId: megenagna.id, routeId: routeMegPiassa.id   },
      { terminalId: merkato.id,   routeId: routeMrkPiassa.id   },
      { terminalId: kaliti.id,    routeId: routeKalSaris.id    },
      { terminalId: piassa.id,    routeId: routePiaAratKilo.id },
    ],
  });
  console.log('  ✔ Terminal-route links seeded (5).');

  // ── 4.5. VEHICLE GROUPS ───────────────────────────────────────────────────
  const groupA = await prisma.vehicleGroup.create({
    data: {
      name: 'Group A - Megenagna to Bole',
      description: 'Vehicles assigned to Bole route',
    }
  });

  const groupB = await prisma.vehicleGroup.create({
    data: {
      name: 'Group B - Megenagna to Piassa',
      description: 'Vehicles assigned to Piassa route',
    }
  });

  const groupC = await prisma.vehicleGroup.create({
    data: {
      name: 'Group C - Merkato to Piassa',
      description: 'Vehicles assigned to Merkato route',
    }
  });

  const groupD = await prisma.vehicleGroup.create({
    data: {
      name: 'Group D - Kaliti to Saris',
      description: 'Vehicles assigned to Saris route',
    }
  });
  console.log('  ✔ Vehicle groups seeded (4).');

  // ── 5. VEHICLES (12 from government CSV) ──────────────────────────────────
  const vehicleRows = [
    { plateNumber: 'AA-2-B44910', ownerName: 'Bekele Alemu',     ownerPhone: '+251911000001', groupId: groupA.id },
    { plateNumber: 'AA-2-C29918', ownerName: 'Chalew Demissie',  ownerPhone: '+251911000002', groupId: groupA.id },
    { plateNumber: 'AA-2-A77615', ownerName: 'Abebe Worku',      ownerPhone: '+251911000003', groupId: groupA.id },
    { plateNumber: 'CODE2-89012', ownerName: 'Tesfaye Girma',    ownerPhone: '+251911000004', groupId: groupB.id },
    { plateNumber: 'AA-2-B9988',  ownerName: 'Birtukan Hailu',   ownerPhone: '+251911000005', groupId: groupB.id },
    { plateNumber: 'AA-2-X1122',  ownerName: 'Xinare Kebede',    ownerPhone: '+251911000006', groupId: groupB.id },
    { plateNumber: 'AA-2-E7890',  ownerName: 'Eden Tadesse',     ownerPhone: '+251911000011', groupId: groupC.id },
    { plateNumber: 'AA-2-F2345',  ownerName: 'Fikir Muleta',     ownerPhone: '+251911000012', groupId: groupC.id },
    { plateNumber: 'AA-3-A1234',  ownerName: 'Amara Tefera',     ownerPhone: '+251911000007', groupId: groupC.id },
    { plateNumber: 'AA-3-B5678',  ownerName: 'Belaynesh Assefa', ownerPhone: '+251911000008', groupId: groupD.id },
    { plateNumber: 'AA-4-C9012',  ownerName: 'Chernet Desta',    ownerPhone: '+251911000009', groupId: groupD.id },
    { plateNumber: 'AA-5-D3456',  ownerName: 'Dereje Fekadu',    ownerPhone: '+251911000010', groupId: groupD.id },
  ];
  const createdVehicles = await Promise.all(
    vehicleRows.map(v => prisma.vehicle.create({ data: { ...v, capacity: 12, status: VehicleStatus.ACTIVE } })),
  );
  const vByPlate = (plate: string) => {
    const v = createdVehicles.find(x => x.plateNumber === plate);
    if (!v) throw new Error(`Vehicle not found: ${plate}`);
    return v;
  };
  console.log('  ✔ Vehicles seeded (12).');

  // ── 6. WEEKLY ROSTERS & ASSIGNMENTS (Week 24) ─────────────────────────────
  const nowTime = new Date();
  const validFrom = new Date(nowTime);
  validFrom.setDate(nowTime.getDate() - 3);
  validFrom.setUTCHours(0, 0, 0, 0);

  const validUntil = new Date(nowTime);
  validUntil.setDate(nowTime.getDate() + 4);
  validUntil.setUTCHours(23, 59, 59, 999);

  const roster = await prisma.roster.create({
    data: {
      name: `Week 24 – ${validFrom.toISOString().slice(0, 10)} to ${validUntil.toISOString().slice(0, 10)}`,
      weekNumber: 24,
      startDate: validFrom,
      endDate: validUntil,
      isActive: true,
    },
  });

  await prisma.rosterVehicleAssignment.createMany({
    data: [
      { rosterId: roster.id, vehicleId: vByPlate('AA-2-B44910').id, routeId: routeMegBole.id, terminalId: megenagna.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-2-C29918').id, routeId: routeMegBole.id, terminalId: megenagna.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-2-A77615').id, routeId: routeMegBole.id, terminalId: megenagna.id },
      { rosterId: roster.id, vehicleId: vByPlate('CODE2-89012').id, routeId: routeMegBole.id, terminalId: megenagna.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-2-B9988').id,  routeId: routeMegBole.id, terminalId: megenagna.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-2-X1122').id,  routeId: routeMegBole.id, terminalId: megenagna.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-3-A1234').id,  routeId: routeMrkPiassa.id, terminalId: merkato.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-3-B5678').id,  routeId: routeMrkPiassa.id, terminalId: merkato.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-4-C9012').id,  routeId: routeKalSaris.id, terminalId: kaliti.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-5-D3456').id,  routeId: routePiaAratKilo.id, terminalId: piassa.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-2-E7890').id,  routeId: routeMegBole.id, terminalId: megenagna.id },
      { rosterId: roster.id, vehicleId: vByPlate('AA-2-F2345').id,  routeId: routeMegBole.id, terminalId: megenagna.id },
    ],
  });
  console.log('  ✔ Weekly rosters and vehicle assignments seeded.');

  // Assign dispatcher to terminal/route
  await prisma.rosterDispatcherAssignment.create({
    data: {
      rosterId: roster.id,
      dispatcherId: dispatcher.id,
      routeId: routeMegBole.id,
      terminalId: megenagna.id,
    },
  });
  console.log('  ✔ Roster dispatcher assignments seeded.');

  // ── 8. QUEUE ENTRIES (demo) ───────────────────────────────────────────────
  const [queueA, queueB] = await Promise.all([
    prisma.queueEntry.create({
      data: { terminalId: megenagna.id, routeId: routeMegBole.id, vehicleId: vByPlate('AA-2-B44910').id, sequence: 1, status: QueueStatus.WAITING, syncId: 'sync-q-001' },
    }),
    prisma.queueEntry.create({
      data: { terminalId: megenagna.id, routeId: routeMegBole.id, vehicleId: vByPlate('AA-2-C29918').id, sequence: 2, status: QueueStatus.WAITING, syncId: 'sync-q-002' },
    }),
  ]);
  console.log('  ✔ Queue entries seeded (2).');

  // ── 9. DISPATCH RECORDS ───────────────────────────────────────────────────
  await prisma.dispatchRecord.createMany({
    data: [
      { terminalId: megenagna.id, routeId: routeMegBole.id,   vehicleId: vByPlate('AA-2-A77615').id, dispatcherId: dispatcher.id, checkInTime: new Date('2026-03-17T08:00:00Z'), fareChargedETB: 15.00, municipalCommission: 10.00, platformCommission: 1.00, isReconciled: true,  syncId: 'sync-d-001' },
      { terminalId: megenagna.id, routeId: routeMegPiassa.id, vehicleId: vByPlate('CODE2-89012').id, dispatcherId: dispatcher.id, checkInTime: new Date('2026-03-17T09:00:00Z'), fareChargedETB: 20.00, municipalCommission: 10.00, platformCommission: 1.00, isReconciled: false, syncId: 'sync-d-002' },
    ],
  });
  console.log('  ✔ Dispatch records seeded (2).');

  // ── 10. OVERRIDE LOGS ─────────────────────────────────────────────────────
  await prisma.overrideLog.create({
    data: { queueEntryId: queueA.id, supervisorId: sysAdmin.id, overrideType: OverrideType.VEHICLE_SKIP, reason: 'Driver absent - manual skip.', signature: 'SIG-ADMIN-20260601' },
  });
  console.log('  ✔ Override log seeded (1).');

  // ── 11. VIOLATION RECORDS ─────────────────────────────────────────────────
  await prisma.violationRecord.create({
    data: { vehicleId: vByPlate('AA-2-B44910').id, violationType: ViolationType.ROUTE_HOPPING, details: 'Vehicle detected at unauthorized terminal.', severityScore: 3 },
  });
  console.log('  ✔ Violation record seeded (1).');

  // ── 12. AUDIT LOGS ────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { userId: sysAdmin.id,   action: 'USER_CREATED',       details: 'System admin created dispatcher account abebe@aatdrs.gov.et', ipAddress: '192.168.1.10' },
      { userId: dispatcher.id, action: 'VEHICLE_DISPATCHED', details: 'Dispatcher dispatched AA-2-A77615 on route R-001',            ipAddress: '192.168.1.30' },
    ],
  });
  console.log('  ✔ Audit logs seeded (2).');

  // ── 13. DEVICE BINDING ────────────────────────────────────────────────────
  await prisma.deviceBinding.create({
    data: { terminalId: megenagna.id, deviceUuid: 'device-uuid-12345', publicKey: 'ssh-rsa AAAA...dispatcher-tablet==', isApproved: true },
  });
  console.log('  ✔ Device binding seeded (1).');

  // ── 14. SETTINGS ──────────────────────────────────────────────────────────
  try {
    await (prisma as any).settings.createMany({
      data: [
        { key: 'PLATFORM_NAME',         value: 'Addis Ababa Terminal Digital Roster',  description: 'System display name' },
        { key: 'DISPATCH_COMMISSION',   value: '10.00',                                description: 'Municipal commission per dispatch (ETB)' },
        { key: 'PLATFORM_COMMISSION',   value: '1.00',                                 description: 'Platform fee per dispatch (ETB)' },
        { key: 'MAX_QUEUE_PER_ROUTE',   value: '50',                                   description: 'Maximum vehicles allowed in queue per route' },
        { key: 'OFFLINE_SYNC_INTERVAL', value: '60',                                   description: 'Offline sync retry interval (seconds)' },
      ],
    });
    console.log('  ✔ System settings seeded (5).');
  } catch (e) {
    console.log('  ⚠ Settings table not yet migrated — skipping.');
  }

  // ── 15. RECONCILIATION REPORTS ────────────────────────────────────────────
  await prisma.reconciliationReport.createMany({
    data: [
      { startDate: new Date('2026-06-01T00:00:00Z'), endDate: new Date('2026-06-07T23:59:59Z'), terminalId: megenagna.id, totalDispatches: 124, totalMunicipalComm: 1240.00, totalPlatformComm: 124.00, status: 'APPROVED' },
      { startDate: new Date('2026-06-08T00:00:00Z'), endDate: new Date('2026-06-14T23:59:59Z'), terminalId: merkato.id,   totalDispatches: 98,  totalMunicipalComm: 980.00,  totalPlatformComm: 98.00,  status: 'PENDING'  },
    ],
  });
  console.log('  ✔ Reconciliation reports seeded (2).');

  console.log('\n🎉 Seeding complete!\n');
  console.log('📋 Credentials:');
  console.log('  SYSTEM_ADMIN      → system_admin     / Admin@1234');
  console.log('  MUNICIPAL_PLANNER → planner_kebede   / Planner@1234');
  console.log('  DISPATCHER        → dispatcher_abebe / Disp@1234');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
