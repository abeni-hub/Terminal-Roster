'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface Setting {
  id: string;
  key: string;
  value: string;
  description?: string;
}

interface PricingRule {
  id: string;
  dispatcherId: string;
  fareMultiplier: number;
  dispatcher: { username: string; email: string };
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  // Pricing rules
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [dispatchers, setDispatchers] = useState<{ id: string; username: string; email: string }[]>([]);
  const [newDispatcherId, setNewDispatcherId] = useState('');
  const [newMultiplier, setNewMultiplier] = useState('1.0');
  const [pricingMsg, setPricingMsg] = useState('');

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

  const fetchPricingRules = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const [prRes, usersRes] = await Promise.all([
        fetch(`${API_URL}/admin/pricing-rules`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (prRes.ok) setPricingRules(await prRes.json());
      if (usersRes.ok) {
        const users = await usersRes.json();
        setDispatchers(users.filter((u: any) => u.roleName === 'DISPATCHER'));
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchPricingRules();
  }, [fetchSettings, fetchPricingRules]);

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

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/admin/pricing-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ dispatcherId: newDispatcherId, fareMultiplier: parseFloat(newMultiplier) }),
      });
      if (res.ok) {
        setPricingMsg('Pricing rule saved!');
        setNewDispatcherId(''); setNewMultiplier('1.0');
        fetchPricingRules();
        setTimeout(() => setPricingMsg(''), 3000);
      } else {
        const err = await res.json().catch(() => null);
        setPricingMsg(`Error: ${err?.message || 'Failed'}`);
      }
    } catch { setPricingMsg('Network error.'); }
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        {/* System Settings Form */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
          <h3 className="text-sm font-bold text-white mb-6 uppercase tracking-wider">System Parameters</h3>

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

        {/* Dynamic Pricing configuration */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-6">
          <div>
            <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">Dynamic Pricing Rules</h3>
            <p className="text-[11px] text-slate-500">Configure fare multipliers for specific dispatchers.</p>
          </div>

          {pricingMsg && (
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs rounded-xl">
              {pricingMsg}
            </div>
          )}

          <form onSubmit={handleSavePricing} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Dispatcher</label>
                <select
                  value={newDispatcherId}
                  onChange={(e) => setNewDispatcherId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Select dispatcher...</option>
                  {dispatchers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.username} ({d.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Fare Multiplier</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max="10.0"
                  required
                  value={newMultiplier}
                  onChange={(e) => setNewMultiplier(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-3 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-emerald-600/10"
            >
              Configure Rule
            </button>
          </form>

          <div className="border-t border-slate-800/60 pt-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Active Pricing Rules</h4>
            {pricingRules.length === 0 ? (
              <p className="text-slate-500 text-xs italic">No dispatcher-specific pricing rules configured.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="pb-2">Dispatcher</th>
                      <th className="pb-2 text-right">Multiplier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {pricingRules.map((pr) => (
                      <tr key={pr.id}>
                        <td className="py-2.5 font-medium">
                          {pr.dispatcher.username}
                          <span className="block text-[10px] text-slate-500 font-normal">{pr.dispatcher.email}</span>
                        </td>
                        <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                          {pr.fareMultiplier.toFixed(2)}x
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
    </div>
  );
}
