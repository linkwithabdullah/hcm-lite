/**
 * HCM Lite - Automated System Test Suite (Client Bridge)
 * Calls server /api/v1/system/run-tests and maps into UI format
 */

import { api } from './api';

export interface TestCaseResult {
  id: string;
  category: 'Superadmin' | 'Attendance' | 'Leave' | 'Payroll' | 'RBAC' | 'Dashboard & AI' | 'Security' | 'Accessibility & SEO';
  name: string;
  expected: string;
  received: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

export async function runAllSystemTests(
  onProgress?: (progress: number, currentTest: string) => void
): Promise<{ results: TestCaseResult[]; passedCount: number; totalCount: number; durationMs: number }> {
  const startTime = Date.now();
  onProgress?.(0, 'Executing server automated test suite against separate test PostgreSQL database...');

  const res = await api.runSystemTests();
  if (res.status === 200 && res.data?.results) {
    const rawResults = res.data.results;
    const mapped: TestCaseResult[] = rawResults.map((r: any, idx: number) => {
      let category: TestCaseResult['category'] = 'Superadmin';
      if (r.id.startsWith('ATT')) category = 'Attendance';
      else if (r.id.startsWith('LV')) category = 'Leave';
      else if (r.id.startsWith('PAY')) category = 'Payroll';
      else if (r.id.startsWith('RBAC')) category = 'RBAC';
      else if (r.id.startsWith('AI')) category = 'Dashboard & AI';
      else if (r.id.startsWith('SEC')) category = 'Security';
      else if (r.id.startsWith('A11Y')) category = 'Accessibility & SEO';

      return {
        id: r.id,
        category,
        name: r.name,
        expected: r.expected,
        received: r.actual,
        passed: r.status === 'PASS',
        durationMs: 40,
        details: r.action,
      };
    });

    const passedCount = mapped.filter((m) => m.passed).length;
    return {
      results: mapped,
      passedCount,
      totalCount: mapped.length,
      durationMs: Date.now() - startTime,
    };
  }

  // Fallback if network issue
  return {
    results: [
      {
        id: 'SYS-ERR',
        category: 'Security',
        name: 'Server Test Suite Connection',
        expected: 'Successful execution of 26 tests',
        received: res.error?.message || 'Failed to connect to test endpoint',
        passed: false,
        durationMs: Date.now() - startTime,
      },
    ],
    passedCount: 0,
    totalCount: 1,
    durationMs: Date.now() - startTime,
  };
}
