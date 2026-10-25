-- Reference only. Backend auto-creates this schema on first request.

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL, -- SUPERADMIN, ADMIN, HR, EMPLOYEE
        employee_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_system_default INTEGER NOT NULL DEFAULT 0,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_login_at TEXT,
        created_by TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        office_start TEXT NOT NULL DEFAULT '09:00',
        grace_minutes INTEGER NOT NULL DEFAULT 15,
        half_day_hours REAL NOT NULL DEFAULT 5.0,
        weekend_days TEXT NOT NULL DEFAULT '["Sat","Sun"]',
        office_lat REAL,
        office_lng REAL,
        office_radius_m REAL NOT NULL DEFAULT 150.0,
        working_hours_per_week REAL NOT NULL DEFAULT 40.0,
        late_penalty_enabled INTEGER NOT NULL DEFAULT 0,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        company_name TEXT NOT NULL DEFAULT 'HCM Lite Organization',
        updated_by TEXT NOT NULL DEFAULT 'system',
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS departments (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS designations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        department_id TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY(department_id) REFERENCES departments(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS leave_types (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        yearly_quota INTEGER, -- null for unlimited
        is_paid INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS holidays (
        id TEXT PRIMARY KEY,
        date TEXT UNIQUE NOT NULL, -- YYYY-MM-DD
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        address TEXT NOT NULL,
        gender TEXT NOT NULL,
        date_of_birth TEXT NOT NULL,
        department_id TEXT,
        designation_id TEXT,
        join_date TEXT NOT NULL,
        exit_date TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        manager_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS salary_structures (
        id TEXT PRIMARY KEY,
        employee_id TEXT UNIQUE NOT NULL,
        basic_cents INTEGER NOT NULL, -- integer cents to avoid floating point precision issues
        effective_from TEXT NOT NULL,
        set_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attendance (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL, -- YYYY-MM-DD
        check_in_at TEXT NOT NULL,
        check_out_at TEXT,
        status TEXT NOT NULL, -- present, late, half_day, absent, on_leave
        worked_minutes INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'web',
        rule_snapshot TEXT NOT NULL,
        lat REAL,
        lng REAL,
        accuracy_m REAL,
        distance_m REAL,
        face_count INTEGER,
        UNIQUE(employee_id, date),
        FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS attendance_corrections (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        requested_check_in TEXT NOT NULL,
        requested_check_out TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected
        decided_by TEXT,
        decision_comment TEXT,
        decided_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        leave_type_id TEXT NOT NULL,
        start_date TEXT NOT NULL, -- YYYY-MM-DD
        end_date TEXT NOT NULL, -- YYYY-MM-DD
        working_days INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, cancelled
        decided_by TEXT,
        decision_comment TEXT,
        decided_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE,
        FOREIGN KEY(leave_type_id) REFERENCES leave_types(id)
      );

      CREATE TABLE IF NOT EXISTS payroll_runs (
        id TEXT PRIMARY KEY,
        month TEXT NOT NULL, -- YYYY-MM
        department_id TEXT,
        status TEXT NOT NULL DEFAULT 'draft', -- draft, finalized
        total_gross_cents INTEGER NOT NULL DEFAULT 0,
        total_net_cents INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        finalized_by TEXT,
        finalized_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payslips (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        working_days INTEGER NOT NULL,
        absent_days INTEGER NOT NULL,
        unpaid_days INTEGER NOT NULL,
        half_days INTEGER NOT NULL,
        late_penalty_days REAL NOT NULL DEFAULT 0,
        gross_cents INTEGER NOT NULL,
        deductions_cents INTEGER NOT NULL,
        tax_cents INTEGER NOT NULL,
        net_cents INTEGER NOT NULL,
        breakdown_json TEXT NOT NULL,
        pdf_generated_at TEXT,
        FOREIGN KEY(run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
        FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        posted_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        link TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        ip TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        feature TEXT NOT NULL,
        prompt TEXT NOT NULL,
        tool_called TEXT,
        status TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ai_rate_limits (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS login_rate_limits (
        id TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS login_attempts_ip_time ON login_rate_limits(ip,created_at);
    
CREATE UNIQUE INDEX IF NOT EXISTS payroll_one_run_per_month ON payroll_runs(month);
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS setup_complete INTEGER NOT NULL DEFAULT 0;

