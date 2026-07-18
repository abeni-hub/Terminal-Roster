'use client';

import React, { useEffect, useState } from 'react';

interface DashboardStats {
  totalAvailableVehicles: number;
  activeVehicles: number;
  vehiclesWithViolations: number;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function DashboardStatsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('aatdrs_token');
        if (!token) return;

        const res = await fetch(`${API_URL}/admin/dashboard/transport`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(`Server error ${res.status}`);
        setStats(await res.json());
      } catch (err: any) {
        setError(err.message || 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const metrics = [
    {
      label: 'Total Available Vehicles',
      value: stats?.totalAvailableVehicles ?? '—',
      description: 'Vehicles registered as ACTIVE in the system',
      color: 'from-blue-500 to-cyan-500',
      bg: 'bg-blue-500/10',
      dot: 'bg-blue-400',
      pulse: false,
      icon: (
        <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
      ),
    },
    {
      label: 'Active Vehicles',
      value: stats?.activeVehicles ?? '—',
      description: 'Currently checked in or dispatched today',
      color: 'from-emerald-500 to-teal-500',
      bg: 'bg-emerald-500/10',
      dot: 'bg-emerald-400',
      pulse: true,
      icon: (
        <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Vehicles with Violations',
      value: stats?.vehiclesWithViolations ?? '—',
      description: 'Unresolved violations requiring attention',
      color: 'from-rose-500 to-red-500',
      bg: 'bg-rose-500/10',
      dot: 'bg-rose-500',
      pulse: false,
      icon: (
        <svg className="w-6 h-6 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Transport Dashboard</h2>
        <p className="text-slate-400 text-sm mt-1">Real-time overview of fleet status and operations. Auto-refreshes every 30s.</p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          ⚠ Could not load stats: {error}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="relative bg-slate-900/50 border border-slate-800/60 p-6 rounded-2xl backdrop-blur-xl hover:bg-slate-900/80 transition-all duration-300 group overflow-hidden"
          >
            {/* subtle background glow */}
            <div className={`absolute inset-0 bg-gradient-to-br ${m.color} opacity-0 group-hover:opacity-5 transition-opacity duration-500 rounded-2xl`} />

            <div className="relative flex items-start gap-4">
              <div className={`p-3 ${m.bg} rounded-xl group-hover:scale-110 transition-transform duration-300`}>
                {m.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-400 truncate">{m.label}</p>
                {loading ? (
                  <div className="mt-2 h-9 w-16 bg-slate-800 rounded-lg animate-pulse" />
                ) : (
                  <h3 className="text-4xl font-black text-white mt-1 tabular-nums">{m.value}</h3>
                )}
              </div>
            </div>

            <div className="relative mt-5 flex items-center gap-2 text-xs text-slate-500">
              <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot} ${m.pulse ? 'animate-pulse' : ''}`} />
              {m.description}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Roster Schedules', href: '/dashboard/roster' },
          { label: 'Vehicles', href: '/dashboard/vehicles' },
          { label: 'Reports', href: '/dashboard/reports' },
          { label: 'Audit Logs', href: '/dashboard/audit-logs' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="block bg-slate-900/40 border border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/70 transition-all rounded-xl px-4 py-3 text-xs font-medium text-slate-400 hover:text-slate-200 text-center"
          >
            {link.label} →
          </a>
        ))}
      </div>
    </div>
  );
}
