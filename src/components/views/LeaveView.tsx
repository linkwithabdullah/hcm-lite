/**
 * HCM Lite - Leave & Time Off Management
 * Working-day calculation, AI Smart Leave, Overlap & Overbalance checks, HR approvals (Section 5.3, 6.6, 7.3)
 */

import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Plus,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  X,
  Check,
  Calendar,
} from 'lucide-react';
import { LeaveRequest, LeaveType, Role, User } from '../../types/hcm';
import { api } from '../../services/api';
import { ai } from '../../services/ai';
import { db } from '../../services/db';

interface LeaveViewProps {
  currentUser: User;
}

export const LeaveView: React.FC<LeaveViewProps> = ({ currentUser }) => {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balanceData, setBalanceData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Apply Modal state
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [smartPrompt, setSmartPrompt] = useState('');
  const [isSmartLoading, setIsSmartLoading] = useState(false);

  const [formType, setFormType] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formReason, setFormReason] = useState('');

  // Approval modal state
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [decisionComment, setDecisionComment] = useState('');

  const canApprove = currentUser.role === 'SUPERADMIN' || currentUser.role === 'HR';

  const loadLeaveData = async () => {
    setIsLoading(true);
    const reqRes = await api.getLeaveRequests();
    if (reqRes.status === 200 && reqRes.data) {
      setLeaveRequests(reqRes.data);
    }
    const typeRes = await api.getLeaveTypes();
    if (typeRes.status === 200 && typeRes.data) {
      setLeaveTypes(typeRes.data);
      if (!formType && typeRes.data.length > 0) {
        setFormType(typeRes.data[0].id);
      }
    }
    if (currentUser.employee_id) {
      const balRes = await api.getLeaveBalance();
      if (balRes.status === 200 && balRes.data) {
        setBalanceData(balRes.data);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadLeaveData();
    const unsub = db.subscribe(() => {
      loadLeaveData();
    });
    return unsub;
  }, [currentUser]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const res = await api.applyLeave({
      leave_type_id: formType,
      start_date: formStart,
      end_date: formEnd,
      reason: formReason,
    });

    if (res.status === 201) {
      setIsApplyModalOpen(false);
      setMessage({
        type: 'success',
        text: `Leave request for ${res.data?.working_days} working day(s) submitted successfully.`,
      });
      setFormReason('');
      loadLeaveData();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to submit leave request.' });
    }
  };

  const handleSmartLeaveParse = async () => {
    if (!smartPrompt.trim()) return;
    setIsSmartLoading(true);
    try {
      const parsed = await ai.parseSmartLeave(smartPrompt, currentUser);
      if (parsed) {
        const matchedType = leaveTypes.find((lt) => lt.name.toLowerCase() === parsed.leave_type.toLowerCase());
        if (matchedType) {
          setFormType(matchedType.id);
        }
        setFormStart(parsed.start_date);
        setFormEnd(parsed.end_date);
        setFormReason(parsed.reason);
        setMessage({
          type: 'success',
          text: `AI pre-filled the form (${parsed.estimated_working_days} working days estimated). Please review and submit.`,
        });
      } else {
        setMessage({ type: 'error', text: 'AI parsing failed. Please fill dates manually.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: 'AI parsing failed. Please fill dates manually.' });
    }
    setIsSmartLoading(false);
  };

  const handleCancel = async (id: string) => {
    const res = await api.cancelLeave(id);
    if (res.status === 200) {
      setMessage({ type: 'success', text: 'Leave request cancelled.' });
      loadLeaveData();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to cancel.' });
    }
  };

  const handleDecide = async (decision: 'approved' | 'rejected') => {
    if (!selectedRequest) return;
    const res = await api.decideLeave(selectedRequest.id, decision, decisionComment);
    if (res.status === 200) {
      setSelectedRequest(null);
      setDecisionComment('');
      setMessage({ type: 'success', text: `Leave request ${decision}.` });
      loadLeaveData();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Action failed.' });
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Leave & Time Off
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Working-day quota tracking · Weekends & statutory holidays excluded automatically
          </p>
        </div>

        <button
          onClick={() => {
            setIsApplyModalOpen(true);
            const today = new Date().toISOString().split('T')[0];
            setFormStart(today);
            setFormEnd(today);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Apply for Leave
        </button>
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

      {/* Quota Balance Cards (for Employee) */}
      {balanceData && (
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-3">
            Your {balanceData.year} Leave Balance:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {balanceData.balances.map((b: any) => (
              <div key={b.leave_type.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-1">
                <span className="text-xs font-semibold text-slate-500">{b.leave_type.name} Leave</span>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                    {b.remaining}
                  </span>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {b.used} used / {b.quota !== null ? b.quota : '∞'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requests History Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 font-semibold text-slate-800 text-xs">
          Leave Applications & History
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Leave Type</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">Working Days</th>
              <th className="py-3 px-4">Reason</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leaveRequests.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No leave requests found. Click "Apply for Leave" or use AI Smart Leave to create one.
                </td>
              </tr>
            ) : (
              leaveRequests.map((req) => {
                const emp = db.getState().employees.find((e) => e.id === req.employee_id);
                const lt = leaveTypes.find((t) => t.id === req.leave_type_id);
                const isPending = req.status === 'pending';
                const isMine = currentUser.employee_id === req.employee_id;
                return (
                  <tr key={req.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {emp ? `${emp.first_name} ${emp.last_name}` : 'Staff Member'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">{emp?.code}</div>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">{lt?.name || 'Leave'}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {req.start_date} <span className="text-slate-400">to</span> {req.end_date}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {req.working_days} d
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={req.reason}>
                      {req.reason}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold capitalize ${
                          req.status === 'approved'
                            ? 'text-emerald-700'
                            : req.status === 'rejected'
                            ? 'text-rose-700'
                            : req.status === 'cancelled'
                            ? 'text-slate-500'
                            : 'text-amber-700'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {isPending && isMine && (
                        <button
                          onClick={() => handleCancel(req.id)}
                          className="text-xs text-rose-600 hover:text-rose-800 underline"
                        >
                          Cancel
                        </button>
                      )}

                      {canApprove && isPending && !isMine && (
                        <button
                          onClick={() => setSelectedRequest(req)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md"
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Apply for Leave Modal with AI Smart-Leave */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Apply for Leave / Time Off</h2>
              <button onClick={() => setIsApplyModalOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Smart Leave Natural Language Pre-fill Box */}
            <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  AI Smart Leave (Natural Language)
                </span>
                <span className="text-[10px] text-purple-600 font-medium">Auto-prefills form</span>
              </div>
              <p className="text-[11px] text-purple-800">
                Type your leave reason naturally (e.g. "Need next Monday and Tuesday off for sister's wedding").
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={smartPrompt}
                  onChange={(e) => setSmartPrompt(e.target.value)}
                  placeholder="Need 2 days off next week for family event..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-purple-200 rounded-md focus:outline-hidden"
                />
                <button
                  type="button"
                  disabled={isSmartLoading}
                  onClick={handleSmartLeaveParse}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-md whitespace-nowrap"
                >
                  {isSmartLoading ? 'Parsing...' : 'Pre-Fill'}
                </button>
              </div>
            </div>

            {/* Formal Confirmation Form */}
            <form onSubmit={handleApply} className="space-y-4 pt-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Leave Type *</label>
                <select
                  required
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-xs"
                >
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} ({lt.yearly_quota !== null ? `${lt.yearly_quota} days/yr` : 'Unlimited'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Reason for Leave *</label>
                <textarea
                  rows={3}
                  required
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Explain why you require this time off..."
                  className="w-full p-2 border border-slate-300 rounded-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Confirm & Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review & Approve Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Review Leave Request</h2>
              <button onClick={() => setSelectedRequest(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 font-medium text-slate-700">
              <p>Duration: <span className="font-mono">{selectedRequest.start_date} to {selectedRequest.end_date}</span> ({selectedRequest.working_days} working days)</p>
              <p>Reason: <span className="font-normal text-slate-900">{selectedRequest.reason}</span></p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Decision Comment (optional)</label>
              <input
                type="text"
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                placeholder="e.g. Approved. Enjoy your time off!"
                className="w-full px-3 py-2 border border-slate-300 rounded-md"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleDecide('rejected')}
                className="px-3.5 py-1.5 font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg"
              >
                Reject Request
              </button>
              <button
                type="button"
                onClick={() => handleDecide('approved')}
                className="px-4 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg"
              >
                Approve Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
