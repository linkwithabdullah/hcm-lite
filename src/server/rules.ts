/**
 * HCM Lite - Business Rules & Calculation Engine (Server)
 * Implements exact formulas from System Design Document v1.0 and audit corrections.
 */

export interface HolidayRow {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface SettingsRow {
  id: string;
  office_start: string;
  grace_minutes: number;
  half_day_hours: number;
  weekend_days: string; // JSON array
  office_lat: number | null;
  office_lng: number | null;
  office_radius_m: number;
  working_hours_per_week: number;
  late_penalty_enabled: number;
  timezone: string;
}

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
  holidays: HolidayRow[] = [],
  weekendDays: string[] = ['Sat', 'Sun']
): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];

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
  holidays: HolidayRow[] = [],
  weekendDays: string[] = ['Sat', 'Sun']
): number {
  if (startDateStr > endDateStr) return 0;

  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);

  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const yyyy = current.getUTCFullYear();
    const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(current.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (isWorkingDay(dateStr, holidays, weekendDays)) {
      count++;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return count;
}

/**
 * Counts working days split by calendar year for cross-year leave support
 */
export function countWorkingDaysByYear(
  startDateStr: string,
  endDateStr: string,
  holidays: HolidayRow[] = [],
  weekendDays: string[] = ['Sat', 'Sun']
): Record<number, number> {
  const [sy, sm, sd] = startDateStr.split('-').map(Number);
  const [ey, em, ed] = endDateStr.split('-').map(Number);

  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));

  const result: Record<number, number> = {};
  const current = new Date(start);

  while (current <= end) {
    const yyyy = current.getUTCFullYear();
    const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(current.getUTCDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (isWorkingDay(dateStr, holidays, weekendDays)) {
      result[yyyy] = (result[yyyy] || 0) + 1;
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return result;
}

/**
 * Counts total working days in a given calendar month (YYYY-MM)
 */
export function getMonthWorkingDays(
  monthStr: string,
  holidays: HolidayRow[] = [],
  weekendDays: string[] = ['Sat', 'Sun']
): number {
  const [yearStr, mStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDateStr = `${yearStr}-${String(month).padStart(2, '0')}-01`;
  const endDateStr = `${yearStr}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  return countWorkingDays(startDateStr, endDateStr, holidays, weekendDays);
}

/**
 * Evaluates attendance status on check-in based on office start and grace period
 */
export function evaluateCheckInStatus(
  checkInTimeIso: string,
  officeStartStr = '09:00',
  graceMinutes = 15,
  timezone = 'UTC'
): 'present' | 'late' {
  const date = new Date(checkInTimeIso);
  // Format into local office hours and minutes
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const [inHourStr, inMinStr] = timeFormatter.format(date).split(':');
  const inMinutes = parseInt(inHourStr, 10) * 60 + parseInt(inMinStr, 10);

  const [startHour, startMin] = officeStartStr.split(':').map(Number);
  const cutoffMinutes = startHour * 60 + startMin + graceMinutes;

  return inMinutes > cutoffMinutes ? 'late' : 'present';
}

/**
 * Computes worked minutes and updates status upon checkout
 */
export function evaluateCheckOutStatus(
  checkInIso: string,
  checkOutIso: string,
  initialStatus: 'present' | 'late',
  halfDayHours = 5.0
): { status: 'present' | 'late' | 'half_day'; workedMinutes: number } {
  const diffMs = new Date(checkOutIso).getTime() - new Date(checkInIso).getTime();
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

export interface PayrollComputeParams {
  basicCents: number;
  monthStr: string; // YYYY-MM
  joinDate: string; // YYYY-MM-DD
  exitDate: string | null; // YYYY-MM-DD
  attendanceDays: number;
  halfDays: number;
  unpaidLeaveDays: number;
  approvedPaidLeaveDays: number;
  lateCount: number;
  latePenaltyEnabled: boolean;
  holidays: HolidayRow[];
  weekendDays: string[];
}

export function computeEmployeePayroll(params: PayrollComputeParams) {
  const {
    basicCents,
    monthStr,
    joinDate,
    exitDate,
    attendanceDays,
    halfDays,
    unpaidLeaveDays,
    approvedPaidLeaveDays,
    lateCount,
    latePenaltyEnabled,
    holidays,
    weekendDays,
  } = params;

  const [yStr, mStr] = monthStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = `${monthStr}-01`;
  const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;

  // Month total working days (standard for company)
  const monthWorkingDays = getMonthWorkingDays(monthStr, holidays, weekendDays);

  // Active employment period within the month
  const effectiveStart = joinDate > monthStart ? joinDate : monthStart;
  const effectiveEnd = exitDate && exitDate < monthEnd ? exitDate : monthEnd;

  // Active working days for this employee in the month
  let activeWorkingDays = 0;
  if (effectiveStart <= effectiveEnd) {
    activeWorkingDays = countWorkingDays(effectiveStart, effectiveEnd, holidays, weekendDays);
  }

  // Exact formula from user instructions:
  // absent_days = working days in the full month (up to joining/exit) minus attendance days minus approved leave days
  // (Note: attendance days count actual present, late, and half_day records; half_day deduction is handled separately)
  const absentDays = Math.max(0, activeWorkingDays - attendanceDays - approvedPaidLeaveDays - unpaidLeaveDays);

  // Late penalty days: 3 late = 0.5 day deduction, only if enabled!
  const latePenaltyDays = latePenaltyEnabled ? 0.5 * Math.floor(lateCount / 3) : 0;

  // Standard salary breakdown in cents
  // Basic is provided; HRA = 40% of basic, Medical = 10% of basic; Gross = Basic + HRA + Medical
  const hraCents = Math.round(basicCents * 0.4);
  const medicalCents = Math.round(basicCents * 0.1);
  const grossCents = basicCents + hraCents + medicalCents;

  const perDayRateCents = monthWorkingDays > 0 ? grossCents / monthWorkingDays : 0;

  // Proration deduction if employee joined mid-month or exited mid-month
  const unworkedDaysDueToJoinExit = Math.max(0, monthWorkingDays - activeWorkingDays);
  const prorationDeductionCents = Math.round(perDayRateCents * unworkedDaysDueToJoinExit);

  // Absence, unpaid leave, half-day, and late penalty deductions
  const absentDeductionCents = Math.round(perDayRateCents * absentDays);
  const unpaidDeductionCents = Math.round(perDayRateCents * unpaidLeaveDays);
  const halfDayDeductionCents = Math.round(perDayRateCents * 0.5 * halfDays);
  const latePenaltyDeductionCents = Math.round(perDayRateCents * latePenaltyDays);

  const totalDeductionsCents =
    absentDeductionCents +
    unpaidDeductionCents +
    halfDayDeductionCents +
    latePenaltyDeductionCents +
    prorationDeductionCents;

  // Tax calculation in dollars/cents
  const annualGrossDollars = (grossCents / 100) * 12;
  const annualTaxDollars = calculateAnnualTax(annualGrossDollars);
  const monthlyTaxCents = Math.round((annualTaxDollars / 12) * 100);

  const netCents = Math.max(0, grossCents - totalDeductionsCents - monthlyTaxCents);

  return {
    monthWorkingDays,
    activeWorkingDays,
    absentDays,
    unpaidLeaveDays,
    halfDays,
    latePenaltyDays,
    basicCents,
    hraCents,
    medicalCents,
    grossCents,
    deductionsCents: totalDeductionsCents,
    taxCents: monthlyTaxCents,
    netCents,
    breakdown: {
      basic: basicCents / 100,
      hra: hraCents / 100,
      medical: medicalCents / 100,
      per_day_rate: Math.round((perDayRateCents / 100) * 100) / 100,
      month_working_days: monthWorkingDays,
      active_working_days: activeWorkingDays,
      absent_days: absentDays,
      absent_deduction: absentDeductionCents / 100,
      unpaid_leave_deduction: unpaidDeductionCents / 100,
      half_day_deduction: halfDayDeductionCents / 100,
      late_penalty_deduction: latePenaltyDeductionCents / 100,
      proration_deduction: prorationDeductionCents / 100,
      annual_gross: annualGrossDollars,
      annual_tax: Math.round(annualTaxDollars * 100) / 100,
      monthly_tax: monthlyTaxCents / 100,
      net: netCents / 100,
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
