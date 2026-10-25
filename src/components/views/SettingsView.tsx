/**
 * HCM Lite - Organization Settings & Governance
 * Implements Section 4.1, 6.3: Versioned settings, Office timing, GPS coordinates, Departments, Holidays
 */

import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Building, Clock, MapPin, Calendar, Plus, Check, X } from 'lucide-react';
import { Department, Designation, Holiday, LeaveType, Settings, User } from '../../types/hcm';
import { api } from '../../services/api';
import { db } from '../../services/db';

interface SettingsViewProps {
  currentUser: User;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ currentUser }) => {
  const [settings, setSettings] = useState<Settings>(db.getState().settings);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // New dept / holiday state
  const [newDeptName, setNewDeptName] = useState('');
  const [newHolDate, setNewHolDate] = useState('');
  const [newHolName, setNewHolName] = useState('');

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadAll = async () => {
    const s = await api.getSettings();
    if (s.data) setSettings(s.data);
    const d = await api.getDepartments();
    if (d.data) setDepartments(d.data);
    const des = await api.getDesignations();
    if (des.data) setDesignations(des.data);
    const lt = await api.getLeaveTypes();
    if (lt.data) setLeaveTypes(lt.data);
    const h = await api.getHolidays();
    if (h.data) setHolidays(h.data);
  };

  useEffect(() => {
    loadAll();
    const unsub = db.subscribe(() => {
      loadAll();
    });
    return unsub;
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const res = await api.updateSettings(settings);
    if (res.status === 200) {
      setMessage({ type: 'success', text: 'Organization policies and settings saved and versioned.' });
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to update settings.' });
    }
  };

  const handleAddDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeptName.trim()) return;
    const res = await api.addDepartment(newDeptName);
    if (res.status === 201) {
      setNewDeptName('');
      setMessage({ type: 'success', text: 'Department added successfully.' });
      loadAll();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to add department.' });
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolDate || !newHolName) return;
    const res = await api.addHoliday(newHolDate, newHolName);
    if (res.status === 201) {
      setNewHolDate('');
      setNewHolName('');
      setMessage({ type: 'success', text: 'Company holiday added.' });
      loadAll();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to add holiday.' });
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-6xl mx-auto text-xs">
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Organization Setup & Governance
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Rule changes are snapshotted and apply to future records without rewriting history
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Settings Form */}
      <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
          <Clock className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Attendance & Shift Policies</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Office Start Time</label>
            <input
              type="time"
              value={settings.office_start}
              onChange={(e) => setSettings({ ...settings, office_start: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Grace Period (Minutes)</label>
            <input
              type="number"
              min={0}
              max={60}
              value={settings.grace_minutes}
              onChange={(e) => setSettings({ ...settings, grace_minutes: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Half-Day Cutoff (Hours)</label>
            <input
              type="number"
              min={1}
              max={8}
              value={settings.half_day_hours}
              onChange={(e) => setSettings({ ...settings, half_day_hours: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 pt-2">
          <MapPin className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Office Geofence Coordinates</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Office Latitude</label>
            <input
              type="number"
              step="0.000001"
              value={settings.office_lat}
              onChange={(e) => setSettings({ ...settings, office_lat: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Office Longitude</label>
            <input
              type="number"
              step="0.000001"
              value={settings.office_lng}
              onChange={(e) => setSettings({ ...settings, office_lng: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Allowed Radius (meters, 10–5000)</label>
            <input
              type="number"
              min={10}
              max={5000}
              value={settings.office_radius_m}
              onChange={(e) => setSettings({ ...settings, office_radius_m: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end pt-3">
          <button
            type="submit"
            className="px-5 py-2 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            Save Policy Settings
          </button>
        </div>
      </form>

      {/* Departments & Designations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Departments */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Departments</h2>
          <form onSubmit={handleAddDept} className="flex gap-2">
            <input
              type="text"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="New department name..."
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md"
            />
            <button
              type="submit"
              className="px-3 py-1.5 font-semibold text-white bg-slate-900 rounded-md"
            >
              Add
            </button>
          </form>
          <div className="divide-y divide-slate-100">
            {departments.map((d) => (
              <div key={d.id} className="py-2 flex items-center justify-between text-slate-800">
                <span className="font-medium">{d.name}</span>
                <span className="text-emerald-700">Active</span>
              </div>
            ))}
          </div>
        </div>

        {/* Official Holidays */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
          <h2 className="text-sm font-bold text-slate-900">Official Statutory Holidays</h2>
          <form onSubmit={handleAddHoliday} className="grid grid-cols-3 gap-2">
            <input
              type="date"
              value={newHolDate}
              onChange={(e) => setNewHolDate(e.target.value)}
              className="px-2 py-1.5 border border-slate-300 rounded-md font-mono"
            />
            <input
              type="text"
              value={newHolName}
              onChange={(e) => setNewHolName(e.target.value)}
              placeholder="Holiday name..."
              className="px-2 py-1.5 border border-slate-300 rounded-md"
            />
            <button
              type="submit"
              className="px-3 py-1.5 font-semibold text-white bg-slate-900 rounded-md"
            >
              Add
            </button>
          </form>
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {holidays.map((h) => (
              <div key={h.id} className="py-2 flex items-center justify-between text-slate-800">
                <span>{h.name}</span>
                <span className="font-mono text-slate-500">{h.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
