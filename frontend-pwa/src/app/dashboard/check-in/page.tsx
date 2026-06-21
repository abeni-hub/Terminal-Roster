'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db, LocalTerminal, LocalScheduleEntry } from '../../../db/schema';
import { SyncEngine } from '../../../db/syncEngine';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export default function CheckInPage() {
  const [user, setUser] = useState<any>(null);
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [schedules, setSchedules] = useState<LocalScheduleEntry[]>([]);
  const [termFilter, setTermFilter] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('R-001');
  const [plateInput, setPlateInput] = useState('');
  const [syncQueueSize, setSyncQueueSize] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [infoMsg, setInfoMsg] = useState('');
  const [checkedInPlates, setCheckedInPlates] = useState<string[]>([]);

  const fetchCheckedInPlates = useCallback(async () => {
    try {
      const pending = await db.queue.where('status').equals('PENDING').toArray();
      setCheckedInPlates(pending.map((p) => p.vehicleId));
    } catch (e) {
      console.error('Failed to load pending queue plates:', e);
    }
  }, []);

  const fetchTerminals = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/terminals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.clear();
        window.location.href = '/';
        return;
      }
      if (res.ok) {
        const data: LocalTerminal[] = await res.json();
        setTerminals(data);
        if (data.length > 0) {
          setTermFilter(data[0].code);
        }
        await db.terminals.bulkPut(data);
      }
    } catch {
      const cached = await db.terminals.toArray();
      setTerminals(cached);
      if (cached.length > 0) {
        setTermFilter(cached[0].code);
      }
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/schedules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.clear();
        window.location.href = '/';
        return;
      }
      if (res.ok) {
        const raw = await res.json();
        const mapped: LocalScheduleEntry[] = raw.map((s: any) => ({
          id: s.id,
          plateNumber: s.vehicle.plateNumber,
          ownerName: s.vehicle.ownerName,
          vehicleStatus: s.vehicle.status,
          terminalName: s.terminal.name,
          terminalCode: s.terminal.code,
          terminalId: s.terminal.id,
          routeCode: s.route.code,
          routeId: s.route.id,
          origin: s.route.origin,
          destination: s.route.destination,
          baseFareETB: parseFloat(s.route.baseFareETB),
          weekNumber: s.weekNumber,
          validFrom: s.validFrom,
          validUntil: s.validUntil,
          status: s.status,
          importedAt: s.importedAt,
        }));
        setSchedules(mapped);
        if (mapped.length > 0) {
          setSelectedRouteId(mapped[0].routeCode);
        }
        await db.schedules.bulkPut(mapped);
      }
    } catch {
      const cached = await db.schedules.toArray();
      setSchedules(cached);
      if (cached.length > 0) {
        setSelectedRouteId(cached[0].routeCode);
      }
    }
  }, []);

  const updateSyncSize = useCallback(async () => {
    const size = await db.syncQueue.count();
    setSyncQueueSize(size);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('aatdrs_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    fetchTerminals();
    fetchSchedules();
    updateSyncSize();
    fetchCheckedInPlates();
    setIsOnline(navigator.onLine);

    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    const interval = setInterval(() => {
      updateSyncSize();
      fetchCheckedInPlates();
    }, 3000);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      clearInterval(interval);
    };
  }, [fetchTerminals, fetchSchedules, updateSyncSize, fetchCheckedInPlates]);

  // Update selected route when terminal filter changes to ensure it's valid for non-dispatchers
  useEffect(() => {
    if (user?.roleName !== 'DISPATCHER') {
      const validRoutes = schedules.filter((s) => !termFilter || s.terminalCode === termFilter);
      if (validRoutes.length > 0) {
        const isValid = validRoutes.some((r) => r.routeCode === selectedRouteId);
        if (!isValid) {
          setSelectedRouteId(validRoutes[0].routeCode);
        }
      }
    }
  }, [termFilter, schedules, selectedRouteId, user]);

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateInput.trim()) return;

    // Prevent duplicate check-ins locally
    if (checkedInPlates.includes(plateInput.trim())) {
      setInfoMsg(`Error: Vehicle ${plateInput.trim()} is already checked in and pending dispatch.`);
      setTimeout(() => setInfoMsg(''), 4000);
      return;
    }

    // For dispatchers: use their locked assigned terminal/route from roster data.
    // For admins/planners: use the selected values from the dropdowns.
    const isDispatcher = user?.roleName === 'DISPATCHER';
    const assignedSchedule = schedules[0]; // Dispatcher's single assigned route entry

    let effectiveTerminalId: string;
    let effectiveRouteId: string;

    if (isDispatcher && assignedSchedule && terminals.length > 0) {
      effectiveTerminalId = terminals[0].id;
      effectiveRouteId = assignedSchedule.routeId || assignedSchedule.routeCode;
    } else {
      const currentTerminal = terminals.find((t) => !termFilter || t.code === termFilter) || terminals[0];
      effectiveTerminalId = currentTerminal?.id || 'UNKNOWN';
      // Resolve route UUID from schedules if available, otherwise use selectedRouteId (code)
      const matchedSchedule = schedules.find((s) => s.routeCode === selectedRouteId);
      effectiveRouteId = matchedSchedule?.routeId || selectedRouteId;
    }

    const entryId = crypto.randomUUID();
    const syncId = crypto.randomUUID();
    const now = Date.now();
    const todayCount = await db.queue.count();

    // Add locally to Dexie queue
    await db.queue.add({
      id: entryId,
      terminalId: effectiveTerminalId,
      routeId: effectiveRouteId,
      vehicleId: plateInput.trim(),
      checkInTime: now,
      status: 'PENDING',
      sequence: todayCount + 1,
      syncId,
    });

    // Add to outbox sync queue — backend uses plateNumber to resolve vehicleId
    await db.syncQueue.add({
      action: 'CHECKIN',
      payload: { plateNumber: plateInput.trim(), routeId: effectiveRouteId, terminalId: effectiveTerminalId, syncId },
      timestamp: now,
      retryCount: 0,
    });

    setPlateInput('');
    setInfoMsg(`Successfully checked in vehicle ${plateInput.trim()}!`);
    setTimeout(() => setInfoMsg(''), 4000);
    updateSyncSize();
    fetchCheckedInPlates();

    if (navigator.onLine) {
      const token = localStorage.getItem('aatdrs_token');
      if (token) {
        await SyncEngine.triggerSync('device-uuid-12345', API_URL, token);
        updateSyncSize();
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Dispatcher Terminal Operations</h2>
        <p className="text-xs text-slate-500">Record incoming minibus taxi check-ins and verify weekly assignment schedule status in real-time.</p>
      </div>

      <div className="max-w-xl bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Vehicle Check-In Form</h3>

        {infoMsg && (
          <div className="mb-5 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shrink-0 animate-ping"></span>
            {infoMsg}
          </div>
        )}

        <form onSubmit={handleCheckInSubmit} className="space-y-5">
          {/* Terminal selector — Dispatchers see only their assigned terminal (read-only) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Terminal
              {user?.roleName === 'DISPATCHER' && (
                <span className="ml-2 text-teal-500 normal-case font-normal">(roster-assigned only)</span>
              )}
            </label>
            {user?.roleName === 'DISPATCHER' ? (
              terminals.length > 0 ? (
                <div className="w-full bg-slate-950/60 border border-slate-700/50 text-teal-300 rounded-lg text-xs px-3.5 py-2.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-teal-400 rounded-full shrink-0"></span>
                  {terminals[0].name} ({terminals[0].code})
                </div>
              ) : (
                <div className="w-full bg-slate-950/60 border border-amber-700/50 text-amber-400 rounded-lg text-xs px-3.5 py-2.5">
                  No terminal assigned on current roster
                </div>
              )
            ) : (
              <select
                value={termFilter}
                onChange={(e) => setTermFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3.5 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                {terminals.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Route selector — Dispatchers see only their assigned route (read-only) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Route
              {user?.roleName === 'DISPATCHER' && (
                <span className="ml-2 text-teal-500 normal-case font-normal">(roster-assigned only)</span>
              )}
            </label>
            {user?.roleName === 'DISPATCHER' ? (
              schedules.length > 0 ? (
                <div className="w-full bg-slate-950/60 border border-slate-700/50 text-teal-300 rounded-lg text-xs px-3.5 py-2.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-teal-400 rounded-full shrink-0"></span>
                  {schedules[0].routeCode} — {schedules[0].origin} → {schedules[0].destination}
                </div>
              ) : (
                <div className="w-full bg-slate-950/60 border border-amber-700/50 text-amber-400 rounded-lg text-xs px-3.5 py-2.5">
                  No route assigned on current roster
                </div>
              )
            ) : (
              <select
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3.5 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                {schedules
                  .filter((s) => !termFilter || s.terminalCode === termFilter)
                  .filter((s, idx, arr) => arr.findIndex((x) => x.routeCode === s.routeCode) === idx)
                  .map((s) => (
                    <option key={s.routeCode} value={s.routeCode}>
                      {s.routeCode} ({s.origin} → {s.destination})
                    </option>
                  ))}
              </select>
            )}
          </div>

          {/* Plate Number — Dispatcher sees auto-complete only from their route's roster vehicles */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Plate Number
            </label>
            <input
              type="text"
              required
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
              placeholder="e.g. AA-2-B44910"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono tracking-wider"
            />
            {plateInput.length > 3 && (() => {
              const match = schedules.find((s) => s.plateNumber.includes(plateInput));
              return match ? (
                <p className="text-[10px] text-emerald-400 mt-2 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  Roster Verified: {match.origin} → {match.destination}
                </p>
              ) : plateInput.length > 6 ? (
                <p className="text-[10px] text-amber-400 mt-2 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                  Warning: Vehicle not on this week&apos;s roster for this route.
                </p>
              ) : null;
            })()}
          </div>

          {/* Roster Vehicle Quick-Select — shows ONLY vehicles assigned to selected route */}
          {(() => {
            const isDispatcher = user?.roleName === 'DISPATCHER';
            const filteredSchedules = isDispatcher 
              ? schedules 
              : schedules.filter(s => s.routeCode === selectedRouteId && (!termFilter || s.terminalCode === termFilter));
            
            if (filteredSchedules.length === 0) return null;
            
            const availableSchedules = filteredSchedules.filter(
              (s) => !checkedInPlates.includes(s.plateNumber)
            );
            
            return (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                  Roster Vehicles
                  <span className="ml-2 text-slate-600 normal-case font-normal">
                    ({availableSchedules.length} available / {filteredSchedules.length} total on {isDispatcher ? schedules[0]?.routeCode : selectedRouteId})
                  </span>
                </label>
                {availableSchedules.length === 0 ? (
                  <div className="text-[11px] text-teal-400 bg-teal-500/5 border border-teal-500/10 rounded-lg p-3 italic">
                    All rostered vehicles for this route are currently checked in and waiting in the queue.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {availableSchedules.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setPlateInput(s.plateNumber)}
                        className={`text-left px-3 py-2 rounded-lg border text-[11px] font-mono transition-all ${
                          plateInput === s.plateNumber
                            ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                      >
                        <span className="font-bold text-white">{s.plateNumber}</span>
                        <span className="block text-[9px] text-slate-500 mt-0.5 truncate">{s.ownerName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <button
            type="submit"
            disabled={schedules.length === 0 && user?.roleName === 'DISPATCHER'}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold text-xs py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/10"
          >
            {schedules.length === 0 && user?.roleName === 'DISPATCHER'
              ? 'No Active Roster Assignment'
              : 'Check In Vehicle'}
          </button>
        </form>
      </div>
    </div>
  );
}
