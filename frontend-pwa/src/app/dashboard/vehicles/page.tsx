'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface Vehicle {
  id: string;
  plateNumber: string;
  ownerName: string;
  ownerPhone: string;
  capacity: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE';
}

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [plateNumber, setPlateNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [capacity, setCapacity] = useState('12');
  const [status, setStatus] = useState<'ACTIVE' | 'SUSPENDED' | 'MAINTENANCE'>('ACTIVE');

  const [msg, setMsg] = useState('');

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setVehicles(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('aatdrs_token');
    const method = editId ? 'PATCH' : 'POST';
    const url = editId ? `${API_URL}/vehicles/${editId}` : `${API_URL}/vehicles`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plateNumber,
          ownerName,
          ownerPhone,
          capacity: parseInt(capacity, 10),
          status,
        }),
      });

      if (res.ok) {
        setMsg(editId ? 'Vehicle record updated successfully!' : 'Vehicle registered successfully!');
        setPlateNumber('');
        setOwnerName('');
        setOwnerPhone('');
        setCapacity('12');
        setStatus('ACTIVE');
        setEditId(null);
        fetchVehicles();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setMsg(`Error: ${err?.message || 'Action failed'}`);
      }
    } catch (err) {
      setMsg('Network error occurred.');
    }
  };

  const handleEdit = (v: Vehicle) => {
    setEditId(v.id);
    setPlateNumber(v.plateNumber);
    setOwnerName(v.ownerName);
    setOwnerPhone(v.ownerPhone || '');
    setCapacity(v.capacity.toString());
    setStatus(v.status);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this vehicle registration?')) return;
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/vehicles/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMsg('Vehicle record deleted successfully!');
        fetchVehicles();
        setTimeout(() => setMsg(''), 4000);
      }
    } catch {
      setMsg('Delete action failed.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Vehicle Registrations</h2>
        <p className="text-xs text-slate-500">Register new taxi vehicles, track capacity constraints, ownership profiles, and operational status.</p>
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
              {editId ? 'Edit Registration' : 'Register Vehicle'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Plate Number</label>
                <input
                  type="text"
                  required
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. AA-2-B44910"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono tracking-wide"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Owner Name</label>
                <input
                  type="text"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="e.g. Bekele Alemu"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Owner Phone</label>
                <input
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="e.g. +251911000001"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Seat Capacity</label>
                <input
                  type="number"
                  required
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 12"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="MAINTENANCE">Maintenance</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-all active:scale-[0.98]"
                >
                  {editId ? 'Save Record' : 'Register Taxi'}
                </button>
                {editId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(null);
                      setPlateNumber('');
                      setOwnerName('');
                      setOwnerPhone('');
                      setCapacity('12');
                      setStatus('ACTIVE');
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
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Registered Taxi Fleets</h3>

          {loading ? (
            <p className="text-slate-500 text-xs text-center py-10">Fetching vehicles...</p>
          ) : vehicles.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">No vehicles registered.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Plate Number</th>
                    <th className="pb-3 pr-4">Owner Profile</th>
                    <th className="pb-3 pr-4">Capacity</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 pr-4 font-mono font-bold text-white text-sm">{v.plateNumber}</td>
                      <td className="py-3.5 pr-4">
                        <div className="text-slate-200">{v.ownerName}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{v.ownerPhone || 'No phone'}</div>
                      </td>
                      <td className="py-3.5 pr-4 font-mono text-slate-400">{v.capacity} seats</td>
                      <td className="py-3.5 pr-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          v.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : v.status === 'SUSPENDED'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {v.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(v)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] py-1 px-2.5 rounded transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(v.id)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 text-[10px] py-1 px-2.5 rounded transition-all"
                        >
                          Delete
                        </button>
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
