'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db, LocalScheduleEntry, LocalTerminal } from '../../../db/schema';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ── Types ────────────────────────────────────────────────────────────────────
interface Route {
  id: string;
  code: string;
  sourceTerminal: { id: string; name: string; code: string };
  destinationTerminal: { id: string; name: string; code: string };
  baseFareETB: number;
}

interface Dispatcher {
  id: string;
  username: string;
  email: string;
  terminalId: string;
}

interface DispatcherAssignment {
  id: string;
  dispatcher: { id: string; username: string; email: string };
  terminal: { id: string; name: string; code: string };
  route: { id: string; code: string; sourceTerminal: any; destinationTerminal: any };
}

interface Roster {
  id: string;
  name: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  isFinalized: boolean;
  _count?: { vehicleAssignments: number; dispatcherAssignments: number };
  groupRotations?: any[];
}

interface RotationPlanEntry {
  groupId: string;
  groupName: string;
  vehicleCount: number;
  routeId: string;
  routeCode: string;
  routeDestination: string;
}

interface TerminalRotationPlan {
  terminalId: string;
  terminalName: string;
  terminalCode: string;
  rotationIndex: number;
  assignments: RotationPlanEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const tok = () => localStorage.getItem('aatdrs_token');
const getUser = () => {
  try { return JSON.parse(localStorage.getItem('aatdrs_user') || 'null'); } catch { return null; }
};

const weekStartEnd = (weekNumber: number, year: number) => {
  const jan4 = new Date(year, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const start = new Date(startOfWeek1);
  start.setDate(startOfWeek1.getDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
};

const currentWeek = () => {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
};

// ── Tab type ─────────────────────────────────────────────────────────────────
type Tab = 'scheduler' | 'assignments' | 'schedules' | 'history';

export default function RosterPage() {
  const user = getUser();
  const isPlanner = user?.roleName === 'MUNICIPAL_PLANNER' || user?.roleName === 'SYSTEM_ADMIN';

  // ── Core state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>(isPlanner ? 'scheduler' : 'schedules');
  const [terminals, setTerminals] = useState<LocalTerminal[]>([]);
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Scheduler state ─────────────────────────────────────────────────────
  const [selectedTerminalId, setSelectedTerminalId] = useState('');
  const [terminalRoutes, setTerminalRoutes] = useState<Route[]>([]);
  const [terminalDispatchers, setTerminalDispatchers] = useState<Dispatcher[]>([]);
  const [weekNumber, setWeekNumber] = useState(String(currentWeek()));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRosterId, setSelectedRosterId] = useState('');

  // ── Dispatcher assignment state ─────────────────────────────────────────
  const [assignments, setAssignments] = useState<DispatcherAssignment[]>([]);
  const [assigningDispatcherId, setAssigningDispatcherId] = useState('');
  const [assigningRouteId, setAssigningRouteId] = useState('');
  const [assignMsg, setAssignMsg] = useState('');
  const [assigning, setAssigning] = useState(false);

  // ── Generate roster state ───────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{ rotationPlan: TerminalRotationPlan[]; assignmentsCount: number; groupsCount: number } | null>(null);
  const [generateMsg, setGenerateMsg] = useState('');

  // ── Schedules / filter state ────────────────────────────────────────────
  const [schedules, setSchedules] = useState<LocalScheduleEntry[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);
  const [termFilter, setTermFilter] = useState('');
  const [weekFilter, setWeekFilter] = useState('');
  const [vehicleGroups, setVehicleGroups] = useState<any[]>([]);
  const [groupFilter, setGroupFilter] = useState('');

  // ── CSV Upload state ────────────────────────────────────────────────────
  const [csvData, setCsvData] = useState('');
  const [uploadResult, setUploadResult] = useState<{ processed: number; errors: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);

  // ── Swap modal ──────────────────────────────────────────────────────────
  const [showSwap, setShowSwap] = useState(false);
  const [swapA, setSwapA] = useState('');
  const [swapB, setSwapB] = useState('');
  const [swapping, setSwapping] = useState(false);
  const [swapMsg, setSwapMsg] = useState('');

  // ── Rotation history ────────────────────────────────────────────────────
  const [rotationHistory, setRotationHistory] = useState<any[]>([]);
  const [rotationLoading, setRotationLoading] = useState(false);

  // ── Fetch functions ─────────────────────────────────────────────────────
  const fetchTerminals = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/roster/terminals`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) {
        const data: LocalTerminal[] = await res.json();
        setTerminals(data);
        await db.terminals.bulkPut(data);
        if (data.length > 0 && !selectedTerminalId) setSelectedTerminalId(data[0].id);
      }
    } catch {
      const cached = await db.terminals.toArray();
      setTerminals(cached);
    }
  }, [selectedTerminalId]);

  const fetchRosters = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/roster`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setRosters(await res.json());
    } catch {}
  }, []);

  const fetchVehicleGroups = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/vehicle-groups`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setVehicleGroups(await res.json());
    } catch {}
  }, []);

  const fetchTerminalRoutes = useCallback(async (terminalId: string) => {
    if (!terminalId) return;
    try {
      const res = await fetch(`${API_URL}/roster/routes?terminalId=${terminalId}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setTerminalRoutes(await res.json());
      else setTerminalRoutes([]);
    } catch { setTerminalRoutes([]); }
  }, []);

  const fetchTerminalDispatchers = useCallback(async (terminalId: string) => {
    if (!terminalId) return;
    try {
      const res = await fetch(`${API_URL}/roster/dispatchers?terminalId=${terminalId}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setTerminalDispatchers(await res.json());
      else setTerminalDispatchers([]);
    } catch { setTerminalDispatchers([]); }
  }, []);

  const fetchAssignments = useCallback(async (rosterId?: string) => {
    try {
      const url = rosterId
        ? `${API_URL}/roster/dispatcher-assignments?rosterId=${rosterId}`
        : `${API_URL}/roster/dispatcher-assignments`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setAssignments(await res.json());
    } catch {}
  }, []);

  const fetchSchedules = useCallback(async () => {
    setSchedLoading(true);
    try {
      const params = new URLSearchParams();
      if (termFilter) params.set('terminalCode', termFilter);
      if (weekFilter) params.set('weekNumber', weekFilter);
      if (groupFilter) params.set('vehicleGroupId', groupFilter);
      const url = `${API_URL}/roster/schedules${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) {
        const raw = await res.json();
        const mapped: LocalScheduleEntry[] = raw.map((s: any) => ({
          id: s.id,
          plateNumber: s.vehicle.plateNumber,
          ownerName: s.vehicle.ownerName,
          vehicleStatus: s.vehicle.status,
          terminalName: s.terminal.name,
          terminalCode: s.terminal.code,
          routeCode: s.route.code,
          origin: s.route.origin,
          destination: s.route.destination,
          baseFareETB: parseFloat(s.route.baseFareETB),
          weekNumber: s.weekNumber,
          validFrom: s.validFrom,
          validUntil: s.validUntil,
          status: s.status,
          importedAt: s.importedAt,
          groupName: s.vehicle.group?.name || 'No Group',
        }));
        setSchedules(mapped);
        await db.schedules.bulkPut(mapped);
      }
    } catch {
      const cached = await db.schedules.toArray();
      setSchedules(cached);
    } finally {
      setSchedLoading(false);
    }
  }, [termFilter, weekFilter, groupFilter]);

  const fetchRotationHistory = useCallback(async (terminalId: string) => {
    if (!terminalId) return;
    setRotationLoading(true);
    try {
      const res = await fetch(`${API_URL}/roster/rotation-history?terminalId=${terminalId}`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (res.ok) setRotationHistory(await res.json());
    } catch {} finally { setRotationLoading(false); }
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTerminals();
    fetchRosters();
    fetchVehicleGroups();
    fetchSchedules();
    fetchAssignments();
  }, []);

  useEffect(() => {
    if (selectedTerminalId) {
      fetchTerminalRoutes(selectedTerminalId);
      fetchTerminalDispatchers(selectedTerminalId);
      if (activeTab === 'history') fetchRotationHistory(selectedTerminalId);
    }
  }, [selectedTerminalId, activeTab]);

  useEffect(() => {
    const wk = parseInt(weekNumber);
    if (!isNaN(wk) && wk >= 1 && wk <= 53) {
      const { start, end } = weekStartEnd(wk, new Date().getFullYear());
      setStartDate(start);
      setEndDate(end);
    }
  }, [weekNumber]);

  // Auto-select latest non-finalized roster for the scheduler
  useEffect(() => {
    const draft = rosters.find((r) => !r.isFinalized);
    if (draft && !selectedRosterId) setSelectedRosterId(draft.id);
  }, [rosters]);

  useEffect(() => {
    if (selectedRosterId) fetchAssignments(selectedRosterId);
  }, [selectedRosterId]);

  // ── Filtered assignments for selected terminal ───────────────────────────
  const terminalAssignments = useMemo(() =>
    assignments.filter((a) => a.terminal.id === selectedTerminalId),
    [assignments, selectedTerminalId]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleAssignDispatcher = async () => {
    if (!assigningDispatcherId || !assigningRouteId || !selectedTerminalId || !selectedRosterId) return;
    setAssigning(true);
    setAssignMsg('');
    try {
      const res = await fetch(`${API_URL}/roster/assign-dispatcher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({
          dispatcherId: assigningDispatcherId,
          terminalId: selectedTerminalId,
          routeId: assigningRouteId,
          rosterId: selectedRosterId,
        }),
      });
      if (res.ok) {
        setAssignMsg('✓ Dispatcher assigned successfully');
        setAssigningDispatcherId('');
        setAssigningRouteId('');
        fetchAssignments(selectedRosterId);
        setTimeout(() => setAssignMsg(''), 3000);
      } else {
        const err = await res.json().catch(() => null);
        setAssignMsg(`✗ ${err?.message || 'Assignment failed'}`);
      }
    } finally { setAssigning(false); }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const res = await fetch(`${API_URL}/roster/dispatcher-assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (res.ok) fetchAssignments(selectedRosterId);
    } catch {}
  };

  const handlePreview = async () => {
    if (!weekNumber || !startDate || !endDate) return;
    setPreviewLoading(true);
    setGenerateMsg('');
    setPreviewData(null);
    try {
      const res = await fetch(`${API_URL}/roster/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({
          weekNumber: parseInt(weekNumber),
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          terminalId: selectedTerminalId || undefined,
          preview: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("previewData received from backend:", data);
        setPreviewData(data);
      } else {
        const err = await res.json().catch(() => null);
        setGenerateMsg(`✗ ${err?.message || 'Preview failed'}`);
      }
    } catch { setGenerateMsg('✗ Network error'); } finally { setPreviewLoading(false); }
  };

  const handleGenerate = async () => {
    if (!weekNumber || !startDate || !endDate) return;
    setGenerating(true);
    setGenerateMsg('');
    try {
      const res = await fetch(`${API_URL}/roster/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({
          weekNumber: parseInt(weekNumber),
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          terminalId: selectedTerminalId || undefined,
          preview: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGenerateMsg(`✓ Roster generated! ${data.assignedGroupsCount} groups, ${data.assignedVehiclesCount} vehicles assigned.`);
        setPreviewData(null);
        fetchRosters();
        fetchSchedules();
        setTimeout(() => setGenerateMsg(''), 4000);
      } else {
        const err = await res.json().catch(() => null);
        setGenerateMsg(`✗ ${err?.message || 'Generation failed'}`);
      }
    } catch { setGenerateMsg('✗ Network error'); } finally { setGenerating(false); }
  };

  const handleActivate = async (rosterId: string) => {
    const res = await fetch(`${API_URL}/roster/${rosterId}/activate`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok()}` },
    });
    if (res.ok) fetchRosters();
  };

  const handlePublish = async (rosterId: string) => {
    if (!confirm('Publish this roster? It will become active and locked — assignments cannot be modified afterwards.')) return;
    const res = await fetch(`${API_URL}/roster/${rosterId}/publish`, {
      method: 'POST', headers: { Authorization: `Bearer ${tok()}` },
    });
    if (res.ok) {
      fetchRosters();
      fetchSchedules();
      fetchAssignments();
    }
  };

  const handleUpload = async () => {
    if (!csvData.trim()) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await fetch(`${API_URL}/roster/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ csvData }),
      });
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { data = { processed: 0, errors: [`Non-JSON: ${text.slice(0, 100)}`] }; }
      if (res.ok) {
        setUploadResult(data);
        setCsvData('');
        fetchSchedules();
        fetchRosters();
      } else {
        const errors = data.errors || (typeof data.message === 'string' ? [data.message] : ['Upload failed']);
        setUploadResult({ processed: 0, errors });
      }
    } catch (e: any) {
      setUploadResult({ processed: 0, errors: [`Network error: ${e.message}`] });
    } finally { setUploading(false); }
  };

  const handleSwap = async () => {
    if (!swapA || !swapB || swapA === swapB) return;
    setSwapping(true);
    setSwapMsg('');
    try {
      const res = await fetch(`${API_URL}/roster/swap-routes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ assignmentId1: swapA, assignmentId2: swapB }),
      });
      if (res.ok) {
        setSwapMsg('Routes swapped successfully!');
        fetchAssignments(selectedRosterId);
        setTimeout(() => { setShowSwap(false); setSwapMsg(''); setSwapA(''); setSwapB(''); }, 2000);
      } else {
        const err = await res.json().catch(() => null);
        setSwapMsg(`✗ ${err?.message || 'Swap failed'}`);
      }
    } finally { setSwapping(false); }
  };

  // ── Derived ─────────────────────────────────────────────────────────────
  const activeRoster = rosters.find((r) => r.isActive);
  const draftRoster = selectedRosterId ? rosters.find((r) => r.id === selectedRosterId) : null;

  // ── Tab styles ───────────────────────────────────────────────────────────
  const tabClass = (t: Tab) =>
    `px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
      activeTab === t
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
    }`;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Roster Scheduling</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isPlanner ? 'Plan weekly rosters, assign dispatchers, and manage vehicle group rotations.' : 'View your active schedule assignments.'}
          </p>
        </div>
        {activeRoster && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-400">Week {activeRoster.weekNumber} Active</span>
          </div>
        )}
      </div>

      {/* ── Tab Navigation ─────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-900/60 rounded-xl p-1 border border-slate-800/60 w-fit">
        {isPlanner && <button className={tabClass('scheduler')} onClick={() => setActiveTab('scheduler')}>📅 Scheduler</button>}
        {isPlanner && <button className={tabClass('assignments')} onClick={() => setActiveTab('assignments')}>👤 Assignments</button>}
        <button className={tabClass('schedules')} onClick={() => { setActiveTab('schedules'); fetchSchedules(); }}>📋 Vehicle Schedule</button>
        {isPlanner && <button className={tabClass('history')} onClick={() => { setActiveTab('history'); if (selectedTerminalId) fetchRotationHistory(selectedTerminalId); }}>🔄 Rotation History</button>}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: SCHEDULER
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scheduler' && isPlanner && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Left: Terminal + Week Config ─────────────────────────── */}
          <div className="xl:col-span-1 space-y-5">

            {/* Terminal & Week */}
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Schedule Configuration
              </h3>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Origin Terminal</label>
                <select
                  value={selectedTerminalId}
                  onChange={(e) => setSelectedTerminalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="">— Select terminal —</option>
                  {terminals.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Week #</label>
                  <input type="number" min={1} max={53} value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Year</label>
                  <input type="number" defaultValue={new Date().getFullYear()} disabled
                    className="w-full bg-slate-950/50 border border-slate-800/50 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Start Date</label>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">End Date</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500" />
                </div>
              </div>

              {/* Draft Roster Selector */}
              {rosters.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Working Roster</label>
                  <select value={selectedRosterId} onChange={(e) => setSelectedRosterId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-indigo-500">
                    <option value="">— Select roster —</option>
                    {rosters.map((r) => (
                      <option key={r.id} value={r.id}>
                        Wk {r.weekNumber} {r.isFinalized ? '🔒' : r.isActive ? '✓' : '●'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {generateMsg && (
                <div className={`p-3 rounded-xl text-xs border ${generateMsg.startsWith('✗') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                  {generateMsg}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={handlePreview} disabled={previewLoading || !weekNumber || !startDate || !endDate}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold py-2 rounded-lg transition-all">
                  {previewLoading ? 'Loading...' : '👁 Preview Rotation'}
                </button>
                <button onClick={handleGenerate} disabled={generating || !weekNumber || !startDate || !endDate}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-lg transition-all shadow-lg shadow-indigo-500/20">
                  {generating ? 'Generating...' : '⚡ Generate'}
                </button>
              </div>
            </div>

            {/* Routes for this terminal */}
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                Terminal Routes
                {selectedTerminalId && <span className="text-slate-500 normal-case font-normal">({terminalRoutes.length} routes)</span>}
              </h3>
              {!selectedTerminalId ? (
                <p className="text-slate-600 text-xs py-3 text-center">Select a terminal above to see its routes.</p>
              ) : terminalRoutes.length === 0 ? (
                <p className="text-slate-600 text-xs py-3 text-center">No routes registered under this terminal.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {terminalRoutes.map((r) => (
                    <div key={r.id} className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/40">
                      <div>
                        <span className="text-xs font-bold text-indigo-400 font-mono">{r.code}</span>
                        <p className="text-[10px] text-slate-500 mt-0.5">{r.sourceTerminal.name} → {r.destinationTerminal.name}</p>
                      </div>
                      <span className="text-[10px] text-slate-600 font-mono">ETB {Number(r.baseFareETB).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Roster list (mini) */}
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Weekly Rosters
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {rosters.map((r) => (
                  <div key={r.id} className={`p-3 rounded-xl border transition-all cursor-pointer ${selectedRosterId === r.id ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-slate-800/40 bg-slate-950/40 hover:border-slate-700'}`}
                    onClick={() => setSelectedRosterId(r.id)}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-white">Week {r.weekNumber}</span>
                      <div className="flex gap-1">
                        {r.isActive && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">LIVE</span>}
                        {r.isFinalized && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">🔒</span>}
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">{new Date(r.startDate).toLocaleDateString()} – {new Date(r.endDate).toLocaleDateString()}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-slate-600">{r._count?.vehicleAssignments || 0} vehicles · {r._count?.dispatcherAssignments || 0} dispatchers</span>
                      {!r.isFinalized && (
                        <div className="flex gap-1">
                          {!r.isActive && (
                            <button onClick={(e) => { e.stopPropagation(); handleActivate(r.id); }}
                              className="text-[9px] bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded-lg transition-all">
                              Activate
                            </button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handlePublish(r.id); }}
                            className="text-[9px] bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/20 font-bold px-2 py-0.5 rounded-lg transition-all">
                            Publish
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {rosters.length === 0 && <p className="text-slate-600 text-xs text-center py-4">No rosters yet. Generate one above.</p>}
              </div>
            </div>
          </div>

          {/* ── Right: Rotation Preview + CSV ────────────────────────── */}
          <div className="xl:col-span-2 space-y-5">
            {/* Rotation Preview */}
            {previewData ? (
              <div className="bg-slate-900/50 border border-indigo-500/20 rounded-2xl p-5 backdrop-blur-md">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Vehicle Group Rotation Preview</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">Week {weekNumber} · {previewData.groupsCount} groups · {previewData.assignmentsCount} vehicles</p>
                  </div>
                  <button onClick={() => setPreviewData(null)} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
                </div>

                <div className="space-y-5">
                  {(previewData.rotationPlan || []).map((tp: any) => (
                    <div key={tp.terminalId}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold text-blue-400">{tp.terminalName}</span>
                        <span className="text-[10px] text-slate-600 font-mono">({tp.terminalCode})</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Rotation #{tp.rotationIndex}</span>
                      </div>
                      <div className="overflow-x-auto rounded-xl border border-slate-800/60">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-950/80 border-b border-slate-800 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                              <th className="px-3 py-2">Vehicle Group</th>
                              <th className="px-3 py-2">Vehicles</th>
                              <th className="px-3 py-2">Assigned Route</th>
                              <th className="px-3 py-2">Destination</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {tp.assignments.map((a) => (
                              <tr key={a.groupId} className="hover:bg-slate-900/40 transition-colors">
                                <td className="px-3 py-2.5 font-semibold text-white">{a.groupName}</td>
                                <td className="px-3 py-2.5 text-slate-400">{a.vehicleCount} vehicles</td>
                                <td className="px-3 py-2.5"><span className="text-indigo-400 font-bold font-mono">{a.routeCode}</span></td>
                                <td className="px-3 py-2.5 text-slate-400">{a.routeDestination}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  {previewData.rotationPlan.length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs">No vehicle groups with active vehicles found.</div>
                  )}
                </div>

                <div className="flex gap-2 pt-4 mt-4 border-t border-slate-800/60">
                  <button onClick={handleGenerate} disabled={generating}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20">
                    {generating ? 'Saving...' : '💾 Confirm & Save Rotation'}
                  </button>
                  <button onClick={() => setPreviewData(null)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2.5 px-4 rounded-xl">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md flex flex-col items-center justify-center py-12">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                  <span className="text-2xl">🔄</span>
                </div>
                <p className="text-sm font-semibold text-white mb-1">Round-Robin Rotation</p>
                <p className="text-xs text-slate-500 text-center max-w-xs">
                  Select a terminal and week, then click <strong className="text-slate-300">Preview Rotation</strong> to see how vehicle groups will be automatically assigned to routes this week.
                </p>
              </div>
            )}

            {/* CSV Upload */}
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-slate-500" />
                Import via CSV
              </h3>
              <p className="text-slate-500 text-[10px] mb-3">
                Expected columns: <code className="text-indigo-400 font-mono text-[9px]">plate_number, assigned_terminal, assigned_route, week_number, valid_from, valid_until, status</code>
              </p>
              <textarea value={csvData} onChange={(e) => setCsvData(e.target.value)} rows={5}
                placeholder="plate_number,assigned_terminal,assigned_route,week_number,valid_from,valid_until,status"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder-slate-700 focus:outline-none focus:border-indigo-500 font-mono" />
              <div className="flex items-center gap-3 mt-3">
                <button onClick={handleUpload} disabled={uploading || !csvData.trim()}
                  className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all disabled:opacity-40">
                  {uploading ? 'Processing...' : '📤 Upload CSV'}
                </button>
                {uploadResult && (
                  <span className={`text-[10px] font-medium ${uploadResult.processed > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {uploadResult.processed} rows processed
                  </span>
                )}
              </div>
              {uploadResult?.errors && uploadResult.errors.length > 0 && (
                <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                  {uploadResult.errors.map((err, idx) => (
                    <div key={idx} className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-2 py-1 font-mono">⚠ {err}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: ASSIGNMENTS
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'assignments' && isPlanner && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* ── Left: Assignment form ────────────────────────────────── */}
          <div className="xl:col-span-1 space-y-5">
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md space-y-4">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-teal-400" />
                Assign Dispatcher to Route
              </h3>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Terminal</label>
                <select value={selectedTerminalId} onChange={(e) => setSelectedTerminalId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-teal-500">
                  <option value="">— Select terminal —</option>
                  {terminals.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Dispatcher <span className="text-slate-600 normal-case font-normal">(must be assigned to this terminal)</span>
                </label>
                {terminalDispatchers.length === 0 ? (
                  <p className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                    No dispatchers assigned to this terminal. Go to User Management to assign one.
                  </p>
                ) : (
                  <select value={assigningDispatcherId} onChange={(e) => setAssigningDispatcherId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-teal-500">
                    <option value="">— Select dispatcher —</option>
                    {terminalDispatchers.map((d) => <option key={d.id} value={d.id}>@{d.username}</option>)}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Route <span className="text-slate-600 normal-case font-normal">(from this terminal only)</span>
                </label>
                {terminalRoutes.length === 0 ? (
                  <p className="text-[10px] text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                    No routes for this terminal.
                  </p>
                ) : (
                  <select value={assigningRouteId} onChange={(e) => setAssigningRouteId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-teal-500">
                    <option value="">— Select route —</option>
                    {terminalRoutes.map((r) => (
                      <option key={r.id} value={r.id}>{r.code} → {r.destinationTerminal.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Roster</label>
                <select value={selectedRosterId} onChange={(e) => setSelectedRosterId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2.5 focus:outline-none focus:border-teal-500">
                  <option value="">— Select roster —</option>
                  {rosters.filter((r) => !r.isFinalized).map((r) => (
                    <option key={r.id} value={r.id}>Wk {r.weekNumber} {r.isActive ? '(active)' : ''}</option>
                  ))}
                </select>
              </div>

              {assignMsg && (
                <div className={`p-3 rounded-xl text-xs border ${assignMsg.startsWith('✗') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                  {assignMsg}
                </div>
              )}

              <button
                onClick={handleAssignDispatcher}
                disabled={assigning || !assigningDispatcherId || !assigningRouteId || !selectedTerminalId || !selectedRosterId}
                className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-xs font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-teal-500/20">
                {assigning ? 'Assigning...' : '✓ Assign Route to Dispatcher'}
              </button>

              <button onClick={() => setShowSwap(true)}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold py-2 rounded-xl transition-all">
                ⇄ Swap Routes Between Dispatchers
              </button>
            </div>
          </div>

          {/* ── Right: Current Assignments ───────────────────────────── */}
          <div className="xl:col-span-2">
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  Dispatcher Assignments
                  {draftRoster && <span className="text-slate-500 normal-case font-normal">· Week {draftRoster.weekNumber}</span>}
                </h3>
                <div className="flex items-center gap-2">
                  {selectedTerminalId && (
                    <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">
                      Showing: {terminalAssignments.length} for this terminal
                    </span>
                  )}
                </div>
              </div>

              {assignments.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                  <p className="text-slate-500 text-xs">No dispatcher assignments yet for this roster.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="pb-3 pr-4">Dispatcher</th>
                        <th className="pb-3 pr-4">Terminal</th>
                        <th className="pb-3 pr-4">Assigned Route</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {(selectedTerminalId ? terminalAssignments : assignments).map((a) => (
                        <tr key={a.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="font-semibold text-white">@{a.dispatcher.username}</div>
                            <div className="text-[10px] text-slate-600">{a.dispatcher.email}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-slate-300">{a.terminal.name}</span>
                            <span className="ml-1 text-[10px] text-slate-600 font-mono">({a.terminal.code})</span>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="text-teal-400 font-bold font-mono">{a.route.code}</span>
                            {a.route.destinationTerminal && (
                              <span className="text-slate-600 ml-1 text-[10px]">→ {a.route.destinationTerminal.name}</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {draftRoster && !draftRoster.isFinalized && (
                              <button onClick={() => handleRemoveAssignment(a.id)}
                                className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/15 px-2 py-0.5 rounded-lg transition-all">
                                Remove
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
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: VEHICLE SCHEDULES
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'schedules' && (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Terminal</label>
              <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500">
                <option value="">All Terminals</option>
                {terminals.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Group</label>
              <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500">
                <option value="">All Groups</option>
                {vehicleGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Week</label>
              <input type="number" value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)} placeholder="e.g. 24"
                className="w-20 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-500 font-mono" />
            </div>
            <button onClick={fetchSchedules} className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium px-4 py-1.5 rounded-lg transition-all">
              Apply Filter
            </button>
          </div>

          {schedLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500 text-xs">No vehicle schedules match the current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="pb-3 pr-4">Plate</th>
                    <th className="pb-3 pr-4">Group</th>
                    <th className="pb-3 pr-4">Terminal</th>
                    <th className="pb-3 pr-4">Route</th>
                    <th className="pb-3 pr-4">Week</th>
                    <th className="pb-3 pr-4">Valid Range</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {schedules.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3 pr-4 font-mono font-bold text-white">{r.plateNumber}</td>
                      <td className="py-3 pr-4 text-indigo-400 font-semibold">{r.groupName || 'No Group'}</td>
                      <td className="py-3 pr-4 text-slate-400">{r.terminalCode}</td>
                      <td className="py-3 pr-4">
                        <span className="text-teal-400 font-bold">{r.routeCode}</span>
                        <span className="text-slate-500 ml-1 text-[10px]">({r.origin}→{r.destination})</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-400 font-mono">Wk {r.weekNumber}</td>
                      <td className="py-3 pr-4 text-slate-500 text-[10px] font-mono">
                        {new Date(r.validFrom).toLocaleDateString()} – {new Date(r.validUntil).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] border ${r.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                          {r.status.toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: ROTATION HISTORY
          ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'history' && isPlanner && (
        <div className="space-y-5">
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md">
            <div className="flex items-center gap-4 mb-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">View History For Terminal</label>
                <select value={selectedTerminalId}
                  onChange={(e) => { setSelectedTerminalId(e.target.value); fetchRotationHistory(e.target.value); }}
                  className="bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500">
                  <option value="">— Select terminal —</option>
                  {terminals.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
                </select>
              </div>
            </div>

            {rotationLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              </div>
            ) : !selectedTerminalId ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500 text-xs">Select a terminal to view its rotation history.</p>
              </div>
            ) : rotationHistory.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500 text-xs">No rotation history for this terminal yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="pb-3 pr-4">Week</th>
                      <th className="pb-3 pr-4">Roster</th>
                      <th className="pb-3 pr-4">Vehicle Group</th>
                      <th className="pb-3 pr-4">Assigned Route</th>
                      <th className="pb-3 pr-4">Rotation #</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {rotationHistory.map((h: any) => (
                      <tr key={h.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 pr-4 font-mono text-white font-bold">Wk {h.roster.weekNumber}</td>
                        <td className="py-3 pr-4 text-slate-400">{h.roster.name}</td>
                        <td className="py-3 pr-4">
                          <span className="text-indigo-400 font-semibold">{h.vehicleGroup.name}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-teal-400 font-bold font-mono">{h.route.code}</span>
                          <span className="text-slate-600 ml-1 text-[10px]">→ {h.route.destinationTerminal?.name}</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-500 font-mono">#{h.rotationIndex}</td>
                        <td className="py-3">
                          {h.roster.isFinalized ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">🔒 Locked</span>
                          ) : h.roster.isActive ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">● Live</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">Draft</span>
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
      )}

      {/* ── Swap Modal ─────────────────────────────────────────────────────── */}
      {showSwap && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">⇄ Swap Dispatcher Routes</h3>
              <button onClick={() => { setShowSwap(false); setSwapMsg(''); setSwapA(''); setSwapB(''); }}
                className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
            </div>
            <p className="text-xs text-slate-400">Select two dispatcher assignments to swap their routes.</p>

            {swapMsg && (
              <div className={`p-3 rounded-xl text-xs border ${swapMsg.startsWith('✗') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                {swapMsg}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Dispatcher A</label>
                <select value={swapA} onChange={(e) => setSwapA(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500">
                  <option value="">Select assignment...</option>
                  {assignments.map((a) => (
                    <option key={a.id} value={a.id}>@{a.dispatcher.username} → {a.route.code} @ {a.terminal.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Dispatcher B</label>
                <select value={swapB} onChange={(e) => setSwapB(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500">
                  <option value="">Select assignment...</option>
                  {assignments.filter((a) => a.id !== swapA).map((a) => (
                    <option key={a.id} value={a.id}>@{a.dispatcher.username} → {a.route.code} @ {a.terminal.code}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={handleSwap} disabled={swapping || !swapA || !swapB}
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold py-2 rounded-xl transition-all">
                {swapping ? 'Swapping...' : 'Confirm Swap'}
              </button>
              <button onClick={() => { setShowSwap(false); setSwapMsg(''); setSwapA(''); setSwapB(''); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 px-4 rounded-xl">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
