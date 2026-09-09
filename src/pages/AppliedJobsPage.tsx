import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { socket } from '../lib/socket';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';
import {
  Briefcase,
  MapPin,
  IndianRupee,
  Building2,
  Clock,
  CheckCircle,
  CheckCircle2,
  Calendar,
  Sparkles,
  Eye,
  X,
  XCircle,
  AlertTriangle,
  Flag,
  Ban,
} from 'lucide-react';
import ReportModal from '../components/ReportModal';
import BlockModal from '../components/BlockModal';

interface AppliedJob {
  id: number;
  worker_id: string | number;
  worker_name?: string;
  job_id: number;
  status: string; // Application status: 'Pending' | 'Hired' | 'Rejected' | 'No Show'
  created_at: string;
  job_title: string;
  description?: string;
  wage: number;
  location: string;
  job_status?: string; // Job status: 'OPEN' | 'HIRED' | 'COMPLETED'
  employer_id?: number | string;
  employer_name?: string;
}

export default function AppliedJobsPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const [applications, setApplications] = useState<AppliedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlightedAppId, setHighlightedAppId] = useState<number | null>(null);

  // Filter: ALL | APPLIED | HIRED | COMPLETED
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'APPLIED' | 'HIRED' | 'COMPLETED'>('ALL');

  // Job Details Modal state
  const [selectedJobForDetails, setSelectedJobForDetails] = useState<AppliedJob | null>(null);
  const [reportTarget, setReportTarget] = useState<{ id: number; name?: string } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: number; name?: string } | null>(null);

  // Determine worker ID from profile or localStorage
  const getWorkerId = (): string | number | null => {
    if (profile?.id) return profile.id;
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const u = JSON.parse(stored);
        return u?.id || null;
      }
    } catch {
      // Ignore
    }
    return null;
  };

  const fetchApplications = async () => {
    const workerId = getWorkerId();
    if (!workerId) {
      setLoading(false);
      setApplications([]);
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/applied-jobs/${workerId}`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        setApplications([]);
        return;
      }

      const data = await response.json();
      setApplications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('Error fetching worker applied jobs:', error);
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();

    // Refetch in real-time when notifications/status changes arrive
    const handleStatusUpdate = () => {
      fetchApplications();
    };

    socket.on('hiredNotification', handleStatusUpdate);
    socket.on('jobCompletedNotification', handleStatusUpdate);
    socket.on('jobStatusUpdated', handleStatusUpdate);
    socket.on('applicationStatusUpdated', handleStatusUpdate);
    socket.on('workerRejected', handleStatusUpdate);
    socket.on('workerNoShow', handleStatusUpdate);

    return () => {
      socket.off('hiredNotification', handleStatusUpdate);
      socket.off('jobCompletedNotification', handleStatusUpdate);
      socket.off('jobStatusUpdated', handleStatusUpdate);
      socket.off('applicationStatusUpdated', handleStatusUpdate);
      socket.off('workerRejected', handleStatusUpdate);
      socket.off('workerNoShow', handleStatusUpdate);
    };
  }, [profile?.id]);

  const getEffectiveStatus = (app: AppliedJob): 'APPLIED' | 'HIRED' | 'COMPLETED' | 'REJECTED' | 'NOSHOW' => {
    if (app.job_status && app.job_status.toUpperCase() === 'COMPLETED') {
      return 'COMPLETED';
    }
    if (app.status === 'Hired' || (app.job_status && app.job_status.toUpperCase() === 'HIRED')) {
      return 'HIRED';
    }
    if (app.status === 'Rejected') {
      return 'REJECTED';
    }
    if (app.status === 'NO_SHOW' || app.status === 'No Show' || app.status?.toUpperCase() === 'NO_SHOW') {
      return 'NOSHOW';
    }
    return 'APPLIED';
  };

  const filteredApplications = applications.filter((app) => {
    const eff = getEffectiveStatus(app);
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'APPLIED') return eff === 'APPLIED' || eff === 'REJECTED' || eff === 'NOSHOW';
    if (activeFilter === 'HIRED') return eff === 'HIRED';
    if (activeFilter === 'COMPLETED') return eff === 'COMPLETED';
    return true;
  });

  const allCount = applications.length;
  const appliedCount = applications.filter((a) => getEffectiveStatus(a) === 'APPLIED').length;
  const hiredCount = applications.filter((a) => getEffectiveStatus(a) === 'HIRED').length;
  const completedCount = applications.filter((a) => getEffectiveStatus(a) === 'COMPLETED').length;

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return 'Recently';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'Recently';
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Recently';
    }
  };

  /* =========================================
     HANDLE NOTIFICATION DEEP LINK NAVIGATION
  ========================================= */
  useEffect(() => {
    const navState = location.state as {
      jobId?: number | string;
      applicationId?: number | string;
      notifType?: string;
    } | null;

    if (
      !navState ||
      (!navState.jobId && !navState.applicationId) ||
      applications.length === 0
    ) {
      return;
    }

    const targetAppId = navState.applicationId ? Number(navState.applicationId) : null;
    const targetJobId = navState.jobId ? Number(navState.jobId) : null;

    const matchedApp = applications.find(
      (app) =>
        (targetAppId && Number(app.id) === targetAppId) ||
        (targetJobId && Number(app.job_id) === targetJobId)
    );

    if (matchedApp) {
      const effStatus = getEffectiveStatus(matchedApp);

      // Ensure the active tab filter allows the matched item to be visible
      if (
        (activeFilter === 'APPLIED' && effStatus !== 'APPLIED' && effStatus !== 'REJECTED' && effStatus !== 'NOSHOW') ||
        (activeFilter === 'HIRED' && effStatus !== 'HIRED') ||
        (activeFilter === 'COMPLETED' && effStatus !== 'COMPLETED')
      ) {
        setActiveFilter('ALL');
      }

      setHighlightedAppId(matchedApp.id);
      setSelectedJobForDetails(matchedApp);

      const timer = setTimeout(() => {
        const el = document.getElementById(`application-card-${matchedApp.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 350);

      const clearTimer = setTimeout(() => {
        setHighlightedAppId((prev) => (prev === matchedApp.id ? null : prev));
      }, 4500);

      try {
        window.history.replaceState({}, document.title);
      } catch {
        // Ignore
      }

      return () => {
        clearTimeout(timer);
        clearTimeout(clearTimer);
      };
    }
  }, [location.state, applications, activeFilter]);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            My Applications & Job History
          </h1>
          <p className="text-slate-400 mt-1 text-xs sm:text-sm">
            Track your job applications, current hiring status, and completed work history.
          </p>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
            activeFilter === 'ALL'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>All Applications</span>
          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] ${activeFilter === 'ALL' ? 'bg-cyan-700 text-white' : 'bg-slate-700 text-slate-300'}`}>
            {allCount}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('APPLIED')}
          className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
            activeFilter === 'APPLIED'
              ? 'bg-amber-500 text-slate-900 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Applied / Pending</span>
          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] ${activeFilter === 'APPLIED' ? 'bg-amber-600 text-slate-900 font-bold' : 'bg-slate-700 text-slate-300'}`}>
            {appliedCount}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('HIRED')}
          className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
            activeFilter === 'HIRED'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Hired</span>
          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] ${activeFilter === 'HIRED' ? 'bg-emerald-800 text-white' : 'bg-slate-700 text-slate-300'}`}>
            {hiredCount}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('COMPLETED')}
          className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 ${
            activeFilter === 'COMPLETED'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>Completed</span>
          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[11px] ${activeFilter === 'COMPLETED' ? 'bg-purple-800 text-white' : 'bg-slate-700 text-slate-300'}`}>
            {completedCount}
          </span>
        </button>
      </div>

      {/* APPLICATIONS LIST */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredApplications.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 text-lg font-medium">
            {activeFilter === 'ALL'
              ? 'No job applications yet.'
              : `No ${activeFilter.toLowerCase()} applications found.`}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            Browse Find Jobs to discover and apply for daily wage opportunities.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredApplications.map((app) => {
            const effStatus = getEffectiveStatus(app);

            return (
              <div
                key={app.id}
                id={`application-card-${app.id}`}
                className={`glass-card p-4 sm:p-6 transition-all duration-500 hover:border-slate-600/60 ${
                  highlightedAppId === app.id
                    ? 'ring-2 ring-cyan-400 bg-cyan-950/40 shadow-lg shadow-cyan-500/20'
                    : ''
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* LEFT: JOB INFO */}
                  <div className="flex-1 min-w-0">
                    {/* TITLE & PRIMARY BADGE */}
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      <h2 className="text-lg sm:text-xl font-bold text-white break-words">
                        {app.job_title}
                      </h2>

                      {effStatus === 'COMPLETED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completed
                        </span>
                      )}

                      {effStatus === 'HIRED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Hired
                        </span>
                      )}

                      {effStatus === 'APPLIED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                          <Clock className="w-3.5 h-3.5" />
                          Applied / Pending
                        </span>
                      )}

                      {effStatus === 'REJECTED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/15 border border-rose-500/30 text-rose-400">
                          <XCircle className="w-3.5 h-3.5" />
                          Not Selected
                        </span>
                      )}

                      {effStatus === 'NOSHOW' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          NO_SHOW
                        </span>
                      )}
                    </div>

                    {app.description && (
                      <p className="text-slate-400 mt-2 text-sm">
                        {app.description}
                      </p>
                    )}

                    {/* DETAILS GRID */}
                    <div className="flex flex-wrap gap-5 mt-4 text-sm">
                      {/* WAGE */}
                      <div className="flex items-center gap-1.5 text-cyan-400 font-semibold">
                        <IndianRupee className="w-4 h-4" />
                        <span>₹{app.wage}/day</span>
                      </div>

                      {/* LOCATION */}
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <MapPin className="w-4 h-4 text-slate-400" />
                        <span>{app.location}</span>
                      </div>

                      {/* EMPLOYER */}
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        <span>Employer: <strong className="text-white">{app.employer_name || 'Employer'}</strong></span>
                      </div>

                      {/* APPLIED DATE */}
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        <span>Applied on: {formatDate(app.created_at)}</span>
                      </div>
                    </div>

                    {/* STATUS BREAKDOWN CHIPS */}
                    <div className="mt-5 flex flex-wrap items-center gap-3 pt-4 border-t border-slate-800/80">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Application Status:</span>
                        {app.status === 'Hired' ? (
                          <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                            Accepted / Hired
                          </span>
                        ) : app.status === 'Rejected' ? (
                          <span className="font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-md border border-rose-500/20">
                            Not Selected
                          </span>
                        ) : (app.status === 'NO_SHOW' || app.status === 'No Show' || app.status?.toUpperCase() === 'NO_SHOW') ? (
                          <span className="font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20">
                            NO_SHOW
                          </span>
                        ) : (
                          <span className="font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-md border border-amber-500/20">
                            Pending Review
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Job Status:</span>
                        <span className={`font-semibold px-2.5 py-0.5 rounded-md border ${
                          effStatus === 'COMPLETED'
                            ? 'text-purple-300 bg-purple-500/10 border-purple-500/20'
                            : effStatus === 'HIRED'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                        }`}>
                          {app.job_status || (effStatus === 'HIRED' ? 'HIRED' : 'OPEN')}
                        </span>
                      </div>
                    </div>

                    {/* SPECIAL HIGHLIGHT BANNERS */}
                    {effStatus === 'COMPLETED' && (
                      <div className="mt-4 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-2.5 text-purple-300 text-sm">
                        <Sparkles className="w-4 h-4 flex-shrink-0 text-purple-400" />
                        <span>
                          <strong>Job Completed:</strong> The employer has marked this job as completed. Thank you for your work!
                        </span>
                      </div>
                    )}

                    {effStatus === 'HIRED' && (
                      <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2.5 text-emerald-300 text-sm">
                        <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                        <span>
                          <strong>You are Hired!</strong> Please connect with the employer for work details.
                        </span>
                      </div>
                    )}

                    {effStatus === 'REJECTED' && (
                      <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-rose-300 text-sm">
                        <XCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                        <span>
                          <strong>Application Not Selected:</strong> The employer did not select this application. You can explore and apply for other jobs!
                        </span>
                      </div>
                    )}

                    {effStatus === 'NOSHOW' && (
                      <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2.5 text-amber-300 text-sm">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                        <span>
                          <strong>Worker No-Show:</strong> Worker marked as No-Show for this job. The job has been reopened.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* RIGHT: ACTION BUTTON */}
                  <div className="w-full md:w-auto flex flex-wrap items-center justify-between md:justify-end gap-2 mt-4 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800/80 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedJobForDetails(app)}
                      className="flex-1 sm:flex-initial px-3.5 sm:px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-400 hover:text-cyan-300 font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View Job</span>
                    </button>

                    {app.employer_id && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({
                              id: Number(app.employer_id),
                              name: app.employer_name || 'Employer',
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                          title="Report Employer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>Report</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setBlockTarget({
                              id: Number(app.employer_id),
                              name: app.employer_name || 'Employer',
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1"
                          title="Block Employer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Block</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* JOB DETAILS MODAL */}
      {selectedJobForDetails && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 p-4 sm:p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-4 sm:space-y-5 max-h-[90vh] overflow-y-auto">
            {/* MODAL HEADER */}
            <div className="flex items-start justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                  <Briefcase className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-xl font-bold text-white break-words">
                    {selectedJobForDetails.job_title}
                  </h3>
                  <p className="text-xs text-slate-400 truncate">Job Details & Application Overview</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJobForDetails(null)}
                className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer shrink-0"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STATUS CARDS */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/70">
                <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                  Application Status
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                  selectedJobForDetails.status === 'Hired'
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                    : 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                }`}>
                  {selectedJobForDetails.status === 'Hired' ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Accepted / Hired
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5" />
                      Pending Review
                    </>
                  )}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-800/70 border border-slate-700/70">
                <span className="block text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1">
                  Job Status
                </span>
                {(() => {
                  const jobStat = (selectedJobForDetails.job_status || 'OPEN').toUpperCase();
                  if (jobStat === 'COMPLETED') {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        COMPLETED
                      </span>
                    );
                  }
                  if (jobStat === 'HIRED') {
                    return (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
                        <CheckCircle className="w-3.5 h-3.5" />
                        HIRED
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/30">
                      <Clock className="w-3.5 h-3.5" />
                      OPEN
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* KEY DETAILS GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* WAGE */}
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <IndianRupee className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Daily Wage</div>
                  <div className="text-sm font-bold text-cyan-400">₹{selectedJobForDetails.wage}/day</div>
                </div>
              </div>

              {/* LOCATION */}
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400">Location</div>
                  <div className="text-sm font-semibold text-white truncate" title={selectedJobForDetails.location}>
                    {selectedJobForDetails.location}
                  </div>
                </div>
              </div>

              {/* TIMING */}
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Timing</div>
                  <div className="text-sm font-semibold text-white">Full Day (Daily Wage)</div>
                </div>
              </div>

              {/* EMPLOYER */}
              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-slate-400">Employer</div>
                  <div className="text-sm font-semibold text-white truncate">
                    {selectedJobForDetails.employer_name || 'Employer'}
                  </div>
                </div>
              </div>
            </div>

            {/* APPLIED DATE */}
            <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-500" />
                Application Submitted On:
              </span>
              <strong className="text-slate-200">{formatDate(selectedJobForDetails.created_at)}</strong>
            </div>

            {/* JOB DESCRIPTION */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Job Description
              </h4>
              <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-sm text-slate-300 leading-relaxed max-h-40 overflow-y-auto">
                {selectedJobForDetails.description ? (
                  selectedJobForDetails.description
                ) : (
                  <span className="text-slate-500 italic">No additional description provided by employer.</span>
                )}
              </div>
            </div>

            {/* APPLICATION RULE BANNER (NO APPLY NOW, DUPLICATE PREVENTED) */}
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/50 flex items-start gap-3 text-xs text-cyan-300">
              <Sparkles className="w-4 h-4 flex-shrink-0 text-cyan-400 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Application Already Submitted</p>
                <p className="text-cyan-300/80 mt-0.5">
                  You have already applied for this job. Duplicate applications are disabled to protect worker priority.
                </p>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-800">
              {selectedJobForDetails.employer_id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setReportTarget({
                        id: Number(selectedJobForDetails.employer_id),
                        name: selectedJobForDetails.employer_name || 'Employer',
                      })
                    }
                    className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Report</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBlockTarget({
                        id: Number(selectedJobForDetails.employer_id),
                        name: selectedJobForDetails.employer_name || 'Employer',
                      })
                    }
                    className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Block</span>
                  </button>
                </div>
              ) : <div />}

              <button
                type="button"
                onClick={() => setSelectedJobForDetails(null)}
                className="w-full sm:w-auto px-5 py-2 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs sm:text-sm transition cursor-pointer border border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUserId={reportTarget?.id || null}
        reportedUserName={reportTarget?.name}
      />

      <BlockModal
        isOpen={!!blockTarget}
        onClose={() => setBlockTarget(null)}
        blockedUserId={blockTarget?.id || null}
        blockedUserName={blockTarget?.name}
        onSuccess={() => {
          setSelectedJobForDetails(null);
          fetchApplications();
        }}
      />
    </div>
  );
}
