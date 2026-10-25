/**
 * HCM Lite - Client State Cache & Subscription Bridge
 * Clean client state (contains no passwords or secret credentials).
 * Zero mock simulation - all state mutations route through real /api/v1 REST endpoints.
 */

import { Company, Role, Settings, User } from '../types/hcm';
import { api } from './api';

export const DEFAULT_SUPERADMIN_USERNAME = 'superadmin';

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings-1',
  office_start: '09:00',
  grace_minutes: 15,
  half_day_hours: 5,
  weekend_days: ['Sat', 'Sun'],
  office_lat: 0,
  office_lng: 0,
  office_radius_m: 150,
  working_hours_per_week: 40,
  late_penalty_enabled: false,
  updated_by: 'system',
  updated_at: new Date().toISOString(),
};

export interface DatabaseState {
  users: User[];
  company: Company | null;
  settings: Settings;
  departments: any[];
  designations: any[];
  employees: any[];
  salary_structures: any[];
  leave_types: any[];
  holidays: any[];
  attendance: any[];
  leave_requests: any[];
  payroll_runs: any[];
  payslips: any[];
  announcements: any[];
  notifications: any[];
  audit_logs: any[];
  ai_logs: any[];
}

function getInitialState(): DatabaseState {
  return {
    users: [],
    company: null,
    settings: { ...DEFAULT_SETTINGS },
    departments: [],
    designations: [],
    employees: [],
    salary_structures: [],
    leave_types: [],
    holidays: [],
    attendance: [],
    leave_requests: [],
    payroll_runs: [],
    payslips: [],
    announcements: [],
    notifications: [],
    audit_logs: [],
    ai_logs: [],
  };
}

class ClientStateBridge {
  private state: DatabaseState = getInitialState();
  private subscribers: Array<() => void> = [];

  constructor() {
    api.subscribe(() => {
      this.notifySubscribers();
    });
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public setState(partial: Partial<DatabaseState>) {
    this.state = { ...this.state, ...partial };
    this.notifySubscribers();
  }

  public subscribe(fn: () => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== fn);
    };
  }

  private notifySubscribers(): void {
    for (const sub of this.subscribers) {
      try {
        sub();
      } catch (err) {
        console.error('Subscriber error:', err);
      }
    }
  }

  public resetToFreshInstall(): void {
    this.state = getInitialState();
    this.notifySubscribers();
  }

  public logAudit(_entry: any): void {
    // Audit logs are stored server-side in PostgreSQL
  }
}

export const db = new ClientStateBridge();
