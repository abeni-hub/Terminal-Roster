'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, LocalQueueEntry, LocalScheduleEntry, LocalTerminal } from '../../db/schema';
import { SyncEngine } from '../../db/syncEngine';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Role meta (label + color) ─────────────────────────────────────────────────
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

// ── Shared components ─────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md">
      <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-white">{value}</h3>
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

// ── Schedule Table (shared across roles) ──────────────────────────────────────
function ScheduleTable({ rows, loading }: { rows: LocalScheduleEntry[]; loading: boolean }) {
  if (loading) {
    return <p className="text-slate-500 text-sm py-8 text-center">Loading schedule…</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
        <p className="text-slate-500 text-sm">No schedule entries found for the selected filters.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <th className="pb-3 pr-4">Plate Number</th>
            <th className="pb-3 pr-4">Terminal</th>
            <th className="pb-3 pr-4">Route</th>
            <th className="pb-3 pr-4">Week</th>
            <th className="pb-3 pr-4">Valid From</th>
            <th className="pb-3 pr-4">Valid Until</th>
            <th className="pb-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-900/30 transition-colors">
              <td className="py-3 pr-4 font-mono font-semibold text-white">{r.plateNumber}</td>
              <td className="py-3 pr-4">{r.terminalName}</td>
              <td className="py-3 pr-4">
                <span className="text-indigo-400 font-medium">{r.routeCode}</span>
                <span className="text-slate-500 ml-1 text-xs">{r.origin} → {r.destination}</span>
              </td>
              <td className="py-3 pr-4 text-slate-400">Wk {r.weekNumber}</td>
              <td className="py-3 pr-4 text-slate-400">{new Date(r.validFrom).toLocaleDateString()}</td>
              <td className="py-3 pr-4 text-slate-400">{new Date(r.validUntil).toLocaleDateString()}</td>
              <td className="py-3">
                <Badge text={r.status} variant={r.status === 'ACTIVE' ? 'green' : 'slate'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Terminal Selector (dropdown shared across roles) ──────────────────────────
function TerminalSelector({
  terminals,
  value,
  onChange,
}: {
  terminals: LocalTerminal[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
        Terminal
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500"
      >
        <option value="">All Terminals</option>
        {terminals.map((t) => (
          <option key={t.id} value={t.code}>
            {t.name} ({t.code})
          </option>
        ))}
      </select>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROLE-SPECIFIC VIEWS
// ══════════════════════════════════════════════════════════════════════════════

// ── SUPER_ADMIN / TRANSPORT_OFFICE_ADMIN ─────────────────────────────────────
function AdminView({
  terminals,
  schedules,
  schedLoading,
  termFilter,
  weekFilter,
  setTermFilter,
  setWeekFilter,
  fetchSchedules,
}: {
  terminals: LocalTerminal[];
  schedules: LocalScheduleEntry[];
  schedLoading: boolean;
  termFilter: string;
  weekFilter: string;
  setTermFilter: (v: string) => void;
  setWeekFilter: (v: string) => void;
  fetchSchedules: () => void;
}) {
  const [csvData, setCsvData] = useState('');
  const [uploadResult, setUploadResult] = useState<{ processed: number; errors: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);

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
      if (res.ok) fetchSchedules();
    } catch {
      setUploadResult({ processed: 0, errors: ['Upload failed – network error'] });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Terminals"   value={terminals.length}           />
        <StatCard label="Scheduled Vehicles" value={schedules.length}          />
        <StatCard label="Active Schedules"   value={schedules.filter(s => s.status === 'ACTIVE').length} />
        <StatCard label="Terminals in CSV"   value={[...new Set(schedules.map(s => s.terminalCode))].length} />
      </div>

      {/* CSV Upload */}
      <SectionCard title="📤 Upload Weekly Government Schedule (CSV)">
        <p className="text-slate-500 text-xs mb-3">
          Paste the government-issued CSV directly (tab or comma separated).
          Columns: <code className="text-indigo-400">plate_number, assigned_terminal, assigned_route, week_number, valid_from, valid_until, status</code>
        </p>
        <textarea
          value={csvData}
          onChange={(e) => setCsvData(e.target.value)}
          rows={8}
          placeholder={`plate_number\tassigned_terminal\tassigned_route\tweek_number\tvalid_from\tvalid_until\tstatus\nAA-2-B44910\tMegenagna\tBole\t24\t17/03/2026\t23/03/2026\tactive`}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleUpload}
            disabled={uploading || !csvData.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2 px-5 rounded-lg transition-all active:scale-[0.98] disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : 'Upload Schedule'}
          </button>
          {uploadResult && (
            <span className={`text-xs font-medium ${uploadResult.processed > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {uploadResult.processed} row(s) processed • {uploadResult.errors.length} error(s)
            </span>
          )}
        </div>
        {uploadResult?.errors?.length > 0 && (
          <ul className="mt-3 space-y-1">
            {uploadResult.errors.map((e, i) => (
              <li key={i} className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-3 py-1">
                ⚠ {e}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Schedule view */}
      <SectionCard title="📋 Weekly Vehicle Schedules">
        <div className="flex flex-wrap gap-4 mb-4">
          <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</label>
            <input
              type="number"
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              placeholder="e.g. 24"
              className="w-24 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all">
            Refresh
          </button>
        </div>
        <ScheduleTable rows={schedules} loading={schedLoading} />
      </SectionCard>
    </div>
  );
}

// ── TERMINAL_ADMIN ────────────────────────────────────────────────────────────
function TerminalAdminView({
  terminals,
  schedules,
  schedLoading,
  termFilter,
  weekFilter,
  setTermFilter,
  setWeekFilter,
  fetchSchedules,
}: {
  terminals: LocalTerminal[];
  schedules: LocalScheduleEntry[];
  schedLoading: boolean;
  termFilter: string;
  weekFilter: string;
  setTermFilter: (v: string) => void;
  setWeekFilter: (v: string) => void;
  fetchSchedules: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Vehicles Assigned" value={schedules.length} />
        <StatCard label="Active"            value={schedules.filter(s => s.status === 'ACTIVE').length} />
        <StatCard label="Terminals"         value={terminals.length} />
      </div>

      <SectionCard title="📋 Terminal Vehicle Schedule">
        <div className="flex flex-wrap gap-4 mb-4">
          <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</label>
            <input
              type="number"
              value={weekFilter}
              onChange={(e) => setWeekFilter(e.target.value)}
              placeholder="e.g. 24"
              className="w-24 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all">
            Refresh
          </button>
        </div>
        <ScheduleTable rows={schedules} loading={schedLoading} />
      </SectionCard>
    </div>
  );
}

// ── SUPERVISOR ────────────────────────────────────────────────────────────────
function SupervisorView({
  terminals,
  schedules,
  schedLoading,
  termFilter,
  weekFilter,
  setTermFilter,
  setWeekFilter,
  fetchSchedules,
  pendingQueue,
}: {
  terminals: LocalTerminal[];
  schedules: LocalScheduleEntry[];
  schedLoading: boolean;
  termFilter: string;
  weekFilter: string;
  setTermFilter: (v: string) => void;
  setWeekFilter: (v: string) => void;
  fetchSchedules: () => void;
  pendingQueue: LocalQueueEntry[];
}) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Queue Size"         value={pendingQueue.length} sub="Vehicles pending dispatch" />
        <StatCard label="Assigned this Week" value={schedules.length} />
        <StatCard label="Active Terminals"   value={terminals.length} />
      </div>

      {/* Live Queue */}
      <SectionCard title="🚦 Live FIFO Queue (Read + Override)">
        {pendingQueue.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
            <p className="text-slate-500 text-sm">No vehicles currently in queue.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Pos</th>
                  <th className="pb-3 pr-4">Vehicle ID</th>
                  <th className="pb-3 pr-4">Check-In</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 text-right">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {pendingQueue.map((entry, index) => (
                  <tr key={entry.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 pr-4 font-semibold text-indigo-400">#{index + 1}</td>
                    <td className="py-3 pr-4 font-mono font-semibold text-white">{entry.vehicleId}</td>
                    <td className="py-3 pr-4 text-slate-400">{new Date(entry.checkInTime).toLocaleTimeString()}</td>
                    <td className="py-3 pr-4">
                      <Badge text={entry.status} variant={entry.status === 'PENDING' ? 'amber' : 'green'} />
                    </td>
                    <td className="py-3 text-right">
                      <button className="text-xs bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/20 py-1 px-3 rounded-lg transition-all">
                        Override
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Schedule */}
      <SectionCard title="📋 Weekly Assignment Schedule">
        <div className="flex flex-wrap gap-4 mb-4">
          <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</label>
            <input type="number" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} placeholder="e.g. 24" className="w-24 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          </div>
          <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all">Refresh</button>
        </div>
        <ScheduleTable rows={schedules} loading={schedLoading} />
      </SectionCard>
    </div>
  );
}

// ── DISPATCHER ────────────────────────────────────────────────────────────────
function DispatcherView({
  terminals,
  schedules,
  schedLoading,
  termFilter,
  weekFilter,
  setTermFilter,
  setWeekFilter,
  fetchSchedules,
  pendingQueue,
  syncQueueSize,
  isOnline,
  onCheckIn,
  onDispatch,
  onSync,
}: {
  terminals: LocalTerminal[];
  schedules: LocalScheduleEntry[];
  schedLoading: boolean;
  termFilter: string;
  weekFilter: string;
  setTermFilter: (v: string) => void;
  setWeekFilter: (v: string) => void;
  fetchSchedules: () => void;
  pendingQueue: LocalQueueEntry[];
  syncQueueSize: number;
  isOnline: boolean;
  onCheckIn: (plate: string, routeId: string, terminalId: string) => Promise<void>;
  onDispatch: (entryId: string, vehicleId: string, routeId: string) => Promise<void>;
  onSync: () => void;
}) {
  const [plateInput, setPlateInput] = useState('');
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('R-001');

  // When termFilter changes, find matching terminal id
  const currentTerminal = terminals.find(t => t.code === termFilter) || terminals[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateInput.trim()) return;
    const tid = currentTerminal?.id || 'MEG-01';
    await onCheckIn(plateInput.trim(), selectedRouteId, tid);
    setPlateInput('');
  };

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pending Sync" value={syncQueueSize} sub={isOnline ? 'Online' : 'Offline mode'} />
        <StatCard label="Queue Size"   value={pendingQueue.length} sub="Vehicles waiting" />
        <StatCard label="My Schedule"  value={schedules.filter(s => s.status === 'ACTIVE').length} sub="Active this week" />
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 flex items-center justify-center">
          <span className={`inline-flex items-center gap-2 text-sm font-medium ${isOnline ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            {isOnline ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Check-In Form */}
        <SectionCard title="🚗 Vehicle Check-In">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Terminal</label>
              <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Route</label>
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-2 focus:outline-none focus:border-indigo-500"
              >
                {schedules
                  .filter(s => !termFilter || s.terminalCode === termFilter)
                  .filter((s, i, arr) => arr.findIndex(x => x.routeCode === s.routeCode) === i)
                  .map(s => (
                    <option key={s.routeCode} value={s.routeCode}>
                      {s.routeCode} ({s.origin} → {s.destination})
                    </option>
                  ))}
                <option value="R-001">R-001 (Megenagna → Bole)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Plate Number</label>
              <input
                type="text"
                required
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                placeholder="e.g. AA-2-B44910"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
              {/* Schedule lookup hint */}
              {plateInput.length > 4 && (
                (() => {
                  const match = schedules.find(s => s.plateNumber.includes(plateInput));
                  return match ? (
                    <p className="text-xs text-emerald-400 mt-1">
                      ✔ Scheduled: {match.origin} → {match.destination} (Wk {match.weekNumber})
                    </p>
                  ) : plateInput.length > 6 ? (
                    <p className="text-xs text-amber-400 mt-1">⚠ Not found in this week's schedule</p>
                  ) : null;
                })()
              )}
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 rounded-lg transition-all active:scale-[0.98]">
              Add to Queue
            </button>
            {syncQueueSize > 0 && isOnline && (
              <button type="button" onClick={onSync} className="w-full bg-emerald-700/30 hover:bg-emerald-700/50 text-emerald-400 border border-emerald-500/20 text-sm py-2 rounded-lg transition-all">
                Sync {syncQueueSize} pending record(s)
              </button>
            )}
          </form>
        </SectionCard>

        {/* Live Queue */}
        <div className="lg:col-span-2">
          <SectionCard title="⚡ Live FIFO Dispatch Queue">
            {pendingQueue.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500 text-sm">Queue is empty. Use check-in form to add vehicles.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="pb-3 pr-3">Pos</th>
                      <th className="pb-3 pr-3">Plate Number</th>
                      <th className="pb-3 pr-3">Check-In</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {pendingQueue.map((entry, index) => (
                      <tr key={entry.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 pr-3 font-semibold text-indigo-400">#{index + 1}</td>
                        <td className="py-3 pr-3 font-mono font-semibold text-white">{entry.vehicleId}</td>
                        <td className="py-3 pr-3 text-slate-400">{new Date(entry.checkInTime).toLocaleTimeString()}</td>
                        <td className="py-3 text-right">
                          {index === 0 ? (
                            <button
                              onClick={() => onDispatch(entry.id, entry.vehicleId, entry.routeId)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-1.5 px-4 rounded-lg transition-all active:scale-[0.98]"
                            >
                              Dispatch
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600 italic">Awaiting turn</span>
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

      {/* Weekly schedule pane */}
      <SectionCard title="📋 Weekly Assignment Schedule">
        <div className="flex flex-wrap gap-4 mb-4">
          <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</label>
            <input type="number" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} placeholder="e.g. 24" className="w-24 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          </div>
          <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all">Refresh</button>
        </div>
        <ScheduleTable rows={schedules} loading={schedLoading} />
      </SectionCard>
    </div>
  );
}

// ── AUDITOR ───────────────────────────────────────────────────────────────────
function AuditorView({
  terminals, schedules, schedLoading, termFilter, weekFilter, setTermFilter, setWeekFilter, fetchSchedules,
}: {
  terminals: LocalTerminal[]; schedules: LocalScheduleEntry[]; schedLoading: boolean;
  termFilter: string; weekFilter: string; setTermFilter: (v: string) => void; setWeekFilter: (v: string) => void; fetchSchedules: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Schedules" value={schedules.length} />
        <StatCard label="Active"          value={schedules.filter(s => s.status === 'ACTIVE').length} />
        <StatCard label="Inactive"        value={schedules.filter(s => s.status !== 'ACTIVE').length} />
        <StatCard label="Terminals"       value={terminals.length} />
      </div>

      <SectionCard title="📋 Schedule Audit Log (Read-Only)">
        <div className="flex flex-wrap gap-4 mb-4">
          <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</label>
            <input type="number" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} placeholder="e.g. 24" className="w-24 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          </div>
          <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all">Refresh</button>
        </div>
        <ScheduleTable rows={schedules} loading={schedLoading} />
      </SectionCard>
    </div>
  );
}

// ── FINANCE_OFFICER ───────────────────────────────────────────────────────────
function FinanceView({
  terminals, schedules, schedLoading, termFilter, weekFilter, setTermFilter, setWeekFilter, fetchSchedules,
}: {
  terminals: LocalTerminal[]; schedules: LocalScheduleEntry[]; schedLoading: boolean;
  termFilter: string; weekFilter: string; setTermFilter: (v: string) => void; setWeekFilter: (v: string) => void; fetchSchedules: () => void;
}) {
  const totalFare = schedules.reduce((s, r) => s + r.baseFareETB, 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Vehicles Scheduled" value={schedules.length} />
        <StatCard label="Active"             value={schedules.filter(s => s.status === 'ACTIVE').length} />
        <StatCard label="Est. Fare Revenue"  value={`${totalFare.toFixed(2)} ETB`} sub="Base fares × assigned vehicles" />
        <StatCard label="Terminals"          value={terminals.length} />
      </div>

      <SectionCard title="💰 Schedule & Revenue Overview">
        <div className="flex flex-wrap gap-4 mb-4">
          <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</label>
            <input type="number" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} placeholder="e.g. 24" className="w-24 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          </div>
          <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all">Refresh</button>
        </div>
        <ScheduleTable rows={schedules} loading={schedLoading} />
      </SectionCard>
    </div>
  );
}

// ── SYSTEM_SUPPORT ────────────────────────────────────────────────────────────
function SystemSupportView({
  terminals, schedules, schedLoading, termFilter, weekFilter, setTermFilter, setWeekFilter, fetchSchedules,
}: {
  terminals: LocalTerminal[]; schedules: LocalScheduleEntry[]; schedLoading: boolean;
  termFilter: string; weekFilter: string; setTermFilter: (v: string) => void; setWeekFilter: (v: string) => void; fetchSchedules: () => void;
}) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Terminals"   value={terminals.length} />
        <StatCard label="Schedules"   value={schedules.length} />
        <StatCard label="DB Version"  value="v2" sub="Dexie IndexedDB" />
      </div>

      <SectionCard title="🔧 System — All Schedules">
        <div className="flex flex-wrap gap-4 mb-4">
          <TerminalSelector terminals={terminals} value={termFilter} onChange={setTermFilter} />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Week</label>
            <input type="number" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} placeholder="e.g. 24" className="w-24 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm px-3 py-1.5 focus:outline-none focus:border-indigo-500" />
          </div>
          <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition-all">Refresh</button>
        </div>
        <ScheduleTable rows={schedules} loading={schedLoading} />
      </SectionCard>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const router = useRouter();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  // ── Schedule state ────────────────────────────────────────────────────────
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [schedules, setSchedules] = useState<LocalScheduleEntry[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [termFilter, setTermFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('');

  // ── Queue state ───────────────────────────────────────────────────────────
  const [pendingQueue, setPendingQueue] = useState<LocalQueueEntry[]>([]);
  const [syncQueueSize, setSyncQueueSize] = useState(0);

  // ── Fetch terminals ───────────────────────────────────────────────────────
  const fetchTerminals = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/terminals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: LocalTerminal[] = await res.json();
        setTerminals(data);
        // Cache locally
        await db.terminals.bulkPut(data);
      }
    } catch {
      // Fallback to local cache
      const cached = await db.terminals.toArray();
      setTerminals(cached);
    }
  }, []);

  // ── Fetch schedules ───────────────────────────────────────────────────────
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
      // Fallback to cached data
      const cached = await db.schedules.toArray();
      setSchedules(cached);
    } finally {
      setSchedLoading(false);
    }
  }, [termFilter, weekFilter]);

  // ── Load local queue ──────────────────────────────────────────────────────
  const loadLocalData = useCallback(async () => {
    const size  = await db.syncQueue.count();
    setSyncQueueSize(size);
    const list  = await db.queue.where('status').equals('PENDING').toArray();
    list.sort((a, b) => a.checkInTime - b.checkInTime || a.sequence - b.sequence);
    setPendingQueue(list);
  }, []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
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

  // Fetch schedules when filters change
  useEffect(() => {
    if (user) fetchSchedules();
  }, [termFilter, weekFilter, user, fetchSchedules]);

  // ── Actions (for dispatcher) ──────────────────────────────────────────────
  const handleCheckIn = async (plate: string, routeId: string, terminalId: string) => {
    const entryId   = crypto.randomUUID();
    const syncId    = crypto.randomUUID();
    const now       = Date.now();
    const todayCount = await db.queue.count();
    await db.queue.add({ id: entryId, terminalId, routeId, vehicleId: plate, checkInTime: now, status: 'PENDING', sequence: todayCount + 1, syncId });
    await db.syncQueue.add({ action: 'CHECKIN', payload: { plateNumber: plate, routeId, terminalId, syncId }, timestamp: now, retryCount: 0 });
    loadLocalData();
    if (isOnline) triggerSync();
  };

  const handleDispatch = async (entryId: string, vehicleId: string, routeId: string) => {
    const syncId = crypto.randomUUID();
    const now    = Date.now();
    await db.queue.update(entryId, { status: 'DISPATCHED' });
    await db.dispatches.add({ id: crypto.randomUUID(), terminalId: 'MEG-01', routeId, vehicleId, dispatcherId: user?.username || '', dispatchTime: now, fareChargedETB: 15, syncId, isSynced: 0 });
    await db.syncQueue.add({ action: 'DISPATCH', payload: { routeId, vehicleId, syncId }, timestamp: now, retryCount: 0 });
    loadLocalData();
    if (isOnline) triggerSync();
  };

  const triggerSync = async () => {
    const token = localStorage.getItem('aatdrs_token');
    if (token) { await SyncEngine.triggerSync('device-uuid-12345', API_URL, token); loadLocalData(); }
  };

  const handleLogout = () => { localStorage.clear(); router.push('/'); };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!user) return null;

  const roleMeta = ROLE_META[user.roleName] || { label: user.roleName, color: 'from-slate-600 to-slate-500' };

  // Shared view props
  const sharedProps = { terminals, schedules, schedLoading, termFilter, weekFilter, setTermFilter, setWeekFilter, fetchSchedules };

  // Render role-specific content
  const renderContent = () => {
    switch (user.roleName) {
      case 'SUPER_ADMIN':
      case 'TRANSPORT_OFFICE_ADMIN':
        return <AdminView {...sharedProps} />;
      case 'TERMINAL_ADMIN':
        return <TerminalAdminView {...sharedProps} />;
      case 'SUPERVISOR':
        return <SupervisorView {...sharedProps} pendingQueue={pendingQueue} />;
      case 'DISPATCHER':
        return (
          <DispatcherView
            {...sharedProps}
            pendingQueue={pendingQueue}
            syncQueueSize={syncQueueSize}
            isOnline={isOnline}
            onCheckIn={handleCheckIn}
            onDispatch={handleDispatch}
            onSync={triggerSync}
          />
        );
      case 'AUDITOR':
        return <AuditorView {...sharedProps} />;
      case 'FINANCE_OFFICER':
        return <FinanceView {...sharedProps} />;
      case 'SYSTEM_SUPPORT':
        return <SystemSupportView {...sharedProps} />;
      default:
        return <AuditorView {...sharedProps} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Logo */}
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
            {/* Online badge */}
            <span className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>
            {/* User info */}
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
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Role banner */}
        <div className={`mb-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${roleMeta.color} bg-opacity-10`}>
          <span className="text-xs font-bold text-white uppercase tracking-widest">{roleMeta.label} Dashboard</span>
        </div>
        {renderContent()}
      </main>
    </div>
  );
}
