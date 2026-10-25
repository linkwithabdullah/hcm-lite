/**
 * HCM Lite - Public Help & Frequently Asked Questions (FAQ)
 * Section 10: Human-friendly documentation for SEO and operations
 */

import React from 'react';
import { ArrowLeft, HelpCircle, Shield, Clock, Calculator, Lock } from 'lucide-react';

interface FaqViewProps {
  onNavigate: (view: string) => void;
}

export const FaqView: React.FC<FaqViewProps> = ({ onNavigate }) => {
  const faqs = [
    {
      question: 'How do I sign in as the first administrator?',
      answer:
        'The first administrator username and private password are configured via ADMIN_USERNAME and ADMIN_PASSWORD on the server. Contact the deployer for the credentials; the administrator is required to change the password after first login.',
      category: 'Security & Access',
    },
    {
      question: 'How is attendance status determined?',
      answer:
        'Standard office hours start at 09:00 with a 15-minute grace period. Anyone checking in at or before 09:15 is marked "Present". Anyone checking in after 09:15 is stamped "Late". If an employee checks out with less than 5 hours of total worked time, the status automatically converts to "Half Day". Server timestamps are authoritative—the client never supplies the time.',
      category: 'Attendance',
    },
    {
      question: 'How does the automated payroll calculation work?',
      answer:
        'Gross salary is calculated as Basic Salary + 40% HRA + 10% Medical Allowance (equal to 1.5 × Basic). The daily salary divisor is the number of actual working days in the month (excluding weekends and official company holidays). Deductions equal: Absent days + Unpaid leave days + 0.5 × Half days. Monthly tax is computed by projecting annual gross (Gross × 12), applying statutory annual tax slabs, and dividing by 12.',
      category: 'Payroll & Tax',
    },
    {
      question: 'What are the annual statutory tax slabs applied in HCM Lite?',
      answer:
        '• Up to $600,000: 0% tax\n• $600,001 to $1,200,000: 5% of amount above $600,000\n• $1,200,001 to $2,400,000: $30,000 + 15% of amount above $1,200,000\n• $2,400,001 to $3,600,000: $210,000 + 25% of amount above $2,400,000\n• Above $3,600,000: $510,000 + 35% of amount above $3,600,000',
      category: 'Payroll & Tax',
    },
    {
      question: 'How does the AI Assistant protect privacy?',
      answer:
        'The AI assistant executes with the exact role and employee ID of the authenticated user. It never queries the raw database directly; it invokes named, permission-scoped tools. If an employee asks the assistant for a colleague\'s salary or company financial aggregates, the AI politely refuses with: "I can\'t share other employees\' salaries."',
      category: 'AI Assistant',
    },
    {
      question: 'Can the last remaining Superadmin be deactivated or demoted?',
      answer:
        'No. HCM Lite includes a strict Last-Superadmin guard. Any API request attempting to deactivate, demote, or delete the final active Superadmin is rejected with HTTP 409 Conflict to protect the organization against accidental system lockout.',
      category: 'Security & Access',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-6 sm:px-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <button
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
            Frequently Asked Questions & Policy Guide
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Clear, authoritative explanations of HCM Lite calculations, access models, and operational policies.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div key={index} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                <span>{faq.category}</span>
                <span className="font-mono">#{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h2 className="text-base font-bold text-slate-900">{faq.question}</h2>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
