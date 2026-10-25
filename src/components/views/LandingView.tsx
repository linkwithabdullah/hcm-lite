/**
 * HCM Lite - Public Landing & Architecture Overview
 * Section 10: SEO from a Human Perspective (Search-friendly, WCAG AA, semantic hierarchy)
 */

import React from 'react';
import {
  ShieldCheck,
  Clock,
  CalendarDays,
  CreditCard,
  Bot,
  FileCheck2,
  Lock,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Cpu,
  Layers,
} from 'lucide-react';

interface LandingViewProps {
  onNavigate: (view: string) => void;
  onOpenQuickDemo?: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white border-b border-slate-200 pt-16 pb-20 px-6 sm:px-12">
        <div className="max-w-5xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700">
            <span>Hackathon Release v1.0</span>
            <span aria-hidden="true">·</span>
            <span>Zero Dummy Data by Default</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight">
            AI-Assisted Human Capital Management for Modern Teams
          </h1>

          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed">
            A production-ready HR operations platform with built-in Superadmin access control,
            geofenced attendance, automated tax slab payroll, and an AI assistant grounded in real database truth.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={() => onNavigate('login')}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors"
            >
              Sign In to Organization
              <ArrowRight className="w-4 h-4" />
            </button>


            <button
              onClick={() => onNavigate('test-runner')}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Run 30 System Tests
            </button>
          </div>

          {/* Key Metric Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-10 border-t border-slate-100 text-left">
            <div className="p-4 bg-slate-50/60 rounded-lg">
              <span className="text-2xl font-bold font-mono text-slate-900">4 Roles</span>
              <p className="text-xs text-slate-500 mt-1">Superadmin, Admin, HR, Employee</p>
            </div>
            <div className="p-4 bg-slate-50/60 rounded-lg">
              <span className="text-2xl font-bold font-mono text-slate-900">7 AI Tools</span>
              <p className="text-xs text-slate-500 mt-1">Strict role-scoped database tools</p>
            </div>
            <div className="p-4 bg-slate-50/60 rounded-lg">
              <span className="text-2xl font-bold font-mono text-slate-900">5 Slabs</span>
              <p className="text-xs text-slate-500 mt-1">Statutory annual income tax tiers</p>
            </div>
            <div className="p-4 bg-slate-50/60 rounded-lg">
              <span className="text-2xl font-bold font-mono text-slate-900">100%</span>
              <p className="text-xs text-slate-500 mt-1">Append-only audit log coverage</p>
            </div>
          </div>
        </div>
      </section>

      {/* Core Architectural Pillars */}
      <section className="py-16 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-2xl font-bold text-slate-900">Architected for Real Operations</h2>
          <p className="text-sm text-slate-600 mt-2">
            Every rule is enforced on the server. Buttons are not just hidden; unauthorized requests receive strict 401, 403, 409, or 422 HTTP responses.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Built-in Superadmin & RBAC</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Default superadmin seeded once on first boot with bcrypt cost 12. Forced password change on first login.
              Guarded against last-superadmin deletion or lockout.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Attendance & Haversine Geofencing</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Office start at 09:00 with a 15-minute grace period. Camera check-in with facial verification and Haversine
              GPS distance validation within the 150m radius.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Automated Multi-Slab Payroll</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Computes basic, 40% HRA, 10% medical allowances, working-day divisors, absence/half-day penalties,
              and monthly tax from statutory annual slabs. Downloadable PDF payslips.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">AI Assistant Grounded in Truth</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              7 named tools run the same services as the REST API. Scoped permissions guarantee employees cannot inspect
              peer salaries (polite refusal). Supports Roman Urdu natively.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CalendarDays className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Working-Day Leave Quotas</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Skips weekends and official calendar holidays automatically. Strictly rejects overlapping requests (422)
              and over-balance submissions.
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Append-Only Audit Trail</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Every Superadmin action, login event, password change, and payroll finalization is recorded with actor ID,
              role, timestamp, IP, and before/after JSON diffs.
            </p>
          </div>
        </div>
      </section>

      {/* SEO & Public Help Link */}
      <section className="bg-slate-900 text-white py-12 px-6 sm:px-12">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <h3 className="text-lg font-bold">Have Questions About Policies or Calculations?</h3>
            <p className="text-xs text-slate-400 mt-1">
              Read our public documentation covering tax slabs, grace times, leave policies, and security controls.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('faq')}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Read Help & FAQ
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="px-4 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors"
            >
              Sign In Now
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
