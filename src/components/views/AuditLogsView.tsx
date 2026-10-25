/**
 * HCM Lite - Append-Only Immutable Audit Log Viewer
 * Accessible to Superadmin & Admin only (Section 4.5, 6.9, RB-03)
 */

import React, { useState, useEffect } from 'react';
import { FileText, Shield, Search, Eye, X, Filter } from 'lucide-react';
import { AuditLog, User } from '../../types/hcm';
import { api } from '../../services/api';
import { db } from '../../services/db';

interface AuditLogsViewProps {
  currentUser: User;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = async () => {
    setIsLoading(true);
    const res = await api.getAuditLogs();
    if (res.status === 200 && res.data) {
      setLogs(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadLogs();
    const unsub = db.subscribe(() => {
      loadLogs();
    });
    return unsub;
  }, []);

  const filteredLogs = logs.filter((l) => {
    const q = searchTerm.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.entity.toLowerCase().includes(q) ||
      l.actor_role.toLowerCase().includes(q) ||
      l.actor_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-7xl mx-auto text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-1.5 text-slate-500 mb-1">
            <Shield className="w-3.5 h-3.5 text-slate-700" />
            <span className="font-semibold">Security Compliance</span>
            <span>·</span>
            <span>Append-Only Table (No Update / Delete API)</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            System Audit Trail
          </h1>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by action, entity, actor role..."
          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
            <tr>
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Actor</th>
              <th className="py-3 px-4">Entity</th>
              <th className="py-3 px-4">IP Address</th>
              <th className="py-3 px-4 text-right">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                  No audit records found.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 text-slate-500 tabular-nums">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">{log.action}</td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-800">{log.actor_role}</span>
                    <span className="text-[10px] text-slate-400 block">{log.actor_id}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {log.entity} <span className="text-slate-400">({log.entity_id.substring(0, 8)})</span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{log.ip}</td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                      title="Inspect Diff Payload"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* JSON Payload Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
          <div className="w-full max-w-xl bg-white rounded-xl shadow-xl border border-slate-200 p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-slate-500 text-[10px]">{selectedLog.id}</span>
                <h2 className="text-sm font-bold text-slate-900">{selectedLog.action}</h2>
              </div>
              <button onClick={() => setSelectedLog(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-3 font-mono">
              <div>
                <span className="font-semibold text-slate-700 block mb-1">Before State:</span>
                <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto text-[11px] max-h-36">
                  {selectedLog.before ? JSON.stringify(selectedLog.before, null, 2) : 'null (New Record)'}
                </pre>
              </div>

              <div>
                <span className="font-semibold text-slate-700 block mb-1">After State:</span>
                <pre className="p-3 bg-slate-50 border border-slate-200 rounded-lg overflow-x-auto text-[11px] max-h-36">
                  {selectedLog.after ? JSON.stringify(selectedLog.after, null, 2) : 'null'}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
