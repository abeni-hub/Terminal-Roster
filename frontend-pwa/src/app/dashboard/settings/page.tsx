'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface Setting {
  id: string;
  key: string;
  value: string;
  description?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        const valMap: Record<string, string> = {};
        data.forEach((s: Setting) => {
          valMap[s.key] = s.value;
        });
        setEditedValues(valMap);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (key: string, val: string) => {
    setEditedValues((prev) => ({
      ...prev,
      [key]: val,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('aatdrs_token');
    const payload = Object.entries(editedValues).map(([key, value]) => ({ key, value }));

    try {
      const res = await fetch(`${API_URL}/admin/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setMsg('System settings successfully updated!');
        fetchSettings();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setMsg(`Error: ${err?.message || 'Update failed'}`);
      }
    } catch {
      setMsg('Network error occurred.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">System Settings & Parameters</h2>
        <p className="text-xs text-slate-500">Configure global limits, operational parameters, sync intervals, and commission fee splits.</p>
      </div>

      {msg && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs rounded-xl">
          {msg}
        </div>
      )}

      <div className="max-w-2xl bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">System Settings Form</h3>

        {loading ? (
          <p className="text-slate-500 text-xs text-center py-10">Fetching parameters...</p>
        ) : settings.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-10">No settings found.</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <div className="space-y-4">
              {settings.map((s) => (
                <div key={s.id} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center border-b border-slate-800/40 pb-4 last:border-b-0 last:pb-0">
                  <div className="md:col-span-1">
                    <label className="block text-xs font-bold text-slate-300 font-mono tracking-wide">{s.key}</label>
                    {s.description && (
                      <p className="text-[10px] text-slate-500 mt-0.5">{s.description}</p>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      required
                      value={editedValues[s.key] ?? ''}
                      onChange={(e) => handleChange(s.key, e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/10"
            >
              Save Parameters
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
