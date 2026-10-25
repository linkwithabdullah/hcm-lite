/**
 * HCM Lite - Payroll Management & Payslip Generation
 * Implements Section 4.4, 5.4, 6.7: Draft, Recalculate, Finalize Lock, Tax slabs, PDF generation
 */

import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Lock,
  Download,
  Eye,
  CheckCircle,
  AlertCircle,
  X,
  FileText,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { Department, Employee, PayrollRun, Payslip, Role, User } from '../../types/hcm';
import { api } from '../../services/api';
import {
  generatePayslipPdf,
  generatePayrollRunSummaryPdf,
  generateAllPayrollSummaryPdf,
} from '../../services/pdf';
import { db } from '../../services/db';

interface PayrollViewProps {
  currentUser: User;
}

export const PayrollView: React.FC<PayrollViewProps> = ({ currentUser }) => {
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [myPayslips, setMyPayslips] = useState<Array<Payslip & { run: PayrollRun }>>([]);
  const [selectedRunDetails, setSelectedRunDetails] = useState<{
    run: PayrollRun;
    payslips: Array<Payslip & { employee: Employee }>;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New run modal
  const [isNewRunModalOpen, setIsNewRunModalOpen] = useState(false);
  const [runMonth, setRunMonth] = useState(new Date().toISOString().substring(0, 7));
  const [runDept, setRunDept] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);

  const isEmployeeOnly = currentUser.role === 'EMPLOYEE';
  const canDraft = currentUser.role === 'SUPERADMIN' || currentUser.role === 'HR';
  const canFinalize = currentUser.role === 'SUPERADMIN' || currentUser.role === 'ADMIN';

  const loadPayroll = async () => {
    setIsLoading(true);
    if (!isEmployeeOnly) {
      const runsRes = await api.getPayrollRuns();
      if (runsRes.status === 200 && runsRes.data) {
        setRuns(runsRes.data);
      }
      const deptRes = await api.getDepartments();
      if (deptRes.status === 200 && deptRes.data) {
        setDepartments(deptRes.data);
      }
    }

    if (currentUser.employee_id) {
      const myRes = await api.getMyPayslips();
      if (myRes.status === 200 && myRes.data) {
        setMyPayslips(myRes.data as any);
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadPayroll();
    const unsub = db.subscribe(() => {
      loadPayroll();
    });
    return unsub;
  }, [currentUser]);

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const res = await api.createPayrollRun(runMonth, runDept || undefined);
    if (res.status === 201) {
      setIsNewRunModalOpen(false);
      setMessage({
        type: 'success',
        text: `Payroll draft created for ${runMonth} (${(res.data as any)?.employee_count || ''} payslips computed).`,
      });
      loadPayroll();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to generate payroll.' });
    }
  };

  const handleOpenRun = async (runId: string) => {
    const res = await api.getPayrollRunDetails(runId);
    if (res.status === 200 && res.data) {
      setSelectedRunDetails(res.data);
    }
  };

  const handleFinalizeRun = async (runId: string) => {
    setMessage(null);
    const res = await api.finalizePayrollRun(runId);
    if (res.status === 200) {
      setMessage({
        type: 'success',
        text: 'Payroll finalized and locked! No further modifications permitted.',
      });
      if (selectedRunDetails) {
        handleOpenRun(runId);
      }
      loadPayroll();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to finalize payroll.' });
    }
  };

  const handleDownloadPdf = (payslip: Payslip, employee: Employee, run: PayrollRun) => {
    generatePayslipPdf(payslip, employee, run);
  };

  const handleExportAllRunsCsv = () => {
    if (runs.length === 0) {
      setMessage({ type: 'error', text: 'No payroll runs recorded to export.' });
      return;
    }
    const headers = ['Period Month', 'Status', 'Total Gross ($)', 'Total Net ($)', 'Created Date', 'Finalized Date'];
    const rows = runs.map((r) => [
      `"${r.month}"`,
      `"${r.status.toUpperCase()}"`,
      r.total_gross.toFixed(2),
      r.total_net.toFixed(2),
      `"${r.created_at}"`,
      r.finalized_at ? `"${r.finalized_at}"` : '"Draft"',
    ]);
    const csvStr = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payroll_Overview_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setMessage({ type: 'success', text: `Exported ${runs.length} payroll run record(s) to CSV.` });
  };

  const handleExportAllRunsPdf = () => {
    if (runs.length === 0) {
      setMessage({ type: 'error', text: 'No payroll runs recorded to export.' });
      return;
    }
    const companyName = db.getState().company?.name || 'HCM Lite Enterprise';
    generateAllPayrollSummaryPdf(runs, companyName);
    setMessage({ type: 'success', text: `Generated and downloaded Payroll Overview PDF report.` });
  };

  const handleExportSingleRunCsv = () => {
    if (!selectedRunDetails) return;
    const { run, payslips } = selectedRunDetails;
    const headers = [
      'Employee Code',
      'First Name',
      'Last Name',
      'Basic Salary ($)',
      'HRA 40% ($)',
      'Medical 10% ($)',
      'Gross Salary ($)',
      'Working Days',
      'Absent Days',
      'Half Days',
      'Deductions ($)',
      'Monthly Income Tax ($)',
      'Net Salary Payable ($)',
    ];

    const rows = payslips.map((ps) => [
      `"${ps.employee.code}"`,
      `"${ps.employee.first_name}"`,
      `"${ps.employee.last_name}"`,
      ps.breakdown.basic.toFixed(2),
      ps.breakdown.hra.toFixed(2),
      ps.breakdown.medical.toFixed(2),
      ps.gross.toFixed(2),
      ps.working_days,
      ps.absent_days,
      ps.half_days,
      ps.deductions.toFixed(2),
      ps.tax.toFixed(2),
      ps.net.toFixed(2),
    ]);

    // Totals row
    const totalBasic = payslips.reduce((s, p) => s + p.breakdown.basic, 0);
    const totalHra = payslips.reduce((s, p) => s + p.breakdown.hra, 0);
    const totalMed = payslips.reduce((s, p) => s + p.breakdown.medical, 0);
    const totalGross = payslips.reduce((s, p) => s + p.gross, 0);
    const totalDeductions = payslips.reduce((s, p) => s + p.deductions, 0);
    const totalTax = payslips.reduce((s, p) => s + p.tax, 0);
    const totalNet = payslips.reduce((s, p) => s + p.net, 0);

    const totalsRow = [
      '"TOTALS"',
      '""',
      '""',
      totalBasic.toFixed(2),
      totalHra.toFixed(2),
      totalMed.toFixed(2),
      totalGross.toFixed(2),
      '""',
      '""',
      '""',
      totalDeductions.toFixed(2),
      totalTax.toFixed(2),
      totalNet.toFixed(2),
    ];

    const csvStr = [headers.join(','), ...rows.map((r) => r.join(',')), totalsRow.join(',')].join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payroll_Run_${run.month}_Detailed_Breakdown.csv`;
    a.click();
    setMessage({ type: 'success', text: `Exported ${run.month} detailed payroll breakdown to CSV.` });
  };

  const handleExportSingleRunPdf = () => {
    if (!selectedRunDetails) return;
    const companyName = db.getState().company?.name || 'HCM Lite Enterprise';
    generatePayrollRunSummaryPdf(selectedRunDetails.run, selectedRunDetails.payslips, companyName);
    setMessage({ type: 'success', text: `Generated and downloaded ${selectedRunDetails.run.month} Payroll Summary PDF.` });
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Payroll & Compensation
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Automated statutory tax slabs · Absence & half-day deductions · PDF payslips
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isEmployeeOnly && runs.length > 0 && (
            <>
              <button
                onClick={handleExportAllRunsCsv}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" />
                Export Overview (CSV)
              </button>

              <button
                onClick={handleExportAllRunsPdf}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <FileText className="w-3.5 h-3.5 text-slate-600" />
                Export Overview (PDF)
              </button>
            </>
          )}

          {canDraft && (
            <button
              onClick={() => setIsNewRunModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Monthly Payroll Run
            </button>
          )}
        </div>
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

      {/* Employee Personal Payslips */}
      {isEmployeeOnly && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-semibold text-slate-800 text-xs">
            My Salary Payslips
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4">Pay Period</th>
                <th className="py-3 px-4">Gross Salary</th>
                <th className="py-3 px-4">Deductions</th>
                <th className="py-3 px-4">Income Tax</th>
                <th className="py-3 px-4">Net Payable</th>
                <th className="py-3 px-4 text-right">Download PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {myPayslips.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No payslips generated for your profile yet.
                  </td>
                </tr>
              ) : (
                myPayslips.map((ps) => {
                  const emp = db.getState().employees.find((e) => e.id === ps.employee_id)!;
                  return (
                    <tr key={ps.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{ps.run.month}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-800">${ps.gross.toLocaleString()}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-rose-600">-${ps.deductions.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-amber-700">-${ps.tax.toFixed(2)}</td>
                      <td className="py-3 px-4 font-mono tabular-nums font-bold text-emerald-700">
                        ${ps.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleDownloadPdf(ps, emp, ps.run)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF Payslip
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Organization Payroll Runs Table (Admin / HR) */}
      {!isEmployeeOnly && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 font-semibold text-slate-800 text-xs">
            Organizational Payroll Runs
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4">Month</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Total Gross</th>
                <th className="py-3 px-4">Total Net</th>
                <th className="py-3 px-4">Created Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No payroll runs recorded. Click "Create Monthly Payroll Run" to generate one.
                  </td>
                </tr>
              ) : (
                runs.map((r) => {
                  const isLocked = r.status === 'finalized';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{r.month}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold capitalize inline-flex items-center gap-1 ${
                            isLocked ? 'text-slate-700' : 'text-amber-700'
                          }`}
                        >
                          {isLocked && <Lock className="w-3 h-3" />}
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-800">
                        ${r.total_gross.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums font-bold text-emerald-700">
                        ${r.total_net.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono">
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenRun(r.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                        >
                          View Slips ({db.getState().payslips.filter((p) => p.run_id === r.id).length})
                        </button>

                        {canFinalize && !isLocked && (
                          <button
                            onClick={() => handleFinalizeRun(r.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                          >
                            Lock & Finalize
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
      )}

      {/* Selected Run Details Modal / Drawer */}
      {selectedRunDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-xl border border-slate-200 flex flex-col overflow-hidden text-xs">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold text-slate-900">
                  Payroll Run: {selectedRunDetails.run.month} ({selectedRunDetails.run.status.toUpperCase()})
                </h2>
                {selectedRunDetails.run.status === 'finalized' && (
                  <span className="text-[11px] font-mono text-slate-600 bg-slate-200/70 px-2 py-0.5 rounded">
                    LOCKED
                  </span>
                )}
              </div>
              <button onClick={() => setSelectedRunDetails(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200 font-mono">
                <div>
                  <span className="text-[11px] text-slate-500 block">Total Gross</span>
                  <span className="font-bold text-slate-900">${selectedRunDetails.run.total_gross.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Total Net</span>
                  <span className="font-bold text-emerald-700">${selectedRunDetails.run.total_net.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Status</span>
                  <span className="capitalize text-slate-800">{selectedRunDetails.run.status}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Finalized By</span>
                  <span className="text-slate-800">{selectedRunDetails.run.finalized_by ? 'Admin/Superadmin' : 'Pending'}</span>
                </div>
              </div>

              <table className="w-full text-left">
                <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Basic</th>
                    <th className="py-2.5 px-3">Gross</th>
                    <th className="py-2.5 px-3">Absent/Half</th>
                    <th className="py-2.5 px-3">Deductions</th>
                    <th className="py-2.5 px-3">Tax</th>
                    <th className="py-2.5 px-3">Net</th>
                    <th className="py-2.5 px-3 text-right">PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedRunDetails.payslips.map((ps) => (
                    <tr key={ps.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 block">{ps.employee.first_name} {ps.employee.last_name}</span>
                        <span className="font-mono text-[10px] text-slate-500">{ps.employee.code}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">${ps.breakdown.basic.toLocaleString()}</td>
                      <td className="py-2.5 px-3 font-mono font-medium">${ps.gross.toLocaleString()}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">{ps.absent_days}d / {ps.half_days}h</td>
                      <td className="py-2.5 px-3 font-mono text-rose-600">-${ps.deductions.toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-mono text-amber-700">-${ps.tax.toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">${ps.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDownloadPdf(ps, ps.employee, selectedRunDetails.run)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                          title="Download Payslip PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
              <span className="text-[11px] text-slate-500">
                Formula: Gross = Basic + 40% HRA + 10% Medical · Monthly Tax = Annual Tax / 12
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportSingleRunCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Run (CSV)
                </button>

                <button
                  type="button"
                  onClick={handleExportSingleRunPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  Export Run (PDF)
                </button>

                {canFinalize && selectedRunDetails.run.status === 'draft' && (
                  <button
                    onClick={() => handleFinalizeRun(selectedRunDetails.run.id)}
                    className="px-4 py-1.5 font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    Lock & Finalize Run
                  </button>
                )}
                <button
                  onClick={() => setSelectedRunDetails(null)}
                  className="px-3 py-1.5 text-slate-700 hover:text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Run Modal */}
      {isNewRunModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Generate Monthly Payroll Run</h2>
              <button onClick={() => setIsNewRunModalOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateRun} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Month (YYYY-MM) *</label>
                <input
                  type="month"
                  required
                  value={runMonth}
                  onChange={(e) => setRunMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Department Scope (optional)</label>
                <select
                  value={runDept}
                  onChange={(e) => setRunDept(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                >
                  <option value="">All Departments (Entire Organization)</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewRunModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Calculate & Create Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
