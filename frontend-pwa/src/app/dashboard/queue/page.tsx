'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

  // Override Modal state
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; vehicleId: string; routeId: string } | null>(null);
  const [supervisorUsername, setSupervisorUsername] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [overrideReason, setOverrideReason] = useState('Driver absent / route-hop manual skip');
  const [modalError, setModalError] = useState('');
  const [submittingOverride, setSubmittingOverride] = useState(false);

  const loadLocalData = useCallback(async () => {
    const list = await db.queue.where('status').equals('PENDING').toArray();
    list.sort((a, b) => a.checkInTime - b.checkInTime || a.sequence - b.sequence);
    setPendingQueue(list);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('aatdrs_user');
    if (stored) {
      setUser(JSON.parse(stored));
    }
    loadLocalData();
    setIsOnline(navigator.onLine);

    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    const timer = setInterval(loadLocalData, 2000);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      clearInterval(timer);
    };
  }, [loadLocalData]);

  const triggerSync = async () => {
    const token = localStorage.getItem('aatdrs_token');
    if (token) {
      await SyncEngine.triggerSync('device-uuid-12345', API_URL, token);
      loadLocalData();
    }
  };

  const handleDispatch = async (entryId: string, vehicleId: string, routeId: string) => {
    const syncId = crypto.randomUUID();
    const now = Date.now();

    // Mark as dispatched locally
    await db.queue.update(entryId, { status: 'DISPATCHED' });
    await db.dispatches.add({
      id: crypto.randomUUID(),
      terminalId: 'MEG-01',
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
      payload: { routeId, vehicleId, syncId },
      timestamp: now,
      retryCount: 0,
    });

    loadLocalData();
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
      loadLocalData();
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
