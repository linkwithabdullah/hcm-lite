/** Persistent PostgreSQL backend for Vercel and local development.
 * The table definitions mirror the original HCM-Lite SQLite schema.
 * Numeric flags remain 0/1 so existing JSON/route behavior is preserved.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import pg, { type PoolClient } from 'pg';
const { Pool, types } = pg;
import bcrypt from 'bcryptjs';

// COUNT(*) uses int8 in PostgreSQL; dashboard counts are small enough for Number.
types.setTypeParser(20, (value: string) => Number(value));
export interface SqlQueryRow { [key: string]: any }
export type SqlValue = string | number | boolean | null | Uint8Array;
const schema = String.raw`
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
`;

// A pool is reused within a warm Vercel function. Use Neon's pooled URL.
const transactionStore = new AsyncLocalStorage<PoolClient>();
export class SqliteDb { // historic class name retained for imported compatibility
  private pool: InstanceType<typeof Pool>;
  private initPromise: Promise<void> | undefined;
  constructor(connectionString: string | null = process.env.DATABASE_URL || null) {
    if (!connectionString) throw new Error('DATABASE_URL is required. Configure hosted PostgreSQL.');
    this.pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 12000, ssl: undefined });
  }
  public init(): Promise<void> {
    if (!this.initPromise) this.initPromise = this.initialize().catch(err => {this.initPromise=undefined; throw err;});
    return this.initPromise;
  }
  private async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(87655234)');
      await client.query(schema);
      // A first install creates only the default account, settings, leave types and install audit.
      const check = await client.query('SELECT id FROM users LIMIT 1');
      if (check.rowCount === 0) {
        const username = process.env.ADMIN_USERNAME || 'superadmin';
        const password = process.env.ADMIN_PASSWORD;
        if (!password || password.length < 12) {
          throw new Error('Fresh installation requires ADMIN_PASSWORD (minimum 12 characters) in the server environment.');
        }
        const now = new Date().toISOString();
        const hash = await bcrypt.hash(password, 12);
        await client.query(`INSERT INTO users (id,username,email,password_hash,role,employee_id,is_active,is_system_default,must_change_password,failed_attempts,locked_until,last_login_at,created_by,created_at,updated_at,token_version)
          VALUES ($1,$2,$3,$4,'SUPERADMIN',NULL,1,1,1,0,NULL,NULL,NULL,$5,$5,0)`,
          ['usr-superadmin-001',username,process.env.ADMIN_EMAIL||null,hash,now]);
        await client.query(`INSERT INTO audit_logs(id,actor_id,actor_role,action,entity,entity_id,before_json,after_json,ip,created_at)
          VALUES ('aud-init-001','system','SUPERADMIN','SYSTEM_INSTALL_BOOT','system','root',NULL,$1,'127.0.0.1',$2)`,[JSON.stringify({seeded_user:username}),now]);
      }
      await client.query(`INSERT INTO settings (id, office_start, grace_minutes, half_day_hours, weekend_days, office_lat, office_lng, office_radius_m, working_hours_per_week, late_penalty_enabled, timezone, company_name, updated_by, updated_at)
          VALUES ('settings-1','09:00',15,5,'["Sat","Sun"]',NULL,NULL,150,40,0,'Asia/Karachi','HCM Lite Organization','system',$1) ON CONFLICT(id) DO NOTHING`, [new Date().toISOString()]);
      for (const [id,name,quota,paid] of [['lt-annual','Annual',14,1],['lt-sick','Sick',8,1],['lt-casual','Casual',10,1],['lt-unpaid','Unpaid',null,0]] as const) {
        await client.query('INSERT INTO leave_types (id,name,yearly_quota,is_paid) VALUES ($1,$2,$3,$4) ON CONFLICT(name) DO NOTHING',[id,name,quota,paid]);
      }
      await client.query('COMMIT');
    } catch (err) {await client.query('ROLLBACK'); throw err;} finally {client.release();}
  }
  private parameterize(sql: string): string {
    // Convert SQLite's positional ? placeholders, ignoring question marks in quoted strings.
    let out='', index=0, quote='';
    for(let i=0;i<sql.length;i++) {
      const c=sql[i];
      if(quote) {out+=c;if(c===quote){if(sql[i+1]===quote){out+=sql[++i]}else quote='';}continue;}
      if(c==="'"||c==='"'){quote=c;out+=c;continue;}
      if(c==='?'){out+='$'+(++index);continue;}
      out+=c;
    }
    return out;
  }
  private async execute(sql:string,values: SqlValue[] = []) {
    const client=transactionStore.getStore() || this.pool;
    return client.query(this.parameterize(sql),values as any[]);
  }
  public async run(sql:string,params:SqlValue[]=[]):Promise<void>{await this.execute(sql,params);}
  public async query<T = SqlQueryRow>(sql:string,params:SqlValue[]=[]):Promise<T[]>{return (await this.execute(sql,params)).rows as T[];}
  public async queryOne<T = SqlQueryRow>(sql:string,params:SqlValue[]=[]):Promise<T|null>{return (await this.query<T>(sql,params))[0]||null;}
  public async transaction<T>(callback:()=>Promise<T>):Promise<T> {
    if(transactionStore.getStore())return callback();
    const client=await this.pool.connect();
    try {await client.query('BEGIN');const result=await transactionStore.run(client,callback);await client.query('COMMIT');return result;}
    catch(err){await client.query('ROLLBACK');throw err;}finally{client.release();}
  }
  public async close():Promise<void>{await this.pool.end();}
}
export const serverDb = new SqliteDb();
