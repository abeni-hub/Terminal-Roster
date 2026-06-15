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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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
    </div>
  );
}
