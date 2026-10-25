/**
 * HCM Lite - Attendance Management & Geofenced Check-In
 * Supports Standard Check-in/out, Daily Board, Calendar, Camera & GPS verification, and Corrections (Section 5.1, 5.2, 6.5)
 */

import React, { useState, useEffect } from 'react';
import {
  Clock,
  Camera,
  MapPin,
  Calendar,
  CheckCircle,
  AlertTriangle,
  FileEdit,
  Check,
  X,
  UserCheck,
  Building,
} from 'lucide-react';
import { AttendanceCorrection, AttendanceRecord, Employee, User } from '../../types/hcm';
import { api } from '../../services/api';
import { db } from '../../services/db';

interface AttendanceViewProps {
  currentUser: User;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({ currentUser }) => {
  const [boardData, setBoardData] = useState<any>(null);
  const [calendarRecords, setCalendarRecords] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'board' | 'calendar' | 'camera' | 'corrections'>('board');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Correction Form
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionDate, setCorrectionDate] = useState(selectedDate);
  const [reqCheckIn, setReqCheckIn] = useState('09:00');
  const [reqCheckOut, setReqCheckOut] = useState('17:30');
  const [correctionReason, setCorrectionReason] = useState('');

  // Camera Check-in Simulator
  const [simLat, setSimLat] = useState(37.774929);
  const [simLng, setSimLng] = useState(-122.419416);
  const [simAccuracy, setSimAccuracy] = useState(25);
  const [simFaces, setSimFaces] = useState(1);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const isEmployee = currentUser.role === 'EMPLOYEE';
  const canDecide = currentUser.role === 'SUPERADMIN' || currentUser.role === 'HR';

  const loadAttendance = async () => {
    setIsLoading(true);
    if (!isEmployee) {
      const boardRes = await api.getAttendanceBoard(selectedDate);
      if (boardRes.status === 200) {
        setBoardData(boardRes.data);
      }
    }
    const calRes = await api.getMyAttendanceCalendar();
    if (calRes.status === 200 && calRes.data) {
      setCalendarRecords(calRes.data);
    }
    const corRes = await api.getAttendanceCorrections();
    if (corRes.status === 200 && corRes.data) {
      setCorrections(corRes.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadAttendance();
    const unsub = db.subscribe(() => {
      loadAttendance();
    });
    return unsub;
  }, [selectedDate, currentUser]);

  const handleStandardCheckIn = async () => {
    setMessage(null);
    const res = await api.checkIn();
    if (res.status === 201) {
      setMessage({ type: 'success', text: `Checked in successfully as ${res.data?.status.toUpperCase()}.` });
      loadAttendance();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Check-in failed.' });
    }
  };

  const handleStandardCheckOut = async () => {
    setMessage(null);
    const res = await api.checkOut();
    if (res.status === 200) {
      setMessage({
        type: 'success',
        text: `Checked out successfully! Total worked time: ${Math.floor((res.data?.worked_minutes || 0) / 60)}h ${
          (res.data?.worked_minutes || 0) % 60
        }m (Status: ${res.data?.status.toUpperCase()}).`,
      });
      loadAttendance();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Check-out failed.' });
    }
  };

  const handleCameraCheckIn = async () => {
    setMessage(null);
    const res = await api.cameraCheckIn({
      lat: Number(simLat),
      lng: Number(simLng),
      accuracy_m: Number(simAccuracy),
      face_count: Number(simFaces),
    });

    if (res.status === 201) {
      setMessage({
        type: 'success',
        text: `Camera attendance verified & recorded! Distance to office: ${res.data?.distance_m}m. Status: ${res.data?.status.toUpperCase()}.`,
      });
      setIsCameraActive(false);
      loadAttendance();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Camera check-in verification failed.' });
    }
  };

  const handleApplyCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const res = await api.requestAttendanceCorrection({
      date: correctionDate,
      requested_check_in: reqCheckIn,
      requested_check_out: reqCheckOut,
      reason: correctionReason,
    });

    if (res.status === 201) {
      setIsCorrectionModalOpen(false);
      setMessage({ type: 'success', text: 'Attendance correction request submitted for HR approval.' });
      setCorrectionReason('');
      loadAttendance();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to submit correction.' });
    }
  };

  const handleDecideCorrection = async (id: string, decision: 'approved' | 'rejected') => {
    const res = await api.decideAttendanceCorrection(id, decision);
    if (res.status === 200) {
      setMessage({ type: 'success', text: `Correction request ${decision}.` });
      loadAttendance();
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Attendance & Shifts
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            09:00 start with 15m grace period · Server authoritative timestamping
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleStandardCheckIn}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-2xs transition-colors"
          >
            Web Check-In
          </button>
          <button
            onClick={handleStandardCheckOut}
            className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Check Out
          </button>
          <button
            onClick={() => setIsCorrectionModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Request Correction
          </button>
        </div>
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

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
        {!isEmployee && (
          <button
            onClick={() => setActiveTab('board')}
            className={`px-3 py-1.5 font-medium rounded-lg transition-colors ${
              activeTab === 'board' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Board
          </button>
        )}
        <button
          onClick={() => setActiveTab('calendar')}
          className={`px-3 py-1.5 font-medium rounded-lg transition-colors ${
            activeTab === 'calendar' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Personal Calendar
        </button>
        <button
          onClick={() => setActiveTab('camera')}
          className={`px-3 py-1.5 font-medium rounded-lg transition-colors ${
            activeTab === 'camera' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Camera & GPS Check-In
        </button>
        <button
          onClick={() => setActiveTab('corrections')}
          className={`px-3 py-1.5 font-medium rounded-lg transition-colors ${
            activeTab === 'corrections' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Corrections ({corrections.filter((c) => c.status === 'pending').length})
        </button>
      </div>

      {/* Tab: Daily Board */}
      {activeTab === 'board' && !isEmployee && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-700">Filter Board Date:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
            />
            {boardData && (
              <span className="text-xs text-slate-500">
                {boardData.isWorkingDay ? 'Official Working Day' : 'Weekend / Official Holiday'}
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Check-In</th>
                  <th className="py-3 px-4">Check-Out</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {boardData?.board?.map((item: any) => {
                  const att = item.attendance;
                  const isLate = att?.status === 'late';
                  const isPresent = att?.status === 'present';
                  return (
                    <tr key={item.employee.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {item.employee.first_name} {item.employee.last_name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">{item.employee.code}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold capitalize ${
                            item.computedStatus === 'present'
                              ? 'text-emerald-700'
                              : item.computedStatus === 'late'
                              ? 'text-amber-700'
                              : item.computedStatus === 'half_day'
                              ? 'text-indigo-700'
                              : item.computedStatus === 'on_leave'
                              ? 'text-purple-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {item.computedStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {att?.check_in_at ? new Date(att.check_in_at).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {att?.check_out_at ? new Date(att.check_out_at).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 tabular-nums">
                        {att?.worked_minutes ? `${Math.floor(att.worked_minutes / 60)}h ${att.worked_minutes % 60}m` : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-500 capitalize">{att?.source || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Personal Calendar */}
      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 font-semibold text-slate-800 text-xs">
              Your Recent Attendance Records
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Check-In</th>
                  <th className="py-3 px-4">Check-Out</th>
                  <th className="py-3 px-4">Worked Hours</th>
                  <th className="py-3 px-4">Verification Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calendarRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No attendance records found for your account. Use "Web Check-In" to mark attendance.
                    </td>
                  </tr>
                ) : (
                  calendarRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{r.date}</td>
                      <td className="py-3 px-4 capitalize font-semibold text-slate-800">{r.status.replace('_', ' ')}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {new Date(r.check_in_at).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString() : 'In Progress'}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        {r.worked_minutes ? `${(r.worked_minutes / 60).toFixed(1)} hrs` : '—'}
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-500">{r.source}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Camera & GPS Check-in */}
      {activeTab === 'camera' && (
        <div className="max-w-2xl bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Biometric & Geofenced Attendance (Bonus Module)
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Section 5.2 validation: Face count must equal 1, GPS accuracy ≤ 100m, Haversine distance ≤ 150m.
              </p>
            </div>
            <Camera className="w-5 h-5 text-slate-400" />
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
            <span className="font-semibold text-slate-700 block">Sensor & Geolocation Simulator:</span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Face Detection Count (Must be 1)</label>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={simFaces}
                  onChange={(e) => setSimFaces(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">GPS Accuracy (meters, ≤ 100m)</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={simAccuracy}
                  onChange={(e) => setSimAccuracy(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={simLat}
                  onChange={(e) => setSimLat(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={simLng}
                  onChange={(e) => setSimLng(Number(e.target.value))}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCameraCheckIn}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Camera className="w-4 h-4" />
              Verify & Check In
            </button>
          </div>
        </div>
      )}

      {/* Tab: Corrections */}
      {activeTab === 'corrections' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-slate-800 text-xs">Attendance Correction Requests</span>
            <button
              onClick={() => setIsCorrectionModalOpen(true)}
              className="px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
            >
              + New Request
            </button>
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Requested Times</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                {canDecide && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {corrections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No attendance correction requests filed.
                  </td>
                </tr>
              ) : (
                corrections.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono font-medium">{c.date}</td>
                    <td className="py-3 px-4 font-mono">
                      {c.requested_check_in} – {c.requested_check_out}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{c.reason}</td>
                    <td className="py-3 px-4">
                      <span className="capitalize font-semibold text-slate-800">{c.status}</span>
                    </td>
                    {canDecide && (
                      <td className="py-3 px-4 text-right space-x-2">
                        {c.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleDecideCorrection(c.id, 'approved')}
                              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-500"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleDecideCorrection(c.id, 'rejected')}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Correction Modal */}
      {isCorrectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Request Attendance Correction</h2>
              <button onClick={() => setIsCorrectionModalOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleApplyCorrection} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Date *</label>
                <input
                  type="date"
                  required
                  value={correctionDate}
                  onChange={(e) => setCorrectionDate(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Check-In Time *</label>
                  <input
                    type="time"
                    required
                    value={reqCheckIn}
                    onChange={(e) => setReqCheckIn(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Check-Out Time *</label>
                  <input
                    type="time"
                    required
                    value={reqCheckOut}
                    onChange={(e) => setReqCheckOut(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Correction *</label>
                <textarea
                  rows={3}
                  required
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  placeholder="e.g. Forgot to stamp check-out due to offsite client meeting"
                  className="w-full p-2 border border-slate-300 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCorrectionModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
