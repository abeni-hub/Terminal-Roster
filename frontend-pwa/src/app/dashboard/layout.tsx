'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

interface AuthUser {
  id: string;
  username: string;
  email: string;
  roleName: 'SYSTEM_ADMIN' | 'MUNICIPAL_PLANNER' | 'DISPATCHER';
}

const ROLE_META = {
  SYSTEM_ADMIN:      { label: 'System Admin',       color: 'from-violet-600 to-purple-600' },
  MUNICIPAL_PLANNER: { label: 'Municipal Planner',  color: 'from-blue-600 to-cyan-600'     },
  DISPATCHER:        { label: 'Dispatcher',         color: 'from-emerald-600 to-teal-600'  },
};

const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/dashboard':            ['SYSTEM_ADMIN', 'MUNICIPAL_PLANNER'],
  '/dashboard/check-in':   ['SYSTEM_ADMIN', 'DISPATCHER'],
  '/dashboard/queue':      ['SYSTEM_ADMIN', 'DISPATCHER', 'MUNICIPAL_PLANNER'],
  '/dashboard/history':    ['SYSTEM_ADMIN', 'DISPATCHER', 'MUNICIPAL_PLANNER'],
  '/dashboard/terminals':  ['SYSTEM_ADMIN', 'MUNICIPAL_PLANNER'],
  '/dashboard/routes':     ['SYSTEM_ADMIN', 'MUNICIPAL_PLANNER'],
  '/dashboard/vehicles':   ['SYSTEM_ADMIN', 'MUNICIPAL_PLANNER'],
  '/dashboard/vehicle-groups': ['SYSTEM_ADMIN', 'MUNICIPAL_PLANNER'],
  '/dashboard/roster':     ['SYSTEM_ADMIN', 'MUNICIPAL_PLANNER'],
  '/dashboard/reports':    ['SYSTEM_ADMIN', 'MUNICIPAL_PLANNER'],
  '/dashboard/users':      ['SYSTEM_ADMIN'],
  '/dashboard/settings':   ['SYSTEM_ADMIN'],
  '/dashboard/audit-logs': ['SYSTEM_ADMIN'],
};

interface MenuItem {
  name: string;
  path: string;
  icon: React.ReactNode;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<AuthUser | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedUser = localStorage.getItem('aatdrs_user');
    const token = localStorage.getItem('aatdrs_token');

    if (!storedUser || !token) {
      router.push('/');
      return;
    }

    const parsedUser = JSON.parse(storedUser) as AuthUser;
    setUser(parsedUser);
    setIsOnline(navigator.onLine);

    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    // Enforce Route Protection & Redirects
    const allowedRoles = ROUTE_PERMISSIONS[pathname];
    if (allowedRoles && !allowedRoles.includes(parsedUser.roleName)) {
      // Not allowed! Redirect to default landing page based on role
      if (parsedUser.roleName === 'SYSTEM_ADMIN') {
        router.push('/dashboard/users');
      } else if (parsedUser.roleName === 'MUNICIPAL_PLANNER') {
        router.push('/dashboard/roster');
      } else {
        router.push('/dashboard/check-in');
      }
    } else if (pathname === '/dashboard') {
      // Dispatcher goes to check-in, others stay on the dashboard for stats
      if (parsedUser.roleName === 'DISPATCHER') {
        router.push('/dashboard/check-in');
      }
    }

    setLoading(false);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [pathname, router]);

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-sm">
        Verifying authorization...
      </div>
    );
  }

  const roleMeta = ROLE_META[user.roleName] || { label: user.roleName, color: 'from-slate-600 to-slate-500' };

  // Generate dynamic navigation items based on role permissions
  const menuItems: MenuItem[] = [];

  const addMenu = (name: string, path: string, icon: React.ReactNode) => {
    const roles = ROUTE_PERMISSIONS[path];
    if (roles && roles.includes(user.roleName)) {
      menuItems.push({ name, path, icon });
    }
  };

  // Dispatcher scope menus
  addMenu('Check-In', '/dashboard/check-in', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ));
  addMenu('Live FIFO Queue', '/dashboard/queue', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ));
  addMenu('Dispatch History', '/dashboard/history', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ));

  // Planner scope menus
  addMenu('Dashboard Stats', '/dashboard', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ));
  addMenu('Roster Schedules', '/dashboard/roster', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ));
  addMenu('Terminals', '/dashboard/terminals', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ));
  addMenu('Routes', '/dashboard/routes', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0022 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
    </svg>
  ));
  addMenu('Vehicles', '/dashboard/vehicles', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  ));
  addMenu('Vehicle Groups', '/dashboard/vehicle-groups', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ));
  addMenu('Revenue Reports', '/dashboard/reports', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" />
    </svg>
  ));

  // Admin scope menus
  addMenu('User Accounts', '/dashboard/users', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ));
  addMenu('System Settings', '/dashboard/settings', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ));
  addMenu('Audit Trails', '/dashboard/audit-logs', (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-64 border-r border-slate-900 bg-slate-950 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-6 py-6 border-b border-slate-900/60 flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${roleMeta.color} flex items-center justify-center shadow-lg shadow-indigo-500/10`}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-white">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <div>
            <h1 className="text-xs font-bold text-white tracking-wide">AATDRS</h1>
            <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">Addis Ababa Transit</p>
          </div>
        </div>

        {/* Menu Items */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {menuItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? `bg-gradient-to-r ${roleMeta.color} text-white shadow-lg`
                    : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
                }`}
              >
                {item.icon}
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-900/60 bg-slate-950/20 text-center">
          <p className="text-[10px] text-slate-500 font-medium">Digital Roster Console v1.2</p>
        </div>
      </aside>

      {/* ── Main Container ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
        {/* Top Header */}
        <header className="bg-slate-950/80 backdrop-blur-xl border-b border-slate-900/80 px-8 py-4 sticky top-0 z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wider uppercase border ${isOnline ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isOnline ? 'Network Connected' : 'Offline Mode Active'}
            </span>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-200">{user.username}</p>
              <p className={`text-[10px] font-bold tracking-wider uppercase bg-gradient-to-r ${roleMeta.color} bg-clip-text text-transparent`}>
                {roleMeta.label}
              </p>
            </div>
            <div className="h-8 w-px bg-slate-900" />
            <button
              onClick={handleLogout}
              className="text-xs bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 py-1.5 px-4 rounded-lg transition-all active:scale-[0.98] font-medium"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
