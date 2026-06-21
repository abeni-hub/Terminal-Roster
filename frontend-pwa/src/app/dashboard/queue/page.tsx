'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, LocalQueueEntry } from '../../../db/schema';
import { SyncEngine } from '../../../db/syncEngine';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  roleName: 'SYSTEM_ADMIN' | 'MUNICIPAL_PLANNER' | 'DISPATCHER';
}

export default function QueuePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pendingQueue, setPendingQueue] = useState<LocalQueueEntry[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  // Dispatcher roster assignment
  const [assignedRouteCode, setAssignedRouteCode] = useState<string | null>(null);
  const [assignedTerminalName, setAssignedTerminalName] = useState<string | null>(null);
  const [assignedRouteName, setAssignedRouteName] = useState<string | null>(null);
  const [assignedTerminalId, setAssignedTerminalId] = useState<string | null>(null);

  // Override Modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; vehicleId: string; routeId: string } | null>(null);
  const [supervisorUsername, setSupervisorUsername] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [overrideReason, setOverrideReason] = useState('Driver absent / route-hop manual skip');
  const [modalError, setModalError] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);
  const routeCodeRef = useRef<string | null>(null);
  const terminalIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  const loadLocalData = useCallback(async (routeFilter?: string, terminalIdOverride?: string) => {
    const token = localStorage.getItem('aatdrs_token');
    const effectiveTerminalId = terminalIdOverride ?? terminalIdRef.current ?? assignedTerminalId;
    const storedUser = localStorage.getItem('aatdrs_user');
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;
    const isDispatcher = parsedUser?.roleName === 'DISPATCHER';

    if (navigator.onLine && token && isDispatcher && effectiveTerminalId && routeFilter) {
      try {
        const res = await fetch(`${API_URL}/queue/live/${effectiveTerminalId}/${routeFilter}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const rawLive = await res.json();
          const serverEntries = rawLive.map((item: any) => ({
            id: item.id,
            terminalId: item.terminalId,
            routeId: item.routeId,
            vehicleId: item.vehicle.plateNumber,
            checkInTime: new Date(item.checkInTime).getTime(),
            status: 'PENDING',
            sequence: item.sequence,
            syncId: item.syncId || '',
          }));

          // Fetch unsynced local check-ins from outbox
          const outbox = await db.syncQueue.where('action').equals('CHECKIN').toArray();
          const unsyncedEntries = outbox.map((action: any) => ({
            id: action.payload.syncId,
            terminalId: action.payload.terminalId,
            routeId: action.payload.routeId,
            vehicleId: action.payload.plateNumber,
            checkInTime: action.timestamp,
            status: 'PENDING',
            sequence: 999,
            syncId: action.payload.syncId,
          }));

          const combined = [...serverEntries];
          for (const unsynced of unsyncedEntries) {
            if (!combined.some(x => x.syncId === unsynced.syncId)) {
              combined.push(unsynced);
            }
          }

          // Clear local queue entries of this terminal/route and put the combined list
          const localToKeep = await db.queue.toArray();
          const filteredKeep = localToKeep.filter(q => q.terminalId !== effectiveTerminalId || q.routeId !== routeFilter);
          
          await db.queue.clear();
          await db.queue.bulkPut([...filteredKeep, ...combined]);
        }
      } catch (err) {
        console.error('Failed to fetch live queue from server:', err);
      }
    }

    let list = await db.queue.where('status').equals('PENDING').toArray();
    if (routeFilter) {
      list = list.filter((e) => e.routeId === routeFilter);
    }
    list.sort((a, b) => a.checkInTime - b.checkInTime || a.sequence - b.sequence);
    setPendingQueue(list);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedTerminalId]);


  const fetchRosterAssignment = useCallback(async (userObj: AuthUser): Promise<{ routeId: string | null; terminalId: string | null }> => {
    if (userObj.roleName !== 'DISPATCHER') return { routeId: null, terminalId: null };
    const token = localStorage.getItem('aatdrs_token');
    try {
      const [schedRes, termRes] = await Promise.all([
        fetch(`${API_URL}/roster/schedules`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/roster/terminals`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      let routeCode: string | null = null;
      let routeId: string | null = null;
      let termId: string | null = null;
      let termName: string | null = null;
      let routeName: string | null = null;

      if (schedRes.ok) {
        const schedules = await schedRes.json();
        if (schedules.length > 0) {
          const s = schedules[0];
          routeCode = s.route.code;
          routeId = s.route.id;
          routeName = `${s.route.origin} → ${s.route.destination}`;
        }
      }
      if (termRes.ok) {
        const terminals = await termRes.json();
        if (terminals.length > 0) {
          termName = terminals[0].name;
          termId = terminals[0].id;
        }
      }

      if (routeCode) {
        setAssignedRouteCode(routeCode);
        setAssignedRouteName(routeName);
      }
      if (termName) {
        setAssignedTerminalName(termName);
        setAssignedTerminalId(termId);
      }
      return { routeId, terminalId: termId };
    } catch {
      // Offline fallback: load from IndexedDB
      const cachedSchedules = await db.schedules.toArray();
      const cachedTerminals = await db.terminals.toArray();
      let routeCode: string | null = null;
      let routeId: string | null = null;
      let termId: string | null = null;
      let termName: string | null = null;
      let routeName: string | null = null;

      if (cachedSchedules.length > 0) {
        const s = cachedSchedules[0];
        routeCode = s.routeCode;
        routeId = s.routeId || null;
        routeName = `${s.origin} → ${s.destination}`;
      }
      if (cachedTerminals.length > 0) {
        termName = cachedTerminals[0].name;
        termId = cachedTerminals[0].id;
      }

      if (routeCode) {
        setAssignedRouteCode(routeCode);
        setAssignedRouteName(routeName);
      }
      if (termName) {
        setAssignedTerminalName(termName);
        setAssignedTerminalId(termId);
      }
      return { routeId, terminalId: termId };
    }
  }, []);

  useEffect(() => {
    // Guard against double-initialization (React StrictMode double-mount)
    if (initializedRef.current) return;
    initializedRef.current = true;

    const stored = localStorage.getItem('aatdrs_user');
    let parsedUser: AuthUser | null = null;
    if (stored) {
      parsedUser = JSON.parse(stored);
      setUser(parsedUser);
    }

    const init = async () => {
      if (parsedUser?.roleName === 'DISPATCHER') {
        const { routeId, terminalId } = await fetchRosterAssignment(parsedUser);
        routeCodeRef.current = routeId;
        terminalIdRef.current = terminalId;
        loadLocalData(routeId ?? undefined, terminalId ?? undefined);
      } else {
        loadLocalData();
      }
    };

    init();
    setIsOnline(navigator.onLine);

    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    const timer = setInterval(() => {
      loadLocalData(routeCodeRef.current ?? undefined);
    }, 3000);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      clearInterval(timer);
      initializedRef.current = false;
    };
  // Only run on mount — dependencies are stable callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerSync = async () => {
    const token = localStorage.getItem('aatdrs_token');
    if (token) {
      await SyncEngine.triggerSync('device-uuid-12345', API_URL, token);
      const isDispatcher = user?.roleName === 'DISPATCHER';
      loadLocalData(isDispatcher ? routeCodeRef.current ?? undefined : undefined);
    }
  };

  const handleDispatch = async (entryId: string, vehicleId: string, routeId: string) => {
    const syncId = crypto.randomUUID();
    const now = Date.now();

    let effectiveTerminalId = terminalIdRef.current ?? assignedTerminalId ?? '';
    if (!effectiveTerminalId) {
      if (user?.roleName === 'DISPATCHER') {
        const cachedTerminals = await db.terminals.toArray();
        if (cachedTerminals.length > 0) {
          effectiveTerminalId = cachedTerminals[0].id;
        }
      }
    }

    // Mark as dispatched locally
    await db.queue.update(entryId, { status: 'DISPATCHED' });
    await db.dispatches.add({
      id: crypto.randomUUID(),
      terminalId: effectiveTerminalId,
      routeId,
      vehicleId,
      dispatcherId: user?.username || 'system',
      dispatchTime: now,
      fareChargedETB: 15.0,
      syncId,
      isSynced: 0,
    });

    // Queue sync action
    await db.syncQueue.add({
      action: 'DISPATCH',
      payload: { routeId, vehicleId, terminalId: effectiveTerminalId, syncId },
      timestamp: now,
      retryCount: 0,
    });

    const isDispatcher = user?.roleName === 'DISPATCHER';
    loadLocalData(isDispatcher ? routeCodeRef.current ?? undefined : undefined);
    if (navigator.onLine) triggerSync();
  };

  const openOverrideModal = (entry: LocalQueueEntry) => {
    setSelectedEntry({ id: entry.id, vehicleId: entry.vehicleId, routeId: entry.routeId });
    setSupervisorUsername('');
    setSupervisorPin('');
    setModalError('');
    setShowOverrideModal(true);
  };

  const submitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;
    setSubmittingOverride(true);
    setModalError('');

    try {
      const token = localStorage.getItem('aatdrs_token');
      // If we are online, authenticate supervisor PIN via API
      if (navigator.onLine) {
        const res = await fetch(`${API_URL}/overrides`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            queueEntryId: selectedEntry.id,
            supervisorUsername,
            supervisorPin,
            overrideType: 'VEHICLE_SKIP',
            reason: overrideReason,
          }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.message || 'Invalid supervisor credentials or PIN');
        }
      } else {
        // Offline: save override locally to sync queue outbox
        const now = Date.now();
        const syncId = crypto.randomUUID();
        await db.syncQueue.add({
          action: 'OVERRIDE',
          payload: {
            queueEntryId: selectedEntry.id,
            overrideType: 'VEHICLE_SKIP',
            reason: overrideReason,
            signature: `SIG-${supervisorUsername.toUpperCase()}-${now}`,
            syncId,
          },
          timestamp: now,
          retryCount: 0,
        });
      }

      // Skip the vehicle in our local DB
      await db.queue.update(selectedEntry.id, { status: 'SKIPPED' });
      const isDispatcher = user?.roleName === 'DISPATCHER';
      loadLocalData(isDispatcher ? routeCodeRef.current ?? undefined : undefined);
      setShowOverrideModal(false);
    } catch (err: any) {
      setModalError(err.message || 'Validation failed. Check credentials and retry.');
    } finally {
      setSubmittingOverride(false);
    }
  };

  const canDispatch = user?.roleName === 'SYSTEM_ADMIN' || user?.roleName === 'DISPATCHER';
  const canOverride = user?.roleName === 'SYSTEM_ADMIN' || user?.roleName === 'MUNICIPAL_PLANNER';

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Live Dispatch Queue</h2>
          <p className="text-xs text-slate-500">Addis Ababa taxi digital dispatch board. FIFO constraints are automatically enforced.</p>
        </div>
      </div>

      {user?.roleName === 'DISPATCHER' && (
        <div className="flex flex-wrap items-center gap-4 bg-slate-900/60 border border-teal-500/20 rounded-xl p-4 text-xs backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 px-2.5 py-1 rounded-lg font-semibold tracking-wide flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
              📍 {assignedTerminalName || 'Loading Terminal...'}
            </span>
            <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2.5 py-1 rounded-lg font-mono font-bold tracking-wide flex items-center gap-1.5">
              🛣️ {assignedRouteName || 'Loading Route...'} ({assignedRouteCode || '...'})
            </span>
          </div>
          <div className="text-slate-400 text-xs flex-1 text-right italic font-medium">
            Authorized Route Roster View — Showing only assigned vehicles.
          </div>
        </div>
      )}

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        {pendingQueue.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-xl">
            <p className="text-slate-500 text-sm">No vehicles currently in queue.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-3">Position</th>
                  <th className="pb-3 pr-3">Plate Number</th>
                  <th className="pb-3 pr-3">Route Code</th>
                  <th className="pb-3 pr-3">Check-In Time</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {pendingQueue.map((entry, index) => (
                  <tr key={entry.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3.5 pr-3 font-extrabold text-indigo-400 text-sm">#{index + 1}</td>
                    <td className="py-3.5 pr-3 font-mono font-bold text-white tracking-wide text-sm">{entry.vehicleId}</td>
                    <td className="py-3.5 pr-3">
                      <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300 font-bold">{entry.routeId}</span>
                    </td>
                    <td className="py-3.5 pr-3 text-slate-400">{new Date(entry.checkInTime).toLocaleTimeString()}</td>
                    <td className="py-3.5 text-right flex items-center justify-end gap-2">
                      {/* Skip Queue Bypass */}
                      {canOverride && (
                        <button
                          onClick={() => openOverrideModal(entry)}
                          className="bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-500/20 text-[10px] font-bold py-1 px-3 rounded-lg transition-all"
                        >
                          Skip Queue
                        </button>
                      )}

                      {/* Dispatch Action (Strict FIFO - only active for index === 0) */}
                      {index === 0 ? (
                        canDispatch ? (
                          <button
                            onClick={() => handleDispatch(entry.id, entry.vehicleId, entry.routeId)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 px-3.5 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/10"
                          >
                            Dispatch Vehicle
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-semibold tracking-wide bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">Ready</span>
                        )
                      ) : (
                        <span className="text-[10px] text-slate-600 italic">Awaiting Turn</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Supervisor Override Modal ── */}
      {showOverrideModal && selectedEntry && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-white mb-2">Queue Override Bypass</h3>
            <p className="text-xs text-slate-400 mb-5">
              Skipping vehicle <span className="font-mono text-indigo-400 font-bold">{selectedEntry.vehicleId}</span>. This requires credentials of an authorized administrator or planner.
            </p>

            {modalError && (
              <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg">
                {modalError}
              </div>
            )}

            <form onSubmit={submitOverride} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Supervisor Username</label>
                <input
                  type="text"
                  required
                  value={supervisorUsername}
                  onChange={(e) => setSupervisorUsername(e.target.value)}
                  placeholder="e.g. planner_kebede"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Supervisor PIN</label>
                <input
                  type="password"
                  required
                  value={supervisorPin}
                  onChange={(e) => setSupervisorPin(e.target.value)}
                  placeholder="••••"
                  maxLength={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Override Reason</label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs py-2 px-4 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOverride}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all disabled:opacity-40"
                >
                  {submittingOverride ? 'Verifying...' : 'Bypass FIFO Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
