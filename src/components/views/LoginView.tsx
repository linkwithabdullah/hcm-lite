/**
 * HCM Lite - Sign In Screen
 * Enforces failed login lockout, live error feedback, and quick role switcher for testing (Section 2.1, 2.3, 8.1)
 */

import React, { useState } from 'react';
import { Lock, User as UserIcon, ShieldAlert, ArrowRight, Sparkles, Eye, EyeOff } from 'lucide-react';
import { api } from '../../services/api';
import { DEFAULT_SUPERADMIN_USERNAME } from '../../services/db';
import { User } from '../../types/hcm';

interface LoginViewProps {
  onSuccess: (user: User) => void;
  onNavigate: (view: string) => void;
  onOpenQuickDemo?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSuccess, onNavigate }) => {
  const [identifier, setIdentifier] = useState(DEFAULT_SUPERADMIN_USERNAME);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);

    const res = await api.login(identifier, password);
    setIsSubmitting(false);

    if (res.status === 200 && res.data) {
      onSuccess(res.data.user);
    } else {
      setErrorMsg(res.error?.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <button
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
        >
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-lg">
            H
          </div>
          <span className="text-xl font-extrabold text-slate-900 tracking-tight">HCM Lite</span>
        </button>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Sign in to your organization
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Enter your employee or administrator account credentials
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-xl sm:px-10">
          {errorMsg && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-xs text-red-700">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Authentication Failed</span>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username or Email
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. superadmin or email"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying...' : 'Sign In'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
            Sign in with the administrator credentials configured privately during deployment.
            Employee passwords are provided securely by HR and must be changed on first login.
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => onNavigate('faq')}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Need help? Read our Operations and Security FAQ
          </button>
        </div>
      </div>
    </div>
  );
};
