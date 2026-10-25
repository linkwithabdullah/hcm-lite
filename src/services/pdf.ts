/**
 * HCM Lite - Official Payslip PDF Generator
 * Uses jsPDF to generate pixel-perfect downloadable payslips
 */

import { jsPDF } from 'jspdf';
import { Employee, PayrollRun, Payslip } from '../types/hcm';
import { db } from './db';

export function generatePayslipPdf(payslip: Payslip, employee: Employee, run: PayrollRun) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const company = db.getState().company;
  const companyName = company?.name || 'HCM Lite Enterprise Org';

  // Colors
  const darkNavy = [15, 23, 42];
  const mutedGray = [100, 116, 139];
  const borderGray = [226, 232, 240];

  // Header Bar
  doc.setFillColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.rect(0, 0, 210, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(companyName.toUpperCase(), 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('OFFICIAL MONTHLY SALARY STATEMENT', 14, 26);

  doc.setFont('helvetica', 'bold');
  doc.text(`PAY PERIOD: ${run.month}`, 150, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`STATUS: ${run.status.toUpperCase()}`, 150, 26);

  // Employee Information Box
  let y = 48;
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('EMPLOYEE DETAILS', 14, y);

  y += 6;
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, 182, 34, 2, 2, 'FD');

  doc.setFontSize(9);
  doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
  doc.text('Employee Name:', 18, y + 8);
  doc.text('Employee Code:', 18, y + 16);
  doc.text('Designation:', 18, y + 24);

  doc.text('Email Address:', 105, y + 8);
  doc.text('Join Date:', 105, y + 16);
  doc.text('Payslip Reference:', 105, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text(`${employee.first_name} ${employee.last_name}`, 50, y + 8);
  doc.text(employee.code, 50, y + 16);
  const designation = db.getState().designations.find((d) => d.id === employee.designation_id)?.title || 'Staff';
  doc.text(designation, 50, y + 24);

  doc.text(employee.email, 140, y + 8);
  doc.text(employee.join_date, 140, y + 16);
  doc.text(payslip.id.substring(0, 16), 140, y + 24);

  // Attendance & Days Summary
  y += 42;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ATTENDANCE & LEAVE SUMMARY', 14, y);

  y += 6;
  doc.roundedRect(14, y, 182, 22, 2, 2, 'FD');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
  doc.text('Working Days:', 18, y + 8);
  doc.text('Absent Days:', 18, y + 15);
  doc.text('Unpaid Leave:', 75, y + 8);
  doc.text('Half Days:', 75, y + 15);
  doc.text('Late Penalties:', 135, y + 8);
  doc.text('Daily Divisor Rate:', 135, y + 15);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text(`${payslip.working_days}`, 48, y + 8);
  doc.text(`${payslip.absent_days}`, 48, y + 15);
  doc.text(`${payslip.unpaid_days}`, 102, y + 8);
  doc.text(`${payslip.half_days}`, 102, y + 15);
  doc.text(`${payslip.late_penalty_days}`, 168, y + 8);
  doc.text(`$${payslip.breakdown.per_day_rate.toFixed(2)}`, 168, y + 15);

  // Earnings & Deductions Table
  y += 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('EARNINGS & ALLOWANCES', 14, y);
  doc.text('DEDUCTIONS & TAXES', 108, y);

  y += 6;
  // Left table: Earnings
  doc.rect(14, y, 88, 50, 'S');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Basic Salary', 18, y + 10);
  doc.text(`$${payslip.breakdown.basic.toLocaleString()}`, 80, y + 10);

  doc.text('House Rent Allowance (HRA 40%)', 18, y + 20);
  doc.text(`$${payslip.breakdown.hra.toLocaleString()}`, 80, y + 20);

  doc.text('Medical Allowance (10%)', 18, y + 30);
  doc.text(`$${payslip.breakdown.medical.toLocaleString()}`, 80, y + 30);

  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.line(14, y + 38, 102, y + 38);
  doc.setFont('helvetica', 'bold');
  doc.text('GROSS SALARY', 18, y + 45);
  doc.text(`$${payslip.gross.toLocaleString()}`, 80, y + 45);

  // Right table: Deductions
  doc.rect(108, y, 88, 50, 'S');
  doc.setFont('helvetica', 'normal');
  doc.text('Absent & Half-Day Deductions', 112, y + 10);
  doc.text(`-$${payslip.deductions.toFixed(2)}`, 175, y + 10);

  doc.text('Monthly Income Tax (divided by 12)', 112, y + 20);
  doc.text(`-$${payslip.tax.toFixed(2)}`, 175, y + 20);

  doc.text('Annual Gross Computed', 112, y + 30);
  doc.text(`$${payslip.breakdown.annual_gross.toLocaleString()}`, 175, y + 30);

  doc.line(108, y + 38, 196, y + 38);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL DEDUCTIONS', 112, y + 45);
  doc.text(`-$${(payslip.deductions + payslip.tax).toFixed(2)}`, 175, y + 45);

  // Net Pay Highlight Box
  y += 58;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 24, 'F');
  doc.setDrawColor(15, 23, 42);
  doc.rect(14, y, 182, 24, 'S');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text('NET SALARY PAYABLE:', 22, y + 15);

  doc.setFontSize(16);
  doc.setTextColor(22, 163, 74);
  doc.text(`$${payslip.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 130, y + 15);

  // Signatures & Notes
  y += 34;
  doc.setFontSize(8);
  doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Note: This payslip is computer-generated by HCM Lite and does not require a physical signature.',
    14,
    y
  );
  doc.text('All calculations adhere strictly to company policy and statutory tax slabs.', 14, y + 5);

  // Save/Download
  doc.save(`Payslip_${employee.code}_${run.month}.pdf`);
}

/**
 * Generates an official Employee Directory Roster PDF report
 * Formats columns according to RBAC (compensation included for HR & Superadmin only)
 */
export function generateEmployeeRosterPdf(
  employees: Employee[],
  departments: Array<{ id: string; name: string }>,
  designations: Array<{ id: string; title: string }>,
  salaryMap: Record<string, number>,
  isHrOrAdmin: boolean,
  companyName = 'HCM Lite Enterprise'
) {
  const doc = new jsPDF({
    orientation: isHrOrAdmin ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = isHrOrAdmin ? 297 : 210;
  const pageHeight = isHrOrAdmin ? 210 : 297;
  const darkNavy = [15, 23, 42];
  const borderGray = [226, 232, 240];
  const mutedGray = [100, 116, 139];

  let currentPage = 1;

  const renderHeader = () => {
    doc.setFillColor(darkNavy[0], darkNavy[1], darkNavy[2]);
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(companyName.toUpperCase(), 14, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('OFFICIAL EMPLOYEE DIRECTORY & ROSTER REPORT', 14, 20);

    doc.setFontSize(8);
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    doc.text(`GENERATED: ${dateStr} · ROSTER COUNT: ${employees.length}`, pageWidth - 14, 20, { align: 'right' });
  };

  renderHeader();

  let y = 38;

  // Table Column Headers
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.rect(14, y, pageWidth - 28, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);

  if (isHrOrAdmin) {
    doc.text('CODE', 16, y + 5.5);
    doc.text('EMPLOYEE NAME', 38, y + 5.5);
    doc.text('DEPARTMENT', 88, y + 5.5);
    doc.text('DESIGNATION', 135, y + 5.5);
    doc.text('JOIN DATE', 185, y + 5.5);
    doc.text('BASIC SALARY', 225, y + 5.5, { align: 'right' });
    doc.text('GROSS (1.5x)', 275, y + 5.5, { align: 'right' });
  } else {
    doc.text('CODE', 16, y + 5.5);
    doc.text('EMPLOYEE NAME', 40, y + 5.5);
    doc.text('DEPARTMENT', 85, y + 5.5);
    doc.text('DESIGNATION', 125, y + 5.5);
    doc.text('JOIN DATE', 165, y + 5.5);
    doc.text('STATUS', 190, y + 5.5);
  }

  y += 8;

  // Table Data Rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  employees.forEach((emp) => {
    if (y > pageHeight - 20) {
      doc.addPage();
      currentPage++;
      renderHeader();
      y = 38;

      // Re-render header on new page
      doc.setFillColor(241, 245, 249);
      doc.rect(14, y, pageWidth - 28, 8, 'F');
      doc.setFont('helvetica', 'bold');
      if (isHrOrAdmin) {
        doc.text('CODE', 16, y + 5.5);
        doc.text('EMPLOYEE NAME', 38, y + 5.5);
        doc.text('DEPARTMENT', 88, y + 5.5);
        doc.text('DESIGNATION', 135, y + 5.5);
        doc.text('JOIN DATE', 185, y + 5.5);
        doc.text('BASIC SALARY', 225, y + 5.5, { align: 'right' });
        doc.text('GROSS (1.5x)', 275, y + 5.5, { align: 'right' });
      } else {
        doc.text('CODE', 16, y + 5.5);
        doc.text('EMPLOYEE NAME', 40, y + 5.5);
        doc.text('DEPARTMENT', 85, y + 5.5);
        doc.text('DESIGNATION', 125, y + 5.5);
        doc.text('JOIN DATE', 165, y + 5.5);
        doc.text('STATUS', 190, y + 5.5);
      }
      y += 8;
      doc.setFont('helvetica', 'normal');
    }

    const deptName = departments.find((d) => d.id === emp.department_id)?.name || 'General';
    const desTitle = designations.find((d) => d.id === emp.designation_id)?.title || 'Staff';
    const basic = salaryMap[emp.id] || 0;
    const gross = basic * 1.5;

    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.line(14, y + 7, pageWidth - 14, y + 7);

    doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
    if (isHrOrAdmin) {
      doc.setFont('helvetica', 'bold');
      doc.text(emp.code, 16, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.text(`${emp.first_name} ${emp.last_name}`, 38, y + 5);
      doc.text(deptName, 88, y + 5);
      doc.text(desTitle, 135, y + 5);
      doc.text(emp.join_date, 185, y + 5);
      doc.text(`$${basic.toLocaleString()}`, 225, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(`$${gross.toLocaleString()}`, 275, y + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text(emp.code, 16, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.text(`${emp.first_name} ${emp.last_name}`, 40, y + 5);
      doc.text(deptName, 85, y + 5);
      doc.text(desTitle, 125, y + 5);
      doc.text(emp.join_date, 165, y + 5);
      doc.text(emp.status.toUpperCase(), 190, y + 5);
    }

    y += 8;
  });

  // Footer Note
  y += 6;
  if (y < pageHeight - 15) {
    doc.setFontSize(7);
    doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
    doc.text(
      `Confidential: For internal HCM administrative use only. Page ${currentPage}`,
      14,
      pageHeight - 8
    );
  }

  doc.save(`Employee_Directory_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Generates an executive Monthly Payroll Run Summary PDF report
 */
export function generatePayrollRunSummaryPdf(
  run: PayrollRun,
  payslips: Array<Payslip & { employee: Employee }>,
  companyName = 'HCM Lite Enterprise'
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const darkNavy = [15, 23, 42];
  const borderGray = [226, 232, 240];
  const mutedGray = [100, 116, 139];

  // Header Bar
  doc.setFillColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(companyName.toUpperCase(), 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`MONTHLY PAYROLL SUMMARY STATEMENT · PERIOD: ${run.month}`, 14, 20);

  doc.setFont('helvetica', 'bold');
  doc.text(`STATUS: ${run.status.toUpperCase()}`, pageWidth - 14, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`TOTAL EMPLOYEES: ${payslips.length}`, pageWidth - 14, 21, { align: 'right' });

  // Top KPI Overview Box
  let y = 35;
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y, pageWidth - 28, 18, 2, 2, 'FD');

  const totalGross = payslips.reduce((s, p) => s + p.gross, 0);
  const totalDeductions = payslips.reduce((s, p) => s + p.deductions, 0);
  const totalTax = payslips.reduce((s, p) => s + p.tax, 0);
  const totalNet = payslips.reduce((s, p) => s + p.net, 0);

  doc.setFontSize(8);
  doc.setTextColor(mutedGray[0], mutedGray[1], mutedGray[2]);
  doc.text('TOTAL GROSS SALARIES:', 20, y + 7);
  doc.text('TOTAL DEDUCTIONS:', 90, y + 7);
  doc.text('TOTAL INCOME TAX (WITHHELD):', 160, y + 7);
  doc.text('TOTAL NET DISBURSED:', 230, y + 7);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text(`$${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 20, y + 14);
  doc.setTextColor(220, 38, 38);
  doc.text(`-$${totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 90, y + 14);
  doc.setTextColor(180, 83, 9);
  doc.text(`-$${totalTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 160, y + 14);
  doc.setTextColor(22, 163, 74);
  doc.text(`$${totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 230, y + 14);

  // Table Column Header
  y += 24;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.rect(14, y, pageWidth - 28, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text('CODE', 16, y + 5.5);
  doc.text('EMPLOYEE NAME', 38, y + 5.5);
  doc.text('BASIC', 95, y + 5.5, { align: 'right' });
  doc.text('GROSS', 125, y + 5.5, { align: 'right' });
  doc.text('ABSENT/HALF', 160, y + 5.5, { align: 'center' });
  doc.text('DEDUCTIONS', 195, y + 5.5, { align: 'right' });
  doc.text('MONTHLY TAX', 235, y + 5.5, { align: 'right' });
  doc.text('NET PAYABLE', 275, y + 5.5, { align: 'right' });

  y += 8;

  // Table Rows
  doc.setFont('helvetica', 'normal');
  payslips.forEach((ps) => {
    if (y > pageHeight - 25) {
      doc.addPage();
      y = 20;
    }

    doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
    doc.line(14, y + 7, pageWidth - 14, y + 7);

    doc.setFont('helvetica', 'bold');
    doc.text(ps.employee.code, 16, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(`${ps.employee.first_name} ${ps.employee.last_name}`, 38, y + 5);
    doc.text(`$${ps.breakdown.basic.toLocaleString()}`, 95, y + 5, { align: 'right' });
    doc.text(`$${ps.gross.toLocaleString()}`, 125, y + 5, { align: 'right' });
    doc.text(`${ps.absent_days}d / ${ps.half_days}h`, 160, y + 5, { align: 'center' });
    doc.setTextColor(220, 38, 38);
    doc.text(`-$${ps.deductions.toFixed(2)}`, 195, y + 5, { align: 'right' });
    doc.setTextColor(180, 83, 9);
    doc.text(`-$${ps.tax.toFixed(2)}`, 235, y + 5, { align: 'right' });
    doc.setTextColor(22, 163, 74);
    doc.setFont('helvetica', 'bold');
    doc.text(`$${ps.net.toFixed(2)}`, 275, y + 5, { align: 'right' });

    doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
    doc.setFont('helvetica', 'normal');
    y += 8;
  });

  // Grand Totals Summary Row
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setDrawColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.rect(14, y, pageWidth - 28, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('ORGANIZATIONAL GRAND TOTALS', 16, y + 5.5);
  doc.text(`$${totalGross.toLocaleString()}`, 125, y + 5.5, { align: 'right' });
  doc.setTextColor(220, 38, 38);
  doc.text(`-$${totalDeductions.toFixed(2)}`, 195, y + 5.5, { align: 'right' });
  doc.setTextColor(180, 83, 9);
  doc.text(`-$${totalTax.toFixed(2)}`, 235, y + 5.5, { align: 'right' });
  doc.setTextColor(22, 163, 74);
  doc.text(`$${totalNet.toFixed(2)}`, 275, y + 5.5, { align: 'right' });

  doc.save(`Payroll_Run_${run.month}_Report.pdf`);
}

/**
 * Generates an all-time historical Payroll Summary PDF across all runs
 */
export function generateAllPayrollSummaryPdf(
  runs: PayrollRun[],
  companyName = 'HCM Lite Enterprise'
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const darkNavy = [15, 23, 42];
  const borderGray = [226, 232, 240];

  doc.setFillColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.rect(0, 0, pageWidth, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(companyName.toUpperCase(), 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('ORGANIZATIONAL PAYROLL OVERVIEW & TREND REPORT', 14, 20);

  let y = 38;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
  doc.rect(14, y, pageWidth - 28, 8, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
  doc.text('PERIOD', 16, y + 5.5);
  doc.text('STATUS', 50, y + 5.5);
  doc.text('TOTAL GROSS', 110, y + 5.5, { align: 'right' });
  doc.text('TOTAL NET', 150, y + 5.5, { align: 'right' });
  doc.text('FINALIZED DATE', 190, y + 5.5, { align: 'right' });

  y += 8;
  doc.setFont('helvetica', 'normal');

  runs.forEach((r) => {
    doc.line(14, y + 7, pageWidth - 14, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.text(r.month, 16, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(r.status.toUpperCase(), 50, y + 5);
    doc.text(`$${r.total_gross.toLocaleString()}`, 110, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(22, 163, 74);
    doc.text(`$${r.total_net.toLocaleString()}`, 150, y + 5, { align: 'right' });
    doc.setTextColor(darkNavy[0], darkNavy[1], darkNavy[2]);
    doc.setFont('helvetica', 'normal');
    doc.text(r.finalized_at ? new Date(r.finalized_at).toLocaleDateString() : 'Draft Mode', 190, y + 5, { align: 'right' });
    y += 8;
  });

  doc.save(`Payroll_Executive_Summary_${new Date().toISOString().split('T')[0]}.pdf`);
}

