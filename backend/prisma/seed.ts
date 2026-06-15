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
const pgUrl   = rawUrl.split('?')[0];          // strip ?schema=public
const pool    = new Pool({ connectionString: pgUrl });
const adapter = new PrismaPg(pool, { schema: 'public' });
const prisma  = new PrismaClient({ adapter } as any);

async function main() {
  console.log('🌱 Seeding Addis Ababa Terminal Digital Roster Database...');

  // ────────────────────────────────────────────────────────────────────────────
  // 0. CLEAN (order respects FK constraints)
  // ────────────────────────────────────────────────────────────────────────────
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
  console.log('  ✔ Existing data cleared.');

  // ────────────────────────────────────────────────────────────────────────────
  // 1. USERS  (8 users — one per role, all unique)
  // ────────────────────────────────────────────────────────────────────────────
  const hash    = (pw: string)  => bcrypt.hash(pw, 10);
  const pinHash = (pin: string) => bcrypt.hash(pin, 10);

  const [
    superAdmin,
    transportAdmin,
    terminalAdmin,
    supervisor1,
    supervisor2,
    dispatcher1,
    dispatcher2,
    auditor,
    financeOfficer,
    systemSupport,
  ] = await Promise.all([
    prisma.user.create({
      data: {
        username:     'super_admin',
        email:        'super@aatdrs.gov.et',
        passwordHash: await hash('Admin@1234'),
        roleName:     RoleName.SUPER_ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        username:     'transport_admin',
        email:        'transport.admin@aatdrs.gov.et',
        passwordHash: await hash('Transport@1234'),
        roleName:     RoleName.TRANSPORT_OFFICE_ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        username:     'terminal_admin',
        email:        'terminal.admin@aatdrs.gov.et',
        passwordHash: await hash('TermAdm@1234'),
        roleName:     RoleName.TERMINAL_ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        username:     'supervisor_haile',
        email:        'haile@aatdrs.gov.et',
        passwordHash: await hash('Sup@1234'),
        pinHash:      await pinHash('112233'),
        roleName:     RoleName.SUPERVISOR,
      },
    }),
    prisma.user.create({
      data: {
        username:     'supervisor_meron',
        email:        'meron@aatdrs.gov.et',
        passwordHash: await hash('Sup@5678'),
        pinHash:      await pinHash('445566'),
        roleName:     RoleName.SUPERVISOR,
      },
    }),
    prisma.user.create({
      data: {
        username:     'dispatcher_abebe',
        email:        'abebe@aatdrs.gov.et',
        passwordHash: await hash('Disp@1234'),
        pinHash:      await pinHash('998877'),
        roleName:     RoleName.DISPATCHER,
      },
    }),
    prisma.user.create({
      data: {
        username:     'dispatcher_tigist',
        email:        'tigist@aatdrs.gov.et',
        passwordHash: await hash('Disp@5678'),
        pinHash:      await pinHash('776655'),
        roleName:     RoleName.DISPATCHER,
      },
    }),
    prisma.user.create({
      data: {
        username:     'auditor_yonas',
        email:        'yonas.audit@aatdrs.gov.et',
        passwordHash: await hash('Audit@9999'),
        roleName:     RoleName.AUDITOR,
      },
    }),
    prisma.user.create({
      data: {
        username:     'finance_sara',
        email:        'sara.finance@aatdrs.gov.et',
        passwordHash: await hash('Finance@1111'),
        roleName:     RoleName.FINANCE_OFFICER,
      },
    }),
    prisma.user.create({
      data: {
        username:     'sysadmin_dawit',
        email:        'dawit.sys@aatdrs.gov.et',
        passwordHash: await hash('Sys@2222'),
        roleName:     RoleName.SYSTEM_SUPPORT,
      },
    }),
  ]);
  console.log('  ✔ Users seeded (10).');

  // ────────────────────────────────────────────────────────────────────────────
  // 2. TERMINALS  (5 — mirrors what the government CSV references)
  //    Columns: assigned_terminal  →  origin terminal
  // ────────────────────────────────────────────────────────────────────────────
  const [megenagna, merkato, kaliti, piassa, bole] = await Promise.all([
    prisma.terminal.create({
      data: { name: 'Megenagna Taxi Terminal', code: 'MEG-01', location: '9.0223,38.8021' },
    }),
    prisma.terminal.create({
      data: { name: 'Merkato Taxi Terminal',  code: 'MRK-02', location: '9.0357,38.7469' },
    }),
    prisma.terminal.create({
      data: { name: 'Kaliti Taxi Terminal',   code: 'KAL-03', location: '8.9502,38.7936' },
    }),
    prisma.terminal.create({
      data: { name: 'Piassa Taxi Terminal',   code: 'PIA-04', location: '9.0374,38.7573' },
    }),
    prisma.terminal.create({
      data: { name: 'Bole Taxi Terminal',     code: 'BOL-05', location: '8.9892,38.7884' },
    }),
  ]);
  console.log('  ✔ Terminals seeded (5).');

  // ────────────────────────────────────────────────────────────────────────────
  // 3. USER → TERMINAL ASSIGNMENTS
  //    Each dispatcher/supervisor is assigned to one terminal
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.userTerminalAssignment.createMany({
    data: [
      { userId: supervisor1.id,   terminalId: megenagna.id },
      { userId: dispatcher1.id,   terminalId: megenagna.id },
      { userId: supervisor2.id,   terminalId: merkato.id   },
      { userId: dispatcher2.id,   terminalId: merkato.id   },
      { userId: terminalAdmin.id, terminalId: kaliti.id    },
    ],
  });
  console.log('  ✔ User-terminal assignments seeded (5).');

  // ────────────────────────────────────────────────────────────────────────────
  // 4. ROUTES  (5 — origin → destination, matching CSV "assigned_route" field)
  //    The CSV "assigned_route" is the destination name.
  // ────────────────────────────────────────────────────────────────────────────
  const [routeMegBole, routeMegPiassa, routeMrkPiassa, routeKalSaris, routePiaAratKilo] =
    await Promise.all([
      prisma.route.create({
        data: { code: 'R-001', origin: 'Megenagna', destination: 'Bole',      baseFareETB: 15.00 },
      }),
      prisma.route.create({
        data: { code: 'R-002', origin: 'Megenagna', destination: 'Piassa',    baseFareETB: 20.00 },
      }),
      prisma.route.create({
        data: { code: 'R-003', origin: 'Merkato',   destination: 'Piassa',    baseFareETB: 18.00 },
      }),
      prisma.route.create({
        data: { code: 'R-004', origin: 'Kaliti',    destination: 'Saris',     baseFareETB: 12.00 },
      }),
      prisma.route.create({
        data: { code: 'R-005', origin: 'Piassa',    destination: 'Arat Kilo', baseFareETB: 10.00 },
      }),
    ]);
  console.log('  ✔ Routes seeded (5).');

  // ────────────────────────────────────────────────────────────────────────────
  // 5. TERMINAL → ROUTE LINKS
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.terminalRoute.createMany({
    data: [
      { terminalId: megenagna.id, routeId: routeMegBole.id      },
      { terminalId: megenagna.id, routeId: routeMegPiassa.id    },
      { terminalId: merkato.id,   routeId: routeMrkPiassa.id    },
      { terminalId: kaliti.id,    routeId: routeKalSaris.id     },
      { terminalId: piassa.id,    routeId: routePiaAratKilo.id  },
    ],
  });
  console.log('  ✔ Terminal-route links seeded (5).');

  // ────────────────────────────────────────────────────────────────────────────
  // 6. VEHICLES  (12 — exactly the plate numbers from the government CSV)
  // ────────────────────────────────────────────────────────────────────────────
  const vehicleRows = [
    // Megenagna → Bole vehicles
    { plateNumber: 'AA-2-B44910', ownerName: 'Bekele Alemu',    ownerPhone: '+251911000001' },
    { plateNumber: 'AA-2-C29918', ownerName: 'Chalew Demissie', ownerPhone: '+251911000002' },
    { plateNumber: 'AA-2-A77615', ownerName: 'Abebe Worku',     ownerPhone: '+251911000003' },
    { plateNumber: 'CODE2-89012', ownerName: 'Tesfaye Girma',   ownerPhone: '+251911000004' },
    { plateNumber: 'AA-2-B9988',  ownerName: 'Birtukan Hailu',  ownerPhone: '+251911000005' },
    { plateNumber: 'AA-2-X1122',  ownerName: 'Xinare Kebede',   ownerPhone: '+251911000006' },
    { plateNumber: 'AA-2-E7890',  ownerName: 'Eden Tadesse',    ownerPhone: '+251911000011' },
    { plateNumber: 'AA-2-F2345',  ownerName: 'Fikir Muleta',    ownerPhone: '+251911000012' },
    // Merkato → Piassa vehicles
    { plateNumber: 'AA-3-A1234',  ownerName: 'Amara Tefera',    ownerPhone: '+251911000007' },
    { plateNumber: 'AA-3-B5678',  ownerName: 'Belaynesh Assefa', ownerPhone: '+251911000008' },
    // Kaliti → Saris
    { plateNumber: 'AA-4-C9012',  ownerName: 'Chernet Desta',   ownerPhone: '+251911000009' },
    // Piassa → Arat Kilo
    { plateNumber: 'AA-5-D3456',  ownerName: 'Dereje Fekadu',   ownerPhone: '+251911000010' },
  ];

  const createdVehicles = await Promise.all(
    vehicleRows.map(v =>
      prisma.vehicle.create({
        data: { ...v, capacity: 12, status: VehicleStatus.ACTIVE },
      }),
    ),
  );

  // Helper: find vehicle by plate
  const vByPlate = (plate: string) => {
    const v = createdVehicles.find(x => x.plateNumber === plate);
    if (!v) throw new Error(`Vehicle not found: ${plate}`);
    return v;
  };

  console.log('  ✔ Vehicles seeded (12).');

  // ────────────────────────────────────────────────────────────────────────────
  // 7. VEHICLE → ROUTE ASSIGNMENTS  (legacy table, kept for queue compatibility)
  // ────────────────────────────────────────────────────────────────────────────
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
  console.log('  ✔ Vehicle-route assignments seeded (5).');

  // ────────────────────────────────────────────────────────────────────────────
  // 8. VEHICLE SCHEDULES  (weekly roster — exactly the government CSV data)
  //
  //  plate_number | assigned_terminal | assigned_route | week_number | valid_from | valid_until | status
  //  AA-2-B44910  | Megenagna         | Bole           | 24          | 17/03/2026 | 23/03/2026  | active
  //  ...
  // ────────────────────────────────────────────────────────────────────────────
  type ScheduleRow = {
    plate: string;
    terminal: typeof megenagna;
    route:    typeof routeMegBole;
    week:     number;
    from:     Date;
    until:    Date;
    status:   AssignmentStatus;
  };

  const validFrom  = new Date('2026-03-17T00:00:00Z');
  const validUntil = new Date('2026-03-23T23:59:59Z');
  const WEEK       = 24;
  const ACTIVE     = AssignmentStatus.ACTIVE;

  const scheduleRows: ScheduleRow[] = [
    { plate: 'AA-2-B44910', terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-2-C29918', terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-2-A77615', terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'CODE2-89012', terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-2-B9988',  terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-2-X1122',  terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-3-A1234',  terminal: merkato,   route: routeMrkPiassa,  week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-3-B5678',  terminal: merkato,   route: routeMrkPiassa,  week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-4-C9012',  terminal: kaliti,    route: routeKalSaris,   week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-5-D3456',  terminal: piassa,    route: routePiaAratKilo,week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-2-E7890',  terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
    { plate: 'AA-2-F2345',  terminal: megenagna, route: routeMegBole,    week: WEEK, from: validFrom, until: validUntil, status: ACTIVE },
  ];

  await prisma.vehicleSchedule.createMany({
    data: scheduleRows.map(r => ({
      vehicleId:  vByPlate(r.plate).id,
      terminalId: r.terminal.id,
      routeId:    r.route.id,
      weekNumber: r.week,
      validFrom:  r.from,
      validUntil: r.until,
      status:     r.status,
    })),
    skipDuplicates: true,
  });
  console.log('  ✔ Vehicle schedules seeded (12) — Week 24 government roster.');

  // ────────────────────────────────────────────────────────────────────────────
  // 9. QUEUE ENTRIES (3 sample entries for the live FIFO queue demo)
  // ────────────────────────────────────────────────────────────────────────────
  const [queueA, queueB, queueC] = await Promise.all([
    prisma.queueEntry.create({
      data: {
        terminalId: megenagna.id,
        routeId:    routeMegBole.id,
        vehicleId:  vByPlate('AA-2-B44910').id,
        sequence:   1,
        status:     QueueStatus.DISPATCHED,
        syncId:     'sync-q-001',
      },
    }),
    prisma.queueEntry.create({
      data: {
        terminalId: megenagna.id,
        routeId:    routeMegBole.id,
        vehicleId:  vByPlate('AA-2-C29918').id,
        sequence:   2,
        status:     QueueStatus.PENDING,
        syncId:     'sync-q-002',
      },
    }),
    prisma.queueEntry.create({
      data: {
        terminalId: merkato.id,
        routeId:    routeMrkPiassa.id,
        vehicleId:  vByPlate('AA-3-A1234').id,
        sequence:   1,
        status:     QueueStatus.SKIPPED,
        syncId:     'sync-q-003',
      },
    }),
  ]);
  console.log('  ✔ Queue entries seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 10. DISPATCH RECORDS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.dispatchRecord.createMany({
    data: [
      {
        terminalId:          megenagna.id,
        routeId:             routeMegBole.id,
        vehicleId:           vByPlate('AA-2-B44910').id,
        dispatcherId:        dispatcher1.id,
        fareChargedETB:      15.00,
        municipalCommission: 10.00,
        platformCommission:  1.00,
        isReconciled:        true,
        syncId:              'sync-d-001',
      },
      {
        terminalId:          megenagna.id,
        routeId:             routeMegPiassa.id,
        vehicleId:           vByPlate('AA-2-C29918').id,
        dispatcherId:        dispatcher1.id,
        fareChargedETB:      20.00,
        municipalCommission: 10.00,
        platformCommission:  1.00,
        isReconciled:        false,
        syncId:              'sync-d-002',
      },
      {
        terminalId:          merkato.id,
        routeId:             routeMrkPiassa.id,
        vehicleId:           vByPlate('AA-3-A1234').id,
        dispatcherId:        dispatcher2.id,
        fareChargedETB:      18.00,
        municipalCommission: 10.00,
        platformCommission:  1.00,
        isReconciled:        false,
        syncId:              'sync-d-003',
      },
    ],
  });
  console.log('  ✔ Dispatch records seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 11. OVERRIDE LOGS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.overrideLog.createMany({
    data: [
      {
        queueEntryId: queueA.id,
        supervisorId: supervisor1.id,
        overrideType: OverrideType.FORCE_DISPATCH,
        reason:       'Vehicle had mechanical issue; forced dispatch approved.',
        signature:    'SIG-HAILE-20260601',
      },
      {
        queueEntryId: queueB.id,
        supervisorId: supervisor1.id,
        overrideType: OverrideType.VEHICLE_SKIP,
        reason:       'Driver absent; vehicle skipped by supervisor.',
        signature:    'SIG-HAILE-20260602',
      },
      {
        queueEntryId: queueC.id,
        supervisorId: supervisor2.id,
        overrideType: OverrideType.ROUTE_TEMPORARY_CHANGE,
        reason:       'Road closed – temporary route change authorized.',
        signature:    'SIG-MERON-20260601',
      },
    ],
  });
  console.log('  ✔ Override logs seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 12. VIOLATION RECORDS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.violationRecord.createMany({
    data: [
      {
        vehicleId:     vByPlate('AA-2-B44910').id,
        violationType: ViolationType.ROUTE_HOPPING,
        details:       'Vehicle AA-2-B44910 detected at unauthorized terminal during Bole route.',
        severityScore: 3,
        resolved:      false,
      },
      {
        vehicleId:     vByPlate('AA-2-C29918').id,
        violationType: ViolationType.DUPLICATE_CHECKIN,
        details:       'Vehicle AA-2-C29918 checked in twice within 10 minutes at Megenagna.',
        severityScore: 2,
        resolved:      true,
        resolvedAt:    new Date(),
      },
      {
        vehicleId:     vByPlate('AA-3-A1234').id,
        violationType: ViolationType.SUSPICIOUS_INTERVAL,
        details:       'Vehicle AA-3-A1234 made 15 trips in 2 hours – statistically improbable.',
        severityScore: 5,
        resolved:      false,
      },
    ],
  });
  console.log('  ✔ Violation records seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 13. DEVICE BINDINGS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.deviceBinding.createMany({
    data: [
      { terminalId: megenagna.id, deviceUuid: 'DEV-UUID-AAAA-1111', publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAk1dev1==', isApproved: true  },
      { terminalId: merkato.id,   deviceUuid: 'DEV-UUID-BBBB-2222', publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAk2dev2==', isApproved: false },
      { terminalId: kaliti.id,    deviceUuid: 'DEV-UUID-CCCC-3333', publicKey: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAk3dev3==', isApproved: false },
    ],
  });
  console.log('  ✔ Device bindings seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 14. AUDIT LOGS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { userId: superAdmin.id,   action: 'USER_CREATED',       details: 'Super admin created dispatcher account for abebe@aatdrs.gov.et',          ipAddress: '192.168.1.10' },
      { userId: supervisor1.id,  action: 'OVERRIDE_APPLIED',   details: 'Supervisor applied FORCE_DISPATCH override on queue entry sync-q-001',      ipAddress: '192.168.1.25' },
      { userId: dispatcher1.id,  action: 'VEHICLE_DISPATCHED', details: 'Dispatcher dispatched vehicle AA-2-B44910 on route R-001 (Megenagna→Bole)', ipAddress: '192.168.1.30' },
    ],
  });
  console.log('  ✔ Audit logs seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 15. RECONCILIATION REPORTS (2)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.reconciliationReport.createMany({
    data: [
      {
        startDate:          new Date('2026-06-01T00:00:00Z'),
        endDate:            new Date('2026-06-07T23:59:59Z'),
        terminalId:         megenagna.id,
        totalDispatches:    124,
        totalMunicipalComm: 1240.00,
        totalPlatformComm:  124.00,
        status:             'APPROVED',
      },
      {
        startDate:          new Date('2026-06-08T00:00:00Z'),
        endDate:            new Date('2026-06-14T23:59:59Z'),
        terminalId:         merkato.id,
        totalDispatches:    98,
        totalMunicipalComm: 980.00,
        totalPlatformComm:  98.00,
        status:             'PENDING',
      },
    ],
  });
  console.log('  ✔ Reconciliation reports seeded (2).');

  console.log('\n🎉 Seeding completed successfully!');
  console.log('\n📋 Credentials summary:');
  console.log('  super_admin         / Admin@1234');
  console.log('  transport_admin     / Transport@1234');
  console.log('  terminal_admin      / TermAdm@1234');
  console.log('  supervisor_haile    / Sup@1234    (PIN: 112233)');
  console.log('  supervisor_meron    / Sup@5678    (PIN: 445566)');
  console.log('  dispatcher_abebe    / Disp@1234   (PIN: 998877)');
  console.log('  dispatcher_tigist   / Disp@5678   (PIN: 776655)');
  console.log('  auditor_yonas       / Audit@9999');
  console.log('  finance_sara        / Finance@1111');
  console.log('  sysadmin_dawit      / Sys@2222');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
