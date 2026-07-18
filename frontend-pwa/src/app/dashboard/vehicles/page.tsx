'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Vehicle {
  id: string;
  plateNumber: string;
  ownerName: string;
  ownerPhone: string;
  capacity: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE';
  groupId?: string | null;
  group?: { name: string; id: string } | null;
}

interface PlateHistoryEntry {
  id: string;
  oldPlate: string;
  newPlate: string;
  changedAt: string;
}

interface Terminal { id: string; name: string; code: string; }
interface Route { id: string; code: string; origin: string; destination: string; }

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [plateNumber, setPlateNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [capacity, setCapacity] = useState('12');
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE'>('ACTIVE');
  const [withViolation, setWithViolation] = useState(false);
  const [violationDetails, setViolationDetails] = useState('');

  const [historyVehicle, setHistoryVehicle] = useState<Vehicle | null>(null);
  const [plateHistory, setPlateHistory] = useState<PlateHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [flagVehicle, setFlagVehicle] = useState<Vehicle | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [flagTerminalId, setFlagTerminalId] = useState('');
  const [flagRouteId, setFlagRouteId] = useState('');
  const [flagSaving, setFlagSaving] = useState(false);

  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchCsv, setBatchCsv] = useState('');
  const [batching, setBatching] = useState(false);
  const [batchResult, setBatchResult] = useState<{ count: number; messages: string[] } | null>(null);

  const tok = () => localStorage.getItem('aatdrs_token');

  const showMsg = (text: string, type: 'ok' | 'err' = 'ok') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  };

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/vehicles`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setVehicles(await res.json());
    } finally { setLoading(false); }
  }, []);

  const fetchTerminalsAndRoutes = useCallback(async () => {
    try {
      const [tRes, rRes] = await Promise.all([
        fetch(`${API_URL}/roster/terminals`, { headers: { Authorization: `Bearer ${tok()}` } }),
        fetch(`${API_URL}/routes`, { headers: { Authorization: `Bearer ${tok()}` } }),
      ]);
      if (tRes.ok) setTerminals(await tRes.json());
      if (rRes.ok) setRoutes(await rRes.json());
    } catch {}
  }, []);

  useEffect(() => { fetchVehicles(); fetchTerminalsAndRoutes(); }, [fetchVehicles, fetchTerminalsAndRoutes]);

  const resetForm = () => {
    setEditId(null); setPlateNumber(''); setOwnerName('');
    setOwnerPhone(''); setCapacity('12'); setStatus('ACTIVE');
    setWithViolation(false); setViolationDetails('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const method = editId ? 'PATCH' : 'POST';
    let url = editId ? `${API_URL}/vehicles/${editId}` : `${API_URL}/vehicles`;
    let body: any = { plateNumber, ownerName, ownerPhone, capacity: parseInt(capacity, 10), status };

    if (!editId && withViolation) {
      url = `${API_URL}/vehicles/with-violation`;
      body = {
        vehicle: { plateNumber, ownerName, ownerPhone, capacity: parseInt(capacity, 10), status },
        violationDetails: violationDetails || 'Registered with initial violation flag.',
        violationType: 'ROUTE_HOPPING',
        severityScore: 50,
      };
    }

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showMsg(editId ? 'Vehicle updated!' : withViolation ? 'Registered with violation flag!' : 'Vehicle registered!');
        resetForm(); fetchVehicles();
      } else {
        const err = await res.json().catch(() => null);
        showMsg(`Error: ${err?.message || 'Action failed'}`, 'err');
      }
    } catch { showMsg('Network error.', 'err'); }
  };

  const handleBatchSubmit = async () => {
    if (!batchCsv.trim()) return;
    setBatching(true); setBatchResult(null);
    try {
      const res = await fetch(`${API_URL}/vehicles/batch-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ csvData: batchCsv })
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setBatchResult({ count: data?.upsertedCount || 0, messages: [] });
        fetchVehicles();
        setTimeout(() => { setShowBatchForm(false); setBatchCsv(''); setBatchResult(null); }, 3000);
      } else {
        setBatchResult({ count: 0, messages: [data?.message || 'Import failed'] });
      }
    } catch {
      setBatchResult({ count: 0, messages: ['Network error'] });
    } finally {
      setBatching(false);
    }
  };

  const handleEdit = (v: Vehicle) => {
    setEditId(v.id); setPlateNumber(v.plateNumber); setOwnerName(v.ownerName);
    setOwnerPhone(v.ownerPhone || ''); setCapacity(v.capacity.toString()); setStatus(v.status);
    setWithViolation(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this vehicle?')) return;
    const res = await fetch(`${API_URL}/vehicles/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` } });
    if (res.ok) { showMsg('Deleted.'); fetchVehicles(); }
    else showMsg('Delete failed.', 'err');
  };

  const openHistory = async (v: Vehicle) => {
    setHistoryVehicle(v); setHistoryLoading(true); setPlateHistory([]);
    try {
      const res = await fetch(`${API_URL}/vehicles/${v.id}/plate-history`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setPlateHistory(await res.json());
    } finally { setHistoryLoading(false); }
  };

  const handleFlagViolation = async () => {
    if (!flagVehicle || !flagTerminalId || !flagRouteId) return;
    setFlagSaving(true);
    try {
      const res = await fetch(`${API_URL}/roster/assign-vehicle-with-violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ vehicleId: flagVehicle.id, terminalId: flagTerminalId, routeId: flagRouteId }),
      });
      if (res.ok) {
        showMsg(`${flagVehicle.plateNumber} assigned with violation flag.`);
        setFlagVehicle(null); setFlagTerminalId(''); setFlagRouteId('');
      } else {
        const err = await res.json().catch(() => null);
        showMsg(`Error: ${err?.message || 'Failed'}`, 'err');
      }
    } finally { setFlagSaving(false); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Vehicle Registrations</h2>
          <p className="text-xs text-slate-500">Register vehicles, manage plate history, assign to additional routes with violation flags.</p>
        </div>
        <button onClick={() => setShowBatchForm(true)} className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 text-xs font-semibold py-2 px-4 rounded-lg transition-all">
          📤 Bulk Import CSV
        </button>
      </div>

      {msg && (
        <div className={`p-3 border rounded-xl text-xs ${msgType === 'ok' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="lg:col-span-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">{editId ? 'Edit Registration' : 'Register Vehicle'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Plate Number</label>
              <input type="text" required value={plateNumber} onChange={e => setPlateNumber(e.target.value.toUpperCase())} placeholder="AA-2-B44910"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Owner Name</label>
              <input type="text" required value={ownerName} onChange={e => setOwnerName(e.target.value)} placeholder="Bekele Alemu"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Owner Phone</label>
              <input type="text" value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} placeholder="+251911000001"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Seat Capacity</label>
              <input type="number" required value={capacity} onChange={e => setCapacity(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500">
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="MAINTENANCE">Maintenance</option>
              </select>
            </div>
            {!editId && (
              <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={withViolation} onChange={e => setWithViolation(e.target.checked)} className="accent-amber-500 w-4 h-4" />
                  <span className="text-xs font-semibold text-amber-400">Register with violation flag</span>
                </label>
                {withViolation && (
                  <textarea value={violationDetails} onChange={e => setViolationDetails(e.target.value)}
                    rows={2} placeholder="Describe the violation reason..."
                    className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none" />
                )}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-all active:scale-[0.98]">
                {editId ? 'Save Record' : withViolation ? 'Register + Flag' : 'Register Taxi'}
              </button>
              {editId && (
                <button type="button" onClick={resetForm} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 px-3 rounded-lg transition-all">Cancel</button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Registered Fleet</h3>
          {loading ? (
            <p className="text-slate-500 text-xs text-center py-10">Loading...</p>
          ) : vehicles.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">No vehicles registered.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Plate</th>
                    <th className="pb-3 pr-4">Owner</th>
                    <th className="pb-3 pr-4">Group</th>
                    <th className="pb-3 pr-3">Cap.</th>
                    <th className="pb-3 pr-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3 pr-4 font-mono font-bold text-white">{v.plateNumber}</td>
                      <td className="py-3 pr-4">
                        <div className="text-slate-200">{v.ownerName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{v.ownerPhone || '—'}</div>
                      </td>
                      <td className="py-3 pr-4 text-[10px] text-slate-400">
                        {v.group ? (
                          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full inline-block">
                            {v.group.name}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-slate-400 font-mono">{v.capacity}</td>
                      <td className="py-3 pr-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          v.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : v.status === 'SUSPENDED' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>{v.status.toLowerCase()}</span>
                      </td>
                      <td className="py-3 text-right space-x-1 whitespace-nowrap">
                        <button onClick={() => handleEdit(v)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] py-1 px-2 rounded transition-all">Edit</button>
                        <button onClick={() => openHistory(v)} className="bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/10 text-[10px] py-1 px-2 rounded transition-all">History</button>
                        <button onClick={() => { setFlagVehicle(v); setFlagTerminalId(''); setFlagRouteId(''); }} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/10 text-[10px] py-1 px-2 rounded transition-all">Flag</button>
                        <button onClick={() => handleDelete(v.id)} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 text-[10px] py-1 px-2 rounded transition-all">Del</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {historyVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">Plate History — <span className="font-mono text-indigo-400">{historyVehicle.plateNumber}</span></h3>
              <button onClick={() => setHistoryVehicle(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            {historyLoading ? (
              <p className="text-slate-500 text-xs text-center py-6">Loading...</p>
            ) : plateHistory.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-6">No plate changes recorded.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {plateHistory.map(h => (
                  <div key={h.id} className="bg-slate-800/50 rounded-xl px-4 py-3 text-xs flex items-center gap-3">
                    <span className="font-mono text-red-400 line-through">{h.oldPlate}</span>
                    <span className="text-slate-500">→</span>
                    <span className="font-mono text-emerald-400">{h.newPlate}</span>
                    <span className="ml-auto text-slate-600 text-[10px]">{new Date(h.changedAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {flagVehicle && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">Assign to Additional Route + Violation Flag</h3>
              <button onClick={() => setFlagVehicle(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-slate-400">
              <span className="font-mono text-amber-400 font-bold">{flagVehicle.plateNumber}</span> will be added to the
              selected route on the active roster with a <span className="text-amber-400">violation flag</span>.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Terminal</label>
                <select value={flagTerminalId} onChange={e => setFlagTerminalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-amber-500">
                  <option value="">Select terminal...</option>
                  {terminals.map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Route</label>
                <select value={flagRouteId} onChange={e => setFlagRouteId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-amber-500">
                  <option value="">Select route...</option>
                  {routes.map(r => <option key={r.id} value={r.id}>{r.code} ({r.origin} → {r.destination})</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleFlagViolation} disabled={flagSaving || !flagTerminalId || !flagRouteId}
                className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg transition-all">
                {flagSaving ? 'Saving...' : 'Confirm & Flag'}
              </button>
              <button onClick={() => setFlagVehicle(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 px-4 rounded-lg transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showBatchForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">📤 Bulk Import Vehicles</h3>
              <button onClick={() => { setShowBatchForm(false); setBatchResult(null); }} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-slate-400">
              Paste CSV data to bulk insert or update vehicles. Expected columns:<br/>
              <code className="text-emerald-400 font-mono text-[9px]">plateNumber, ownerName, ownerPhone, capacity, status</code>
            </p>

            <textarea value={batchCsv} onChange={e => setBatchCsv(e.target.value)} rows={8}
              placeholder="plateNumber,ownerName,ownerPhone,capacity,status&#10;AA-2-B44910,Bekele Alemu,+251911000001,12,ACTIVE"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono" />
            
            <div className="flex items-center gap-3">
              <button onClick={handleBatchSubmit} disabled={batching || !batchCsv.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all disabled:opacity-40">
                {batching ? 'Processing...' : 'Import Data'}
              </button>
              <button onClick={() => { setShowBatchForm(false); setBatchResult(null); }} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 px-4 rounded-lg transition-all">Cancel</button>
              
              {batchResult && (
                <span className={`text-[10px] font-medium ml-auto ${batchResult.count > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {batchResult.count} rows processed. {batchResult.messages[0]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
