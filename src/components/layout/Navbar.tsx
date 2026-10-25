/**
 * HCM Lite - Top Navigation Bar
 * Conforms strictly to Top Bar Contract: Brand title / breadcrumb, single-line clean controls, user profile
 */

import React from 'react';
import {
  Bell,
  LogOut,
  ShieldAlert,
  Sparkles,
  UserCheck,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { Role, User } from '../../types/hcm';
import { api } from '../../services/api';
import { db } from '../../services/db';

interface NavbarProps {
  currentView: string;
  currentUser: User | null;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onOpenQuickDemo?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  currentUser,
  onNavigate,
  onLogout,
  onOpenQuickDemo,
}) => {
  const company = db.getState().company;
  const isSuperadmin = currentUser?.role === 'SUPERADMIN';
  const isDefaultPassword = currentUser?.is_system_default && currentUser?.must_change_password;

  const viewTitles: Record<string, string> = {
    landing: 'Home',
    faq: 'Help & FAQ',
    dashboard: 'Operations Dashboard',
    employees: 'Employee Directory',
    attendance: 'Attendance Management',
    leave: 'Leave & Time Off',
    payroll: 'Payroll Operations',
    users: 'System User Administration',
    settings: 'Organization Settings',
    'audit-logs': 'Immutable Audit Logs',
    'ai-assistant': 'AI HR Assistant',
    'test-runner': 'System Test Suite (30 Tests)',
  };

  const currentTitle = viewTitles[currentView] || 'HCM Lite';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-6 px-6 py-3.5 bg-white border-b border-slate-200 shadow-xs">
      {/* Zone 1: Breadcrumb and Brand */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => onNavigate(currentUser ? 'dashboard' : 'landing')}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-sm">
            H
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900 leading-tight">
              {company?.name || 'HCM Lite'}
            </span>
            <span className="text-xs text-slate-500 font-normal">
              Enterprise HR System
            </span>
          </div>
        </button>

        <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
          /
        </span>
        <span className="text-sm font-medium text-slate-700 truncate hidden sm:inline">
          {currentTitle}
        </span>

        {isDefaultPassword && (
          <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium">
            <ShieldAlert className="w-3.5 h-3.5" />
            Default password in use
          </span>
        )}
      </div>

      {/* Zone 2 & 3: Quick Action & User Menu */}
      <div className="flex items-center gap-3 shrink-0">

        <button
          onClick={() => onNavigate('test-runner')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
            currentView === 'test-runner'
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          System Tests
        </button>

        <button
          onClick={() => onNavigate('ai-assistant')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
            currentView === 'ai-assistant'
              ? 'bg-emerald-600 text-white'
              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI Assistant
        </button>

        {currentUser ? (
          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="flex flex-col text-right hidden sm:flex">
              <span className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser.username}
              </span>
              <span className="text-[11px] text-slate-500 font-mono tracking-wide">
                {currentUser.role}
              </span>
            </div>

            <button
              onClick={onLogout}
              title="Sign out"
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('faq')}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
            >
              Help & FAQ
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Sign In
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
