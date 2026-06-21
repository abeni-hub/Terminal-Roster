import Dexie, { Table } from 'dexie';

export interface LocalVehicle {
  id: string;
  plateNumber: string;
  ownerName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE';
  assignedRouteId: string;
}

export interface LocalRoute {
  id: string;
  code: string;
  origin: string;
  destination: string;
  baseFareETB: number;
}

export interface LocalTerminal {
  id: string;
  name: string;
  code: string;
  location: string;
}

export interface LocalScheduleEntry {
  id: string;
  plateNumber: string;
  ownerName: string;
  vehicleStatus: string;
  terminalName: string;
  terminalCode: string;
  terminalId?: string;  // database UUID
  routeCode: string;
  routeId?: string;     // database UUID
  origin: string;
  destination: string;
  baseFareETB: number;
  weekNumber: number;
  validFrom: string;   // ISO string
  validUntil: string;  // ISO string
  status: 'ACTIVE' | 'INACTIVE';
  importedAt: string;
}

export interface LocalQueueEntry {
  id: string;
  terminalId: string;
  routeId: string;
  vehicleId: string;
  checkInTime: number; // Unix timestamp
  status: 'PENDING' | 'DISPATCHED' | 'SKIPPED';
  sequence: number;
  syncId: string;
}

export interface LocalDispatchRecord {
  id: string;
  terminalId: string;
  routeId: string;
  vehicleId: string;
  dispatcherId: string;
  dispatchTime: number;
  fareChargedETB: number;
  syncId: string;
  isSynced: number; // 0 = False, 1 = True
}

export interface LocalViolation {
  id: string;
  vehicleId: string;
  violationType: string;
  details: string;
  severityScore: number;
  timestamp: number;
  syncId: string;
}

export interface SyncQueueItem {
  id?: number;
  action: 'CHECKIN' | 'DISPATCH' | 'OVERRIDE' | 'VIOLATION';
  payload: any;
  timestamp: number;
  retryCount: number;
}

export interface LocalAuditLog {
  id: string;
  action: string;
  details: string;
  timestamp: number;
}

export class OfflineDatabase extends Dexie {
  vehicles!: Table<LocalVehicle>;
  routes!: Table<LocalRoute>;
  terminals!: Table<LocalTerminal>;
  schedules!: Table<LocalScheduleEntry>;
  queue!: Table<LocalQueueEntry>;
  dispatches!: Table<LocalDispatchRecord>;
  violations!: Table<LocalViolation>;
  syncQueue!: Table<SyncQueueItem>;
  auditLogs!: Table<LocalAuditLog>;

  constructor() {
    super('AATDRS_Terminal_DB');
    // Version 2: original schema
    this.version(2).stores({
      vehicles:  'id, plateNumber, assignedRouteId',
      routes:    'id, code',
      terminals: 'id, code, name',
      schedules: 'id, weekNumber, terminalCode, status',
      queue:     'id, [terminalId+routeId], status, checkInTime',
      dispatches:'id, syncId, isSynced, dispatchTime',
      violations:'id, vehicleId, timestamp',
      syncQueue: '++id, action, timestamp',
      auditLogs: 'id, timestamp',
    });
    // Version 3: add syncId index to queue table
    this.version(3).stores({
      vehicles:  'id, plateNumber, assignedRouteId',
      routes:    'id, code',
      terminals: 'id, code, name',
      schedules: 'id, weekNumber, terminalCode, status',
      queue:     'id, [terminalId+routeId], status, checkInTime, syncId',
      dispatches:'id, syncId, isSynced, dispatchTime',
      violations:'id, vehicleId, timestamp',
      syncQueue: '++id, action, timestamp',
      auditLogs: 'id, timestamp',
    });
  }
}

export const db = new OfflineDatabase();
