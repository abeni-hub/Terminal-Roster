'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface Report {
  id: string;
  startDate: string;
  endDate: string;
  totalDispatches: number;
  totalMunicipalComm: number;
  totalPlatformComm: number;
  status: 'PENDING' | 'APPROVED';
  createdAt: string;
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [terminals, setTerminals] = useState<{ id: string; name: string }[]>([]);

  const [msg, setMsg] = useState('');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/reconciliation/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTerminals = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/terminals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTerminals(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchTerminals();
  }, [fetchReports, fetchTerminals]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate || !endDate) return;
    const token = localStorage.getItem('aatdrs_token');

    try {
      const res = await fetch(`${API_URL}/reconciliation/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          terminalId: terminalId || undefined,
        }),
      });

      if (res.ok) {
        setMsg('Financial reconciliation report generated!');
        setStartDate('');
        setEndDate('');
        setTerminalId('');
        fetchReports();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setMsg(`Error: ${err?.message || 'Generation failed'}`);
      }
    } catch {
      setMsg('Network error occurred.');
    }
  };

  const handleSettle = async (id: string) => {
    if (!confirm('Mark all commissions in this report range as settled?')) return;
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/reconciliation/${id}/settle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMsg('Report range successfully settled!');
        fetchReports();
        setTimeout(() => setMsg(''), 4000);
      }
    } catch {
      setMsg('Settle request failed.');
    }
  };

  const totalComm = reports.reduce((sum, r) => sum + Number(r.totalMunicipalComm || 0), 0);
  const totalPlatform = reports.reduce((sum, r) => sum + Number(r.totalPlatformComm || 0), 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Financial Reports & Reconciliation</h2>
          <p className="text-xs text-slate-500">Generate, audit, and settle municipal dispatch commissions and platform revenue splits.</p>
        </div>

        <div className="flex gap-4">
          <div className="bg-slate-900/50 border border-slate-800/80 px-4 py-2 rounded-xl text-right shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Municipal Comm.</p>
            <h4 className="text-base font-extrabold text-indigo-400">{totalComm.toFixed(2)} ETB</h4>
          </div>
          <div className="bg-slate-900/50 border border-slate-800/80 px-4 py-2 rounded-xl text-right shrink-0">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Platform Fee</p>
            <h4 className="text-base font-extrabold text-emerald-400">{totalPlatform.toFixed(2)} ETB</h4>
          </div>
        </div>
      </div>

      {msg && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs rounded-xl">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Generate Report Form */}
        <div className="lg:col-span-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Generate Report</h3>

          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Start Date</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">End Date</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Terminal (Optional)</label>
              <select
                value={terminalId}
                onChange={(e) => setTerminalId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="">All Terminals</option>
                {terminals.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/10"
            >
              Generate Audit Report
            </button>
          </form>
        </div>

        {/* Generated Reports List */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Commission Reports History</h3>

          {loading ? (
            <p className="text-slate-500 text-xs text-center py-10">Fetching reports...</p>
          ) : reports.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">No reconciliation reports generated.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Range</th>
                    <th className="pb-3 pr-4">Dispatches</th>
                    <th className="pb-3 pr-4">Muni. Comm</th>
                    <th className="pb-3 pr-4">Platform Fee</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                  {reports.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 pr-4 text-[10px] font-mono text-slate-300">
                        {new Date(r.startDate).toLocaleDateString()} - {new Date(r.endDate).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-slate-200 text-sm font-bold">{r.totalDispatches}</td>
                      <td className="py-3.5 pr-4 font-mono text-indigo-400 font-bold">{Number(r.totalMunicipalComm).toFixed(2)} ETB</td>
                      <td className="py-3.5 pr-4 font-mono text-emerald-400 font-bold">{Number(r.totalPlatformComm).toFixed(2)} ETB</td>
                      <td className="py-3.5 pr-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          r.status === 'APPROVED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {r.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        {r.status === 'PENDING' ? (
                          <button
                            onClick={() => handleSettle(r.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1 px-3 rounded transition-all"
                          >
                            Settle
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-500 italic">Settled</span>
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
