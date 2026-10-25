/**
 * HCM Lite - Mandatory Password Change Modal
 * Enforced on first login when must_change_password = true (Section 2.1, 2.3, 8.4)
 */

import React, { useState } from 'react';
import { Lock, ShieldAlert, Check, X, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { validatePassword } from '../../services/rules';

interface ForcePasswordChangeModalProps {
  username: string;
  isSystemDefault: boolean;
  onSuccess: () => void;
  onLogout: () => void;
}

export const ForcePasswordChangeModal: React.FC<ForcePasswordChangeModalProps> = ({
  username,
  isSystemDefault,
  onSuccess,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live password validation check
  const validation = validatePassword(newPassword, username, currentPassword);

  const checks = [
    { label: 'At least 8 characters (max 72)', valid: newPassword.length >= 8 && newPassword.length <= 72 },
    { label: 'At least one letter (a-z, A-Z)', valid: /[a-zA-Z]/.test(newPassword) },
    { label: 'At least one number (0-9)', valid: /[0-9]/.test(newPassword) },
    { label: 'At least one special symbol (!@#$%^&*)', valid: /[^a-zA-Z0-9]/.test(newPassword) },
    { label: 'Must differ from username', valid: newPassword.length > 0 && newPassword.toLowerCase() !== username.toLowerCase() },
  ];

  const allValid = checks.every((c) => c.valid) && newPassword === confirmPassword && currentPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrorMsg('New password and confirmation do not match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await api.changePassword(currentPassword, newPassword);
    setIsSubmitting(false);

    if (res.status === 200) {
      onSuccess();
    } else {
      setErrorMsg(res.error?.message || 'Failed to update password.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header Banner */}
        <div className="bg-amber-500/10 border-b border-amber-200/60 p-5 flex items-start gap-3.5">
          <div className="p-2 bg-amber-500/20 text-amber-700 rounded-lg shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Password Change Required
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              {isSystemDefault
                ? 'Set a new private password before accessing the system.'
                : 'Your temporary password has expired. Please choose a new secure password to continue.'}
            </p>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new strong password"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Confirm New Password <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </div>

          {/* Live Validation Checklist */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-600 block mb-1">
              Password Security Policy:
            </span>
            {checks.map((check, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                {check.valid ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <X className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                )}
                <span className={check.valid ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                  {check.label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Sign out instead
            </button>

            <button
              type="submit"
              disabled={!allValid || isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? 'Updating...' : 'Set Password & Enter'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
