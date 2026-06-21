'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { db, LocalScheduleEntry, LocalTerminal } from '../../../db/schema';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

export default function RosterPage() {
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [schedules, setSchedules] = useState<LocalScheduleEntry[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);

  // Filters
  const [termFilter, setTermFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('');

  // CSV upload
  const [csvData, setCsvData] = useState('');
  const [uploadResult, setUploadResult] = useState<{ processed: number; errors: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);

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
      if (termFilter) params.set('terminalCode', termFilter);
      if (weekFilter) params.set('weekNumber', weekFilter);
      const url = `${API_URL}/roster/schedules${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
    } finally {
      setSchedLoading(false);
    }
  }, [termFilter, weekFilter]);

  useEffect(() => {
    fetchTerminals();
    fetchSchedules();
  }, [fetchTerminals, fetchSchedules]);

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
      
      let data;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { processed: 0, errors: [`Server returned non-JSON response: ${text.slice(0, 100)}...`] };
      }

      if (res.ok) {
        setUploadResult(data);
        setCsvData('');
        fetchSchedules();
      } else {
        const errors = data.errors || data.message?.errors || (typeof data.message === 'string' ? [data.message] : ['Upload failed']);
        setUploadResult({ processed: 0, errors });
      }
    } catch (e: any) {
      setUploadResult({ processed: 0, errors: [`Upload failed: ${e.message || 'network error'}`] });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Roster Schedules Configuration</h2>
        <p className="text-xs text-slate-500">Upload weekly government-issued taxi schedules and review current terminal routing plans.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* CSV Upload Section */}
        <div className="lg:col-span-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">📤 Upload Weekly CSV</h3>
          <p className="text-slate-500 text-[11px] mb-4">
            Expected columns: <br />
            <code className="text-indigo-400 font-mono text-[9px]">plate_number, assigned_terminal, assigned_route, week_number, valid_from, valid_until, status</code>
          </p>

          <textarea
            value={csvData}
            onChange={(e) => setCsvData(e.target.value)}
            rows={8}
            placeholder="plate_number,assigned_terminal,assigned_route,week_number,valid_from,valid_until,status&#10;AA-2-B44910,Megenagna Taxi Terminal,R-001,24,2026-03-17,2026-03-23,active"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
          />

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleUpload}
              disabled={uploading || !csvData.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all active:scale-[0.98] disabled:opacity-40"
            >
              {uploading ? 'Processing...' : 'Upload CSV'}
            </button>
            {uploadResult && (
              <span className={`text-[10px] font-medium ${uploadResult.processed > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {uploadResult.processed} rows processed
              </span>
            )}
          </div>

          {uploadResult?.errors && uploadResult.errors.length > 0 && (
            <div className="mt-4 space-y-1.5 max-h-40 overflow-y-auto">
              {uploadResult.errors.map((err, idx) => (
                <div key={idx} className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-2 py-1 font-mono">
                  ⚠ {err}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule List */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">📋 Active Roster List</h3>

          <div className="flex flex-wrap items-center gap-4 mb-5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terminal</label>
              <select
                value={termFilter}
                onChange={(e) => setTermFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Terminals</option>
                {terminals.map((t) => (
                  <option key={t.id} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Week</label>
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
              className="text-xs bg-slate-800 hover:bg-slate-755 text-slate-200 font-medium px-4 py-1.5 rounded-lg transition-all"
            >
              Apply Filter
            </button>
          </div>

          {schedLoading ? (
            <p className="text-slate-500 text-xs py-10 text-center">Loading weekly schedules...</p>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500 text-xs">No rosters found matching the search filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Plate Number</th>
                    <th className="pb-3 pr-4">Terminal</th>
                    <th className="pb-3 pr-4">Assigned Route</th>
                    <th className="pb-3 pr-4">Week</th>
                    <th className="pb-3 pr-4">Valid Range</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {schedules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3 pr-4 font-mono font-bold text-white">{r.plateNumber}</td>
                      <td className="py-3 pr-4 text-slate-400">{r.terminalCode}</td>
                      <td className="py-3 pr-4">
                        <span className="text-indigo-400 font-bold">{r.routeCode}</span>
                        <span className="text-slate-500 ml-1 text-[10px]">({r.origin}→{r.destination})</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-400 font-mono">Wk {r.weekNumber}</td>
                      <td className="py-3 pr-4 text-slate-500 text-[10px] font-mono">
                        {new Date(r.validFrom).toLocaleDateString()} - {new Date(r.validUntil).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] border ${r.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                          {r.status.toLowerCase()}
                        </span>
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
