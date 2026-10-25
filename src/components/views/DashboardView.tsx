/**
 * HCM Lite - Operations Dashboard
 * Role-tailored operational KPIs with AI summary generation (Section 5.5, 6.8, 7.3)
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  Clock,
  CalendarCheck,
  CreditCard,
  TrendingDown,
  Sparkles,
  ArrowUpRight,
  AlertCircle,
  CheckCircle,
  FileText,
  UserCheck,
} from 'lucide-react';
import { User } from '../../types/hcm';
import { api } from '../../services/api';
import { ai } from '../../services/ai';
import { db } from '../../services/db';

interface DashboardViewProps {
  currentUser: User;
  onNavigate: (view: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ currentUser, onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [aiSummary, setAiSummary] = useState<string[] | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [todayCheckedIn, setTodayCheckedIn] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    const res = await api.getDashboardData();
    if (res.status === 200) {
      setData(res.data);
    }
    // Check if user has attendance today
    if (currentUser.employee_id) {
      const todayStr = new Date().toISOString().split('T')[0];
      const att = db.getState().attendance.find(
        (a) => a.employee_id === currentUser.employee_id && a.date === todayStr
      );
      setTodayCheckedIn(!!att);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = db.subscribe(() => {
      loadData();
    });
    return unsub;
  }, [currentUser]);

  const handleGenerateSummary = async () => {
    if (!data) return;
    setIsSummarizing(true);
    const summary = await ai.summarizeDashboardKpis(data);
    setAiSummary(summary);
    setIsSummarizing(false);
  };

  const handleQuickCheckIn = async () => {
    const res = await api.checkIn();
    if (res.status === 201) {
      setTodayCheckedIn(true);
      loadData();
    }
  };

  const handleQuickCheckOut = async () => {
    const res = await api.checkOut();
    if (res.status === 200) {
      loadData();
    }
  };

  if (isLoading && !data) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-48 bg-slate-200 animate-pulse rounded-md" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const isEmployeeOnly = currentUser.role === 'EMPLOYEE';

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>Welcome back, {currentUser.username}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{currentUser.role}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {isEmployeeOnly ? 'Employee Self-Service' : 'People & Operations Dashboard'}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateSummary}
            disabled={isSummarizing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            {isSummarizing ? 'Analyzing...' : 'AI KPI Summary'}
          </button>

          {isEmployeeOnly && (
            <div className="flex items-center gap-2">
              {!todayCheckedIn ? (
                <button
                  onClick={handleQuickCheckIn}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors"
                >
                  Quick Check-In
                </button>
              ) : (
                <button
                  onClick={handleQuickCheckOut}
                  className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Check Out
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AI Summary Banner (if generated) */}
      {aiSummary && (
        <div className="bg-purple-50/70 border border-purple-200/80 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-900">
              <Sparkles className="w-4 h-4 text-purple-600" />
              Executive AI Insights
            </span>
            <span className="text-[10px] text-purple-600 font-medium">AI-generated</span>
          </div>
          <ul className="space-y-1.5 text-xs text-purple-950">
            {aiSummary.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Active Headcount</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {data?.headcount || 0}
            </span>
            <span className="text-xs text-slate-500">
              {data?.totalEmployees || 0} total registered
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Today's Attendance Rate</span>
            <Clock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {data?.attendanceRate || '100%'}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {data?.presentToday || 0} Present · {data?.lateToday || 0} Late
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Pending Approvals</span>
            <CalendarCheck className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {(data?.pendingLeaves || 0) + (data?.pendingCorrections || 0)}
            </span>
            <span className="text-xs text-amber-700 tabular-nums">
              {data?.pendingLeaves || 0} Leaves · {data?.pendingCorrections || 0} Corrections
            </span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Annualized Attrition</span>
            <TrendingDown className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
              {data?.attrition || '0.0%'}
            </span>
            <span className="text-xs text-emerald-700">Healthy rate</span>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Attendance & Shift Board</h2>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Record geofenced check-in, review office arrival status (09:00 start with 15m grace),
            and inspect daily attendance logs.
          </p>
          <button
            onClick={() => onNavigate('attendance')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:text-slate-700"
          >
            Open Attendance Module
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Leave Quotas & Time Off</h2>
            <CalendarCheck className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Submit leave requests in plain language via Smart Leave, verify working-day calculations,
            and review approvals without calendar overlaps.
          </p>
          <button
            onClick={() => onNavigate('leave')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:text-slate-700"
          >
            Manage Time Off
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Payroll & Payslips</h2>
            <CreditCard className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Execute monthly payroll drafts, review tax deductions across statutory slabs, lock finalized runs,
            and download official PDF payslips.
          </p>
          <button
            onClick={() => onNavigate('payroll')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:text-slate-700"
          >
            Access Payroll Console
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Announcements */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Company Announcements</h2>
          <FileText className="w-4 h-4 text-slate-400" />
        </div>
        <div className="divide-y divide-slate-100">
          {data?.recentAnnouncements && data.recentAnnouncements.length > 0 ? (
            data.recentAnnouncements.map((ann: any) => (
              <div key={ann.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">{ann.title}</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(ann.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{ann.body}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-slate-500 py-3">No announcements posted yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
