/**
 * HCM Lite - Main Application Root
 * Enforces authentication, forced password change gates, First-Run Wizard, and dynamic SEO titles
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { ForcePasswordChangeModal } from './components/modals/ForcePasswordChangeModal';
import { FirstRunWizardModal } from './components/modals/FirstRunWizardModal';

import { LandingView } from './components/views/LandingView';
import { LoginView } from './components/views/LoginView';
import { FaqView } from './components/views/FaqView';
import { DashboardView } from './components/views/DashboardView';
import { EmployeesView } from './components/views/EmployeesView';
import { AttendanceView } from './components/views/AttendanceView';
import { LeaveView } from './components/views/LeaveView';
import { PayrollView } from './components/views/PayrollView';
import { UsersView } from './components/views/UsersView';
import { SettingsView } from './components/views/SettingsView';
import { AuditLogsView } from './components/views/AuditLogsView';
import { AiAssistantView } from './components/views/AiAssistantView';
import { TestRunnerView } from './components/views/TestRunnerView';

import { api } from './services/api';
import { db } from './services/db';
import { User } from './types/hcm';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(api.getCurrentUser());
  const [currentView, setCurrentView] = useState<string>('landing');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);

  // Sync state with DB updates
  useEffect(() => {
    const unsub = db.subscribe(() => {
      const u = api.getCurrentUser();
      setCurrentUser(u);
    });
    return unsub;
  }, []);

  // The first-run flag is authoritative in PostgreSQL, not an in-memory browser cache.
  useEffect(() => {
    if (!currentUser || currentUser.must_change_password) {setSetupComplete(null);return;}
    let live=true;
    api.getSettings().then(result=>{
      if (live && result.status===200 && result.data) {
        const settings = result.data as any;
        const configured = Boolean(settings.setup_complete);
        setSetupComplete(configured);
        db.setState({
          settings,
          company: configured ? { id: 'company-1', name: settings.company_name,
            logo_url: '', created_at: settings.updated_at } : null,
        });
      }
    });
    return ()=>{live=false;};
  },[currentUser?.id,currentUser?.must_change_password]);

  // Update document title dynamically per Section 10.2
  useEffect(() => {
    const titles: Record<string, string> = {
      landing: 'HCM Lite - AI-Powered Human Capital Management',
      faq: 'Help & FAQ | HCM Lite',
      login: 'Sign In | HCM Lite',
      dashboard: 'Operations Dashboard | HCM Lite',
      employees: 'Employee Directory | HCM Lite',
      attendance: 'Attendance Management | HCM Lite',
      leave: 'Leave Requests | HCM Lite',
      payroll: 'Payroll Operations | HCM Lite',
      users: 'User Management | HCM Lite',
      settings: 'Organization Settings | HCM Lite',
      'audit-logs': 'Audit Logs | HCM Lite',
      'ai-assistant': 'AI HR Assistant | HCM Lite',
      'test-runner': 'System Tests | HCM Lite',
    };

    document.title = titles[currentView] || 'HCM Lite';
  }, [currentView]);

  // Navigate helper
  const navigateTo = (view: string) => {
    setCurrentView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    navigateTo('dashboard');
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    navigateTo('landing');
  };

  const handleSwitchUser = async (username: string, pass: string) => {
    const res = await api.login(username, pass);
    if (res.status === 200 && res.data) {
      setCurrentUser(res.data.user);
    }
  };

  const isConfigured = setupComplete === true;
  const isSuperadmin = currentUser?.role === 'SUPERADMIN';
  const showFirstRunWizard = isSuperadmin && setupComplete === false && !currentUser?.must_change_password;
  const isAuthPage = currentView === 'landing' || currentView === 'login' || currentView === 'faq';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* WCAG 2.1 AA Skip-to-content landmark */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-emerald-700 focus:text-white focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 font-medium"
      >
        Skip to main content
      </a>

      {/* Top Navigation Bar */}
      <Navbar
        currentView={currentView}
        currentUser={currentUser}
        onNavigate={navigateTo}
        onLogout={handleLogout}
      />

      {/* Mandatory Password Change Gate per Section 2.1 & 6.1 */}
      {currentUser && currentUser.must_change_password && (
        <ForcePasswordChangeModal
          username={currentUser.username}
          isSystemDefault={currentUser.is_system_default}
          onSuccess={() => {
            const updated = api.getCurrentUser();
            setCurrentUser(updated);
          }}
          onLogout={handleLogout}
        />
      )}

      {/* First-Run Organization Wizard */}
      {showFirstRunWizard && (
        <FirstRunWizardModal onComplete={async () => {
          const result = await api.getSettings();
          if (result.status === 200 && result.data) {
            const settings = result.data as any;
            db.setState({ settings, company: { id: 'company-1', name: settings.company_name,
              logo_url: '', created_at: settings.updated_at } });
          }
          setSetupComplete(true);
          navigateTo('dashboard');
        }} />
      )}

      {/* Main Body */}
      {isAuthPage || !currentUser ? (
        <main id="main-content" className="flex-1" tabIndex={-1}>
          {currentView === 'landing' && (
            <LandingView
              onNavigate={navigateTo}
            />
          )}
          {currentView === 'faq' && <FaqView onNavigate={navigateTo} />}
          {currentView === 'login' && (
            <LoginView
              onSuccess={handleLoginSuccess}
              onNavigate={navigateTo}
            />
          )}
          {currentView === 'test-runner' && <TestRunnerView />}
        </main>
      ) : (
        <div className="flex-1 flex">
          {/* Sidebar */}
          <Sidebar
            currentView={currentView}
            onNavigate={navigateTo}
            currentUser={currentUser}
            isOpenMobile={isMobileNavOpen}
            onCloseMobile={() => setIsMobileNavOpen(false)}
          />

          {/* View Container */}
          <main id="main-content" className="flex-1 overflow-x-hidden min-h-[calc(100vh-60px)]" tabIndex={-1}>
            {currentView === 'dashboard' && (
              <DashboardView currentUser={currentUser} onNavigate={navigateTo} />
            )}
            {currentView === 'employees' && <EmployeesView currentUser={currentUser} />}
            {currentView === 'attendance' && <AttendanceView currentUser={currentUser} />}
            {currentView === 'leave' && <LeaveView currentUser={currentUser} />}
            {currentView === 'payroll' && <PayrollView currentUser={currentUser} />}
            {currentView === 'users' && <UsersView currentUser={currentUser} />}
            {currentView === 'settings' && <SettingsView currentUser={currentUser} />}
            {currentView === 'audit-logs' && <AuditLogsView currentUser={currentUser} />}
            {currentView === 'ai-assistant' && <AiAssistantView currentUser={currentUser} />}
            {currentView === 'test-runner' && <TestRunnerView />}
            {currentView === 'faq' && <FaqView onNavigate={navigateTo} />}
          </main>
        </div>
      )}
    </div>
  );
}
