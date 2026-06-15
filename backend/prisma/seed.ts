import 'dotenv/config';
import {
  PrismaClient,
  RoleName,
  VehicleStatus,
  QueueStatus,
  OverrideType,
  ViolationType,
  AssignmentStatus,
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
  await prisma.vehicleSchedule.deleteMany({});
  await prisma.vehicleRouteAssignment.deleteMany({});
  await prisma.terminalRoute.deleteMany({});
  await prisma.userTerminalAssignment.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.terminal.deleteMany({});
  await prisma.route.deleteMany({});
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
  const [megenagna, merkato, kaliti, piassa, bole] = await Promise.all([
    prisma.terminal.create({ data: { name: 'Megenagna Taxi Terminal', code: 'MEG-01', location: '9.0223,38.8021' } }),
    prisma.terminal.create({ data: { name: 'Merkato Taxi Terminal',  code: 'MRK-02', location: '9.0357,38.7469' } }),
    prisma.terminal.create({ data: { name: 'Kaliti Taxi Terminal',   code: 'KAL-03', location: '8.9502,38.7936' } }),
    prisma.terminal.create({ data: { name: 'Piassa Taxi Terminal',   code: 'PIA-04', location: '9.0374,38.7573' } }),
    prisma.terminal.create({ data: { name: 'Bole Taxi Terminal',     code: 'BOL-05', location: '8.9892,38.7884' } }),
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
      prisma.route.create({ data: { code: 'R-001', origin: 'Megenagna', destination: 'Bole',      baseFareETB: 15.00 } }),
      prisma.route.create({ data: { code: 'R-002', origin: 'Megenagna', destination: 'Piassa',    baseFareETB: 20.00 } }),
      prisma.route.create({ data: { code: 'R-003', origin: 'Merkato',   destination: 'Piassa',    baseFareETB: 18.00 } }),
      prisma.route.create({ data: { code: 'R-004', origin: 'Kaliti',    destination: 'Saris',     baseFareETB: 12.00 } }),
      prisma.route.create({ data: { code: 'R-005', origin: 'Piassa',    destination: 'Arat Kilo', baseFareETB: 10.00 } }),
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

  // ── 5. VEHICLES (12 from government CSV) ──────────────────────────────────
  const vehicleRows = [
    { plateNumber: 'AA-2-B44910', ownerName: 'Bekele Alemu',     ownerPhone: '+251911000001' },
    { plateNumber: 'AA-2-C29918', ownerName: 'Chalew Demissie',  ownerPhone: '+251911000002' },
    { plateNumber: 'AA-2-A77615', ownerName: 'Abebe Worku',      ownerPhone: '+251911000003' },
    { plateNumber: 'CODE2-89012', ownerName: 'Tesfaye Girma',    ownerPhone: '+251911000004' },
    { plateNumber: 'AA-2-B9988',  ownerName: 'Birtukan Hailu',   ownerPhone: '+251911000005' },
    { plateNumber: 'AA-2-X1122',  ownerName: 'Xinare Kebede',    ownerPhone: '+251911000006' },
    { plateNumber: 'AA-2-E7890',  ownerName: 'Eden Tadesse',     ownerPhone: '+251911000011' },
    { plateNumber: 'AA-2-F2345',  ownerName: 'Fikir Muleta',     ownerPhone: '+251911000012' },
    { plateNumber: 'AA-3-A1234',  ownerName: 'Amara Tefera',     ownerPhone: '+251911000007' },
    { plateNumber: 'AA-3-B5678',  ownerName: 'Belaynesh Assefa', ownerPhone: '+251911000008' },
    { plateNumber: 'AA-4-C9012',  ownerName: 'Chernet Desta',    ownerPhone: '+251911000009' },
    { plateNumber: 'AA-5-D3456',  ownerName: 'Dereje Fekadu',    ownerPhone: '+251911000010' },
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

  // ── 6. VEHICLE SCHEDULES (Week 24, government CSV format) ─────────────────
  const validFrom  = new Date('2026-03-17T00:00:00Z');
  const validUntil = new Date('2026-03-23T23:59:59Z');
  const ACTIVE = AssignmentStatus.ACTIVE;

  await prisma.vehicleSchedule.createMany({
    data: [
      { vehicleId: vByPlate('AA-2-B44910').id, terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-2-C29918').id, terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-2-A77615').id, terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('CODE2-89012').id, terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-2-B9988').id,  terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-2-X1122').id,  terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-3-A1234').id,  terminalId: merkato.id,   routeId: routeMrkPiassa.id,   weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-3-B5678').id,  terminalId: merkato.id,   routeId: routeMrkPiassa.id,   weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-4-C9012').id,  terminalId: kaliti.id,    routeId: routeKalSaris.id,    weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-5-D3456').id,  terminalId: piassa.id,    routeId: routePiaAratKilo.id, weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-2-E7890').id,  terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
      { vehicleId: vByPlate('AA-2-F2345').id,  terminalId: megenagna.id, routeId: routeMegBole.id,     weekNumber: 24, validFrom, validUntil, status: ACTIVE },
    ],
    skipDuplicates: true,
  });
  console.log('  ✔ Vehicle schedules seeded (12) — Week 24.');

  // ── 7. VEHICLE ROUTE ASSIGNMENTS ──────────────────────────────────────────
  const expiry = new Date('2026-03-23T23:59:59Z');
  await prisma.vehicleRouteAssignment.createMany({
    data: [
      { vehicleId: vByPlate('AA-2-B44910').id, routeId: routeMegBole.id,     expiresAt: expiry },
      { vehicleId: vByPlate('AA-2-C29918').id, routeId: routeMegBole.id,     expiresAt: expiry },
      { vehicleId: vByPlate('AA-3-A1234').id,  routeId: routeMrkPiassa.id,   expiresAt: expiry },
      { vehicleId: vByPlate('AA-4-C9012').id,  routeId: routeKalSaris.id,    expiresAt: expiry },
      { vehicleId: vByPlate('AA-5-D3456').id,  routeId: routePiaAratKilo.id, expiresAt: expiry },
    ],
  });
  console.log('  ✔ Vehicle route assignments seeded (5).');

  // ── 8. QUEUE ENTRIES (demo) ───────────────────────────────────────────────
  const [queueA, queueB] = await Promise.all([
    prisma.queueEntry.create({
      data: { terminalId: megenagna.id, routeId: routeMegBole.id, vehicleId: vByPlate('AA-2-B44910').id, sequence: 1, status: QueueStatus.PENDING, syncId: 'sync-q-001' },
    }),
    prisma.queueEntry.create({
      data: { terminalId: megenagna.id, routeId: routeMegBole.id, vehicleId: vByPlate('AA-2-C29918').id, sequence: 2, status: QueueStatus.PENDING, syncId: 'sync-q-002' },
    }),
  ]);
  console.log('  ✔ Queue entries seeded (2).');

  // ── 9. DISPATCH RECORDS ───────────────────────────────────────────────────
  await prisma.dispatchRecord.createMany({
    data: [
      { terminalId: megenagna.id, routeId: routeMegBole.id,   vehicleId: vByPlate('AA-2-A77615').id, dispatcherId: dispatcher.id, fareChargedETB: 15.00, municipalCommission: 10.00, platformCommission: 1.00, isReconciled: true,  syncId: 'sync-d-001' },
      { terminalId: megenagna.id, routeId: routeMegPiassa.id, vehicleId: vByPlate('CODE2-89012').id, dispatcherId: dispatcher.id, fareChargedETB: 20.00, municipalCommission: 10.00, platformCommission: 1.00, isReconciled: false, syncId: 'sync-d-002' },
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
