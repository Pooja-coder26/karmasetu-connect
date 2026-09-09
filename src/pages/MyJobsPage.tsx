import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  MapPin,
  IndianRupee,
  Trash2,
  Users,
  CheckCircle,
  CheckCircle2,
  Clock,
  Briefcase,
  AlertTriangle,
  Flag,
  Ban,
} from 'lucide-react';

import { socket } from '../lib/socket';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';
import ReportModal from '../components/ReportModal';
import BlockModal from '../components/BlockModal';

interface Job {
  id: number;
  title: string;
  description: string;
  wage: number;
  location: string;
  employer_id: number;
  status?: string;
  total_applications?: number;
  pending_applications?: number;
  accepted_applications?: number;
}

interface Application {
  id: number;
  worker_id: number;
  worker_name: string;
  job_id: number;
  status: string;
  job_title?: string;
}

export default function MyJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // Status Filter State: ALL | OPEN | HIRED | COMPLETED
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'OPEN' | 'HIRED' | 'COMPLETED'>('ALL');

  // Confirmation modal state for job completion
  const [jobToComplete, setJobToComplete] = useState<Job | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Report and Block modal state
  const [reportTarget, setReportTarget] = useState<{ id: number; name?: string } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: number; name?: string } | null>(null);

  useEffect(() => {
    fetchJobs();
    fetchApplications();

    /*
     * REAL-TIME APPLICATION & JOB UPDATES
     */

    const handleApplicationAdded = (data?: any) => {
      console.log('New worker application received:', data);
      if (data?.application_id && data?.job_id) {
        setApplications((prev) => {
          if (prev.some((a) => a.id === data.application_id)) return prev;
          return [
            {
              id: data.application_id,
              worker_id: data.worker_id,
              worker_name: data.worker_name,
              job_id: data.job_id,
              status: data.status || 'Pending',
            },
            ...prev,
          ];
        });
      }
      fetchApplications();
      fetchJobs();
    };

    const handleApplicationUpdated = (data?: any) => {
      console.log('Worker application hired / updated:', data);
      const appId = Number(data?.applicationId || data?.application_id);
      if (appId) {
        setApplications((prev) =>
          prev.map((app) =>
            app.id === appId ? { ...app, status: 'Hired' } : app
          )
        );
      }
      fetchApplications();
      fetchJobs();
    };

    const handleJobStatusUpdated = (data?: any) => {
      console.log('Job status updated event:', data);
      const updatedJobId = Number(data?.job_id || data?.jobId);
      const updatedStatus = data?.status;
      if (updatedJobId && updatedStatus) {
        setJobs((prev) =>
          prev.map((j) => (j.id === updatedJobId ? { ...j, status: updatedStatus } : j))
        );
      }
      fetchJobs();
    };

    const handleJobReopened = () => {
      fetchJobs();
      fetchApplications();
    };

    socket.on('applicationAdded', handleApplicationAdded);
    socket.on('workerHired', handleApplicationUpdated);
    socket.on('workerRejected', handleApplicationUpdated);
    socket.on('workerNoShow', handleApplicationUpdated);
    socket.on('applicationStatusUpdated', handleApplicationUpdated);
    socket.on('jobStatusUpdated', handleJobStatusUpdated);
    socket.on('jobReopened', handleJobReopened);

    /*
     * CLEANUP
     */

    return () => {
      socket.off('applicationAdded', handleApplicationAdded);
      socket.off('workerHired', handleApplicationUpdated);
      socket.off('workerRejected', handleApplicationUpdated);
      socket.off('workerNoShow', handleApplicationUpdated);
      socket.off('applicationStatusUpdated', handleApplicationUpdated);
      socket.off('jobStatusUpdated', handleJobStatusUpdated);
      socket.off('jobReopened', handleJobReopened);
    };
  }, []);

  /*
   * FETCH ONLY MY JOBS
   */

  const fetchJobs = async () => {
    try {
      const storedUser = localStorage.getItem('user');

      if (!storedUser) {
        console.log('No logged-in user found');
        setJobs([]);
        return;
      }

      const user = JSON.parse(storedUser);

      if (!user?.id) {
        console.log('Employer ID not found');
        setJobs([]);
        return;
      }

      const response = await fetch(
        `${API_BASE_URL}/my-jobs/${user.id}`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch my jobs');
      }

      const data = await response.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('Fetch my jobs error:', error);
    } finally {
      setLoading(false);
    }
  };

  /*
   * FETCH ALL APPLICATIONS
   */

  const fetchApplications = async () => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/all-applications`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch applications');
      }

      const data = await response.json();
      setApplications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('Fetch applications error:', error);
    }
  };

  /*
   * GET APPLICATIONS FOR A PARTICULAR JOB
   */

  const getJobApplications = (jobId: number) => {
    return applications.filter((application) => application.job_id === jobId);
  };

  /*
   * DETERMINE EFFECTIVE JOB STATUS
   */

  const getEffectiveStatus = (job: Job): 'OPEN' | 'RESERVED' | 'HIRED' | 'COMPLETED' => {
    if (job.status && job.status.toUpperCase() === 'COMPLETED') {
      return 'COMPLETED';
    }
    if (job.status && job.status.toUpperCase() === 'HIRED') {
      return 'HIRED';
    }
    if (job.status && job.status.toUpperCase() === 'RESERVED') {
      return 'RESERVED';
    }
    const jobApps = getJobApplications(job.id);
    const hasHired = jobApps.some((a) => a.status === 'Hired') || (job.accepted_applications && job.accepted_applications > 0);
    if (hasHired) {
      return 'HIRED';
    }
    const hasPending = jobApps.some((a) => a.status === 'Pending');
    if (hasPending) {
      return 'RESERVED';
    }
    return 'OPEN';
  };

  /*
   * MARK JOB AS COMPLETED (EMPLOYER ACTION)
   */

  const handleCompleteJob = async (jobId: number) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}/status`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'COMPLETED' }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        alert(errorData?.message || 'Failed to update job status to COMPLETED');
        return;
      }

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'COMPLETED' } : j))
      );

      setJobToComplete(null);
      setSuccessMsg('Job successfully marked as COMPLETED! Hired worker has been notified.');
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchJobs();
    } catch (error) {
      console.error('Complete job error:', error);
      alert('Network error while marking job as completed');
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * WORKER NO-SHOW (EMPLOYER ACTION)
   */

  const handleInitiateNoShow = async (job: Job) => {
    if (!window.confirm(`Are you sure you want to mark the hired worker as No-Show for "${job.title}"? The application will be marked as NO_SHOW and the job will immediately be reopened for other workers.`)) {
      return;
    }

    try {
      let hiredApp = getJobApplications(job.id).find((a) => a.status === 'Hired');

      if (!hiredApp) {
        const res = await fetch(`${API_BASE_URL}/applications/${job.id}`, {
          headers: getAuthHeaders(),
        });
        if (res.ok) {
          const apps = await res.json();
          hiredApp = (apps || []).find((a: any) => a.status === 'Hired');
        }
      }

      if (!hiredApp) {
        alert('Could not locate the hired worker application for this job.');
        return;
      }

      const response = await fetch(`${API_BASE_URL}/mark-noshow/${hiredApp.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      });

      const message = await response.text();
      alert(message);
      setSuccessMsg('Worker marked as No-Show. The job has been reopened for other workers.');
      setTimeout(() => setSuccessMsg(null), 5000);
      fetchJobs();
      fetchApplications();
    } catch (err) {
      console.error('Mark No-Show error:', err);
      alert('Failed to mark worker as No-Show');
    }
  };

  /*
   * DELETE JOB
   */

  const handleDelete = async (jobId: number) => {
    if (!window.confirm('Are you sure you want to delete this job posting?')) {
      return;
    }

    try {
      const storedUser = localStorage.getItem('user');
      const user = storedUser ? JSON.parse(storedUser) : null;
      const employerId = user?.id;

      const response = await fetch(
        `${API_BASE_URL}/jobs/${jobId}`,
        {
          method: 'DELETE',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            employer_id: employerId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        alert(errorData?.message || 'Failed to delete job');
        return;
      }

      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      setApplications((prev) => prev.filter((application) => application.job_id !== jobId));
    } catch (error) {
      console.log('Delete job error:', error);
    }
  };

  /*
   * FILTERED JOBS & COUNTS
   */

  const filteredJobs = jobs.filter((job) => {
    const status = getEffectiveStatus(job);
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'OPEN') return status === 'OPEN' || status === 'RESERVED';
    if (activeFilter === 'HIRED') return status === 'HIRED';
    if (activeFilter === 'COMPLETED') return status === 'COMPLETED';
    return true;
  });

  const allCount = jobs.length;
  const openCount = jobs.filter((j) => getEffectiveStatus(j) === 'OPEN' || getEffectiveStatus(j) === 'RESERVED').length;
  const hiredCount = jobs.filter((j) => getEffectiveStatus(j) === 'HIRED').length;
  const completedCount = jobs.filter((j) => getEffectiveStatus(j) === 'COMPLETED').length;

  /*
   * LOADING
   */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /*
   * PAGE
   */

  return (
    <div className="space-y-8">
      {/* SUCCESS FLASH BANNER */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
            <p className="text-sm font-medium">{successMsg}</p>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-400 hover:text-white text-sm px-2 py-1 rounded-lg hover:bg-emerald-500/20"
          >
            ✕
          </button>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">
            My Posted Jobs
          </h1>
          <p className="text-slate-400 mt-1">
            Manage your posted jobs, track worker hiring, and complete jobs.
          </p>
        </div>

        <Link
          to="/post-job"
          className="px-5 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-center shadow-lg shadow-cyan-500/20 transition cursor-pointer"
        >
          Post New Job
        </Link>
      </div>

      {/* STATUS FILTER TABS */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
        <button
          onClick={() => setActiveFilter('ALL')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
            activeFilter === 'ALL'
              ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>All Jobs</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${activeFilter === 'ALL' ? 'bg-cyan-700 text-white' : 'bg-slate-700 text-slate-300'}`}>
            {allCount}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('OPEN')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
            activeFilter === 'OPEN'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Active / Open</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${activeFilter === 'OPEN' ? 'bg-blue-800 text-white' : 'bg-slate-700 text-slate-300'}`}>
            {openCount}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('HIRED')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
            activeFilter === 'HIRED'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Worker Hired</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${activeFilter === 'HIRED' ? 'bg-emerald-800 text-white' : 'bg-slate-700 text-slate-300'}`}>
            {hiredCount}
          </span>
        </button>

        <button
          onClick={() => setActiveFilter('COMPLETED')}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition cursor-pointer flex items-center gap-2 ${
            activeFilter === 'COMPLETED'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Completed</span>
          <span className={`px-2 py-0.5 rounded-full text-xs ${activeFilter === 'COMPLETED' ? 'bg-purple-800 text-white' : 'bg-slate-700 text-slate-300'}`}>
            {completedCount}
          </span>
        </button>
      </div>

      {/* EMPTY STATE */}
      {filteredJobs.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 text-lg font-medium">
            {activeFilter === 'ALL'
              ? 'No jobs posted yet.'
              : `No ${activeFilter.toLowerCase()} jobs found.`}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {activeFilter === 'ALL'
              ? 'Post your first job to start hiring daily wage workers.'
              : 'Switch tabs above to view other job statuses.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredJobs.map((job) => {
            const jobApplications = getJobApplications(job.id);
            const status = getEffectiveStatus(job);

            const totalCount =
              jobApplications.length > 0
                ? jobApplications.length
                : Number(job.total_applications || 0);

            const pendingCount =
              jobApplications.length > 0
                ? jobApplications.filter((app) => app.status === 'Pending').length
                : Number(job.pending_applications || 0);

            const acceptedCount =
              jobApplications.length > 0
                ? jobApplications.filter((app) => app.status === 'Hired').length
                : Number(job.accepted_applications || 0);

            return (
              <div
                key={job.id}
                className="glass-card p-6 transition-all hover:border-slate-600/60"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
                  {/* LEFT */}
                  <div className="flex-1">
                    {/* TITLE & STATUS BADGE */}
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-bold text-white">
                        {job.title}
                      </h2>

                      {status === 'OPEN' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
                          <Clock className="w-3.5 h-3.5" />
                          Open / Active
                        </span>
                      )}

                      {status === 'RESERVED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                          <Clock className="w-3.5 h-3.5" />
                          Applicant Pending Review
                        </span>
                      )}

                      {status === 'HIRED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                          <Users className="w-3.5 h-3.5" />
                          Worker Hired
                        </span>
                      )}

                      {status === 'COMPLETED' && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completed
                        </span>
                      )}
                    </div>

                    <p className="text-slate-400 mt-2">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap gap-5 mt-4">
                      {/* WAGE */}
                      <div className="flex items-center gap-1 text-cyan-400 font-semibold">
                        <IndianRupee className="w-4 h-4" />
                        {job.wage}/day
                      </div>

                      {/* LOCATION */}
                      <div className="flex items-center gap-1 text-slate-400">
                        <MapPin className="w-4 h-4" />
                        {job.location}
                      </div>
                    </div>

                    {/* APPLICATION STATISTICS */}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 font-medium text-sm">
                        <Users className="w-4 h-4" />
                        <span>Total Applications: {totalCount}</span>
                      </div>

                      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-medium text-sm">
                        <Clock className="w-4 h-4" />
                        <span>Pending: {pendingCount}</span>
                      </div>

                      <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-medium text-sm">
                        <CheckCircle className="w-4 h-4" />
                        <span>Accepted: {acceptedCount}</span>
                      </div>
                    </div>

                    {/* WORKERS WHO APPLIED */}
                    {jobApplications.length > 0 && (
                      <div className="mt-5">
                        <p className="text-sm font-semibold text-slate-300 mb-3">
                          Workers Applied for this Job
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {jobApplications.map((application) => (
                            <div
                              key={application.id}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700"
                            >
                              <div className="w-7 h-7 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                                {application.worker_name?.charAt(0).toUpperCase()}
                              </div>

                              <span className="text-white text-sm">
                                {application.worker_name}
                              </span>

                              {application.status === 'Hired' ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-500/10 px-2 py-0.5 rounded-md">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Accepted
                                </span>
                              ) : (application.status === 'NO_SHOW' || application.status === 'No Show' || application.status?.toUpperCase() === 'NO_SHOW') ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  NO_SHOW
                                </span>
                              ) : application.status === 'Rejected' ? (
                                <span className="flex items-center gap-1 text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                                  Rejected
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-semibold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-md">
                                  <Clock className="w-3.5 h-3.5" />
                                  Pending
                                </span>
                              )}

                              <div className="flex items-center gap-1 ml-1 pl-1 border-l border-slate-700">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReportTarget({
                                      id: Number(application.worker_id),
                                      name: application.worker_name,
                                    })
                                  }
                                  className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                  title="Report Worker"
                                >
                                  <Flag className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setBlockTarget({
                                      id: Number(application.worker_id),
                                      name: application.worker_name,
                                    })
                                  }
                                  className="p-1 rounded text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition cursor-pointer"
                                  title="Block Worker"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* NO APPLICATIONS */}
                    {jobApplications.length === 0 && (
                      <div className="mt-5 flex items-center gap-2 text-slate-500 text-sm">
                        <Users className="w-4 h-4" />
                        No workers have applied yet.
                      </div>
                    )}

                    {/* COMPLETED STATUS MESSAGE */}
                    {status === 'COMPLETED' && (
                      <div className="mt-5 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-2 text-purple-300 text-sm">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-purple-400" />
                        <span>This job has been completed and remains preserved in your history.</span>
                      </div>
                    )}
                  </div>

                  {/* RIGHT ACTION BUTTONS */}
                  <div className="flex flex-wrap items-center gap-3 self-start">
                    {/* ACTIONS FOR HIRED JOBS */}
                    {status === 'HIRED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => setJobToComplete(job)}
                          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                          title="Mark Job as Completed"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Mark Job as Completed</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleInitiateNoShow(job)}
                          className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-sm flex items-center gap-2 transition cursor-pointer"
                          title="Mark Worker as No-Show & Reopen Job"
                        >
                          <AlertTriangle className="w-4 h-4" />
                          <span>Worker No-Show</span>
                        </button>
                      </>
                    )}

                    <Link
                      to={`/applicants/${job.id}`}
                      className="px-4 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/30 font-medium text-sm transition"
                    >
                      View Applicants
                    </Link>

                    {status !== 'COMPLETED' && (
                      <button
                        onClick={() => handleDelete(job.id)}
                        className="p-3 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition cursor-pointer"
                        title="Delete Job"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMATION MODAL FOR MARK JOB AS COMPLETED */}
      {jobToComplete && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Mark Job as Completed</h3>
                <p className="text-xs text-slate-400">Finalize job & notify worker</p>
              </div>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed">
              Are you sure you want to mark the job <strong className="text-white">"{jobToComplete.title}"</strong> as completed?
            </p>

            <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>Job lifecycle transitions to <strong className="text-emerald-400">COMPLETED</strong>.</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>The hired worker will be automatically notified.</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>This job will be permanently saved in your history.</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setJobToComplete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 font-medium text-sm transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => handleCompleteJob(jobToComplete.id)}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-sm transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/20"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Completing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Yes, Mark Completed
                  </>
                )}
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
      />
    </div>
  );
}
