/**
 * HCM Lite - Real REST API Client
 * Connects browser UI directly to Express backend (/api/v1/*) over fetch
 * Automatically handles Bearer tokens and transparent refresh token rotation.
 */

import {
  AttendanceCorrection,
  AttendanceRecord,
  AuditLog,
  Department,
  Designation,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveType,
  Notification,
  PayrollRun,
  Payslip,
  Role,
  SalaryStructure,
  Settings,
  User,
} from '../types/hcm';

export interface ApiResponse<T = any> {
  status: number;
  data?: T;
  error?: {
    code: string;
    message: string;
    fields?: Array<{ field: string; reason: string }>;
  };
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private cachedUser: User | null = null;
  private subscribers: Array<() => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('hcm_access_token');
      this.refreshToken = localStorage.getItem('hcm_refresh_token');
      const savedUser = localStorage.getItem('hcm_user');
      if (savedUser) {
        try {
          this.cachedUser = JSON.parse(savedUser);
        } catch {
          this.cachedUser = null;
        }
      }
    }
  }

  public subscribe(fn: () => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  private notify(): void {
    for (const sub of this.subscribers) {
      try {
        sub();
      } catch (e) {
        console.error('Subscriber error:', e);
      }
    }
  }

  public getCurrentUser(): User | null {
    return this.cachedUser;
  }

  private setSession(accessToken: string | null, refreshToken: string | null, user: User | null) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.cachedUser = user;

    if (typeof window !== 'undefined') {
      if (accessToken && refreshToken && user) {
        localStorage.setItem('hcm_access_token', accessToken);
        localStorage.setItem('hcm_refresh_token', refreshToken);
        localStorage.setItem('hcm_user', JSON.stringify(user));
      } else {
        localStorage.removeItem('hcm_access_token');
        localStorage.removeItem('hcm_refresh_token');
        localStorage.removeItem('hcm_user');
      }
    }
    this.notify();
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<ApiResponse<T>> {
    const url = `/api/v1${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      let data: any = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      // If unauthorized and we have a refresh token, try refreshing once
      if (response.status === 401 && !isRetry && this.refreshToken && endpoint !== '/auth/login' && endpoint !== '/auth/refresh') {
        const refreshed = await this.refreshTokens();
        if (refreshed) {
          return this.request<T>(endpoint, options, true);
        } else {
          this.setSession(null, null, null);
        }
      }

      if (!response.ok) {
        return {
          status: response.status,
          error: data.error || { code: 'HTTP_ERROR', message: `Request failed with status ${response.status}` },
        };
      }

      return {
        status: response.status,
        data: data.data,
      };
    } catch (err: any) {
      return {
        status: 0,
        error: { code: 'NETWORK_ERROR', message: err.message || 'Network request failed' },
      };
    }
  }

  private async refreshTokens(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const res = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });
      if (res.ok) {
        const body = await res.json();
        if (body.data?.accessToken) {
          this.setSession(body.data.accessToken, body.data.refreshToken, body.data.user);
          return true;
        }
      }
    } catch {
      // Failed to refresh
    }
    return false;
  }

  // -------------------------------------------------------------
  // AUTH
  // -------------------------------------------------------------
  public async login(identifier: string, pass: string): Promise<ApiResponse<{ user: User; accessToken: string }>> {
    const res = await this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password: pass }),
    });

    if (res.status === 200 && res.data) {
      this.setSession(res.data.accessToken, res.data.refreshToken, res.data.user);
    }
    return res;
  }

  public async logout(): Promise<ApiResponse> {
    const res = await this.request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });
    this.setSession(null, null, null);
    return res;
  }

  public async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse> {
    const res = await this.request<any>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.status === 200 && res.data) {
      this.setSession(res.data.accessToken, res.data.refreshToken, res.data.user);
    }
    return res;
  }

  public async getMe(): Promise<ApiResponse<{ user: User }>> {
    const res = await this.request<any>('/auth/me');
    if (res.status === 200 && res.data?.user) {
      this.cachedUser = res.data.user;
      this.notify();
    }
    return res;
  }

  // -------------------------------------------------------------
  // SETTINGS & ORGANIZATION
  // -------------------------------------------------------------
  public async getSettings(): Promise<ApiResponse<Settings>> {
    return this.request<Settings>('/settings');
  }

  public async updateSettings(data: Partial<Settings>): Promise<ApiResponse<Settings>> {
    return this.request<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  public async getDepartments(): Promise<ApiResponse<Department[]>> {
    return this.request<Department[]>('/departments');
  }

  public async createDepartment(name: string): Promise<ApiResponse<Department>> {
    return this.request<Department>('/departments', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  public async getDesignations(): Promise<ApiResponse<Designation[]>> {
    return this.request<Designation[]>('/designations');
  }

  public async createDesignation(title: string, department_id?: string): Promise<ApiResponse<Designation>> {
    return this.request<Designation>('/designations', {
      method: 'POST',
      body: JSON.stringify({ title, department_id }),
    });
  }

  public async getHolidays(): Promise<ApiResponse<Holiday[]>> {
    return this.request<Holiday[]>('/holidays');
  }

  public async createHoliday(date: string, name: string): Promise<ApiResponse<Holiday>> {
    return this.request<Holiday>('/holidays', {
      method: 'POST',
      body: JSON.stringify({ date, name }),
    });
  }

  public async getLeaveTypes(): Promise<ApiResponse<LeaveType[]>> {
    return this.request<LeaveType[]>('/leave-types');
  }

  public async createLeaveType(name: string, yearly_quota: number | null, is_paid = true): Promise<ApiResponse<LeaveType>> {
    return this.request<LeaveType>('/leave-types', {
      method: 'POST',
      body: JSON.stringify({ name, yearly_quota, is_paid }),
    });
  }

  // -------------------------------------------------------------
  // EMPLOYEES
  // -------------------------------------------------------------
  public async getEmployees(search?: string, department_id?: string): Promise<ApiResponse<Employee[]>> {
    let query = '';
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (department_id) params.set('department_id', department_id);
    const qs = params.toString();
    if (qs) query = `?${qs}`;
    return this.request<Employee[]>(`/employees${query}`);
  }

  public async registerEmployee(data: any): Promise<ApiResponse<{ employee: Employee; credentials: any }>> {
    return this.request<{ employee: Employee; credentials: any }>('/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getEmployee(id: string): Promise<ApiResponse<Employee>> {
    return this.request<Employee>(`/employees/${id}`);
  }

  // -------------------------------------------------------------
  // USERS
  // -------------------------------------------------------------
  public async getUsers(): Promise<ApiResponse<User[]>> {
    return this.request<User[]>('/users');
  }

  public async createUser(data: { username: string; email?: string; role: Role; employee_id?: string }): Promise<ApiResponse<any>> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async deactivateUser(id: string): Promise<ApiResponse> {
    return this.request(`/users/${id}/deactivate`, { method: 'PUT' });
  }

  // -------------------------------------------------------------
  // ATTENDANCE
  // -------------------------------------------------------------
  public async checkIn(coords?: { lat?: number; lng?: number }): Promise<ApiResponse<AttendanceRecord>> {
    return this.request<AttendanceRecord>('/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify(coords || {}),
    });
  }

  public async checkOut(): Promise<ApiResponse<AttendanceRecord>> {
    return this.request<AttendanceRecord>('/attendance/check-out', {
      method: 'POST',
    });
  }

  public async getAttendanceRecords(employee_id?: string): Promise<ApiResponse<AttendanceRecord[]>> {
    const qs = employee_id ? `?employee_id=${employee_id}` : '';
    return this.request<AttendanceRecord[]>(`/attendance/records${qs}`);
  }

  public async getAttendanceSummary(): Promise<ApiResponse<any>> {
    return this.request('/attendance/summary');
  }

  // -------------------------------------------------------------
  // LEAVE
  // -------------------------------------------------------------
  public async applyLeave(data: {
    leave_type_id: string;
    start_date: string;
    end_date: string;
    reason: string;
  }): Promise<ApiResponse<LeaveRequest>> {
    return this.request<LeaveRequest>('/leave/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async getMyLeaveBalances(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/leave/my-balance');
  }

  public async getLeaveRequests(): Promise<ApiResponse<LeaveRequest[]>> {
    return this.request<LeaveRequest[]>('/leave/requests');
  }

  public async decideLeave(id: string, decision: 'approved' | 'rejected', comment?: string): Promise<ApiResponse> {
    return this.request(`/leave/requests/${id}/decide`, {
      method: 'PUT',
      body: JSON.stringify({ decision, comment }),
    });
  }

  public async cancelLeave(id: string): Promise<ApiResponse> {
    return this.request(`/leave/requests/${id}/cancel`, {
      method: 'PUT',
    });
  }

  // -------------------------------------------------------------
  // PAYROLL
  // -------------------------------------------------------------
  public async getPayrollRuns(): Promise<ApiResponse<PayrollRun[]>> {
    return this.request<PayrollRun[]>('/payroll/runs');
  }

  public async createPayrollRun(month: string, department_id?: string): Promise<ApiResponse<PayrollRun>> {
    return this.request<PayrollRun>('/payroll/runs', {
      method: 'POST',
      body: JSON.stringify({ month, department_id }),
    });
  }

  public async finalizePayrollRun(id: string): Promise<ApiResponse> {
    return this.request(`/payroll/runs/${id}/finalize`, {
      method: 'POST',
    });
  }

  public async getPayrollRunPayslips(runId: string): Promise<ApiResponse<Payslip[]>> {
    return this.request<Payslip[]>(`/payroll/runs/${runId}/payslips`);
  }

  public async getPayslip(id: string): Promise<ApiResponse<Payslip>> {
    return this.request<Payslip>(`/payslips/${id}`);
  }

  // -------------------------------------------------------------
  // ANNOUNCEMENTS & AUDIT & AI
  // -------------------------------------------------------------
  public async getAnnouncements(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/announcements');
  }

  public async createAnnouncement(title: string, body: string): Promise<ApiResponse> {
    return this.request('/announcements', {
      method: 'POST',
      body: JSON.stringify({ title, body }),
    });
  }

  public async getAuditLogs(): Promise<ApiResponse<AuditLog[]>> {
    return this.request<AuditLog[]>('/audit-logs');
  }

  public async aiChat(message: string): Promise<ApiResponse<{ response: string; toolCalled?: string; isAiGenerated: boolean }>> {
    return this.request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  public async aiSmartLeave(text: string): Promise<ApiResponse<any>> {
    return this.request('/ai/smart-leave', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
  }

  public async setupCompany(companyName: string, settings: any): Promise<ApiResponse<Settings>> {
    return this.updateSettings({ ...settings, company_name: companyName });
  }

  public async getAttendanceBoard(_date?: string): Promise<ApiResponse<any>> {
    return this.getAttendanceRecords();
  }

  public async getMyAttendanceCalendar(_month?: string): Promise<ApiResponse<AttendanceRecord[]>> {
    return this.getAttendanceRecords();
  }

  public async getAttendanceCorrections(): Promise<ApiResponse<AttendanceCorrection[]>> {
    return this.request<AttendanceCorrection[]>('/attendance/corrections');
  }

  public async requestAttendanceCorrection(data: any): Promise<ApiResponse<any>> {
    return this.request('/attendance/corrections', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  public async decideAttendanceCorrection(id: string, decision: 'approved' | 'rejected', comment?: string): Promise<ApiResponse<any>> {
    return this.request(`/attendance/corrections/${id}/decide`, {
      method: 'PUT',
      body: JSON.stringify({ decision, comment }),
    });
  }

  public async cameraCheckIn(data: any): Promise<ApiResponse<AttendanceRecord>> {
    return this.checkIn(data);
  }

  public async getDashboardData(): Promise<ApiResponse<any>> {
    const emps = await this.getEmployees();
    const attSummary = await this.getAttendanceSummary();
    const leaves = await this.getLeaveRequests();
    const runs = await this.getPayrollRuns();
    const settings = await this.getSettings();

    const activeEmps = (emps.data || []).filter((e: any) => e.status !== 'exited');
    const pendingLeaves = (leaves.data || []).filter((l: any) => l.status === 'pending');
    const totalPayroll = (runs.data || []).reduce((sum: number, r: any) => sum + (r.total_net || 0), 0);

    return {
      status: 200,
      data: {
        activeHeadcount: activeEmps.length,
        attendanceRate: attSummary.data?.attendance_rate || 100,
        pendingLeavesCount: pendingLeaves.length,
        totalPayrollDisbursed: totalPayroll,
        recentRuns: runs.data?.slice(0, 3) || [],
        settings: settings.data,
      },
    };
  }

  public async updateEmployeeSalary(employee_id: string, basic: number): Promise<ApiResponse<any>> {
    return this.request(`/employees/${employee_id}/salary`, {
      method: 'PUT',
      body: JSON.stringify({ basic_salary: basic }),
    });
  }

  public async getEmployeeById(id: string): Promise<ApiResponse<Employee>> {
    return this.getEmployee(id);
  }

  public async importEmployeesCsv(csvContent: string, dryRun: boolean): Promise<ApiResponse<any>> {
    return this.request('/employees/import-csv', {
      method: 'POST',
      body: JSON.stringify({ csvContent, dryRun }),
    });
  }

  public async getLeaveBalance(_employee_id?: string): Promise<ApiResponse<any[]>> {
    return this.getMyLeaveBalances();
  }

  public async getMyPayslips(): Promise<ApiResponse<Payslip[]>> {
    return this.request<Payslip[]>('/payroll/my-payslips');
  }

  public async getPayrollRunDetails(id: string): Promise<ApiResponse<any>> {
    const slips = await this.getPayrollRunPayslips(id);
    return {
      status: 200,
      data: {
        id,
        payslips: slips.data || [],
      },
    };
  }

  public async addDepartment(name: string): Promise<ApiResponse<Department>> {
    return this.createDepartment(name);
  }

  public async addHoliday(date: string, name: string): Promise<ApiResponse<Holiday>> {
    return this.createHoliday(date, name);
  }

  public async activateUser(id: string): Promise<ApiResponse<any>> {
    return this.request(`/users/${id}/activate`, { method: 'PUT' });
  }

  public async resetUserPassword(id: string, tempPassword?: string): Promise<ApiResponse<any>> {
    return this.request(`/users/${id}/reset-password`, {
      method: 'PUT',
      body: JSON.stringify({ tempPassword }),
    });
  }

  public async runSystemTests(): Promise<ApiResponse<any>> {
    return this.request('/system/run-tests', {
      method: 'POST',
    });
  }
}

export const api = new ApiClient();
