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
const pgUrl   = rawUrl.split('?')[0];          // strip ?schema=public – not understood by pg
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
  await prisma.vehicleRouteAssignment.deleteMany({});
  await prisma.terminalRoute.deleteMany({});
  await prisma.userTerminalAssignment.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.terminal.deleteMany({});
  await prisma.route.deleteMany({});
  await prisma.vehicle.deleteMany({});
  console.log('  ✔ Existing data cleared.');

  // ────────────────────────────────────────────────────────────────────────────
  // 1. USERS  (6 users – covers all key roles)
  // ────────────────────────────────────────────────────────────────────────────
  const hash = (pw: string) => bcrypt.hash(pw, 10);
  const pinHash = (pin: string) => bcrypt.hash(pin, 10);

  const [
    superAdmin,
    terminalAdmin,
    supervisor1,
    supervisor2,
    dispatcher1,
    dispatcher2,
    auditor,
    financeOfficer,
  ] = await Promise.all([
    prisma.user.create({
      data: {
        username: 'super_admin',
        email: 'super@aatdrs.gov.et',
        passwordHash: await hash('Admin@1234'),
        roleName: RoleName.SUPER_ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        username: 'terminal_admin',
        email: 'terminal.admin@aatdrs.gov.et',
        passwordHash: await hash('TermAdm@1234'),
        roleName: RoleName.TERMINAL_ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        username: 'supervisor_haile',
        email: 'haile@aatdrs.gov.et',
        passwordHash: await hash('Sup@1234'),
        pinHash: await pinHash('112233'),
        roleName: RoleName.SUPERVISOR,
      },
    }),
    prisma.user.create({
      data: {
        username: 'supervisor_meron',
        email: 'meron@aatdrs.gov.et',
        passwordHash: await hash('Sup@5678'),
        pinHash: await pinHash('445566'),
        roleName: RoleName.SUPERVISOR,
      },
    }),
    prisma.user.create({
      data: {
        username: 'dispatcher_abebe',
        email: 'abebe@aatdrs.gov.et',
        passwordHash: await hash('Disp@1234'),
        pinHash: await pinHash('998877'),
        roleName: RoleName.DISPATCHER,
      },
    }),
    prisma.user.create({
      data: {
        username: 'dispatcher_tigist',
        email: 'tigist@aatdrs.gov.et',
        passwordHash: await hash('Disp@5678'),
        pinHash: await pinHash('776655'),
        roleName: RoleName.DISPATCHER,
      },
    }),
    prisma.user.create({
      data: {
        username: 'auditor_yonas',
        email: 'yonas.audit@aatdrs.gov.et',
        passwordHash: await hash('Audit@9999'),
        roleName: RoleName.AUDITOR,
      },
    }),
    prisma.user.create({
      data: {
        username: 'finance_sara',
        email: 'sara.finance@aatdrs.gov.et',
        passwordHash: await hash('Finance@1111'),
        roleName: RoleName.FINANCE_OFFICER,
      },
    }),
  ]);
  console.log('  ✔ Users seeded (8).');

  // ────────────────────────────────────────────────────────────────────────────
  // 2. TERMINALS (3)
  // ────────────────────────────────────────────────────────────────────────────
  const [megenagna, bole, mercato] = await Promise.all([
    prisma.terminal.create({
      data: {
        name: 'Megenagna Taxi Terminal',
        code: 'MEG-01',
        location: '9.0223,38.8021',
      },
    }),
    prisma.terminal.create({
      data: {
        name: 'Bole Taxi Terminal',
        code: 'BOL-02',
        location: '8.9892,38.7884',
      },
    }),
    prisma.terminal.create({
      data: {
        name: 'Mercato Taxi Terminal',
        code: 'MRC-03',
        location: '9.0357,38.7469',
      },
    }),
  ]);
  console.log('  ✔ Terminals seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 3. USER → TERMINAL ASSIGNMENTS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.userTerminalAssignment.createMany({
    data: [
      { userId: supervisor1.id,  terminalId: megenagna.id },
      { userId: dispatcher1.id,  terminalId: megenagna.id },
      { userId: supervisor2.id,  terminalId: bole.id },
      { userId: dispatcher2.id,  terminalId: bole.id },
      { userId: terminalAdmin.id, terminalId: mercato.id },
    ],
  });
  console.log('  ✔ User-terminal assignments seeded (5).');

  // ────────────────────────────────────────────────────────────────────────────
  // 4. ROUTES (3)
  // ────────────────────────────────────────────────────────────────────────────
  const [routeMegBole, routeMegPiazza, routeBoleMercato] = await Promise.all([
    prisma.route.create({
      data: { code: 'R-001', origin: 'Megenagna', destination: 'Bole',    baseFareETB: 15.00 },
    }),
    prisma.route.create({
      data: { code: 'R-002', origin: 'Megenagna', destination: 'Piazza',  baseFareETB: 20.00 },
    }),
    prisma.route.create({
      data: { code: 'R-003', origin: 'Bole',      destination: 'Mercato', baseFareETB: 18.00 },
    }),
  ]);
  console.log('  ✔ Routes seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 5. TERMINAL → ROUTE ASSIGNMENTS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.terminalRoute.createMany({
    data: [
      { terminalId: megenagna.id, routeId: routeMegBole.id },
      { terminalId: megenagna.id, routeId: routeMegPiazza.id },
      { terminalId: bole.id,      routeId: routeBoleMercato.id },
      { terminalId: mercato.id,   routeId: routeBoleMercato.id },
    ],
  });
  console.log('  ✔ Terminal-route links seeded (4).');

  // ────────────────────────────────────────────────────────────────────────────
  // 6. VEHICLES (3)
  // ────────────────────────────────────────────────────────────────────────────
  const [vehicleA, vehicleB, vehicleC] = await Promise.all([
    prisma.vehicle.create({
      data: {
        plateNumber: 'AA-3-A12345',
        ownerName:   'Abebe Kebede',
        ownerPhone:  '+251911223344',
        capacity:    12,
        status:      VehicleStatus.ACTIVE,
      },
    }),
    prisma.vehicle.create({
      data: {
        plateNumber: 'AA-3-B54321',
        ownerName:   'Mulugeta Tesfaye',
        ownerPhone:  '+251912556677',
        capacity:    15,
        status:      VehicleStatus.ACTIVE,
      },
    }),
    prisma.vehicle.create({
      data: {
        plateNumber: 'AA-3-C99001',
        ownerName:   'Hiwot Bekele',
        ownerPhone:  '+251913887766',
        capacity:    12,
        status:      VehicleStatus.MAINTENANCE,
      },
    }),
  ]);
  console.log('  ✔ Vehicles seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 7. VEHICLE → ROUTE ASSIGNMENTS (3)
  // ────────────────────────────────────────────────────────────────────────────
  const expiry7  = new Date(Date.now() + 7  * 86_400_000);
  const expiry14 = new Date(Date.now() + 14 * 86_400_000);
  const expiry30 = new Date(Date.now() + 30 * 86_400_000);

  await prisma.vehicleRouteAssignment.createMany({
    data: [
      { vehicleId: vehicleA.id, routeId: routeMegBole.id,     expiresAt: expiry7  },
      { vehicleId: vehicleB.id, routeId: routeMegPiazza.id,   expiresAt: expiry14 },
      { vehicleId: vehicleC.id, routeId: routeBoleMercato.id, expiresAt: expiry30 },
    ],
  });
  console.log('  ✔ Vehicle-route assignments seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 8. QUEUE ENTRIES (3)
  // ────────────────────────────────────────────────────────────────────────────
  const [queueA, queueB, queueC] = await Promise.all([
    prisma.queueEntry.create({
      data: {
        terminalId: megenagna.id,
        routeId:    routeMegBole.id,
        vehicleId:  vehicleA.id,
        sequence:   1,
        status:     QueueStatus.DISPATCHED,
        syncId:     'sync-q-001',
      },
    }),
    prisma.queueEntry.create({
      data: {
        terminalId: megenagna.id,
        routeId:    routeMegPiazza.id,
        vehicleId:  vehicleB.id,
        sequence:   2,
        status:     QueueStatus.PENDING,
        syncId:     'sync-q-002',
      },
    }),
    prisma.queueEntry.create({
      data: {
        terminalId: bole.id,
        routeId:    routeBoleMercato.id,
        vehicleId:  vehicleC.id,
        sequence:   1,
        status:     QueueStatus.SKIPPED,
        syncId:     'sync-q-003',
      },
    }),
  ]);
  console.log('  ✔ Queue entries seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 9. DISPATCH RECORDS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.dispatchRecord.createMany({
    data: [
      {
        terminalId:          megenagna.id,
        routeId:             routeMegBole.id,
        vehicleId:           vehicleA.id,
        dispatcherId:        dispatcher1.id,
        fareChargedETB:      15.00,
        municipalCommission: 10.00,
        platformCommission:  1.00,
        isReconciled:        true,
        syncId:              'sync-d-001',
      },
      {
        terminalId:          megenagna.id,
        routeId:             routeMegPiazza.id,
        vehicleId:           vehicleB.id,
        dispatcherId:        dispatcher1.id,
        fareChargedETB:      20.00,
        municipalCommission: 10.00,
        platformCommission:  1.00,
        isReconciled:        false,
        syncId:              'sync-d-002',
      },
      {
        terminalId:          bole.id,
        routeId:             routeBoleMercato.id,
        vehicleId:           vehicleC.id,
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
  // 10. OVERRIDE LOGS (3 – one per queue entry)
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
  // 11. VIOLATION RECORDS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.violationRecord.createMany({
    data: [
      {
        vehicleId:     vehicleA.id,
        violationType: ViolationType.ROUTE_HOPPING,
        details:       'Vehicle AA-3-A12345 detected at unauthorized terminal during Bole–Piazza route.',
        severityScore: 3,
        resolved:      false,
      },
      {
        vehicleId:     vehicleB.id,
        violationType: ViolationType.DUPLICATE_CHECKIN,
        details:       'Vehicle AA-3-B54321 checked in twice within 10 minutes at Megenagna.',
        severityScore: 2,
        resolved:      true,
        resolvedAt:    new Date(),
      },
      {
        vehicleId:     vehicleC.id,
        violationType: ViolationType.SUSPICIOUS_INTERVAL,
        details:       'Vehicle AA-3-C99001 made 15 trips in 2 hours – statistically improbable.',
        severityScore: 5,
        resolved:      false,
      },
    ],
  });
  console.log('  ✔ Violation records seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 12. DEVICE BINDINGS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.deviceBinding.createMany({
    data: [
      {
        terminalId: megenagna.id,
        deviceUuid: 'DEV-UUID-AAAA-1111',
        publicKey:  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAk1dev1==',
        isApproved: true,
      },
      {
        terminalId: bole.id,
        deviceUuid: 'DEV-UUID-BBBB-2222',
        publicKey:  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAk2dev2==',
        isApproved: false,
      },
      {
        terminalId: mercato.id,
        deviceUuid: 'DEV-UUID-CCCC-3333',
        publicKey:  'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAk3dev3==',
        isApproved: false,
      },
    ],
  });
  console.log('  ✔ Device bindings seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 13. AUDIT LOGS (3)
  // ────────────────────────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        userId:    superAdmin.id,
        action:    'USER_CREATED',
        details:   'Super admin created dispatcher account for abebe@aatdrs.gov.et',
        ipAddress: '192.168.1.10',
      },
      {
        userId:    supervisor1.id,
        action:    'OVERRIDE_APPLIED',
        details:   'Supervisor applied FORCE_DISPATCH override on queue entry sync-q-001',
        ipAddress: '192.168.1.25',
      },
      {
        userId:    dispatcher1.id,
        action:    'VEHICLE_DISPATCHED',
        details:   'Dispatcher dispatched vehicle AA-3-A12345 on route R-001',
        ipAddress: '192.168.1.30',
      },
    ],
  });
  console.log('  ✔ Audit logs seeded (3).');

  // ────────────────────────────────────────────────────────────────────────────
  // 14. RECONCILIATION REPORTS (3)
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
        terminalId:         bole.id,
        totalDispatches:    98,
        totalMunicipalComm: 980.00,
        totalPlatformComm:  98.00,
        status:             'PENDING',
      },
      {
        startDate:          new Date('2026-06-01T00:00:00Z'),
        endDate:            new Date('2026-06-14T23:59:59Z'),
        terminalId:         null,   // System-wide report
        totalDispatches:    310,
        totalMunicipalComm: 3100.00,
        totalPlatformComm:  310.00,
        status:             'PENDING',
      },
    ],
  });
  console.log('  ✔ Reconciliation reports seeded (3).');

  console.log('\n🎉 Seeding completed successfully!');
  console.log('\n📋 Credentials summary:');
  console.log('  super_admin          / Admin@1234');
  console.log('  terminal_admin       / TermAdm@1234');
  console.log('  supervisor_haile     / Sup@1234   (PIN: 112233)');
  console.log('  supervisor_meron     / Sup@5678   (PIN: 445566)');
  console.log('  dispatcher_abebe     / Disp@1234  (PIN: 998877)');
  console.log('  dispatcher_tigist    / Disp@5678  (PIN: 776655)');
  console.log('  auditor_yonas        / Audit@9999');
  console.log('  finance_sara         / Finance@1111');
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
