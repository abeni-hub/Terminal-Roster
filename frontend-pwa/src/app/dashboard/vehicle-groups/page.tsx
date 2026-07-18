'use client';

import React, { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  plateNumber: string;
  ownerName: string;
  ownerPhone: string;
  capacity: number;
  status: string;
}

interface VehicleGroup {
  id: string;
  name: string;
  description: string | null;
  vehicles?: Vehicle[];
}

type ActiveTab = 'vehicles' | 'bulk-import';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  SUSPENDED:   'bg-amber-500/10  text-amber-400  border-amber-500/20',
  MAINTENANCE: 'bg-blue-500/10   text-blue-400   border-blue-500/20',
  INACTIVE:    'bg-slate-500/10  text-slate-400  border-slate-500/20',
};

const CSV_TEMPLATE =
  `plate_number,owner_name,owner_phone,capacity,status\n` +
  `AA-3-A12345,Abebe Kebede,+251911223344,12,ACTIVE\n` +
  `AA-2-B44910,Bekele Alemu,+251911000001,14,ACTIVE`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function VehicleGroupsPage() {
  const [groups, setGroups] = useState<VehicleGroup[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  const [selectedGroup, setSelectedGroup] = useState<VehicleGroup | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('vehicles');

  // Group form
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editGroup, setEditGroup] = useState<VehicleGroup | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  // Single vehicle add
  const [addVehicleId, setAddVehicleId] = useState('');

  // Bulk import
  const [bulkMode, setBulkMode] = useState<'csv' | 'json'>('csv');
  const [csvText, setCsvText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ imported: number; errors: string[] } | null>(null);

  // ─── API helpers ────────────────────────────────────────────────────────────

  const tok = () => localStorage.getItem('aatdrs_token');

  const showMsg = (text: string, type: 'ok' | 'err' = 'ok') => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(''), 5000);
  };

  const apiFetch = (path: string, init?: RequestInit) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tok()}`,
        ...(init?.headers ?? {}),
      },
    });

  // ─── Data loading ────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [gRes, vRes] = await Promise.all([
        apiFetch('/vehicle-groups'),
        apiFetch('/vehicles'),
      ]);
      if (gRes.ok) setGroups(await gRes.json());
      if (vRes.ok) setAllVehicles(await vRes.json());
    } catch {
      showMsg('Failed to load data', 'err');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const reloadGroup = async (groupId: string) => {
    try {
      const res = await apiFetch(`/vehicle-groups/${groupId}`);
      if (res.ok) {
        const updated: VehicleGroup = await res.json();
        setSelectedGroup(updated);
        setGroups(prev => prev.map(g => g.id === groupId ? updated : g));
      }
    } catch {}
  };

  // ─── Group CRUD ───────────────────────────────────────────────────────────────

  const openNewGroupForm = () => {
    setEditGroup(null);
    setFormName('');
    setFormDescription('');
    setShowGroupForm(true);
  };

  const openEditGroupForm = (g: VehicleGroup) => {
    setEditGroup(g);
    setFormName(g.name);
    setFormDescription(g.description ?? '');
    setShowGroupForm(true);
  };

  const handleGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    const url  = editGroup ? `/vehicle-groups/${editGroup.id}` : '/vehicle-groups';
    const method = editGroup ? 'PATCH' : 'POST';

    try {
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({ name: formName, description: formDescription }),
      });
      if (res.ok) {
        showMsg(editGroup ? 'Group updated' : 'Group created');
        setShowGroupForm(false);
        fetchAll();
        if (editGroup && selectedGroup?.id === editGroup.id) reloadGroup(editGroup.id);
      } else {
        const err = await res.json().catch(() => null);
        showMsg(`Error: ${err?.message ?? 'Failed to save group'}`, 'err');
      }
    } catch {
      showMsg('Network error', 'err');
    } finally {
      setFormSaving(false);
    }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Delete this group? Vehicles will be unassigned.')) return;
    try {
      const res = await apiFetch(`/vehicle-groups/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showMsg('Group deleted');
        if (selectedGroup?.id === id) setSelectedGroup(null);
        fetchAll();
      } else {
        showMsg('Failed to delete group', 'err');
      }
    } catch { showMsg('Network error', 'err'); }
  };

  // ─── Vehicle membership ───────────────────────────────────────────────────────

  const addVehicleToGroup = async () => {
    if (!selectedGroup || !addVehicleId) return;
    const res = await apiFetch(`/vehicle-groups/${selectedGroup.id}/vehicles`, {
      method: 'POST',
      body: JSON.stringify({ vehicleIds: [addVehicleId] }),
    });
    if (res.ok) {
      showMsg('Vehicle added');
      setAddVehicleId('');
      reloadGroup(selectedGroup.id);
    } else {
      showMsg('Failed to add vehicle', 'err');
    }
  };

  const removeVehicleFromGroup = async (vehicleId: string) => {
    if (!selectedGroup || !confirm('Remove this vehicle from the group?')) return;
    const res = await apiFetch(`/vehicle-groups/${selectedGroup.id}/vehicles`, {
      method: 'DELETE',
      body: JSON.stringify({ vehicleIds: [vehicleId] }),
    });
    if (res.ok) {
      showMsg('Vehicle removed');
      reloadGroup(selectedGroup.id);
    } else {
      showMsg('Failed to remove vehicle', 'err');
    }
  };

  // ─── Bulk import ───────────────────────────────────────────────────────────────

  const handleBulkImport = async () => {
    if (!selectedGroup) return;
    setBulkImporting(true);
    setBulkResult(null);

    const body: Record<string, unknown> =
      bulkMode === 'csv'
        ? { csvData: csvText }
        : { vehicles: (() => { try { return JSON.parse(jsonText); } catch { return []; } })() };

    try {
      const res = await apiFetch(`/vehicle-groups/${selectedGroup.id}/bulk-import`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setBulkResult({ imported: data.imported, errors: data.errors ?? [] });
        showMsg(`Imported ${data.imported} vehicle(s)`);
        reloadGroup(selectedGroup.id);
        fetchAll();
      } else {
        showMsg(`Error: ${data.message ?? 'Import failed'}`, 'err');
      }
    } catch {
      showMsg('Network error during import', 'err');
    } finally {
      setBulkImporting(false);
    }
  };

  // ─── Derived ───────────────────────────────────────────────────────────────────

  const unassignedVehicles = allVehicles.filter(
    v => !(selectedGroup?.vehicles ?? []).some(sv => sv.id === v.id)
  );

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">Vehicle Groups</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Create groups, then bulk-import or assign vehicles to them.
          </p>
        </div>
        <button
          id="create-group-btn"
          onClick={openNewGroupForm}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 px-4 rounded-lg transition-all active:scale-[0.98]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Group
        </button>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`p-3 border rounded-xl text-xs font-medium ${msgType === 'ok' ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* ── Left: Group List ──────────────────────────────────────────── */}
        <div className="lg:col-span-1 bg-slate-900/40 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Groups ({groups.length})
          </h3>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500 text-xs">No groups yet.</p>
              <p className="text-slate-600 text-[10px] mt-1">Click "Create Group" to get started.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {groups.map(g => (
                <div
                  key={g.id}
                  id={`group-card-${g.id}`}
                  onClick={() => { setSelectedGroup(g); reloadGroup(g.id); setActiveTab('vehicles'); setBulkResult(null); }}
                  className={`p-4 rounded-xl cursor-pointer border transition-all ${
                    selectedGroup?.id === g.id
                      ? 'bg-indigo-600/20 border-indigo-500/50'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-200 text-sm truncate pr-2">{g.name}</h4>
                    <div className="flex gap-2 shrink-0">
                      <button
                        id={`edit-group-${g.id}`}
                        onClick={e => { e.stopPropagation(); openEditGroupForm(g); }}
                        className="text-slate-400 hover:text-indigo-400 transition-colors"
                        title="Edit group"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6-6 3 3-6 6H9v-3z" />
                        </svg>
                      </button>
                      <button
                        id={`delete-group-${g.id}`}
                        onClick={e => { e.stopPropagation(); deleteGroup(g.id); }}
                        className="text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete group"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {g.description && (
                    <p className="text-[10px] text-slate-500 line-clamp-1">{g.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    <span className="text-[10px] text-slate-500 font-medium">
                      {g.vehicles?.length ?? 0} vehicle{(g.vehicles?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Group Detail ───────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800/80 rounded-2xl backdrop-blur-md overflow-hidden">
          {selectedGroup ? (
            <div>
              {/* Group header */}
              <div className="px-6 pt-6 pb-4 border-b border-slate-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-extrabold text-white">{selectedGroup.name}</h3>
                    {selectedGroup.description && (
                      <p className="text-xs text-slate-400 mt-1">{selectedGroup.description}</p>
                    )}
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold">
                    {selectedGroup.vehicles?.length ?? 0} vehicles
                  </span>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4">
                  {(['vehicles', 'bulk-import'] as ActiveTab[]).map(tab => (
                    <button
                      key={tab}
                      id={`tab-${tab}`}
                      onClick={() => { setActiveTab(tab); setBulkResult(null); }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeTab === tab
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {tab === 'vehicles' ? 'Vehicles' : 'Bulk Import'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Tab: Vehicles ──────────────────────────────────────── */}
              {activeTab === 'vehicles' && (
                <div className="p-6 space-y-5">
                  {/* Add single vehicle */}
                  <div className="flex items-center gap-2">
                    <select
                      id="add-vehicle-select"
                      value={addVehicleId}
                      onChange={e => setAddVehicleId(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 text-slate-100 rounded-lg text-xs px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
                    >
                      <option value="">Select an unassigned vehicle to add...</option>
                      {unassignedVehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.plateNumber} — {v.ownerName}
                        </option>
                      ))}
                    </select>
                    <button
                      id="add-vehicle-btn"
                      onClick={addVehicleToGroup}
                      disabled={!addVehicleId}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all"
                    >
                      Add
                    </button>
                  </div>

                  {/* Vehicle table */}
                  {!selectedGroup.vehicles || selectedGroup.vehicles.length === 0 ? (
                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl">
                      <svg className="w-8 h-8 text-slate-700 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      <p className="text-slate-500 text-xs">No vehicles in this group.</p>
                      <p className="text-slate-600 text-[10px] mt-1">
                        Add one above or use the Bulk Import tab.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-800">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900/80">
                          <tr className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                            <th className="px-4 py-3">Plate</th>
                            <th className="px-4 py-3">Owner</th>
                            <th className="px-4 py-3">Phone</th>
                            <th className="px-4 py-3">Cap.</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {selectedGroup.vehicles.map(v => (
                            <tr key={v.id} className="hover:bg-slate-900/30 transition-colors">
                              <td className="px-4 py-3 font-mono font-bold text-white">{v.plateNumber}</td>
                              <td className="px-4 py-3 text-slate-300">{v.ownerName}</td>
                              <td className="px-4 py-3 text-slate-400 font-mono">{v.ownerPhone}</td>
                              <td className="px-4 py-3 text-slate-400">{v.capacity}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] border font-semibold ${STATUS_COLORS[v.status] ?? STATUS_COLORS.INACTIVE}`}>
                                  {v.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  id={`remove-vehicle-${v.id}`}
                                  onClick={() => removeVehicleFromGroup(v.id)}
                                  className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 text-[10px] font-semibold py-1 px-3 rounded-lg transition-all"
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── Tab: Bulk Import ──────────────────────────────────── */}
              {activeTab === 'bulk-import' && (
                <div className="p-6 space-y-5">
                  {/* Mode toggle */}
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg w-fit border border-slate-800">
                    {(['csv', 'json'] as const).map(m => (
                      <button
                        key={m}
                        id={`bulk-mode-${m}`}
                        onClick={() => setBulkMode(m)}
                        className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                          bulkMode === m ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  {bulkMode === 'csv' ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                          CSV Data
                          <span className="ml-2 text-slate-600 normal-case font-normal">
                            — columns: plate_number, owner_name, owner_phone, capacity, status
                          </span>
                        </label>
                        <textarea
                          id="csv-input"
                          rows={10}
                          value={csvText}
                          onChange={e => setCsvText(e.target.value)}
                          placeholder={CSV_TEMPLATE}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 resize-none placeholder:text-slate-700"
                        />
                      </div>
                      <button
                        id="load-template-btn"
                        type="button"
                        onClick={() => setCsvText(CSV_TEMPLATE)}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                      >
                        Load example template
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                        JSON Array
                        <span className="ml-2 text-slate-600 normal-case font-normal">
                          — each object: plateNumber, ownerName, ownerPhone, capacity?, status?
                        </span>
                      </label>
                      <textarea
                        id="json-input"
                        rows={10}
                        value={jsonText}
                        onChange={e => setJsonText(e.target.value)}
                        placeholder={`[\n  {\n    "plateNumber": "AA-3-A12345",\n    "ownerName": "Abebe Kebede",\n    "ownerPhone": "+251911223344",\n    "capacity": 12,\n    "status": "ACTIVE"\n  }\n]`}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 resize-none placeholder:text-slate-700"
                      />
                    </div>
                  )}

                  <button
                    id="bulk-import-btn"
                    onClick={handleBulkImport}
                    disabled={bulkImporting || (bulkMode === 'csv' ? !csvText.trim() : !jsonText.trim())}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold py-2.5 px-6 rounded-lg transition-all active:scale-[0.98]"
                  >
                    {bulkImporting ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Importing…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Import into {selectedGroup.name}
                      </>
                    )}
                  </button>

                  {/* Import result */}
                  {bulkResult && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800">
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <div>
                          <p className="text-xs font-bold text-emerald-400">{bulkResult.imported} vehicle(s) imported successfully</p>
                          {bulkResult.errors.length > 0 && (
                            <p className="text-[10px] text-amber-400 mt-0.5">{bulkResult.errors.length} row(s) had errors</p>
                          )}
                        </div>
                      </div>
                      {bulkResult.errors.length > 0 && (
                        <div className="px-4 py-3 space-y-1">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Errors</p>
                          {bulkResult.errors.map((e, i) => (
                            <p key={i} className="text-[10px] text-red-400 font-mono">• {e}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-[480px] text-center px-6">
              <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-slate-400 text-sm font-semibold">Select a group to manage</p>
              <p className="text-slate-600 text-xs mt-1">
                Choose a group from the list, or create a new one.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit Group Modal ─────────────────────────────────────── */}
      {showGroupForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {editGroup ? 'Edit Group' : 'Create New Group'}
              </h3>
              <button
                onClick={() => setShowGroupForm(false)}
                className="text-slate-500 hover:text-slate-200 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form id="group-form" onSubmit={handleGroupSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Group Name <span className="text-red-400">*</span>
                </label>
                <input
                  id="group-name-input"
                  type="text"
                  required
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Group A — Morning Shift"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                  Description <span className="text-slate-600 font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  id="group-description-input"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Brief notes about this group…"
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 resize-none transition-colors"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  id="group-form-submit"
                  type="submit"
                  disabled={formSaving}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg transition-all"
                >
                  {formSaving ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
                  ) : editGroup ? 'Save Changes' : 'Create Group'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowGroupForm(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium py-2.5 px-5 rounded-lg transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
