/**
 * HCM Lite - Employee Directory & Management
 * Register employees, Salary Structure, Employee 360, CSV Import/Export (Section 6.4, 8.1, 8.2)
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Download,
  Upload,
  DollarSign,
  Eye,
  Check,
  AlertTriangle,
  X,
  FileText,
} from 'lucide-react';
import { Department, Designation, Employee, Role, SalaryStructure, User } from '../../types/hcm';
import { api } from '../../services/api';
import { db } from '../../services/db';
import { generateEmployeeRosterPdf } from '../../services/pdf';

interface EmployeesViewProps {
  currentUser: User;
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({ currentUser }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [employee360, setEmployee360] = useState<{ employee: Employee; salary: SalaryStructure | null } | null>(null);

  // Form states
  const [regForm, setRegForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    gender: 'male' as 'male' | 'female' | 'other',
    date_of_birth: '',
    department_id: '',
    designation_id: '',
    join_date: new Date().toISOString().split('T')[0],
    basic_salary: 0,
  });

  const [salaryBasic, setSalaryBasic] = useState(100000);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // CSV Import state
  const [csvContent, setCsvContent] = useState('');
  const [dryRunResults, setDryRunResults] = useState<{
    validCount: number;
    errors: Array<{ row: number; field: string; reason: string }>;
  } | null>(null);

  const canEdit = currentUser.role === 'SUPERADMIN' || currentUser.role === 'HR';

  const loadData = async () => {
    setIsLoading(true);
    const empRes = await api.getEmployees(searchTerm, selectedDept || undefined);
    if (empRes.status === 200 && empRes.data) {
      setEmployees(empRes.data);
    }
    const deptRes = await api.getDepartments();
    if (deptRes.status === 200 && deptRes.data) {
      setDepartments(deptRes.data);
      if (!regForm.department_id && deptRes.data.length > 0) {
        setRegForm((prev) => ({ ...prev, department_id: deptRes.data![0].id }));
      }
    }
    const desRes = await api.getDesignations();
    if (desRes.status === 200 && desRes.data) {
      setDesignations(desRes.data);
      if (!regForm.designation_id && desRes.data.length > 0) {
        setRegForm((prev) => ({ ...prev, designation_id: desRes.data![0].id }));
      }
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    const unsub = db.subscribe(() => {
      loadData();
    });
    return unsub;
  }, [searchTerm, selectedDept]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const res = await api.registerEmployee(regForm);
    if (res.status === 201) {
      setSuccessMsg(`Employee ${res.data?.employee?.first_name} registered. One-time login: ${res.data?.credentials?.username} / ${res.data?.credentials?.temporary_password}. Copy securely now; it will not be shown again.`);
      setIsRegisterOpen(false);
      loadData();
    } else {
      setErrorMsg(res.error?.message || 'Failed to register employee.');
    }
  };

  const handleUpdateSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmp) return;
    setErrorMsg(null);

    const res = await api.updateEmployeeSalary(selectedEmp.id, salaryBasic);
    if (res.status === 200) {
      setIsSalaryModalOpen(false);
      setSuccessMsg(`Salary structure for ${selectedEmp.first_name} updated successfully.`);
      loadData();
    } else {
      setErrorMsg(res.error?.message || 'Failed to update salary structure.');
    }
  };

  const handleOpen360 = async (emp: Employee) => {
    const res = await api.getEmployeeById(emp.id);
    if (res.status === 200 && res.data) {
      setEmployee360({ employee: res.data, salary: null });
    }
  };

  const handleCsvExport = () => {
    const isHrOrAdmin = currentUser.role === 'SUPERADMIN' || currentUser.role === 'HR';
    const headers = ['Code', 'First Name', 'Last Name', 'Email', 'Phone', 'Department', 'Designation', 'Join Date', 'Status'];
    if (isHrOrAdmin) {
      headers.push('Basic Salary', 'HRA (40%)', 'Medical (10%)', 'Gross Salary (1.5x)');
    }

    const stateSalaries = db.getState().salary_structures;
    const rows = employees.map((e) => {
      const dept = departments.find((d) => d.id === e.department_id)?.name || '';
      const des = designations.find((d) => d.id === e.designation_id)?.title || '';
      const baseFields = [
        `"${e.code}"`,
        `"${e.first_name}"`,
        `"${e.last_name}"`,
        `"${e.email}"`,
        `"${e.phone}"`,
        `"${dept}"`,
        `"${des}"`,
        `"${e.join_date}"`,
        `"${e.status}"`,
      ];

      if (isHrOrAdmin) {
        const sal = ((stateSalaries || []) as any[]).find((s: any) => s.employee_id === e.id);
        const basic = (e as any).basic_salary || (sal ? sal.basic : 0);
        const hra = basic * 0.4;
        const med = basic * 0.1;
        const gross = basic * 1.5;
        baseFields.push(basic.toFixed(2), hra.toFixed(2), med.toFixed(2), gross.toFixed(2));
      }

      return baseFields.join(',');
    });

    const csvStr = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Employee_Directory_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setSuccessMsg(`Exported ${employees.length} employee record(s) to CSV.`);
  };

  const handlePdfExport = () => {
    const isHrOrAdmin = currentUser.role === 'SUPERADMIN' || currentUser.role === 'HR';
    const stateSalaries = (db.getState() as any).salary_structures || [];
    const salaryMap: Record<string, number> = {};
    for (const s of stateSalaries) {
      salaryMap[s.employee_id] = s.basic;
    }
    for (const e of employees) {
      if ((e as any).basic_salary) {
        salaryMap[e.id] = (e as any).basic_salary;
      }
    }
    const companyName = db.getState().company?.name || 'HCM Lite Enterprise';
    generateEmployeeRosterPdf(employees, departments, designations, salaryMap, isHrOrAdmin, companyName);
    setSuccessMsg(`Generated and downloaded Employee Directory PDF roster (${employees.length} employees).`);
  };

  const handleDryRunImport = async () => {
    const res = await api.importEmployeesCsv(csvContent, true);
    if (res.data) {
      setDryRunResults(res.data);
    }
  };

  const handleCommitImport = async () => {
    const res = await api.importEmployeesCsv(csvContent, false);
    if (res.status === 201) {
      setIsImportModalOpen(false);
      setSuccessMsg(`Imported ${res.data?.importedCount} employee(s). Copy one-time credentials securely now: ${res.data?.credentials?.map((c: any) => `${c.username} / ${c.temporary_password}`).join('; ')}`);
      setCsvContent('');
      setDryRunResults(null);
      loadData();
    } else {
      setErrorMsg(res.error?.message || 'Import failed.');
    }
  };

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Employee Directory
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage organization staff records, salary structures, and credentials
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleCsvExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          <button
            onClick={handlePdfExport}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5 text-slate-600" />
            Export PDF
          </button>

          {canEdit && (
            <>
              <button
                onClick={() => {
                  setIsImportModalOpen(true);
                  setDryRunResults(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5" />
                Import CSV
              </button>

              <button
                onClick={() => setIsRegisterOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors shadow-2xs"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Register Employee
              </button>
            </>
          )}
        </div>
      </div>

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by employee name, code (EMP-0001), or email..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
        >
          <option value="">All Departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Department & Role</th>
              <th className="py-3 px-4">Join Date</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500">
                  No employee records found. Click "Register Employee" or "Import CSV" to add records.
                </td>
              </tr>
            ) : (
              employees.map((emp) => {
                const dept = departments.find((d) => d.id === emp.department_id)?.name || 'General';
                const des = designations.find((d) => d.id === emp.designation_id)?.title || 'Staff';
                return (
                  <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">{emp.code}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {emp.first_name} {emp.last_name}
                      </div>
                      <div className="text-[11px] text-slate-500">{emp.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-800">{des}</div>
                      <div className="text-[11px] text-slate-500">{dept}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono tabular-nums">{emp.join_date}</td>
                    <td className="py-3 px-4">
                      <span className="capitalize text-slate-700 font-medium">
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpen360(emp)}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                        title="View Employee 360"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {canEdit && (
                        <button
                          onClick={() => {
                            setSelectedEmp(emp);
                            setSalaryBasic((emp as any).basic_salary || 100000);
                            setIsSalaryModalOpen(true);
                          }}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="Edit Salary Structure"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
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

      {/* Register Employee Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Register New Employee</h2>
              <button onClick={() => setIsRegisterOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <form onSubmit={handleRegister} className="p-6 space-y-4 text-xs">
              {errorMsg && (
                <div className="p-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg">
                  {errorMsg}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={regForm.first_name}
                    onChange={(e) => setRegForm({ ...regForm, first_name: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={regForm.last_name}
                    onChange={(e) => setRegForm({ ...regForm, last_name: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={regForm.phone}
                    onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                    placeholder="03001234567"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Residential Address *</label>
                <input
                  type="text"
                  required
                  value={regForm.address}
                  onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department *</label>
                  <select
                    required
                    value={regForm.department_id}
                    onChange={(e) => setRegForm({ ...regForm, department_id: e.target.value, designation_id: '' })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                  >
                    <option value="" disabled>Select department</option>
                    {departments.filter(d => d.is_active).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Designation *</label>
                  <select
                    required
                    value={regForm.designation_id}
                    onChange={(e) => setRegForm({ ...regForm, designation_id: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                  >
                    <option value="" disabled>Select designation</option>
                    {designations.filter(d => d.is_active && (!d.department_id || d.department_id === regForm.department_id)).map((d) => (
                      <option key={d.id} value={d.id}>{d.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date of Birth *</label>
                  <input type="date" required max={new Date(Date.now() - 86400000).toISOString().split('T')[0]}
                    value={regForm.date_of_birth}
                    onChange={(e) => setRegForm({ ...regForm, date_of_birth: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Gender *</label>
                  <select required value={regForm.gender}
                    onChange={(e) => setRegForm({ ...regForm, gender: e.target.value as 'male' | 'female' | 'other' })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Join Date *</label>
                  <input
                    type="date"
                    required
                    value={regForm.join_date}
                    onChange={(e) => setRegForm({ ...regForm, join_date: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Monthly Basic Salary ($) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={regForm.basic_salary}
                    onChange={(e) => setRegForm({ ...regForm, basic_salary: Number(e.target.value) })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Register & Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Structure Modal */}
      {isSalaryModalOpen && selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Salary Structure: {selectedEmp.first_name} {selectedEmp.last_name}
              </h2>
              <button onClick={() => setIsSalaryModalOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleUpdateSalary} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Monthly Basic Salary ($)</label>
                <input
                  type="number"
                  min={1}
                  required
                  value={salaryBasic}
                  onChange={(e) => setSalaryBasic(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                />
              </div>

              {/* Derived Allowances preview per Section 4.2 */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>HRA (40% of basic):</span>
                  <span>${(salaryBasic * 0.4).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Medical (10% of basic):</span>
                  <span>${(salaryBasic * 0.1).toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-1 border-t border-slate-200">
                  <span>Total Gross (1.5x Basic):</span>
                  <span>${(salaryBasic * 1.5).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSalaryModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg"
                >
                  Save Salary
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee 360 View Modal */}
      {employee360 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-slate-500">{employee360.employee.code}</span>
                <h2 className="text-base font-bold text-slate-900">
                  {employee360.employee.first_name} {employee360.employee.last_name}
                </h2>
              </div>
              <button onClick={() => setEmployee360(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-slate-500 font-medium block">Email:</span>
                <span className="text-slate-900 font-medium">{employee360.employee.email}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Phone:</span>
                <span className="text-slate-900 font-medium">{employee360.employee.phone}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Date of Birth:</span>
                <span className="text-slate-900 font-mono">{employee360.employee.date_of_birth}</span>
              </div>
              <div>
                <span className="text-slate-500 font-medium block">Join Date:</span>
                <span className="text-slate-900 font-mono">{employee360.employee.join_date}</span>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500 font-medium block">Address:</span>
                <span className="text-slate-900">{employee360.employee.address}</span>
              </div>
            </div>

            {employee360.salary && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-semibold text-slate-700 block mb-1">Salary Details:</span>
                <div className="flex justify-between">
                  <span className="text-slate-500">Basic:</span>
                  <span className="font-mono">${employee360.salary.basic.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Gross (1.5x):</span>
                  <span className="font-mono">${(employee360.salary.basic * 1.5).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CSV Import Modal with Dry Run */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Batch Import Employees via CSV</h2>
              <button onClick={() => setIsImportModalOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Paste CSV Rows (Header: first_name,last_name,email,phone,department,basic_salary,join_date)
              </label>
              <textarea
                rows={6}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="first_name,last_name,email,phone,department,basic_salary,join_date&#10;Tariq,Malik,tariq@apextech.io,+1-555-0188,Engineering,95000,2026-02-01"
                className="w-full p-2.5 font-mono text-[11px] border border-slate-300 rounded-lg"
              />
            </div>

            {dryRunResults && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <span className="font-semibold text-slate-700 block">
                  Dry-Run Validation Results: {dryRunResults.validCount} valid row(s), {dryRunResults.errors.length} error(s)
                </span>
                {dryRunResults.errors.map((err, i) => (
                  <div key={i} className="text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Row {err.row} [{err.field}]: {err.reason}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleDryRunImport}
                className="px-3 py-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium"
              >
                Validate (Dry Run)
              </button>
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={!dryRunResults || dryRunResults.errors.length > 0 || dryRunResults.validCount === 0}
                className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                Commit Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
