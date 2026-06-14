'use client';

import React from 'react';

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md">
        <div className="w-16 h-16 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h3a2.25 2.25 0 0 1 2.25 2.25V9M1.875 18.75h20.25m-19.5-12h18.75A2.25 2.25 0 0 1 23.625 9v9A2.25 2.25 0 0 1 21.375 20.25H2.625A2.25 2.25 0 0 1 .375 18V9A2.25 2.25 0 0 1 2.625 6.75Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Offline Mode Active</h1>
        <p className="text-slate-400 mb-6 text-sm">
          The terminal internet connection is down. The system is operating in local mode. All dispatches, check-ins, and override actions are stored safely on this tablet.
        </p>
        <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800/80 text-left mb-6">
          <h4 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">PWA Status</h4>
          <ul className="text-xs space-y-1 text-slate-300">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              Local Database Encrypted (IndexedDB)
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
              Service Worker operational
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
              Queue Syncing suspended
            </li>
          </ul>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
        >
          Check Connectivity
        </button>
      </div>
    </div>
  );
}
