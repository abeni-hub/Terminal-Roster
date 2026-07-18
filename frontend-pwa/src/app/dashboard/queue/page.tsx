'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db, LocalQueueEntry } from '../../../db/schema';
import { SyncEngine } from '../../../db/syncEngine';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000').replace(/\/$/, '');

interface AuthUser {
  id: string;
  username: string;
  email: string;
  roleName: 'SYSTEM_ADMIN' | 'MUNICIPAL_PLANNER' | 'DISPATCHER';
}

export default function QueuePage() {
  const [user] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null;

    const stored = localStorage.getItem('aatdrs_user');
    if (!stored) return null;

    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  });

  interface EnrichedQueueEntry extends LocalQueueEntry {
    hasViolation?: boolean;
    violationDetails?: string;
  }

  const [pendingQueue, setPendingQueue] = useState<EnrichedQueueEntry[]>([]);
  // Dispatcher roster assignment
  const [assignedRouteCode, setAssignedRouteCode] = useState<string | null>(null);
  const [assignedTerminalName, setAssignedTerminalName] = useState<string | null>(null);
  const [assignedRouteName, setAssignedRouteName] = useState<string | null>(null);
  const [assignedTerminalId, setAssignedTerminalId] = useState<string | null>(null);

  interface DispatcherAssignment {
    routeId: string;
    terminalId: string;
    routeCode: string;
    routeLabel: string;
    terminalName: string;
  }

  interface QueueLiveItem {
    id: string;
    terminalId: string;
    routeId: string;
    checkInTime: string;
    sequence: number;
    syncId?: string;
    vehicle: {
      plateNumber: string;
      violations?: { details: string }[];
    };
  }

  interface SyncQueueCheckinAction {
    id?: number;
    action: 'CHECKIN' | 'DISPATCH' | 'OVERRIDE' | 'VIOLATION';
    payload: {
      syncId: string;
      terminalId: string;
      routeId: string;
      plateNumber: string;
    };
    timestamp: number;
    retryCount: number;
  }

  const assignedRosterAssignmentsRef = useRef<DispatcherAssignment[]>([]);
  const routeIdRef = useRef<string | null>(null);
  const terminalIdRef = useRef<string | null>(null);

  // Override Modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; vehicleId: string; routeId: string; terminalId: string } | null>(null);
  const [expandedViolationEntryId, setExpandedViolationEntryId] = useState<string | null>(null);
  const [supervisorUsername, setSupervisorUsername] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [overrideReason, setOverrideReason] = useState('Driver absent / route-hop manual skip');
  const [modalError, setModalError] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);
  const initializedRef = useRef(false);

  const loadLocalData = useCallback(async (routeFilter?: string, terminalIdOverride?: string, rosterAssignments?: DispatcherAssignment[]) => {
    const token = localStorage.getItem('aatdrs_token');
    const storedUser = localStorage.getItem('aatdrs_user');
    const parsedUser = storedUser ? JSON.parse(storedUser) : null;
    const isDispatcher = parsedUser?.roleName === 'DISPATCHER';
    const activeAssignments = rosterAssignments ?? assignedRosterAssignmentsRef.current;
    const assignmentPairs = isDispatcher
      ? activeAssignments.map((assignment) => ({ routeId: assignment.routeId, terminalId: assignment.terminalId }))
      : [];
    const effectiveTerminalId = terminalIdOverride ?? assignedTerminalId;

    if (navigator.onLine && token && isDispatcher && assignmentPairs.length > 0) {
      try {
        const liveResponses = await Promise.all(activeAssignments.map(async (assignment) => {
          if (!assignment.terminalId || !assignment.routeId) {
            console.warn('Skipping live queue request for incomplete dispatcher assignment:', assignment);
            return [] as QueueLiveItem[];
          }

          const url = `${API_URL}/queue/live/${encodeURIComponent(assignment.terminalId)}/${encodeURIComponent(assignment.routeId)}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            console.error('Live queue fetch failed for assignment:', { url, status: res.status, statusText: res.statusText });
            return [] as QueueLiveItem[];
          }
          return res.json() as Promise<QueueLiveItem[]>;
        }));

        const rawLive = liveResponses.flat();
        const serverEntries: EnrichedQueueEntry[] = rawLive.map((item) => ({
          id: item.id,
          terminalId: item.terminalId,
          routeId: item.routeId,
          vehicleId: item.vehicle.plateNumber,
          checkInTime: new Date(item.checkInTime).getTime(),
          status: 'PENDING',
          sequence: item.sequence,
          syncId: item.syncId || '',
          hasViolation: Boolean(item.vehicle?.violations?.length),
          violationDetails: item.vehicle?.violations?.[0]?.details || '',
        }));

        const outbox = await db.syncQueue.where('action').equals('CHECKIN').toArray() as SyncQueueCheckinAction[];
        const unsyncedEntries: LocalQueueEntry[] = outbox.map((action) => ({
          id: action.payload.syncId,
          terminalId: action.payload.terminalId,
          routeId: action.payload.routeId,
          vehicleId: action.payload.plateNumber,
          checkInTime: action.timestamp,
          status: 'PENDING',
          sequence: 999,
          syncId: action.payload.syncId,
        }));

        const combined: LocalQueueEntry[] = [...serverEntries];
        for (const unsynced of unsyncedEntries) {
          if (!combined.some((x) => x.syncId === unsynced.syncId)) {
            combined.push(unsynced);
          }
        }

        const localToKeep = await db.queue.toArray();
        const filteredKeep = localToKeep.filter((q) =>
          !assignmentPairs.some((assignment) => assignment.terminalId === q.terminalId && assignment.routeId === q.routeId),
        );

        await db.queue.clear();
        await db.queue.bulkPut([...filteredKeep, ...combined]);
      } catch (err) {
        console.error('Failed to fetch live queue from server:', { error: err });
      }
    } else if (navigator.onLine && token && effectiveTerminalId && routeFilter) {
      try {
        const url = `${API_URL}/queue/live/${encodeURIComponent(effectiveTerminalId)}/${encodeURIComponent(routeFilter)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const rawLive = await res.json() as QueueLiveItem[];
          const serverEntries: EnrichedQueueEntry[] = rawLive.map((item) => ({
            id: item.id,
            terminalId: item.terminalId,
            routeId: item.routeId,
            vehicleId: item.vehicle.plateNumber,
            checkInTime: new Date(item.checkInTime).getTime(),
            status: 'PENDING',
            sequence: item.sequence,
            syncId: item.syncId || '',
            hasViolation: Boolean(item.vehicle?.violations?.length),
            violationDetails: item.vehicle?.violations?.[0]?.details || '',
          }));

          const outbox = await db.syncQueue.where('action').equals('CHECKIN').toArray() as SyncQueueCheckinAction[];
          const unsyncedEntries: LocalQueueEntry[] = outbox.map((action) => ({
            id: action.payload.syncId,
            terminalId: action.payload.terminalId,
            routeId: action.payload.routeId,
            vehicleId: action.payload.plateNumber,
            checkInTime: action.timestamp,
            status: 'PENDING',
            sequence: 999,
            syncId: action.payload.syncId,
          }));

          const combined: LocalQueueEntry[] = [...serverEntries];
          for (const unsynced of unsyncedEntries) {
            if (!combined.some((x) => x.syncId === unsynced.syncId)) {
              combined.push(unsynced);
            }
          }

          const localToKeep = await db.queue.toArray();
          const filteredKeep = localToKeep.filter((q) => q.terminalId !== effectiveTerminalId || q.routeId !== routeFilter);
          await db.queue.clear();
          await db.queue.bulkPut([...filteredKeep, ...combined]);
        } else {
          console.error('Live queue fetch failed:', { url, status: res.status, statusText: res.statusText });
        }
      } catch (err) {
        console.error('Failed to fetch live queue from server:', { error: err });
      }
    }

    let list = await db.queue.where('status').equals('PENDING').toArray() as EnrichedQueueEntry[];
    if (routeFilter) {
      list = list.filter((e) => e.routeId === routeFilter);
    } else if (isDispatcher && assignmentPairs.length > 0) {
      list = list.filter((e) => assignmentPairs.some((a) => a.routeId === e.routeId && a.terminalId === e.terminalId));
    }

    const localViolations = await db.violations.toArray();
    const enrichedList = list.map((entry) => {
      const hasLocalViolation = localViolations.some((v) => v.vehicleId === entry.vehicleId);
      return {
        ...entry,
        hasViolation: entry.hasViolation || hasLocalViolation,
        violationDetails: entry.violationDetails || (hasLocalViolation ? 'Offline registered violation' : ''),
      };
    });

    enrichedList.sort((a, b) => a.checkInTime - b.checkInTime || a.sequence - b.sequence);
    setPendingQueue(enrichedList);
  }, [assignedTerminalId]);


  const fetchRosterAssignment = useCallback(async (userObj: AuthUser): Promise<{ routeId: string | null; terminalId: string | null }> => {
    if (userObj.roleName !== 'DISPATCHER') return { routeId: null, terminalId: null };
    const token = localStorage.getItem('aatdrs_token');
    let routeId: string | null = null;
    let termId: string | null = null;

    try {
      const res = await fetch(`${API_URL}/roster/my-assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch dispatcher assignments');
      }

      const data = await res.json() as { assignments?: Array<{
        route: { id: string; code: string; origin: string; destination: string };
        terminal: { id: string; name: string };
      }> };

      const assignments = Array.isArray(data.assignments) ? data.assignments : [];
      const mappedAssignments: DispatcherAssignment[] = assignments.map((assignment) => ({
        routeId: assignment.route.id,
        terminalId: assignment.terminal.id,
        routeCode: assignment.route.code,
        routeLabel: `${assignment.route.code} (${assignment.route.origin} → ${assignment.route.destination})`,
        terminalName: assignment.terminal.name,
      }));

      if (mappedAssignments.length > 0) {
        assignedRosterAssignmentsRef.current = mappedAssignments;
        setAssignedRouteCode(mappedAssignments[0].routeCode);
        setAssignedRouteName(
          mappedAssignments.length === 1
            ? mappedAssignments[0].routeLabel
            : mappedAssignments.map((item: DispatcherAssignment) => item.routeLabel).join(', '),
        );
        setAssignedTerminalName(mappedAssignments[0].terminalName);
        setAssignedTerminalId(mappedAssignments[0].terminalId);
        routeId = mappedAssignments[0].routeId;
        termId = mappedAssignments[0].terminalId;
      }

      return { routeId, terminalId: termId };
    } catch {
      const cachedSchedules = await db.schedules.toArray();
      const cachedTerminals = await db.terminals.toArray();
      if (cachedSchedules.length > 0) {
        const firstAssigned = cachedSchedules[0];
        setAssignedRouteCode(firstAssigned.routeCode);
        setAssignedRouteName(`${firstAssigned.origin} → ${firstAssigned.destination}`);
        routeId = firstAssigned.routeId || null;
      }
      if (cachedTerminals.length > 0) {
        setAssignedTerminalName(cachedTerminals[0].name);
        setAssignedTerminalId(cachedTerminals[0].id);
        termId = cachedTerminals[0].id;
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
      try {
        parsedUser = JSON.parse(stored) as AuthUser;
      } catch {
        parsedUser = null;
      }
    }

    const init = async () => {
      if (parsedUser?.roleName === 'DISPATCHER') {
        const { routeId, terminalId } = await fetchRosterAssignment(parsedUser);
        routeIdRef.current = routeId;
        terminalIdRef.current = terminalId;
        loadLocalData(undefined, undefined, assignedRosterAssignmentsRef.current);
      } else {
        loadLocalData();
      }
    };

    init();
    const timer = setInterval(() => {
      loadLocalData(undefined, undefined, assignedRosterAssignmentsRef.current);
    }, 3000);

    return () => {
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
      loadLocalData(undefined, undefined, assignedRosterAssignmentsRef.current);
    }
  };

  const handleDispatch = async (entryId: string, vehicleId: string, routeId: string, terminalId: string) => {
    const syncId = crypto.randomUUID();
    const now = Date.now();

    let effectiveTerminalId = terminalId || terminalIdRef.current || assignedTerminalId || '';
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

    loadLocalData(undefined, undefined, assignedRosterAssignmentsRef.current);
    if (navigator.onLine) triggerSync();
  };

  const openOverrideModal = (entry: LocalQueueEntry) => {
    setSelectedEntry({ id: entry.id, vehicleId: entry.vehicleId, routeId: entry.routeId, terminalId: entry.terminalId });
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
      loadLocalData(isDispatcher ? routeIdRef.current ?? undefined : undefined);
      setShowOverrideModal(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Validation failed. Check credentials and retry.';
      setModalError(message);
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
                    <td className="py-3.5 pr-3 font-mono font-bold text-white tracking-wide text-sm">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {entry.vehicleId}
                          {entry.hasViolation && (
                            <button
                              type="button"
                              onClick={() => setExpandedViolationEntryId((value) => value === entry.id ? null : entry.id)}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse"
                              title={entry.violationDetails || 'Active violation'}
                            >
                              ⚠ Violation
                            </button>
                          )}
                        </div>
                        {entry.hasViolation && expandedViolationEntryId === entry.id && (
                          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-200">
                            <div className="mb-0.5 font-semibold uppercase tracking-[0.2em] text-red-400">Remark</div>
                            <div>{entry.violationDetails || 'No remark available for this violation.'}</div>
                          </div>
                        )}
                      </div>
                    </td>
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
                            onClick={() => handleDispatch(entry.id, entry.vehicleId, entry.routeId, entry.terminalId)}
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
