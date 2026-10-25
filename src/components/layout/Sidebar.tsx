/**
 * HCM Lite - Sidebar Navigation
 * Enforces role-based menu visibility per Section 2 of the Build Document
 */

import React from 'react';
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  CreditCard,
  ShieldCheck,
  Settings,
  FileText,
  Bot,
  TestTube2,
  HelpCircle,
  Building2,
} from 'lucide-react';
import { Role, User } from '../../types/hcm';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  currentUser: User | null;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles?: Role[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  currentUser,
  isOpenMobile,
  onCloseMobile,
}) => {
  const role = currentUser?.role;

  const navItems: NavItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'HR', 'EMPLOYEE'],
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: Users,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'HR'],
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: Clock,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'HR', 'EMPLOYEE'],
    },
    {
      id: 'leave',
      label: 'Leave & Time Off',
      icon: CalendarDays,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'HR', 'EMPLOYEE'],
    },
    {
      id: 'payroll',
      label: 'Payroll',
      icon: CreditCard,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'HR', 'EMPLOYEE'],
    },
    {
      id: 'users',
      label: 'User Management',
      icon: ShieldCheck,
      allowedRoles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      id: 'settings',
      label: 'Org Settings',
      icon: Settings,
      allowedRoles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      id: 'audit-logs',
      label: 'Audit Log',
      icon: FileText,
      allowedRoles: ['SUPERADMIN', 'ADMIN'],
    },
    {
      id: 'ai-assistant',
      label: 'AI Assistant',
      icon: Bot,
      allowedRoles: ['SUPERADMIN', 'ADMIN', 'HR', 'EMPLOYEE'],
    },
    {
      id: 'test-runner',
      label: 'Test Runner (developer only)',
      icon: TestTube2,
      allowedRoles: ['SUPERADMIN'],
    },
    {
      id: 'faq',
      label: 'Help & FAQ',
      icon: HelpCircle,
    },
  ];

  // Filter items based on user role
  const visibleItems = navItems.filter((item) => {
    if (item.id === 'test-runner' && import.meta.env.PROD) return false;
    if (!item.allowedRoles) return true;
    if (!role) return false;
    if (role === 'SUPERADMIN') return true;
    return item.allowedRoles.includes(role);
  });

  return (
    <>
      {/* Mobile backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 z-40 h-screen w-64 bg-slate-900 text-slate-200 flex flex-col justify-between shrink-0 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Logo / Header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950 font-bold text-sm">
              HL
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-white tracking-tight">
                HCM Lite
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {role || 'PUBLIC'}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-800 text-white font-semibold shadow-xs'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Role Info Card */}
        {currentUser && (
          <div className="p-4 m-3 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span>Active Identity</span>
              <span className="text-[10px] font-mono text-emerald-400 font-medium">ONLINE</span>
            </div>
            <p className="text-white font-medium truncate">{currentUser.username}</p>
            <p className="text-[11px] text-slate-400 font-mono">{currentUser.role}</p>
          </div>
        )}
      </aside>
    </>
  );
};
