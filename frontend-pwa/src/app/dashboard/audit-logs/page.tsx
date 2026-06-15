'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface AuditLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  ipAddress?: string;
  user?: {
    username: string;
    roleName: string;
  };
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">Audit Trail Logs</h2>
        <p className="text-xs text-slate-500">Examine platform security logs, configuration audits, and administrative queue override bypasses.</p>
      </div>

      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Security Logs Trail</h3>

        {loading ? (
          <p className="text-slate-500 text-xs text-center py-10">Fetching logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-10">No audit logs found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Timestamp</th>
                  <th className="pb-3 pr-4">Operator</th>
                  <th className="pb-3 pr-4">Scope / Action</th>
                  <th className="pb-3 pr-4">Audit Details</th>
                  <th className="pb-3 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3.5 pr-4 font-mono text-[10px] text-slate-400">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3.5 pr-4 text-slate-200">
                      <div>{log.user?.username || 'System Process'}</div>
                      <div className="text-[9px] text-slate-500 tracking-wider uppercase font-semibold">
                        {log.user?.roleName?.replace('_', ' ').toLowerCase() || 'automated'}
                      </div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono text-[10px] px-2 py-0.5 rounded uppercase font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 text-slate-300 font-normal">{log.details}</td>
                    <td className="py-3.5 text-right font-mono text-slate-500 text-[10px]">{log.ipAddress || '127.0.0.1'}</td>
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
