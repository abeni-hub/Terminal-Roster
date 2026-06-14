'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db, LocalQueueEntry } from '../../db/schema';
import { SyncEngine } from '../../db/syncEngine';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ username: string; roleName: string } | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [syncQueueSize, setSyncQueueSize] = useState(0);

  // Form states
  const [plateNumber, setPlateNumber] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('R-001');

  // Queue state
  const [pendingQueue, setPendingQueue] = useState<LocalQueueEntry[]>([]);

  // Setup initial data
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('aatdrs_user');
      const token = localStorage.getItem('aatdrs_token');
      if (!storedUser || !token) {
        router.push('/');
        return;
      }
      setUser(JSON.parse(storedUser));
      setIsOnline(navigator.onLine);

      // Bind connection monitors
      const updateOnlineStatus = () => setIsOnline(navigator.onLine);
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);

      // Load DB records
      loadLocalData();

      // Poll sync queue and local queue every 2 seconds for fresh UI
      const timer = setInterval(() => {
        loadLocalData();
      }, 2000);

      return () => {
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
        clearInterval(timer);
      };
    }
  }, []);

  const loadLocalData = async () => {
    // 1. Get sync queue size
    const size = await db.syncQueue.count();
    setSyncQueueSize(size);

    // 2. Get local pending queue
    const queueList = await db.queue
      .where('status')
      .equals('PENDING')
      .toArray();

    // Sort by check-in time and sequence index (Strict FIFO local sorting)
    queueList.sort((a, b) => a.checkInTime - b.checkInTime || a.sequence - b.sequence);
    setPendingQueue(queueList);
  };

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateNumber.trim()) return;

    try {
      const entryId = crypto.randomUUID();
      const syncId = crypto.randomUUID();
      const checkInTime = Date.now();

      // Get count for sequence index today
      const todayCount = await db.queue.count();
      const sequence = todayCount + 1;

      // 1. Write locally to IndexedDB queue table
      await db.queue.add({
        id: entryId,
        terminalId: 'MEG-01',
        routeId: selectedRoute,
        vehicleId: plateNumber, // Mapped locally
        checkInTime,
        status: 'PENDING',
        sequence,
        syncId,
      });

      // 2. Push synchronization outbox log
      await db.syncQueue.add({
        action: 'CHECKIN',
        payload: {
          plateNumber,
          routeId: selectedRoute,
          terminalId: 'MEG-01',
          syncId,
        },
        timestamp: checkInTime,
        retryCount: 0,
      });

      setPlateNumber('');
      loadLocalData();

      // Auto trigger sync if online
      if (isOnline) {
        triggerManualSync();
      }
    } catch (err) {
      console.error('Local Check-in Error:', err);
    }
  };

  const handleDispatch = async (entryId: string, vehicleId: string) => {
    try {
      const syncId = crypto.randomUUID();
      const dispatchTime = Date.now();

      // 1. Mark as DISPATCHED locally in IndexedDB
      await db.queue.update(entryId, { status: 'DISPATCHED' });

      // 2. Add to local dispatches summary
      await db.dispatches.add({
        id: crypto.randomUUID(),
        terminalId: 'MEG-01',
        routeId: selectedRoute,
        vehicleId,
        dispatcherId: user?.username || 'dispatcher1',
        dispatchTime,
        fareChargedETB: selectedRoute === 'R-001' ? 15 : 20,
        syncId,
        isSynced: 0,
      });

      // 3. Queue synchronization outbox log
      await db.syncQueue.add({
        action: 'DISPATCH',
        payload: {
          routeId: selectedRoute,
          terminalId: 'MEG-01',
          vehicleId,
          dispatcherId: user?.username || 'dispatcher1',
          syncId,
        },
        timestamp: dispatchTime,
        retryCount: 0,
      });

      loadLocalData();

      // Auto trigger sync if online
      if (isOnline) {
        triggerManualSync();
      }
    } catch (err) {
      console.error('Local Dispatch Error:', err);
    }
  };

  const triggerManualSync = async () => {
    const token = localStorage.getItem('aatdrs_token');
    if (token) {
      await SyncEngine.triggerSync('device-uuid-12345', API_URL, token);
      loadLocalData();
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col font-sans">
      {/* Header bar */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800 pb-6 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Megenagna Taxi Terminal</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
              isOnline 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              {isOnline ? 'Connected' : 'Offline Mode'}
            </span>
          </div>
          <p className="text-slate-400 text-xs mt-1">Addis Ababa Transport Office dispatch console</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-200">{user?.username}</p>
            <p className="text-slate-500 text-xs uppercase tracking-wider font-medium">{user?.roleName}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 py-1.5 px-3 rounded-lg transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Stats Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Pending Sync Queue</p>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-white">{syncQueueSize}</h3>
            {syncQueueSize > 0 && isOnline && (
              <button
                onClick={triggerManualSync}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-1 px-3 rounded-lg transition-all active:scale-[0.98]"
              >
                Sync Now
              </button>
            )}
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Active Queue Size</p>
          <h3 className="text-2xl font-bold text-indigo-400">{pendingQueue.length} Vehicles</h3>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1">Terminal Route</p>
          <select
            value={selectedRoute}
            onChange={(e) => setSelectedRoute(e.target.value)}
            className="mt-1 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-sm p-1.5 focus:outline-none focus:border-indigo-500"
          >
            <option value="R-001">R-001 (Megenagna ⇄ Bole)</option>
            <option value="R-002">R-002 (Megenagna ⇄ Piazza)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Check in Form */}
        <div className="bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-md lg:col-span-1">
          <h3 className="text-lg font-bold text-white mb-4">Vehicle Check-In</h3>
          <form onSubmit={handleCheckIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Plate Number</label>
              <input
                type="text"
                required
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value)}
                placeholder="e.g., AA-3-A12345"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2 px-4 rounded-lg transition-all shadow-lg active:scale-[0.98]"
            >
              Add to Queue
            </button>
          </form>
        </div>

        {/* Live Queue list */}
        <div className="bg-slate-900/30 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-md lg:col-span-2">
          <h3 className="text-lg font-bold text-white mb-4">Live FIFO Dispatch Queue</h3>
          {pendingQueue.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500 text-sm">No vehicles currently checked in. Use the check-in form to start queue.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3">Pos</th>
                    <th className="pb-3">Plate Number</th>
                    <th className="pb-3">Check-In Time</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm text-slate-300">
                  {pendingQueue.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-slate-900/20">
                      <td className="py-3 font-semibold text-indigo-400">#{index + 1}</td>
                      <td className="py-3 font-medium text-white">{entry.vehicleId}</td>
                      <td className="py-3">{new Date(entry.checkInTime).toLocaleTimeString()}</td>
                      <td className="py-3 text-right">
                        {index === 0 ? (
                          <button
                            onClick={() => handleDispatch(entry.id, entry.vehicleId)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium py-1 px-3 rounded-lg transition-all"
                          >
                            Dispatch Vehicle
                          </button>
                        ) : (
                          <span className="text-xs text-slate-500 italic">Awaiting turn</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
