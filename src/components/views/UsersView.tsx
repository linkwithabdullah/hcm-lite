/**
 * HCM Lite - User Management & Administration
 * Implements Section 2.2, 2.3, 6.2: Multiple Superadmins, Last-Superadmin guard, Password resets
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  KeyRound,
  UserX,
  UserCheck,
  Search,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
import { Role, User } from '../../types/hcm';
import { api } from '../../services/api';
import { db } from '../../services/db';

interface UsersViewProps {
  currentUser: User;
}

export const UsersView: React.FC<UsersViewProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New User modal
  const [isNewUserOpen, setIsNewUserOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('HR');
  const [tempPassword, setTempPassword] = useState('temp@Pass123');

  // Reset modal
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [newTempPass, setNewTempPass] = useState('temp@Pass123');

  const isSuperadmin = currentUser.role === 'SUPERADMIN';

  const loadUsers = async () => {
    setIsLoading(true);
    const res = await api.getUsers();
    if (res.status === 200 && res.data) {
      setUsers(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadUsers();
    const unsub = db.subscribe(() => {
      loadUsers();
    });
    return unsub;
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const res = await api.createUser({
      username,
      email: email || undefined,
      role,
    });

    if (res.status === 201) {
      setIsNewUserOpen(false);
      setMessage({
        type: 'success',
        text: `User ${username} (${role}) created successfully with temporary password.`,
      });
      setUsername('');
      setEmail('');
      loadUsers();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Failed to create user.' });
    }
  };

  const handleDeactivate = async (user: User) => {
    setMessage(null);
    const res = await api.deactivateUser(user.id);
    if (res.status === 200) {
      setMessage({ type: 'success', text: `User ${user.username} has been deactivated.` });
      loadUsers();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Action rejected.' });
    }
  };

  const handleActivate = async (user: User) => {
    setMessage(null);
    const res = await api.activateUser(user.id);
    if (res.status === 200) {
      setMessage({ type: 'success', text: `User ${user.username} has been reactivated.` });
      loadUsers();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Action rejected.' });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setMessage(null);

    const res = await api.resetUserPassword(resetTargetUser.id, newTempPass);
    if (res.status === 200) {
      setResetTargetUser(null);
      setMessage({
        type: 'success',
        text: `Temporary password reset for ${resetTargetUser.username}. Password change will be required on next login.`,
      });
      loadUsers();
    } else {
      setMessage({ type: 'error', text: res.error?.message || 'Reset failed.' });
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    return u.username.toLowerCase().includes(q) || (u.email && u.email.toLowerCase().includes(q));
  });

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            User Administration & Access Control
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage system logins, roles, password resets, and last-superadmin protection
          </p>
        </div>

        <button
          onClick={() => setIsNewUserOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Create User Login
        </button>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by username or email..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
        />
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="py-3 px-4">Username</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Email</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Security State</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredUsers.map((u) => {
              const isSelf = u.id === currentUser.id;
              return (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono font-medium text-slate-900">
                    {u.username}
                    {u.is_system_default && (
                      <span className="ml-2 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Default Seed
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-800">{u.role}</td>
                  <td className="py-3 px-4 text-slate-600">{u.email || '—'}</td>
                  <td className="py-3 px-4">
                    <span className={`font-semibold ${u.is_active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {u.is_active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {u.must_change_password ? (
                      <span className="text-amber-700 font-medium">Must Change Password</span>
                    ) : (
                      <span className="text-slate-500">Verified</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      onClick={() => {
                        setResetTargetUser(u);
                        setNewTempPass('temp@Pass123');
                      }}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                      title="Reset Password"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>

                    {u.is_active ? (
                      <button
                        onClick={() => handleDeactivate(u)}
                        disabled={isSelf}
                        className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md disabled:opacity-30"
                        title="Deactivate User"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(u)}
                        className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md"
                        title="Activate User"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {isNewUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Create New System User</h2>
              <button onClick={() => setIsNewUserOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. john.doe"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. john@apextech.io"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Assigned Role *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md"
                >
                  {isSuperadmin && <option value="SUPERADMIN">SUPERADMIN (Full Platform Access)</option>}
                  <option value="ADMIN">ADMIN (Company Operations)</option>
                  <option value="HR">HR (People Operations)</option>
                  <option value="EMPLOYEE">EMPLOYEE (Self-Service)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Temporary Initial Password *</label>
                <input
                  type="text"
                  required
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-md font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">User will be forced to change this on first login.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewUserOpen(false)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h2 className="text-sm font-bold text-slate-900">
                Reset Password: {resetTargetUser.username}
              </h2>
              <button onClick={() => setResetTargetUser(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Temporary Password *</label>
                <input
                  type="text"
                  required
                  value={newTempPass}
                  onChange={(e) => setNewTempPass(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-slate-900 rounded-lg"
                >
                  Confirm Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
