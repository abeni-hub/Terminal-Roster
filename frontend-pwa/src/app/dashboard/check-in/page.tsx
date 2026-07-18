'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db, LocalTerminal, LocalScheduleEntry } from '../../../db/schema';
import { SyncEngine } from '../../../db/syncEngine';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const readPersistedState = (key: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
};

export default function CheckInPage() {
  const [user, setUser] = useState<any>(null);
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [schedules, setSchedules] = useState<LocalScheduleEntry[]>([]);
  const [termFilter, setTermFilter] = useState(() => readPersistedState('checkin.termFilter', ''));
  const [selectedRouteId, setSelectedRouteId] = useState(() => readPersistedState('checkin.selectedRouteId', 'R-001'));
  const [plateInput, setPlateInput] = useState(() => readPersistedState('checkin.plateInput', ''));
  const [syncQueueSize, setSyncQueueSize] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [infoMsg, setInfoMsg] = useState('');
  const [checkedInPlates, setCheckedInPlates] = useState<string[]>([]);
  const [plateSearch, setPlateSearch] = useState(''); // search within roster vehicles
  const [allVehicles, setAllVehicles] = useState<any[]>([]);
  const [checkInRemark, setCheckInRemark] = useState(() => readPersistedState('checkin.remark', ''));
  const [showViolationHint, setShowViolationHint] = useState(false);

  // Dispatcher roster assignments
  const [myRoster, setMyRoster] = useState<any>(null);
  const [myAssignments, setMyAssignments] = useState<any[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(() => Number(readPersistedState('checkin.selectedRouteIdx', '0')));

  const fetchAllVehicles = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAllVehicles(data);
        await db.vehicles.bulkPut(data.map((v: any) => ({
          id: v.id,
          plateNumber: v.plateNumber,
          ownerName: v.ownerName,
          status: v.status,
          assignedRouteId: '',
        })));
      }
    } catch {
      const cached = await db.vehicles.toArray();
      setAllVehicles(cached);
    }
  }, []);

  const fetchMyAssignments = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/my-assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMyRoster(data.roster);
        setMyAssignments(data.assignments || []);
        setSelectedRouteIdx(0);
      }
    } catch {}
  }, []);

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

  const refreshDashboardData = useCallback(async () => {
    await Promise.allSettled([
      fetchTerminals(),
      fetchSchedules(),
      fetchAllVehicles(),
      fetchMyAssignments(),
      updateSyncSize(),
      fetchCheckedInPlates(),
    ]);
  }, [fetchTerminals, fetchSchedules, fetchAllVehicles, fetchMyAssignments, updateSyncSize, fetchCheckedInPlates]);

  useEffect(() => {
    const stored = localStorage.getItem('aatdrs_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    refreshDashboardData();
    setIsOnline(navigator.onLine);

    const updateOnline = () => setIsOnline(navigator.onLine);
    const handleVisibility = () => {
      if (!document.hidden) {
        refreshDashboardData();
      }
    };

    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [refreshDashboardData]);

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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('checkin.termFilter', termFilter);
      window.localStorage.setItem('checkin.selectedRouteId', selectedRouteId);
      window.localStorage.setItem('checkin.selectedRouteIdx', String(selectedRouteIdx));
      window.localStorage.setItem('checkin.plateInput', plateInput);
      window.localStorage.setItem('checkin.remark', checkInRemark);
    }
  }, [termFilter, selectedRouteId, selectedRouteIdx, plateInput, checkInRemark]);

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateInput.trim()) return;

    const existsInDb = allVehicles.some(
      v => v.plateNumber.toUpperCase() === plateInput.trim().toUpperCase()
    );

    if (!existsInDb) {
      setInfoMsg(`⛔ Check-in rejected: Vehicle with plate ${plateInput.trim()} not found in database.`);
      setTimeout(() => setInfoMsg(''), 5000);
      return;
    }

    // Prevent duplicate check-ins locally
    if (checkedInPlates.includes(plateInput.trim())) {
      setInfoMsg(`Error: Vehicle ${plateInput.trim()} is already checked in and pending dispatch.`);
      setTimeout(() => setInfoMsg(''), 4000);
      return;
    }

    // For dispatchers: use their locked assigned terminal and selected route.
    // For admins/planners: use the selected values from the dropdowns.
    const isDispatcher = user?.roleName === 'DISPATCHER';
    // Dispatcher: one terminal, multiple routes — pick the selected route
    const dispatcherTerminal = isDispatcher && myAssignments.length > 0 ? myAssignments[0].terminal : null;
    const dispatcherRoutes = isDispatcher ? myAssignments.map((a: any) => a.route) : [];
    const activeDispatcherRoute = dispatcherRoutes[selectedRouteIdx] || dispatcherRoutes[0] || null;

    let effectiveTerminalId: string;
    let effectiveRouteId: string;

    if (isDispatcher && dispatcherTerminal && activeDispatcherRoute) {
      effectiveTerminalId = dispatcherTerminal.id;
      effectiveRouteId = activeDispatcherRoute.id;
    } else if (isDispatcher && schedules.length > 0 && terminals.length > 0) {
      // fallback to old method if no dispatcher assignment in active roster
      effectiveTerminalId = terminals[0].id;
      effectiveRouteId = schedules[0].routeId || schedules[0].routeCode;
    } else {
      const currentTerminal = terminals.find((t) => !termFilter || t.code === termFilter) || terminals[0];
      effectiveTerminalId = currentTerminal?.id || 'UNKNOWN';
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
      remark: checkInRemark.trim() || undefined,
    } as any);

    // Add to outbox sync queue — backend uses plateNumber to resolve vehicleId
    await db.syncQueue.add({
      action: 'CHECKIN',
      payload: {
        plateNumber: plateInput.trim(),
        routeId: effectiveRouteId,
        terminalId: effectiveTerminalId,
        syncId,
        remark: checkInRemark.trim() || undefined
      },
      timestamp: now,
      retryCount: 0,
    });

    setPlateInput('');
    setCheckInRemark('');
    setInfoMsg(`Successfully checked in vehicle ${plateInput.trim()}!`);
    setTimeout(() => setInfoMsg(''), 4000);
    updateSyncSize();
    fetchCheckedInPlates();

    if (navigator.onLine) {
      const token = localStorage.getItem('aatdrs_token');
      if (token) {
        const syncResult = await SyncEngine.triggerSync('device-uuid-12345', API_URL, token);
        updateSyncSize();

        // Surface rejections to the dispatcher immediately
        if (syncResult.rejections && syncResult.rejections.length > 0) {
          const firstRejection = syncResult.rejections[0];
          setInfoMsg(`⛔ Check-in rejected: ${firstRejection.error || 'Vehicle not authorised for this route/terminal.'}`);
          // Don't auto-clear rejection messages — dispatcher needs to see and acknowledge them
        } else if (syncResult.failures && syncResult.failures.length > 0) {
          const firstFailure = syncResult.failures[0];
          setInfoMsg(`⚠ Sync failed (will retry): ${firstFailure.error || 'Server temporarily unavailable.'}`);
          setTimeout(() => setInfoMsg(''), 6000);
        }
      }
    }
  };

  const isDispatcher = user?.roleName === 'DISPATCHER';
  // Dispatcher model: one terminal, multiple routes
  const dispatcherTerminal = isDispatcher && myAssignments.length > 0 ? myAssignments[0].terminal : null;
  const dispatcherRoutes = isDispatcher ? myAssignments.map((a: any) => a.route) : [];
  const activeDispatcherRoute = dispatcherRoutes[selectedRouteIdx] || dispatcherRoutes[0] || null;
  const activeRouteCode = isDispatcher
    ? (activeDispatcherRoute?.code || schedules[0]?.routeCode)
    : selectedRouteId;
  const hasRosterAssignment = schedules.some(
    s => s.plateNumber.toUpperCase() === plateInput.trim().toUpperCase() &&
         s.routeCode === activeRouteCode
  );
  const existsInDb = allVehicles.some(
    v => v.plateNumber.toUpperCase() === plateInput.trim().toUpperCase()
  );
  const isRosterViolation = plateInput.trim().length > 3 && existsInDb && !hasRosterAssignment;
  const violationTagLabel = isRosterViolation ? 'VIOLATION' : null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Dispatcher Terminal Operations</h2>
        <p className="text-xs text-slate-500">Record incoming minibus taxi check-ins and verify weekly assignment schedule status in real-time.</p>
      </div>

      {/* Dispatcher Assignment Banner */}
      {isDispatcher && (
        <div className="space-y-3">
          {myRoster ? (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Active Roster Assignment</h3>
                </div>
                <span className="text-[10px] text-slate-500 font-mono bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">Week {myRoster.weekNumber}</span>
              </div>

              {myAssignments.length === 0 ? (
                <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-xl p-3">
                  ⚠ You have no terminal/route assignments on the active roster. Contact your planner.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Terminal — always locked */}
                  <div className="flex items-start gap-4">
                    <div className="flex-1 bg-slate-950/80 border border-slate-800/60 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Assigned Terminal</p>
                      <p className="text-sm font-bold text-white leading-tight">{dispatcherTerminal?.name}</p>
                      <p className="text-[10px] text-teal-400 font-mono mt-1">{dispatcherTerminal?.code}</p>
                      {dispatcherTerminal?.location && (
                        <p className="text-[10px] text-slate-500 mt-1">📍 {dispatcherTerminal.location}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-center">
                      <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Routes</p>
                      <span className="text-lg font-black text-white">{dispatcherRoutes.length}</span>
                      <p className="text-[9px] text-slate-500">assigned</p>
                    </div>
                  </div>

                  {/* Routes — listed as pills */}
                  <div>
                    <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mb-2">Assigned Routes at this Terminal</p>
                    <div className="flex flex-wrap gap-2">
                      {dispatcherRoutes.map((r: any, idx: number) => (
                        <div key={r.id} className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-3 py-1.5 text-[10px]">
                          <span className="font-bold text-indigo-300 font-mono">{r.code}</span>
                          <span className="text-slate-400 ml-1.5">{r.origin} → {r.destination}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-600 font-mono border-t border-slate-800/60 pt-3">
                    {myRoster.name} &nbsp;·&nbsp;
                    {new Date(myRoster.startDate).toLocaleDateString()} – {new Date(myRoster.endDate).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-400 rounded-full" />
                <p className="text-xs text-amber-400 font-semibold">No Active Roster</p>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">No roster is currently activated. Check-in operations may be limited. Contact your planner to activate the roster.</p>
            </div>
          )}
        </div>
      )}
      <div className="max-w-xl bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Vehicle Check-In Form</h3>

        {infoMsg && (
          <div className={`mb-5 p-3 border rounded-xl text-xs flex items-start gap-2 ${
            infoMsg.startsWith('⛔')
              ? 'bg-red-500/10 border-red-500/20 text-red-400'
              : infoMsg.startsWith('⚠')
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1 ${
              infoMsg.startsWith('⛔') ? 'bg-red-400' : infoMsg.startsWith('⚠') ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-ping'
            }`} />
            <span className="flex-1">{infoMsg}</span>
            <button
              type="button"
              onClick={() => setInfoMsg('')}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity text-base leading-none"
            >×</button>
          </div>
        )}

        <form onSubmit={handleCheckInSubmit} className="space-y-5">
          {/* Terminal — Dispatchers see locked assigned terminal */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Terminal
              {isDispatcher && (
                <span className="ml-2 text-teal-500 normal-case font-normal">(roster-assigned, locked)</span>
              )}
            </label>
            {isDispatcher ? (
              dispatcherTerminal ? (
                <div className="w-full bg-slate-950/60 border border-slate-700/50 text-teal-300 rounded-lg text-xs px-3.5 py-2.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-teal-400 rounded-full shrink-0" />
                  {dispatcherTerminal.name}
                  <span className="ml-auto font-mono text-teal-500/70 text-[10px]">{dispatcherTerminal.code}</span>
                  <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
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

          {/* Route — Dispatchers select from their assigned routes */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
              Route
              {isDispatcher && (
                <span className="ml-2 text-indigo-400 normal-case font-normal">({dispatcherRoutes.length} assigned)</span>
              )}
            </label>
            {isDispatcher ? (
              dispatcherRoutes.length === 0 ? (
                <div className="w-full bg-slate-950/60 border border-amber-700/50 text-amber-400 rounded-lg text-xs px-3.5 py-2.5">
                  No routes assigned on current roster
                </div>
              ) : dispatcherRoutes.length === 1 ? (
                <div className="w-full bg-slate-950/60 border border-slate-700/50 text-teal-300 rounded-lg text-xs px-3.5 py-2.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-teal-400 rounded-full shrink-0" />
                  <span className="font-bold font-mono">{dispatcherRoutes[0].code}</span>
                  <span className="text-slate-400">{dispatcherRoutes[0].origin} → {dispatcherRoutes[0].destination}</span>
                </div>
              ) : (
                <select
                  value={selectedRouteIdx}
                  onChange={(e) => setSelectedRouteIdx(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-950 border border-indigo-500/40 text-slate-100 rounded-lg text-xs px-3.5 py-2.5 focus:outline-none focus:border-indigo-500 accent-indigo-500"
                >
                  {dispatcherRoutes.map((r: any, idx: number) => (
                    <option key={r.id} value={idx}>
                      {r.code} — {r.origin} → {r.destination}
                    </option>
                  ))}
                </select>
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
            <div className="relative">
              <input
                type="text"
                required
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
                placeholder="e.g. AA-2-B44910"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono tracking-wider"
              />
              {violationTagLabel && (
                <button
                  type="button"
                  onClick={() => setShowViolationHint((value) => !value)}
                  title={checkInRemark || 'Tap to view the violation remark'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400"
                >
                  {violationTagLabel}
                </button>
              )}
            </div>
            {showViolationHint && violationTagLabel && (
              <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-200">
                <div className="mb-1 font-semibold uppercase tracking-[0.2em] text-amber-400">Remark</div>
                <div>{checkInRemark || 'No remark entered yet for this violation.'}</div>
              </div>
            )}
            {plateInput.trim().length > 3 && (() => {
              if (hasRosterAssignment) {
                return (
                  <p className="text-[10px] text-emerald-400 mt-2 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    Roster Verified: Vehicle assigned to this route.
                  </p>
                );
              } else if (existsInDb) {
                return (
                  <p className="text-[10px] text-amber-400 mt-2 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                    Roster Violation: Route Hopping detected. Remark required to proceed.
                  </p>
                );
              } else if (plateInput.trim().length > 6) {
                return (
                  <p className="text-[10px] text-red-400 mt-2 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                    Error: Vehicle not registered in the database. Check-in blocked.
                  </p>
                );
              }
              return null;
            })()}
          </div>

          {isRosterViolation && (
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3 space-y-2">
              <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-widest">
                Dispatcher Remark (Roster Violation)
              </label>
              <textarea
                value={checkInRemark}
                onChange={e => setCheckInRemark(e.target.value)}
                required
                rows={2}
                placeholder="Enter justification for route violation..."
                className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none font-medium"
              />
            </div>
          )}

          {/* Roster Vehicle Quick-Select — plates for the dispatcher's selected route */}
          {(() => {
            // For dispatcher: show plates only for the currently selected route
            // For admin/planner: show plates for the selected route + terminal filter
            const filteredSchedules = isDispatcher
              ? schedules.filter(s => s.routeCode === activeRouteCode)
              : schedules.filter(s => s.routeCode === selectedRouteId && (!termFilter || s.terminalCode === termFilter));

            if (filteredSchedules.length === 0 && !isDispatcher) return null;

            const availableSchedules = filteredSchedules.filter(
              (s) => !checkedInPlates.includes(s.plateNumber)
            );

            const searchedSchedules = plateSearch.trim().length > 0
              ? allVehicles
                  .filter(v => !checkedInPlates.includes(v.plateNumber))
                  .filter(v =>
                    v.plateNumber.toUpperCase().includes(plateSearch.trim().toUpperCase()) ||
                    v.ownerName.toLowerCase().includes(plateSearch.trim().toLowerCase())
                  )
              : availableSchedules;

            return (
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                  {plateSearch.trim().length > 0 ? 'Global Database Search Results' : 'Roster Vehicles'}
                  <span className="ml-2 text-slate-600 normal-case font-normal">
                    {plateSearch.trim().length > 0
                      ? `(${searchedSchedules.length} matching vehicles found)`
                      : `(${availableSchedules.length} available / ${filteredSchedules.length} total on ${activeRouteCode || 'route'})`}
                  </span>
                </label>

                {/* Plate search within roster */}
                <div className="relative mb-2">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={plateSearch}
                    onChange={e => setPlateSearch(e.target.value.toUpperCase())}
                    placeholder="Search plate or owner..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none font-mono tracking-wide"
                  />
                  {plateSearch && (
                    <button
                      type="button"
                      onClick={() => setPlateSearch('')}
                      className="absolute inset-y-0 right-2 flex items-center text-slate-500 hover:text-slate-300"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                {isDispatcher && filteredSchedules.length === 0 ? (
                  <div className="text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 italic">
                    No rostered vehicles found for route {activeRouteCode}. They may be assigned via CSV upload.
                  </div>
                ) : availableSchedules.length === 0 && !plateSearch ? (
                  <div className="text-[11px] text-teal-400 bg-teal-500/5 border border-teal-500/10 rounded-lg p-3 italic">
                    All rostered vehicles for this route are currently checked in and waiting in the queue.
                  </div>
                ) : searchedSchedules.length === 0 ? (
                  <div className="text-[11px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg p-3 italic">
                    No vehicles match &ldquo;{plateSearch}&rdquo;.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {searchedSchedules.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setPlateInput(s.plateNumber); setPlateSearch(''); }}
                        className={`text-left px-3 py-2 rounded-lg border text-[11px] font-mono transition-all ${
                          plateInput === s.plateNumber
                            ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white">{s.plateNumber}</span>
                          {!filteredSchedules.some((entry) => entry.plateNumber === s.plateNumber) && (
                            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-400">
                              VIOLATION
                            </span>
                          )}
                        </div>
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
            disabled={isDispatcher && dispatcherRoutes.length === 0}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-white font-semibold text-xs py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/10"
          >
            {isDispatcher && dispatcherRoutes.length === 0
              ? 'No Active Roster Assignment'
              : 'Check In Vehicle'}
          </button>
        </form>
      </div>
    </div>
  );
}
