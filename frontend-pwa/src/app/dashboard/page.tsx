'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, LocalQueueEntry, LocalScheduleEntry, LocalTerminal } from '../../db/schema';
import { SyncEngine } from '../../db/syncEngine';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

type RoleName =
  | 'SUPER_ADMIN'
  | 'TRANSPORT_OFFICE_ADMIN'
  | 'TERMINAL_ADMIN'
  | 'SUPERVISOR'
  | 'DISPATCHER'
  | 'AUDITOR'
  | 'FINANCE_OFFICER'
  | 'SYSTEM_SUPPORT';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  roleName: RoleName;
}

const ROLE_META: Record<RoleName, { label: string; color: string }> = {
  SUPER_ADMIN:             { label: 'Super Admin',           color: 'from-violet-600 to-purple-600'  },
  TRANSPORT_OFFICE_ADMIN:  { label: 'Transport Office Admin', color: 'from-blue-600 to-cyan-600'      },
  TERMINAL_ADMIN:          { label: 'Terminal Admin',         color: 'from-indigo-600 to-blue-600'    },
  SUPERVISOR:              { label: 'Supervisor',             color: 'from-amber-600 to-orange-500'   },
  DISPATCHER:              { label: 'Dispatcher',             color: 'from-emerald-600 to-teal-600'   },
  AUDITOR:                 { label: 'Auditor',                color: 'from-slate-500 to-slate-400'    },
  FINANCE_OFFICER:         { label: 'Finance Officer',        color: 'from-rose-600 to-pink-500'      },
  SYSTEM_SUPPORT:          { label: 'System Support',         color: 'from-sky-600 to-blue-500'       },
};

// ── Shared UI widgets ────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md transition-all hover:border-slate-700/50">
      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-white tracking-tight">{value}</h3>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-md">
      <h3 className="text-lg font-bold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Badge({ text, variant }: { text: string; variant: 'green' | 'amber' | 'red' | 'blue' | 'slate' }) {
  const cls = {
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    amber: 'bg-amber-500/10  text-amber-400  border-amber-500/20',
    red:   'bg-red-500/10    text-red-400    border-red-500/20',
    blue:  'bg-blue-500/10   text-blue-400   border-blue-500/20',
    slate: 'bg-slate-500/10  text-slate-400  border-slate-500/20',
  }[variant];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {text}
    </span>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  // ── States ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [schedules, setSchedules] = useState<LocalScheduleEntry[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  
  // Filters
  const [termFilter, setTermFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('');

  // Queue
  const [pendingQueue, setPendingQueue] = useState<LocalQueueEntry[]>([]);
  const [syncQueueSize, setSyncQueueSize] = useState(0);

  // Forms
  const [csvData, setCsvData] = useState('');
  const [uploadResult, setUploadResult] = useState<{ processed: number; errors: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [plateInput, setPlateInput] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('R-001');

  // ── Database Fetching ───────────────────────────────────────────────────────
  const fetchTerminals = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/terminals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: LocalTerminal[] = await res.json();
        setTerminals(data);
        await db.terminals.bulkPut(data);
      }
    } catch {
      const cached = await db.terminals.toArray();
      setTerminals(cached);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    setSchedLoading(true);
    try {
      const params = new URLSearchParams();
      if (termFilter)  params.set('terminalCode', termFilter);
      if (weekFilter)  params.set('weekNumber',   weekFilter);
      const url = `${API_URL}/roster/schedules${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const raw = await res.json();
        const mapped: LocalScheduleEntry[] = raw.map((s: any) => ({
          id:           s.id,
          plateNumber:  s.vehicle.plateNumber,
          ownerName:    s.vehicle.ownerName,
          vehicleStatus:s.vehicle.status,
          terminalName: s.terminal.name,
          terminalCode: s.terminal.code,
          routeCode:    s.route.code,
          origin:       s.route.origin,
          destination:  s.route.destination,
          baseFareETB:  parseFloat(s.route.baseFareETB),
          weekNumber:   s.weekNumber,
          validFrom:    s.validFrom,
          validUntil:   s.validUntil,
          status:       s.status,
          importedAt:   s.importedAt,
        }));
        setSchedules(mapped);
        await db.schedules.bulkPut(mapped);
      }
    } catch {
      const cached = await db.schedules.toArray();
      setSchedules(cached);
    } finally {
      setSchedLoading(false);
    }
  }, [termFilter, weekFilter]);

  const loadLocalData = useCallback(async () => {
    const size  = await db.syncQueue.count();
    setSyncQueueSize(size);
    const list  = await db.queue.where('status').equals('PENDING').toArray();
    list.sort((a, b) => a.checkInTime - b.checkInTime || a.sequence - b.sequence);
    setPendingQueue(list);
  }, []);

  // ── Sync Actions ────────────────────────────────────────────────────────────
  const triggerSync = async () => {
    const token = localStorage.getItem('aatdrs_token');
    if (token) {
      await SyncEngine.triggerSync('device-uuid-12345', API_URL, token);
      loadLocalData();
    }
  };

  // ── Setup & Bootstrapping ──────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedUser = localStorage.getItem('aatdrs_user');
    const token      = localStorage.getItem('aatdrs_token');
    if (!storedUser || !token) { router.push('/'); return; }
    setUser(JSON.parse(storedUser));
    setIsOnline(navigator.onLine);

    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online',  updateOnline);
    window.addEventListener('offline', updateOnline);

    fetchTerminals();
    loadLocalData();

    const timer = setInterval(loadLocalData, 2000);
    return () => {
      window.removeEventListener('online',  updateOnline);
      window.removeEventListener('offline', updateOnline);
      clearInterval(timer);
    };
  }, [fetchTerminals, loadLocalData, router]);

  useEffect(() => {
    if (user) fetchSchedules();
  }, [termFilter, weekFilter, user, fetchSchedules]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!csvData.trim()) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const token = localStorage.getItem('aatdrs_token');
      const res = await fetch(`${API_URL}/roster/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ csvData }),
      });
      const data = await res.json();
      setUploadResult(data);
      if (res.ok) {
        setCsvData('');
        fetchSchedules();
      }
    } catch {
      setUploadResult({ processed: 0, errors: ['Upload failed – network error'] });
    } finally {
      setUploading(false);
    }
  };

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateInput.trim()) return;
    const currentTerminal = terminals.find(t => !termFilter || t.code === termFilter) || terminals[0];
    const tid = currentTerminal?.id || 'MEG-01';

    const entryId   = crypto.randomUUID();
    const syncId    = crypto.randomUUID();
    const now       = Date.now();
    const todayCount = await db.queue.count();
    
    await db.queue.add({
      id: entryId,
      terminalId: tid,
      routeId: selectedRouteId,
      vehicleId: plateInput.trim(),
      checkInTime: now,
      status: 'PENDING',
      sequence: todayCount + 1,
      syncId,
    });
    
    await db.syncQueue.add({
      action: 'CHECKIN',
      payload: { plateNumber: plateInput.trim(), routeId: selectedRouteId, terminalId: tid, syncId },
      timestamp: now,
      retryCount: 0,
    });

    setPlateInput('');
    loadLocalData();
    if (isOnline) triggerSync();
  };

  const handleDispatch = async (entryId: string, vehicleId: string, routeId: string) => {
    const syncId = crypto.randomUUID();
    const now    = Date.now();
    await db.queue.update(entryId, { status: 'DISPATCHED' });
    await db.dispatches.add({
      id: crypto.randomUUID(),
      terminalId: 'MEG-01',
      routeId,
      vehicleId,
      dispatcherId: user?.username || '',
      dispatchTime: now,
      fareChargedETB: 15,
      syncId,
      isSynced: 0,
    });
    await db.syncQueue.add({
      action: 'DISPATCH',
      payload: { routeId, vehicleId, syncId },
      timestamp: now,
      retryCount: 0,
    });
    loadLocalData();
    if (isOnline) triggerSync();
  };

  const handleOverride = async (entryId: string, vehicleId: string) => {
    const syncId = crypto.randomUUID();
    const now    = Date.now();
    await db.queue.update(entryId, { status: 'SKIPPED' });
    await db.syncQueue.add({
      action: 'OVERRIDE',
      payload: {
        queueEntryId: entryId,
        overrideType: 'VEHICLE_SKIP',
        reason: 'Supervisor manual queue bypass (offline)',
        signature: `SIG-${user?.username?.toUpperCase()}-${now}`,
        syncId,
      },
      timestamp: now,
      retryCount: 0,
    });
    loadLocalData();
    if (isOnline) triggerSync();
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  if (!user) return null;

  const roleMeta = ROLE_META[user.roleName] || { label: user.roleName, color: 'from-slate-600 to-slate-500' };

  // ── Role Permissions Checks ────────────────────────────────────────────────
  const canUpload = user.roleName === 'SUPER_ADMIN' || user.roleName === 'TRANSPORT_OFFICE_ADMIN';
  const canCheckIn = user.roleName === 'SUPER_ADMIN' || user.roleName === 'DISPATCHER';
  const canDispatch = user.roleName === 'SUPER_ADMIN' || user.roleName === 'DISPATCHER';
  const canOverride = user.roleName === 'SUPER_ADMIN' || user.roleName === 'SUPERVISOR';

  // ── Calculation ────────────────────────────────────────────────────────────
  const estFareRevenue = schedules
    .filter(s => s.status === 'ACTIVE')
    .reduce((sum, s) => sum + s.baseFareETB, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleMeta.color} flex items-center justify-center shadow-lg`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Addis Ababa Transport Office</h1>
              <p className="text-slate-500 text-xs">Terminal Digital Roster System</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-200 leading-tight">{user.username}</p>
              <p className={`text-xs font-medium bg-gradient-to-r ${roleMeta.color} bg-clip-text text-transparent`}>
                {roleMeta.label}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 py-1.5 px-3 rounded-lg transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Role banner */}
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${roleMeta.color} bg-opacity-10`}>
          <span className="text-xs font-bold text-white uppercase tracking-widest">{roleMeta.label} Dashboard</span>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Total Terminals" value={terminals.length} />
          <StatCard label="Scheduled Vehicles" value={schedules.length} />
          <StatCard label="Active Schedules" value={schedules.filter(s => s.status === 'ACTIVE').length} />
          <StatCard label="Queue Size" value={pendingQueue.length} sub="Pending dispatch" />
          <StatCard label="Pending Sync" value={syncQueueSize} sub={isOnline ? 'Online' : 'Offline mode'} />
          <StatCard label="Est. Fare Revenue" value={`${estFareRevenue.toFixed(2)} ETB`} sub="Base fare totals" />
        </div>

        {/* ── Primary Columns Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Operations (Left Column) */}
          <div className="lg:col-span-1 space-y-8">
            
            {/* CSV Upload */}
            <SectionCard title="📤 Upload Weekly Government Schedule">
              <p className="text-slate-500 text-xs mb-3">
                Paste the government-issued CSV weekly schedule. Expected columns: <br />
                <code className="text-indigo-400 font-mono text-[10px]">plate_number, assigned_terminal, assigned_route, week_number, valid_from, valid_until, status</code>
              </p>
              
              <textarea
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                disabled={!canUpload}
                rows={6}
                placeholder={
                  canUpload
                    ? "plate_number\tassigned_terminal\tassigned_route\tweek_number\tvalid_from\tvalid_until\tstatus\nAA-2-B44910\tMegenagna\tBole\t24\t17/03/2026\t23/03/2026\tactive"
                    : "🔒 Weekly schedule uploads are restricted to Transport Office Administrators."
                }
                className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono ${!canUpload && 'opacity-60 cursor-not-allowed'}`}
              />

              {canUpload ? (
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={handleUpload}
                    disabled={uploading || !csvData.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all active:scale-[0.98] disabled:opacity-40"
                  >
                    {uploading ? 'Uploading…' : 'Upload CSV'}
                  </button>
                  {uploadResult && (
                    <span className={`text-xs font-medium ${uploadResult.processed > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {uploadResult.processed} rows processed • {uploadResult.errors.length} errors
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500 italic bg-slate-950/40 border border-slate-900 rounded p-2 text-center">
                  Read-only: Restricted role action
                </div>
              )}

              {uploadResult?.errors && uploadResult.errors.length > 0 && (
                <ul className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                  {uploadResult.errors.map((err, idx) => (
                    <li key={idx} className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-2.5 py-1">
                      ⚠ {err}
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            {/* Vehicle Check-In Form */}
            <SectionCard title="🚗 Vehicle Check-In">
              <form onSubmit={handleCheckInSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Terminal</label>
                  <select
                    value={termFilter}
                    onChange={(e) => setTermFilter(e.target.value)}
                    disabled={!canCheckIn}
                    className={`w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500 ${!canCheckIn && 'opacity-60 cursor-not-allowed'}`}
                  >
                    <option value="">All Terminals (Default)</option>
                    {terminals.map((t) => (
                      <option key={t.id} value={t.code}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Route Code</label>
                  <select
                    value={selectedRouteId}
                    onChange={(e) => setSelectedRouteId(e.target.value)}
                    disabled={!canCheckIn}
                    className={`w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500 ${!canCheckIn && 'opacity-60 cursor-not-allowed'}`}
                  >
                    {schedules
                      .filter(s => !termFilter || s.terminalCode === termFilter)
                      .filter((s, idx, arr) => arr.findIndex(x => x.routeCode === s.routeCode) === idx)
                      .map(s => (
                        <option key={s.routeCode} value={s.routeCode}>
                          {s.routeCode} ({s.origin} → {s.destination})
                        </option>
                      ))}
                    <option value="R-001">R-001 (Megenagna → Bole)</option>
                    <option value="R-002">R-002 (Megenagna → Piassa)</option>
                    <option value="R-003">R-003 (Merkato → Piassa)</option>
                    <option value="R-004">R-004 (Kaliti → Saris)</option>
                    <option value="R-005">R-005 (Piassa → Arat Kilo)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Plate Number</label>
                  <input
                    type="text"
                    required
                    value={plateInput}
                    onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                    disabled={!canCheckIn}
                    placeholder="e.g. AA-2-B44910"
                    className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono ${!canCheckIn && 'opacity-60 cursor-not-allowed'}`}
                  />
                  {plateInput.length > 3 && (
                    (() => {
                      const match = schedules.find(s => s.plateNumber.includes(plateInput));
                      return match ? (
                        <p className="text-[10px] text-emerald-400 mt-1">
                          ✔ Weekly Roster OK: {match.origin} → {match.destination}
                        </p>
                      ) : plateInput.length > 6 ? (
                        <p className="text-[10px] text-amber-400 mt-1">⚠ Not assigned in active weekly schedule</p>
                      ) : null;
                    })()
                  )}
                </div>

                {canCheckIn ? (
                  <button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs py-2 rounded-lg transition-all active:scale-[0.98]"
                  >
                    Add to Queue
                  </button>
                ) : (
                  <div className="text-xs text-slate-500 italic bg-slate-950/40 border border-slate-900 rounded p-2 text-center">
                    Read-only: Restricted role action
                  </div>
                )}

                {syncQueueSize > 0 && isOnline && (
                  <button
                    type="button"
                    onClick={triggerSync}
                    className="w-full bg-emerald-700/20 hover:bg-emerald-700/40 text-emerald-400 border border-emerald-500/20 text-xs py-2 rounded-lg transition-all"
                  >
                    Sync Offline Logs ({syncQueueSize})
                  </button>
                )}
              </form>
            </SectionCard>
          </div>

          {/* Live Queue (Right Column) */}
          <div className="lg:col-span-2">
            <SectionCard title="⚡ Live FIFO Dispatch Queue">
              {pendingQueue.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-sm">No vehicles currently in queue.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="pb-3 pr-3">Pos</th>
                        <th className="pb-3 pr-3">Plate Number</th>
                        <th className="pb-3 pr-3">Check-In Time</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {pendingQueue.map((entry, index) => (
                        <tr key={entry.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="py-3 pr-3 font-bold text-indigo-400">#{index + 1}</td>
                          <td className="py-3 pr-3 font-mono font-semibold text-white">{entry.vehicleId}</td>
                          <td className="py-3 pr-3 text-slate-400">{new Date(entry.checkInTime).toLocaleTimeString()}</td>
                          <td className="py-3 text-right flex items-center justify-end gap-2">
                            {/* Override action (Supervisors / Admins) */}
                            {canOverride && (
                              <button
                                onClick={() => handleOverride(entry.id, entry.vehicleId)}
                                className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/20 text-[10px] font-semibold py-1 px-2.5 rounded-lg transition-all"
                              >
                                Skip Queue
                              </button>
                            )}

                            {/* Dispatch action (Dispatchers / Admins - strict FIFO on 1st element) */}
                            {index === 0 ? (
                              canDispatch ? (
                                <button
                                  onClick={() => handleDispatch(entry.id, entry.vehicleId, entry.routeId)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-semibold py-1 px-3 rounded-lg transition-all active:scale-[0.98]"
                                >
                                  Dispatch
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-medium">Ready</span>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-600 italic">Awaiting turn</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ── Weekly Assignment Schedule (Bottom Pane) ── */}
        <SectionCard title="📋 Weekly Vehicle Assignment Schedule">
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Terminal</label>
              <select
                value={termFilter}
                onChange={(e) => setTermFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Terminals</option>
                {terminals.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Week</label>
              <input
                type="number"
                value={weekFilter}
                onChange={(e) => setWeekFilter(e.target.value)}
                placeholder="e.g. 24"
                className="w-20 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <button
              onClick={fetchSchedules}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-4 py-1.5 rounded-lg transition-all"
            >
              Refresh Table
            </button>
          </div>

          {schedLoading ? (
            <p className="text-slate-500 text-xs py-10 text-center">Loading weekly schedules...</p>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500 text-xs">No vehicle schedule assignments found for the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Plate Number</th>
                    <th className="pb-3 pr-4">Assigned Terminal</th>
                    <th className="pb-3 pr-4">Assigned Route</th>
                    <th className="pb-3 pr-4">Week Number</th>
                    <th className="pb-3 pr-4">Valid From</th>
                    <th className="pb-3 pr-4">Valid Until</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                  {schedules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3 pr-4 font-mono font-bold text-white">{r.plateNumber}</td>
                      <td className="py-3 pr-4 text-slate-400">{r.terminalName}</td>
                      <td className="py-3 pr-4">
                        <span className="text-indigo-400 font-bold">{r.routeCode}</span>
                        <span className="text-slate-500 ml-1.5 text-[10px] font-normal">({r.origin} → {r.destination})</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-400 font-mono">Wk {r.weekNumber}</td>
                      <td className="py-3 pr-4 text-slate-400 font-mono">{new Date(r.validFrom).toLocaleDateString()}</td>
                      <td className="py-3 pr-4 text-slate-400 font-mono">{new Date(r.validUntil).toLocaleDateString()}</td>
                      <td className="py-3">
                        <Badge text={r.status.toLowerCase()} variant={r.status === 'ACTIVE' ? 'green' : 'slate'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </main>
    </div>
  );
}
