/**
 * HCM Lite - Core Type Definitions
 * Based on HCM Lite System Design and Build Document v1.0
 */

export type Role = 'SUPERADMIN' | 'ADMIN' | 'HR' | 'EMPLOYEE';

export type EmployeeStatus = 'probation' | 'active' | 'exited';

export type AttendanceStatus =
  | 'present'
  | 'late'
  | 'half_day'
  | 'absent'
  | 'missing_checkout'
  | 'on_leave';

export type AttendanceSource = 'web' | 'camera' | 'correction';

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export type PayrollStatus = 'draft' | 'finalized';

export type AiFeature = 'chat' | 'summary' | 'smart_leave' | 'policy';

export interface User {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  role: Role;
  employee_id: string | null;
  is_active: boolean;
  is_system_default: boolean;
  must_change_password: boolean;
  failed_attempts: number;
  locked_until: string | null; // ISO timestamp
  last_login_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export interface Company {
  id: string;
  name: string;
  logo_url: string;
  created_at: string;
}

export interface Settings {
  id: string;
  office_start: string; // e.g. "09:00"
  grace_minutes: number; // e.g. 15
  half_day_hours: number; // e.g. 5
  weekend_days: string[]; // ["Sat", "Sun"]
  office_lat: number;
  office_lng: number;
  office_radius_m: number; // default 150m
  working_hours_per_week: number; // default 40
  late_penalty_enabled?: boolean; // bonus rule
  updated_by: string;
  updated_at: string;
}

export interface SettingsHistory {
  id: string;
  snapshot: Settings;
  effective_from: string;
  changed_by: string;
}

export interface Department {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Designation {
  id: string;
  title: string;
  department_id: string | null;
  is_active: boolean;
}

export interface LeaveType {
  id: string;
  name: string; // 'Annual', 'Sick', 'Casual', 'Unpaid'
  yearly_quota: number | null; // null for unlimited
  is_paid: boolean;
}

export interface Holiday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
}

export interface SalaryStructure {
  id: string;
  employee_id: string;
  basic: number;
  effective_from: string;
  set_by: string;
}

export interface Employee {
  id: string;
  code: string; // e.g. EMP-0001
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth: string; // YYYY-MM-DD
  department_id: string;
  designation_id: string;
  join_date: string; // YYYY-MM-DD
  exit_date: string | null; // YYYY-MM-DD
  status: EmployeeStatus;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  check_in_at: string; // ISO timestamp
  check_out_at: string | null; // ISO timestamp
  status: AttendanceStatus;
  worked_minutes: number;
  source: AttendanceSource;
  rule_snapshot: {
    office_start: string;
    grace_minutes: number;
    half_day_hours: number;
  };
  lat?: number;
  lng?: number;
  accuracy_m?: number;
  distance_m?: number;
  face_count?: number;
}

export interface AttendanceCorrection {
  id: string;
  employee_id: string;
  date: string;
  requested_check_in: string;
  requested_check_out: string;
  reason: string;
  status: CorrectionStatus;
  decided_by: string | null;
  decision_comment: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  working_days: number;
  reason: string;
  status: LeaveRequestStatus;
  decided_by: string | null;
  decision_comment: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface PayrollRun {
  id: string;
  month: string; // YYYY-MM
  department_id: string | null;
  status: PayrollStatus;
  total_gross: number;
  total_net: number;
  created_by: string;
  finalized_by: string | null;
  finalized_at: string | null;
  created_at: string;
}

export interface PayslipBreakdown {
  basic: number;
  hra: number;
  medical: number;
  per_day_rate: number;
  month_working_days: number;
  absent_deduction: number;
  unpaid_leave_deduction: number;
  half_day_deduction: number;
  late_penalty_deduction: number;
  annual_gross: number;
  annual_tax: number;
  monthly_tax: number;
}

export interface Payslip {
  id: string;
  run_id: string;
  employee_id: string;
  working_days: number;
  absent_days: number;
  unpaid_days: number;
  half_days: number;
  late_penalty_days: number;
  gross: number;
  deductions: number;
  tax: number;
  net: number;
  breakdown: PayslipBreakdown;
  pdf_generated_at: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  posted_by: string;
  created_at: string;
  expires_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  message: string;
  link?: string;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_role: Role;
  action: string;
  entity: string;
  entity_id: string;
  before: any | null;
  after: any | null;
  ip: string;
  created_at: string;
}

export interface AiLog {
  id: string;
  user_id: string;
  feature: AiFeature;
  prompt: string;
  tool_called: string | null;
  status: 'success' | 'refused' | 'error' | 'fallback';
  latency_ms: number;
  created_at: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    fields?: Array<{ field: string; reason: string }>;
  };
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    role: Role;
    employee_id: string | null;
    must_change_password: boolean;
    is_system_default: boolean;
  };
}
