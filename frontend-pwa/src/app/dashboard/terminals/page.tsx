'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface Terminal {
  id: string;
  name: string;
  code: string;
  location: string;
}

export default function TerminalsPage() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [msg, setMsg] = useState('');

  const fetchTerminals = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/terminals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTerminals(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTerminals();
  }, [fetchTerminals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('aatdrs_token');
    const method = editId ? 'PATCH' : 'POST';
    const url = editId ? `${API_URL}/terminals/${editId}` : `${API_URL}/terminals`;

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, code, location }),
      });

      if (res.ok) {
        setMsg(editId ? 'Terminal updated successfully!' : 'Terminal registered successfully!');
        setName('');
        setCode('');
        setLocation('');
        setEditId(null);
        fetchTerminals();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setMsg(`Error: ${err?.message || 'Action failed'}`);
      }
    } catch (err) {
      setMsg('Network error occurred.');
    }
  };

  const handleEdit = (t: Terminal) => {
    setEditId(t.id);
    setName(t.name);
    setCode(t.code);
    setLocation(t.location || '');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to archive this terminal?')) return;
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/terminals/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMsg('Terminal archived successfully!');
        fetchTerminals();
        setTimeout(() => setMsg(''), 4000);
      }
    } catch {
      setMsg('Delete action failed.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Terminal Registry</h2>
        <p className="text-xs text-slate-500">Configure and map Addis Ababa municipal transit hubs and active taxicab terminals.</p>
      </div>

      {msg && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs rounded-xl">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Editor Pane */}
        <div className="lg:col-span-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">
            {editId ? 'Edit Terminal' : 'Register Terminal'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Terminal Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Megenagna Taxi Terminal"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Terminal Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. MEG-01"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">GPS Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. 9.0223,38.8021"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-all active:scale-[0.98]"
              >
                {editId ? 'Save Changes' : 'Register Hub'}
              </button>
              {editId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditId(null);
                    setName('');
                    setCode('');
                    setLocation('');
                  }}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs py-2 px-3 rounded-lg transition-all"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* List Pane */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Active Terminal List</h3>

          {loading ? (
            <p className="text-slate-500 text-xs text-center py-10">Fetching terminals...</p>
          ) : terminals.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">No terminals registered.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Code</th>
                    <th className="pb-3 pr-4">Terminal Name</th>
                    <th className="pb-3 pr-4">Location</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                  {terminals.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 pr-4 font-mono font-bold text-white">{t.code}</td>
                      <td className="py-3.5 pr-4 text-slate-200">{t.name}</td>
                      <td className="py-3.5 pr-4 font-mono text-slate-400">{t.location || 'N/A'}</td>
                      <td className="py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(t)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] py-1 px-2.5 rounded transition-all"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 text-[10px] py-1 px-2.5 rounded transition-all"
                        >
                          Archive
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
