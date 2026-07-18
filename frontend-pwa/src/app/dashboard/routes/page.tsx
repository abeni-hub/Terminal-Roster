'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Route {
  id: string;
  code: string;
  sourceTerminalId: string;
  destinationTerminalId: string;
  baseFareETB: number;
  sourceTerminal: { name: string; code: string };
  destinationTerminal: { name: string; code: string };
}

interface Terminal {
  id: string;
  name: string;
  code: string;
}

export default function RoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(false);
  const [originFilter, setOriginFilter] = useState('');

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [sourceTerminalId, setSourceTerminalId] = useState('');
  const [destinationTerminalId, setDestinationTerminalId] = useState('');
  const [baseFareETB, setBaseFareETB] = useState('');
  
  // Assign terminal state
  const [assignRouteId, setAssignRouteId] = useState<string | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState('');

  const [msg, setMsg] = useState('');

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/routes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);
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
        if (data.length > 0) setSelectedTerminalId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchRoutes();
    fetchTerminals();
  }, [fetchRoutes, fetchTerminals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('aatdrs_token');
    const method = editId ? 'PATCH' : 'POST';
    const url = editId ? `${API_URL}/routes/${editId}` : `${API_URL}/routes`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code,
          sourceTerminalId,
          destinationTerminalId,
          baseFareETB: parseFloat(baseFareETB),
        }),
      });

      if (res.ok) {
        setMsg(editId ? 'Route updated successfully!' : 'Route registered successfully!');
        setCode('');
        setSourceTerminalId('');
        setDestinationTerminalId('');
        setBaseFareETB('');
        setEditId(null);
        fetchRoutes();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setMsg(`Error: ${err?.message || 'Action failed'}`);
      }
    } catch (err) {
      setMsg('Network error occurred.');
    }
  };

  const handleEdit = (r: Route) => {
    setEditId(r.id);
    setCode(r.code);
    setSourceTerminalId(r.sourceTerminalId);
    setDestinationTerminalId(r.destinationTerminalId);
    setBaseFareETB(r.baseFareETB.toString());
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this route?')) return;
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/routes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMsg('Route deleted successfully!');
        fetchRoutes();
        setTimeout(() => setMsg(''), 4000);
      }
    } catch {
      setMsg('Delete action failed.');
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignRouteId) return;
    const token = localStorage.getItem('aatdrs_token');

    try {
      const res = await fetch(`${API_URL}/routes/${assignRouteId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ terminalId: selectedTerminalId }),
      });

      if (res.ok) {
        setMsg('Route successfully assigned to terminal hub!');
        setAssignRouteId(null);
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        alert(`Error: ${err?.message || 'Assignment failed'}`);
      }
    } catch {
      alert('Network error occurred.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Transit Routes Registry</h2>
        <p className="text-xs text-slate-500">Manage route codes, base fares, origins, destinations, and coordinate assignments with active terminal hubs.</p>
      </div>

      {msg && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs rounded-xl">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Editor Pane */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">
              {editId ? 'Edit Route' : 'Create Route'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Route Code</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. R-001"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Origin Terminal</label>
                <select
                  required
                  value={sourceTerminalId}
                  onChange={(e) => setSourceTerminalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="" disabled>Select Origin Terminal...</option>
                  {terminals.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Destination Terminal</label>
                <select
                  required
                  value={destinationTerminalId}
                  onChange={(e) => setDestinationTerminalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value="" disabled>Select Destination Terminal...</option>
                  {terminals.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Base Fare (ETB)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={baseFareETB}
                  onChange={(e) => setBaseFareETB(e.target.value)}
                  placeholder="e.g. 15.00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-all active:scale-[0.98]"
                >
                  {editId ? 'Save Route' : 'Create Route'}
                </button>
                {editId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(null);
                      setCode('');
                      setSourceTerminalId('');
                      setDestinationTerminalId('');
                      setBaseFareETB('');
                    }}
                    className="bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs py-2 px-3 rounded-lg transition-all"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* List Pane */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Active Routes List</h3>
            
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Filter Origin</label>
              <select
                value={originFilter}
                onChange={(e) => setOriginFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="">All Origins (Source Terminals)</option>
                {Array.from(new Set(routes.map(r => r.sourceTerminal?.name).filter(Boolean))).map(originName => (
                  <option key={originName} value={originName}>{originName}</option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p className="text-slate-500 text-xs text-center py-10">Fetching routes...</p>
          ) : routes.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">No routes registered.</p>
          ) : (
            <div className="space-y-6">
              {/* Grouping by Origin */}
              {Object.entries(
                routes
                  .filter(r => !originFilter || r.sourceTerminal?.name === originFilter)
                  .reduce((acc, r) => {
                    const originName = r.sourceTerminal?.name || 'Unknown';
                    if (!acc[originName]) acc[originName] = [];
                    acc[originName].push(r);
                    return acc;
                  }, {} as Record<string, Route[]>)
              ).map(([originGroup, groupedRoutes]) => (
                <div key={originGroup} className="space-y-2 border border-slate-800/40 bg-slate-950/20 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-800/40">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                    From Source Terminal: <span className="text-slate-100">{originGroup}</span>
                  </h4>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          <th className="pb-2 pr-4">Code</th>
                          <th className="pb-2 pr-4">Destination</th>
                          <th className="pb-2 pr-4">Base Fare</th>
                          <th className="pb-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/30 text-slate-300 font-medium">
                        {groupedRoutes.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-900/30 transition-colors">
                            <td className="py-2.5 pr-4 font-mono font-bold text-slate-200">{r.code}</td>
                            <td className="py-2.5 pr-4 text-slate-400">
                              <span className="text-slate-500 text-[10px] mr-1">to</span> {r.destinationTerminal?.name || 'Unknown'}
                            </td>
                            <td className="py-2.5 pr-4 font-mono text-emerald-400 font-bold">{Number(r.baseFareETB).toFixed(2)} ETB</td>
                            <td className="py-2.5 text-right space-x-2">
                         
                              <button
                                onClick={() => handleEdit(r)}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] py-1 px-2 rounded transition-all"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(r.id)}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 text-[10px] py-1 px-2 rounded transition-all"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Assign Terminal Modal */}
      {assignRouteId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Assign Route to Terminal</h3>
            <p className="text-xs text-slate-500 mb-4">Select the taxi terminal that handles dispatches for this route code.</p>

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Select Terminal Hub</label>
                <select
                  value={selectedTerminalId}
                  onChange={(e) => setSelectedTerminalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                >
                  {terminals.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setAssignRouteId(null)}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs py-2 px-4 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
