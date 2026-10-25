/**
 * HCM Lite - Business Rules & Calculation Engine
 * Implements Section 5 & Section 8 of the System Design and Build Document
 */

import { Holiday, Settings } from '../types/hcm';

/**
 * Calculates Haversine distance between two GPS coordinates in meters
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Checks whether a given YYYY-MM-DD date is a working day (not a weekend and not a holiday)
 */
export function isWorkingDay(
  dateStr: string,
  holidays: Holiday[] = [],
  weekendDays: string[] = ['Sat', 'Sun']
): boolean {
  const date = new Date(dateStr + 'T00:00:00');
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

  if (weekendDays.includes(dayName)) {
    return false;
  }

  const isHoliday = holidays.some((h) => h.date === dateStr);
  return !isHoliday;
}

/**
 * Counts working days in a date range (inclusive), skipping weekends and holidays
 */
export function countWorkingDays(
  startDateStr: string,
  endDateStr: string,
  holidays: Holiday[] = [],
  weekendDays: string[] = ['Sat', 'Sun']
): number {
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');

  if (start > end) return 0;

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, '0');
    const dd = String(current.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (isWorkingDay(dateStr, holidays, weekendDays)) {
      count++;
    }

    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Counts total working days in a given calendar month (YYYY-MM)
 */
export function getMonthWorkingDays(
  monthStr: string,
  holidays: Holiday[] = [],
  weekendDays: string[] = ['Sat', 'Sun']
): number {
  const [yearStr, mStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10); // 1-indexed

  const daysInMonth = new Date(year, month, 0).getDate();
  const startDateStr = `${yearStr}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${yearStr}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  return countWorkingDays(startDateStr, endDateStr, holidays, weekendDays);
}

/**
 * Evaluates attendance status on check-in based on office start and grace period
 */
export function evaluateCheckInStatus(
  checkInTime: Date,
  officeStartStr = '09:00',
  graceMinutes = 15
): 'present' | 'late' {
  const [startHour, startMin] = officeStartStr.split(':').map(Number);
  const cutoffMinutes = startHour * 60 + startMin + graceMinutes;

  const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
  return checkInMinutes > cutoffMinutes ? 'late' : 'present';
}

/**
 * Computes worked minutes and updates status upon checkout
 */
export function evaluateCheckOutStatus(
  checkInDate: Date,
  checkOutDate: Date,
  initialStatus: 'present' | 'late',
  halfDayHours = 5
): { status: 'present' | 'late' | 'half_day'; workedMinutes: number } {
  const diffMs = checkOutDate.getTime() - checkInDate.getTime();
  const workedMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  const workedHours = workedMinutes / 60;

  if (workedHours < halfDayHours) {
    return { status: 'half_day', workedMinutes };
  }

  return { status: initialStatus, workedMinutes };
}

/**
 * Annual Tax Slab calculation per Section 5.4:
 * 0 to 600,000: 0
 * 600,001 to 1,200,000: 5% of amount above 600,000
 * 1,200,001 to 2,400,000: 30,000 + 15% of amount above 1,200,000
 * 2,400,001 to 3,600,000: 210,000 + 25% of amount above 2,400,000
 * Above 3,600,000: 510,000 + 35% of amount above 3,600,000
 */
export function calculateAnnualTax(annualGross: number): number {
  if (annualGross <= 600000) {
    return 0;
  } else if (annualGross <= 1200000) {
    return (annualGross - 600000) * 0.05;
  } else if (annualGross <= 2400000) {
    return 30000 + (annualGross - 1200000) * 0.15;
  } else if (annualGross <= 3600000) {
    return 210000 + (annualGross - 2400000) * 0.25;
  } else {
    return 510000 + (annualGross - 3600000) * 0.35;
  }
}

/**
 * Calculates complete payslip metrics for an employee for a specific month
 */
export interface PayrollCalculationInput {
  basic: number;
  monthStr: string; // YYYY-MM
  holidays: Holiday[];
  weekendDays: string[];
  absentDays: number;
  unpaidDays: number;
  halfDays: number;
  lateCount?: number;
  latePenaltyEnabled?: boolean;
  joinDate?: string; // YYYY-MM-DD
  exitDate?: string | null; // YYYY-MM-DD
}

export function calculatePayroll(input: PayrollCalculationInput) {
  const {
    basic,
    monthStr,
    holidays,
    weekendDays,
    absentDays,
    unpaidDays,
    halfDays,
    lateCount = 0,
    latePenaltyEnabled = false,
    joinDate,
    exitDate,
  } = input;

  const hra = Math.round(basic * 0.4 * 100) / 100;
  const medical = Math.round(basic * 0.1 * 100) / 100;
  const gross = Math.round((basic + hra + medical) * 100) / 100;

  const monthWorkingDays = getMonthWorkingDays(monthStr, holidays, weekendDays);
  const perDayRate = monthWorkingDays > 0 ? gross / monthWorkingDays : 0;

  // Deduction days
  const latePenaltyDays = latePenaltyEnabled ? 0.5 * Math.floor(lateCount / 3) : 0;
  const deductionDays = absentDays + unpaidDays + 0.5 * halfDays + latePenaltyDays;

  // Proration for joiner / leaver
  let payableWorkingDays = monthWorkingDays;
  if (joinDate || exitDate) {
    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const monthStart = `${monthStr}-01`;
    const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

    const effectiveStart = joinDate && joinDate > monthStart ? joinDate : monthStart;
    const effectiveEnd = exitDate && exitDate < monthEnd ? exitDate : monthEnd;

    if (effectiveStart > monthStart || effectiveEnd < monthEnd) {
      payableWorkingDays = countWorkingDays(effectiveStart, effectiveEnd, holidays, weekendDays);
    }
  }

  // Deductions calculation
  const standardDeductions = perDayRate * deductionDays;
  const prorationDeduction =
    payableWorkingDays < monthWorkingDays ? perDayRate * (monthWorkingDays - payableWorkingDays) : 0;

  const totalDeductions = Math.round((standardDeductions + prorationDeduction) * 100) / 100;

  // Tax calculation
  const annualGross = gross * 12;
  const annualTax = calculateAnnualTax(annualGross);
  const monthlyTax = Math.round((annualTax / 12) * 100) / 100;

  // Net calculation
  const net = Math.max(0, Math.round((gross - totalDeductions - monthlyTax) * 100) / 100);

  return {
    gross,
    basic,
    hra,
    medical,
    monthWorkingDays,
    perDayRate: Math.round(perDayRate * 100) / 100,
    deductionDays,
    absentDays,
    unpaidDays,
    halfDays,
    latePenaltyDays,
    deductions: totalDeductions,
    annualGross,
    annualTax,
    monthlyTax,
    net,
    breakdown: {
      basic,
      hra,
      medical,
      per_day_rate: Math.round(perDayRate * 100) / 100,
      month_working_days: monthWorkingDays,
      absent_deduction: Math.round(perDayRate * absentDays * 100) / 100,
      unpaid_leave_deduction: Math.round(perDayRate * unpaidDays * 100) / 100,
      half_day_deduction: Math.round(perDayRate * 0.5 * halfDays * 100) / 100,
      late_penalty_deduction: Math.round(perDayRate * latePenaltyDays * 100) / 100,
      annual_gross: annualGross,
      annual_tax: Math.round(annualTax * 100) / 100,
      monthly_tax: monthlyTax,
    },
  };
}

/**
 * Validates password strength per Section 2.3 & 8.1
 */
export function validatePassword(
  newPassword: string,
  username?: string,
  currentPassword?: string
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!newPassword || newPassword.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }

  if (newPassword.length > 72) {
    errors.push('Password must not exceed 72 characters.');
  }

  if (!/[a-zA-Z]/.test(newPassword)) {
    errors.push('Password must contain at least one letter.');
  }

  if (!/[0-9]/.test(newPassword)) {
    errors.push('Password must contain at least one number.');
  }

  if (!/[^a-zA-Z0-9]/.test(newPassword)) {
    errors.push('Password must contain at least one special character.');
  }

  if (username && newPassword.toLowerCase() === username.toLowerCase()) {
    errors.push('Password must differ from the username.');
  }

  if (currentPassword && newPassword === currentPassword) {
    errors.push('New password must differ from current password.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
