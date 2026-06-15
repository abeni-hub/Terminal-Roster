'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db, LocalDispatchRecord } from '../../../db/schema';

export default function HistoryPage() {
  const [history, setHistory] = useState<LocalDispatchRecord[]>([]);

  const loadHistory = useCallback(async () => {
    const list = await db.dispatches.toArray();
    list.sort((a, b) => b.dispatchTime - a.dispatchTime);
    setHistory(list);
  }, []);

  useEffect(() => {
    loadHistory();
    const timer = setInterval(loadHistory, 3000);
    return () => clearInterval(timer);
  }, [loadHistory]);

  const totalRevenue = history.reduce((sum, item) => sum + item.fareChargedETB, 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Dispatch History</h2>
          <p className="text-xs text-slate-500">View chronological log of vehicle dispatches completed on this terminal.</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800/80 px-4 py-2 rounded-xl text-right shrink-0">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Fare Collected</p>
          <h4 className="text-base font-extrabold text-emerald-400">{totalRevenue.toFixed(2)} ETB</h4>
        </div>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        {history.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
            <p className="text-slate-500 text-sm">No dispatches recorded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Vehicle Plate</th>
                  <th className="pb-3 pr-4">Route ID</th>
                  <th className="pb-3 pr-4">Dispatcher</th>
                  <th className="pb-3 pr-4">Dispatch Time</th>
                  <th className="pb-3 pr-4">Fare Charged</th>
                  <th className="pb-3 text-right">Sync Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3.5 pr-4 font-mono font-bold text-white text-sm">{item.vehicleId}</td>
                    <td className="py-3.5 pr-4">
                      <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-indigo-300 font-bold">{item.routeId}</span>
                    </td>
                    <td className="py-3.5 pr-4 text-slate-400">{item.dispatcherId}</td>
                    <td className="py-3.5 pr-4 text-slate-400">{new Date(item.dispatchTime).toLocaleString()}</td>
                    <td className="py-3.5 pr-4 text-emerald-400 font-bold">{item.fareChargedETB.toFixed(2)} ETB</td>
                    <td className="py-3.5 text-right">
                      {item.isSynced === 1 ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                          Synced
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span>
                          Pending
                        </span>
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
  );
}
