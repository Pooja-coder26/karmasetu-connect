import { useEffect, useState } from 'react';
import {
  Users,
  Briefcase,
  FileText,
  Flag,
  ShieldCheck,
  CheckCircle,
  CheckCircle2,
  Clock,
  Ban,
  Eye,
  AlertCircle,
  RefreshCw,
  X,
  Search,
  Building2,
  MapPin,
} from 'lucide-react';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';

interface Stats {
  totalWorkers: number;
  totalEmployers: number;
  totalJobs: number;
  openJobs: number;
  hiredJobs: number;
  completedJobs: number;
  totalApplications: number;
  pendingReports: number;
}

interface AdminUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  location: string | null;
  status: string;
  created_at: string;
}

interface AdminJob {
  id: number;
  title: string;
  description: string | null;
  wage: number;
  location: string;
  status: string;
  created_at: string;
  employer_id: number | string;
  employer_name: string;
  employer_email?: string | null;
  employer_phone?: string | null;
}

interface AdminApplication {
  id: number;
  job_id: number;
  job_title: string;
  wage: number;
  job_location: string;
  worker_id: number | string;
  worker_name: string;
  employer_id: number | string;
  employer_name: string;
  status: string;
  created_at: string;
}

interface AdminReport {
  id: number;
  reporter_id: number;
  reporter_name: string;
  reporter_role: string;
  reporter_email: string | null;
  reported_user_id: number;
  reported_user_name: string;
  reported_user_role: string;
  reported_user_email: string | null;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'jobs' | 'applications' | 'reports'>('users');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [stats, setStats] = useState<Stats>({
    totalWorkers: 0,
    totalEmployers: 0,
    totalJobs: 0,
    openJobs: 0,
    hiredJobs: 0,
    completedJobs: 0,
    totalApplications: 0,
    pendingReports: 0,
  });

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [jobs, setJobs] = useState<AdminJob[]>([]);
  const [applications, setApplications] = useState<AdminApplication[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterJobStatus, setFilterJobStatus] = useState('ALL');
  const [filterReportStatus, setFilterReportStatus] = useState('ALL');

  // Detail Modals
  const [viewUser, setViewUser] = useState<AdminUser | null>(null);
  const [viewJob, setViewJob] = useState<AdminJob | null>(null);
  const [viewApp, setViewApp] = useState<AdminApplication | null>(null);
  const [viewReport, setViewReport] = useState<AdminReport | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchStats(),
      fetchUsers(),
      fetchJobs(),
      fetchApplications(),
      fetchReports(),
    ]);
    setLoading(false);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/stats`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load admin stats:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to load admin users:', err);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/jobs`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('Failed to load admin jobs:', err);
    }
  };

  const fetchApplications = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/applications`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setApplications(data);
      }
    } catch (err) {
      console.error('Failed to load admin applications:', err);
    }
  };

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (err) {
      console.error('Failed to load admin reports:', err);
    }
  };

  // User Actions
  const handleToggleUserStatus = async (user: AdminUser) => {
    const isSuspending = user.status !== 'SUSPENDED';
    const newStatus = isSuspending ? 'SUSPENDED' : 'ACTIVE';

    if (
      !confirm(
        `Are you sure you want to ${isSuspending ? 'SUSPEND' : 'ACTIVATE'} ${user.name}? ${
          isSuspending
            ? 'The user will be immediately blocked from logging in or using KarmaSetu.'
            : 'The user will be allowed to use KarmaSetu normally.'
        }`
      )
    ) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${user.id}/status`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to update user status');

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u))
      );
      if (viewUser?.id === user.id) {
        setViewUser({ ...viewUser, status: newStatus });
      }
      setFeedback({
        type: 'success',
        message: `User ${user.name} is now ${newStatus}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // Job Actions
  const handleToggleJobStatus = async (job: AdminJob) => {
    const isDisabling = job.status !== 'DISABLED';
    const newStatus = isDisabling ? 'DISABLED' : 'OPEN';

    if (
      !confirm(
        `Are you sure you want to ${isDisabling ? 'DISABLE' : 'REACTIVATE'} job "${job.title}"? ${
          isDisabling
            ? 'This job will be hidden from worker feeds and Google Maps.'
            : 'This job will be reopened and visible to eligible workers.'
        }`
      )
    ) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/jobs/${job.id}/status`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to update job status');

      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: newStatus } : j))
      );
      if (viewJob?.id === job.id) {
        setViewJob({ ...viewJob, status: newStatus });
      }
      fetchStats();
      setFeedback({
        type: 'success',
        message: `Job #${job.id} marked as ${newStatus}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // Report Actions
  const handleUpdateReportStatus = async (reportId: number, status: 'RESOLVED' | 'DISMISSED') => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/reports/${reportId}/status`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to update report status');

      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      );
      if (viewReport?.id === reportId) {
        setViewReport({ ...viewReport, status });
      }
      fetchStats();
      setFeedback({
        type: 'success',
        message: `Report #${reportId} marked as ${status}.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // Suspend Reported User Directly
  const handleSuspendFromReport = async (report: AdminReport) => {
    if (
      !confirm(
        `Are you sure you want to suspend reported user "${report.reported_user_name}"? Their account will be blocked immediately.`
      )
    ) {
      return;
    }

    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${report.reported_user_id}/status`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'SUSPENDED' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Failed to suspend user');

      // Also resolve report
      await handleUpdateReportStatus(report.id, 'RESOLVED');
      fetchUsers();
      setFeedback({
        type: 'success',
        message: `User ${report.reported_user_name} suspended and report marked as RESOLVED.`,
      });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Action failed' });
    } finally {
      setActionLoading(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone?.includes(searchQuery) ||
      String(u.id).includes(searchQuery);
    const matchesRole = filterRole === 'ALL' || u.role?.toLowerCase() === filterRole.toLowerCase();
    return matchesSearch && matchesRole;
  });

  // Filtered Jobs
  const filteredJobs = jobs.filter((j) => {
    const matchesSearch =
      j.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.employer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(j.id).includes(searchQuery);
    const matchesStatus =
      filterJobStatus === 'ALL' ||
      (j.status || 'OPEN').toUpperCase() === filterJobStatus.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  // Filtered Applications
  const filteredApps = applications.filter((a) => {
    return (
      a.job_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.worker_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.employer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(a.id).includes(searchQuery)
    );
  });

  // Filtered Reports
  const filteredReports = reports.filter((r) => {
    const matchesSearch =
      r.reporter_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reported_user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(r.id).includes(searchQuery);
    const matchesStatus =
      filterReportStatus === 'ALL' ||
      r.status?.toUpperCase() === filterReportStatus.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* DASHBOARD HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Admin Dashboard</h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Administrator
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            System overview and moderation control for KarmaSetu Connect
          </p>
        </div>

        <button
          onClick={loadAllData}
          disabled={loading || actionLoading}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition cursor-pointer flex items-center gap-2 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* FEEDBACK BANNER */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium border flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 8 SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Workers */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-blue-400">
            <span className="text-xs font-medium text-slate-400">Total Workers</span>
            <div className="p-2 rounded-xl bg-blue-500/10">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalWorkers}</div>
        </div>

        {/* Total Employers */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-purple-400">
            <span className="text-xs font-medium text-slate-400">Total Employers</span>
            <div className="p-2 rounded-xl bg-purple-500/10">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalEmployers}</div>
        </div>

        {/* Total Jobs */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="text-xs font-medium text-slate-400">Total Jobs</span>
            <div className="p-2 rounded-xl bg-cyan-500/10">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalJobs}</div>
        </div>

        {/* Open Jobs */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-medium text-slate-400">Open Jobs</span>
            <div className="p-2 rounded-xl bg-emerald-500/10">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.openJobs}</div>
        </div>

        {/* Hired Jobs */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-teal-400">
            <span className="text-xs font-medium text-slate-400">Hired Jobs</span>
            <div className="p-2 rounded-xl bg-teal-500/10">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.hiredJobs}</div>
        </div>

        {/* Completed Jobs */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-indigo-400">
            <span className="text-xs font-medium text-slate-400">Completed Jobs</span>
            <div className="p-2 rounded-xl bg-indigo-500/10">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.completedJobs}</div>
        </div>

        {/* Total Applications */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-medium text-slate-400">Total Applications</span>
            <div className="p-2 rounded-xl bg-amber-500/10">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white">{stats.totalApplications}</div>
        </div>

        {/* Pending Reports */}
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-rose-400">
            <span className="text-xs font-medium text-slate-400">Pending Reports</span>
            <div className="p-2 rounded-xl bg-rose-500/10">
              <Flag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-400">{stats.pendingReports}</div>
        </div>
      </div>

      {/* TAB NAVIGATION */}
      <div className="flex border-b border-slate-800 gap-2 overflow-x-auto pb-px">
        <button
          onClick={() => {
            setActiveTab('users');
            setSearchQuery('');
          }}
          className={`px-5 py-3 font-semibold text-sm rounded-t-xl transition-all border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'users'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users ({users.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('jobs');
            setSearchQuery('');
          }}
          className={`px-5 py-3 font-semibold text-sm rounded-t-xl transition-all border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'jobs'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Jobs ({jobs.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('applications');
            setSearchQuery('');
          }}
          className={`px-5 py-3 font-semibold text-sm rounded-t-xl transition-all border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'applications'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Applications ({applications.length})</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('reports');
            setSearchQuery('');
          }}
          className={`px-5 py-3 font-semibold text-sm rounded-t-xl transition-all border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'reports'
              ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Flag className="w-4 h-4" />
          <span>Reports ({reports.length})</span>
          {stats.pendingReports > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
              {stats.pendingReports}
            </span>
          )}
        </button>
      </div>

      {/* SEARCH AND FILTERS BAR */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>

        {activeTab === 'users' && (
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Roles</option>
            <option value="worker">Workers Only</option>
            <option value="employer">Employers Only</option>
            <option value="admin">Admins Only</option>
          </select>
        )}

        {activeTab === 'jobs' && (
          <select
            value={filterJobStatus}
            onChange={(e) => setFilterJobStatus(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="HIRED">Hired</option>
            <option value="COMPLETED">Completed</option>
            <option value="DISABLED">Disabled</option>
          </select>
        )}

        {activeTab === 'reports' && (
          <select
            value={filterReportStatus}
            onChange={(e) => setFilterReportStatus(e.target.value)}
            className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        )}
      </div>

      {/* TAB CONTENT */}

      {/* 1. USERS TAB */}
      {activeTab === 'users' && (
        <div className="glass-card bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">ID</th>
                  <th className="py-3.5 px-4">User</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Joined</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                      No users match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">#{u.id}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{u.name || 'Unnamed'}</div>
                        {u.location && (
                          <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            <span>{u.location}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {u.phone && <div>{u.phone}</div>}
                        {u.email && <div>{u.email}</div>}
                        {!u.phone && !u.email && <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            u.role === 'admin'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              : u.role === 'employer'
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.status === 'SUSPENDED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {u.status === 'SUSPENDED' ? (
                            <Ban className="w-3 h-3" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3" />
                          )}
                          <span>{u.status || 'ACTIVE'}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewUser(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="View User Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {u.role !== 'admin' && (
                            <button
                              onClick={() => handleToggleUserStatus(u)}
                              disabled={actionLoading}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                u.status === 'SUSPENDED'
                                  ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30'
                              }`}
                            >
                              {u.status === 'SUSPENDED' ? 'Activate' : 'Suspend'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. JOBS TAB */}
      {activeTab === 'jobs' && (
        <div className="glass-card bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">ID</th>
                  <th className="py-3.5 px-4">Job Title</th>
                  <th className="py-3.5 px-4">Employer</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4">Wage</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Created</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredJobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                      No jobs match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">#{j.id}</td>
                      <td className="py-3.5 px-4 font-semibold text-white max-w-xs truncate" title={j.title}>
                        {j.title}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">{j.employer_name}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-400 max-w-xs truncate" title={j.location}>
                        {j.location}
                      </td>
                      <td className="py-3.5 px-4 text-cyan-400 font-semibold">₹{j.wage}/day</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            j.status === 'COMPLETED'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30'
                              : j.status === 'HIRED'
                              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
                              : j.status === 'DISABLED'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {j.status || 'OPEN'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {j.created_at ? new Date(j.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setViewJob(j)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="View Job Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleToggleJobStatus(j)}
                            disabled={actionLoading}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              j.status === 'DISABLED'
                                ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30'
                            }`}
                          >
                            {j.status === 'DISABLED' ? 'Reopen' : 'Disable'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. APPLICATIONS TAB */}
      {activeTab === 'applications' && (
        <div className="glass-card bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">ID</th>
                  <th className="py-3.5 px-4">Job</th>
                  <th className="py-3.5 px-4">Worker</th>
                  <th className="py-3.5 px-4">Employer</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Applied Date</th>
                  <th className="py-3.5 px-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredApps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                      No applications match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredApps.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">#{a.id}</td>
                      <td className="py-3.5 px-4 font-semibold text-white max-w-xs truncate" title={a.job_title}>
                        {a.job_title}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">{a.worker_name}</td>
                      <td className="py-3.5 px-4 text-slate-400">{a.employer_name}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            a.status === 'Hired'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : a.status === 'Rejected'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                              : a.status === 'NO_SHOW' || a.status === 'No Show'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                              : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setViewApp(a)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                          title="View Application Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. REPORTS TAB */}
      {activeTab === 'reports' && (
        <div className="glass-card bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">ID</th>
                  <th className="py-3.5 px-4">Reporter</th>
                  <th className="py-3.5 px-4">Reported User</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                      No reports match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-400 text-xs">#{r.id}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{r.reporter_name}</div>
                        <div className="text-[11px] text-slate-500 uppercase">{r.reporter_role}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-white">{r.reported_user_name}</div>
                        <div className="text-[11px] text-slate-500 uppercase">{r.reported_user_role}</div>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200">{r.reason}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            r.status === 'RESOLVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                              : r.status === 'DISMISSED'
                              ? 'bg-slate-700/50 text-slate-400 border border-slate-700'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setViewReport(r)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="View Report Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {r.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => handleUpdateReportStatus(r.id, 'RESOLVED')}
                                disabled={actionLoading}
                                className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition"
                                title="Resolve Report"
                              >
                                Resolve
                              </button>
                              <button
                                onClick={() => handleUpdateReportStatus(r.id, 'DISMISSED')}
                                disabled={actionLoading}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 text-xs font-semibold transition"
                                title="Dismiss Report"
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODALS */}

      {/* 1. USER DETAILS MODAL */}
      {viewUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">User Details (#{viewUser.id})</h3>
              <button
                onClick={() => setViewUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-slate-400 block">Name</span>
                <span className="font-semibold text-white">{viewUser.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-slate-400 block">Role</span>
                  <span className="font-semibold text-cyan-400 uppercase">{viewUser.role}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Status</span>
                  <span className="font-semibold text-white">{viewUser.status || 'ACTIVE'}</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Contact Info</span>
                <span className="text-slate-200 block">{viewUser.phone || 'No phone'}</span>
                <span className="text-slate-200 block">{viewUser.email || 'No email'}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Location</span>
                <span className="text-slate-200">{viewUser.location || 'Not provided'}</span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              {viewUser.role !== 'admin' && (
                <button
                  onClick={() => handleToggleUserStatus(viewUser)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                    viewUser.status === 'SUSPENDED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {viewUser.status === 'SUSPENDED' ? 'Activate Account' : 'Suspend Account'}
                </button>
              )}
              <button
                onClick={() => setViewUser(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. JOB DETAILS MODAL */}
      {viewJob && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Job Details (#{viewJob.id})</h3>
              <button
                onClick={() => setViewJob(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <h4 className="text-xl font-bold text-white">{viewJob.title}</h4>
                <p className="text-xs text-slate-400 mt-1">Status: {viewJob.status || 'OPEN'}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-xs text-slate-400 block mb-1">Description</span>
                <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-line">
                  {viewJob.description || 'No description provided.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Wage</span>
                  <span className="text-sm font-bold text-cyan-400">₹{viewJob.wage}/day</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-xs text-slate-400 block">Location</span>
                  <span className="text-sm font-semibold text-slate-200">{viewJob.location}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                <span className="text-xs text-slate-400 block">Employer</span>
                <span className="text-sm font-semibold text-white">{viewJob.employer_name}</span>
                {viewJob.employer_phone && (
                  <span className="text-xs text-slate-400 block mt-0.5">{viewJob.employer_phone}</span>
                )}
                {viewJob.employer_email && (
                  <span className="text-xs text-slate-400 block">{viewJob.employer_email}</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => handleToggleJobStatus(viewJob)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                  viewJob.status === 'DISABLED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {viewJob.status === 'DISABLED' ? 'Reopen Job' : 'Disable Job'}
              </button>
              <button
                onClick={() => setViewJob(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. APPLICATION DETAILS MODAL */}
      {viewApp && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Application (#{viewApp.id})</h3>
              <button
                onClick={() => setViewApp(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-xs text-slate-400 block">Job</span>
                <span className="font-semibold text-white">{viewApp.job_title}</span>
                <span className="text-xs text-slate-400 block mt-0.5">
                  ₹{viewApp.wage}/day • {viewApp.job_location}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-xs text-slate-400 block">Worker</span>
                  <span className="font-semibold text-slate-200">{viewApp.worker_name}</span>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block">Employer</span>
                  <span className="font-semibold text-slate-200">{viewApp.employer_name}</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Application Status</span>
                <span className="font-bold text-amber-400">{viewApp.status}</span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block">Applied Date</span>
                <span className="text-slate-300">
                  {viewApp.created_at ? new Date(viewApp.created_at).toLocaleString() : '—'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setViewApp(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. REPORT DETAILS MODAL */}
      {viewReport && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-rose-400" />
                <h3 className="text-lg font-bold text-white">Report #{viewReport.id}</h3>
              </div>
              <button
                onClick={() => setViewReport(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-[11px] text-slate-400 uppercase font-bold block mb-1">
                    Reporter
                  </span>
                  <div className="font-semibold text-white">{viewReport.reporter_name}</div>
                  <div className="text-xs text-slate-400 uppercase">{viewReport.reporter_role}</div>
                  {viewReport.reporter_email && (
                    <div className="text-xs text-slate-500 mt-1">{viewReport.reporter_email}</div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                  <span className="text-[11px] text-rose-400 uppercase font-bold block mb-1">
                    Reported User
                  </span>
                  <div className="font-semibold text-white">{viewReport.reported_user_name}</div>
                  <div className="text-xs text-slate-400 uppercase">{viewReport.reported_user_role}</div>
                  {viewReport.reported_user_email && (
                    <div className="text-xs text-slate-500 mt-1">{viewReport.reported_user_email}</div>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs text-slate-400 block mb-1">Reason</span>
                <span className="inline-block px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-semibold text-xs">
                  {viewReport.reason}
                </span>
              </div>

              {viewReport.description && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-xs text-slate-400 block mb-1">Description</span>
                  <p className="text-slate-300 text-xs leading-relaxed whitespace-pre-line">
                    {viewReport.description}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                <span>Status: <strong className="text-white">{viewReport.status}</strong></span>
                <span>Reported on: {new Date(viewReport.created_at).toLocaleString()}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-800">
              {viewReport.status === 'PENDING' && (
                <>
                  <button
                    onClick={() => handleSuspendFromReport(viewReport)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 text-xs font-semibold transition"
                  >
                    Suspend Reported User
                  </button>
                  <button
                    onClick={() => handleUpdateReportStatus(viewReport.id, 'RESOLVED')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition"
                  >
                    Resolve Report
                  </button>
                  <button
                    onClick={() => handleUpdateReportStatus(viewReport.id, 'DISMISSED')}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 text-xs font-semibold transition"
                  >
                    Dismiss
                  </button>
                </>
              )}
              <button
                onClick={() => setViewReport(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
