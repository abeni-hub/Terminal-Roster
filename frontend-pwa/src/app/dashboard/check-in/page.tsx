'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db, LocalTerminal, LocalScheduleEntry } from '../../../db/schema';
import { SyncEngine } from '../../../db/syncEngine';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export default function CheckInPage() {
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [schedules, setSchedules] = useState<LocalScheduleEntry[]>([]);
  const [termFilter, setTermFilter] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('R-001');
  const [plateInput, setPlateInput] = useState('');
  const [syncQueueSize, setSyncQueueSize] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [infoMsg, setInfoMsg] = useState('');

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
    try {
      const res = await fetch(`${API_URL}/roster/schedules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const raw = await res.json();
        const mapped: LocalScheduleEntry[] = raw.map((s: any) => ({
          id: s.id,
          plateNumber: s.vehicle.plateNumber,
          ownerName: s.vehicle.ownerName,
          vehicleStatus: s.vehicle.status,
          terminalName: s.terminal.name,
          terminalCode: s.terminal.code,
          routeCode: s.route.code,
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
        await db.schedules.bulkPut(mapped);
      }
    } catch {
      const cached = await db.schedules.toArray();
      setSchedules(cached);
    }
  }, []);

  const updateSyncSize = useCallback(async () => {
    const size = await db.syncQueue.count();
    setSyncQueueSize(size);
  }, []);

  useEffect(() => {
    fetchTerminals();
    fetchSchedules();
    updateSyncSize();
    setIsOnline(navigator.onLine);

    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    const interval = setInterval(updateSyncSize, 3000);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      clearInterval(interval);
    };
  }, [fetchTerminals, fetchSchedules, updateSyncSize]);

  const handleCheckInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateInput.trim()) return;

    const currentTerminal = terminals.find((t) => !termFilter || t.code === termFilter) || terminals[0];
    const tid = currentTerminal?.id || 'MEG-01';

    const entryId = crypto.randomUUID();
    const syncId = crypto.randomUUID();
    const now = Date.now();
    const todayCount = await db.queue.count();

    // Add locally to Dexie queue
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

    // Add to outbox sync queue
    await db.syncQueue.add({
      action: 'CHECKIN',
      payload: { plateNumber: plateInput.trim(), routeId: selectedRouteId, terminalId: tid, syncId },
      timestamp: now,
      retryCount: 0,
    });

    setPlateInput('');
    setInfoMsg(`Successfully checked in vehicle ${plateInput.trim()}!`);
    setTimeout(() => setInfoMsg(''), 4000);
    updateSyncSize();

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
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Terminal</label>
            <select
              value={termFilter}
              onChange={(e) => setTermFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3.5 py-2.5 focus:outline-none focus:border-indigo-500"
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
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Route Code</label>
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
              <option value="R-001">R-001 (Megenagna → Bole)</option>
              <option value="R-002">R-002 (Megenagna → Piassa)</option>
              <option value="R-003">R-003 (Merkato → Piassa)</option>
              <option value="R-004">R-004 (Kaliti → Saris)</option>
              <option value="R-005">R-005 (Piassa → Arat Kilo)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Plate Number</label>
            <input
              type="text"
              required
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value.toUpperCase())}
              placeholder="e.g. AA-2-B44910"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono tracking-wider"
            />
            {plateInput.length > 3 && (
              (() => {
                const match = schedules.find((s) => s.plateNumber.includes(plateInput));
                return match ? (
                  <p className="text-[10px] text-emerald-400 mt-2 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    Roster Verified: {match.origin} → {match.destination}
                  </p>
                ) : plateInput.length > 6 ? (
                  <p className="text-[10px] text-amber-400 mt-2 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></span>
                    Warning: Vehicle not found on Week 24 weekly roster.
                  </p>
                ) : null;
              })()
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/10"
          >
            Check In Vehicle
          </button>
        </form>
      </div>
    </div>
  );
}
