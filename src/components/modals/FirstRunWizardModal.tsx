/**
 * HCM Lite - First-Run Organization Setup Wizard
 * Guides the Superadmin after initial setup (Section 6.1 & 15)
 */

import React, { useState } from 'react';
import { Building2, Clock, MapPin, Check, ArrowRight } from 'lucide-react';
import { api } from '../../services/api';
import { db } from '../../services/db';

interface FirstRunWizardModalProps {
  onComplete: () => void;
}

export const FirstRunWizardModal: React.FC<FirstRunWizardModalProps> = ({ onComplete }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [companyName, setCompanyName] = useState('');
  const [officeStart, setOfficeStart] = useState('09:00');
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [halfDayHours, setHalfDayHours] = useState(5);
  const [officeRadius, setOfficeRadius] = useState(150);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFinish = async () => {
    if (!companyName.trim()) {
      setErrorMsg('Please provide a valid company name.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const res = await api.setupCompany(companyName, {
      office_start: officeStart,
      grace_minutes: Number(graceMinutes),
      half_day_hours: Number(halfDayHours),
      office_radius_m: Number(officeRadius),
    });

    setIsSubmitting(false);

    if (res.status === 200) {
      onComplete();
    } else {
      setErrorMsg(res.error?.message || 'Failed to complete setup.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Step indicator */}
        <div className="bg-slate-900 text-white p-5">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
            <span>First-Run Organization Setup</span>
            <span className="font-mono">Step {step} of 2</span>
          </div>
          <h2 className="text-lg font-bold text-white">
            {step === 1 ? 'Configure Your Organization' : 'Set Attendance & Policy Rules'}
          </h2>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 text-xs bg-red-50 text-red-700 border border-red-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company / Organization Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  This will be shown on employee payslips, system notices, and audit reports.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
                <span className="font-semibold text-slate-700 block">Default Setup Inclusions:</span>
                <p className="text-slate-600">
                  • No example departments or employees: Admin creates real records
                </p>
                <p className="text-slate-600">
                  • 4 Statutory leave types: Annual (14d), Sick (8d), Casual (10d), Unpaid
                </p>
                <p className="text-slate-600">
                  • Holidays are entered by Admin; important actions appear in audit logs
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Continue to Policies
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Office Start Time
                  </label>
                  <input
                    type="time"
                    value={officeStart}
                    onChange={(e) => setOfficeStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Grace Minutes
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={graceMinutes}
                    onChange={(e) => setGraceMinutes(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Half-Day Hours Threshold
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={halfDayHours}
                    onChange={(e) => setHalfDayHours(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Office Geo Radius (meters)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={officeRadius}
                    onChange={(e) => setOfficeRadius(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-600 hover:text-slate-900"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleFinish}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-500 transition-colors shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isSubmitting ? 'Saving...' : 'Complete Setup & Launch'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
