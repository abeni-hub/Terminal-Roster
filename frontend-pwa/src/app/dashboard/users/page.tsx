'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface User {
  id: string;
  username: string;
  email: string;
  roleName: 'SYSTEM_ADMIN' | 'MUNICIPAL_PLANNER' | 'DISPATCHER';
  isActive: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [editId, setEditId] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleName, setRoleName] = useState<'SYSTEM_ADMIN' | 'MUNICIPAL_PLANNER' | 'DISPATCHER'>('DISPATCHER');
  const [isActive, setIsActive] = useState(true);

  const [msg, setMsg] = useState('');

  // Dispatcher Assignment Roster states
  const [assignments, setAssignments] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [assignUser, setAssignUser] = useState<User | null>(null);
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [assignMsg, setAssignMsg] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAssignments = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/dispatcher-assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAssignments(data);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchTerminalsAndRoutes = useCallback(async () => {
    const token = localStorage.getItem('aatdrs_token');
    try {
      const [termRes, routeRes] = await Promise.all([
        fetch(`${API_URL}/terminals`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/routes`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (termRes.ok) {
        const termData = await termRes.json();
        setTerminals(termData);
        if (termData.length > 0) setSelectedTerminalId(termData[0].id);
      }
      if (routeRes.ok) {
        const routeData = await routeRes.json();
        setRoutes(routeData);
        if (routeData.length > 0) setSelectedRouteId(routeData[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAssignments();
    fetchTerminalsAndRoutes();
  }, [fetchUsers, fetchAssignments, fetchTerminalsAndRoutes]);

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignUser) return;
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/roster/assign-dispatcher`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dispatcherId: assignUser.id,
          terminalId: selectedTerminalId,
          routeId: selectedRouteId,
        }),
      });
      if (res.ok) {
        setMsg('Dispatcher assigned to terminal/route successfully!');
        setAssignUser(null);
        fetchAssignments();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setAssignMsg(`Error: ${err?.message || 'Assignment failed'}`);
      }
    } catch (err) {
      setAssignMsg('Network error occurred.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('aatdrs_token');
    const method = editId ? 'PATCH' : 'POST';
    const url = editId ? `${API_URL}/admin/users/${editId}` : `${API_URL}/admin/users`;

    const body: any = {
      username,
      email,
      roleName,
      isActive,
    };
    if (password) {
      body.password = password;
    }

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setMsg(editId ? 'User updated successfully!' : 'User account created successfully!');
        setUsername('');
        setEmail('');
        setPassword('');
        setRoleName('DISPATCHER');
        setIsActive(true);
        setEditId(null);
        fetchUsers();
        setTimeout(() => setMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setMsg(`Error: ${err?.message || 'Action failed'}`);
      }
    } catch (err) {
      setMsg('Network error occurred.');
    }
  };

  const handleEdit = (u: User) => {
    setEditId(u.id);
    setUsername(u.username);
    setEmail(u.email);
    setPassword('');
    setRoleName(u.roleName);
    setIsActive(u.isActive);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate/archive this user account?')) return;
    const token = localStorage.getItem('aatdrs_token');
    try {
      const res = await fetch(`${API_URL}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMsg('User deactivated successfully.');
        fetchUsers();
        setTimeout(() => setMsg(''), 4000);
      }
    } catch {
      setMsg('Deactivation failed.');
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-extrabold text-white tracking-tight">System User Accounts</h2>
        <p className="text-xs text-slate-500">Provision Dispatcher and Municipal Planner accounts, assign roles, and handle credentials.</p>
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
            {editId ? 'Modify User Profile' : 'Create User Account'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. planner_kebede"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. user@aatdrs.gov.et"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                {editId ? 'Password (leave blank to keep unchanged)' : 'Password'}
              </label>
              <input
                type="password"
                required={!editId}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Access Role</label>
              <select
                value={roleName}
                onChange={(e) => setRoleName(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="DISPATCHER">Dispatcher</option>
                <option value="MUNICIPAL_PLANNER">Municipal Planner</option>
                <option value="SYSTEM_ADMIN">System Administrator</option>
              </select>
            </div>

            {editId && (
              <div className="flex items-center gap-2.5 py-1">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <label htmlFor="isActive" className="text-xs text-slate-300 font-medium cursor-pointer">
                  Account is Active / Enabled
                </label>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-lg transition-all active:scale-[0.98]"
              >
                {editId ? 'Save Changes' : 'Register Account'}
              </button>
              {editId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditId(null);
                    setUsername('');
                    setEmail('');
                    setPassword('');
                    setRoleName('DISPATCHER');
                    setIsActive(true);
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
          <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Active System Users</h3>

          {loading ? (
            <p className="text-slate-500 text-xs text-center py-10">Fetching users...</p>
          ) : users.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-10">No users registered.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Username</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Role</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3.5 pr-4 font-bold text-white text-sm">{u.username}</td>
                      <td className="py-3.5 pr-4 text-slate-400 font-mono text-[11px]">{u.email}</td>
                      <td className="py-3.5 pr-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          u.roleName === 'SYSTEM_ADMIN'
                            ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                            : u.roleName === 'MUNICIPAL_PLANNER'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {u.roleName.replace('_', ' ').toLowerCase()}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        {u.isActive ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> Active
                          </span>
                        ) : (
                          <span className="text-red-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span> Disabled
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleEdit(u)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] py-1 px-2.5 rounded transition-all"
                        >
                          Edit
                        </button>
                        {u.roleName === 'DISPATCHER' && u.isActive && (
                          <button
                            onClick={() => {
                              setAssignUser(u);
                              setAssignMsg('');
                              if (terminals.length > 0) setSelectedTerminalId(terminals[0].id);
                              if (routes.length > 0) setSelectedRouteId(routes[0].id);
                            }}
                            className="bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 border border-teal-500/10 text-[10px] py-1 px-2.5 rounded transition-all font-semibold"
                          >
                            Assign Route
                          </button>
                        )}
                        {u.isActive && (
                          <button
                            onClick={() => handleDelete(u.id)}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 text-[10px] py-1 px-2.5 rounded transition-all"
                          >
                            Disable
                          </button>
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

      {/* Dispatcher Roster Assignments List */}
      <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md">
        <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Active Roster Dispatcher Assignments</h3>
        {assignments.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-6">No dispatcher assignments configured on the active roster.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 pr-4">Dispatcher</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">Terminal</th>
                  <th className="pb-3 pr-4">Assigned Route</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 font-medium">
                {assignments.map((as) => (
                  <tr key={as.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 pr-4 font-bold text-white">{as.dispatcher.username}</td>
                    <td className="py-3 pr-4 text-slate-400 font-mono text-[11px]">{as.dispatcher.email}</td>
                    <td className="py-3 pr-4 text-slate-200">{as.terminal.name} ({as.terminal.code})</td>
                    <td className="py-3 pr-4">
                      <span className="text-teal-400 font-bold font-mono">{as.route.code}</span>
                      <span className="text-slate-500 ml-1 text-[10px]">({as.route.origin} → {as.route.destination})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Dispatcher Assignment Modal ── */}
      {assignUser && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <h3 className="text-base font-bold text-white mb-2">Assign Dispatcher Route</h3>
            <p className="text-xs text-slate-400 mb-5">
              Assign dispatcher <span className="text-indigo-400 font-bold">@{assignUser.username}</span> to a terminal and route on the active weekly roster.
            </p>

            {assignMsg && (
              <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg">
                {assignMsg}
              </div>
            )}

            <form onSubmit={handleAssignSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Select Terminal</label>
                {terminals.length === 0 ? (
                  <p className="text-xs text-amber-400">No active terminals found. Please create one first.</p>
                ) : (
                  <select
                    value={selectedTerminalId}
                    onChange={(e) => setSelectedTerminalId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3.5 py-2.5 focus:outline-none focus:border-indigo-500"
                  >
                    {terminals.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Select Route</label>
                {routes.length === 0 ? (
                  <p className="text-xs text-amber-400">No active routes found. Please create one first.</p>
                ) : (
                  <select
                    value={selectedRouteId}
                    onChange={(e) => setSelectedRouteId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3.5 py-2.5 focus:outline-none focus:border-indigo-500"
                  >
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} ({r.origin} → {r.destination})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignUser(null)}
                  className="bg-slate-800 hover:bg-slate-755 text-slate-300 text-xs py-2 px-4 rounded-lg transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={terminals.length === 0 || routes.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all disabled:opacity-40"
                >
                  Save Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
