import { useEffect, useState } from 'react';

import { useParams } from 'react-router-dom';

import {
  User,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Flag,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';
import ReportModal from '../components/ReportModal';
import BlockModal from '../components/BlockModal';

export default function ApplicantsPage() {
  const { jobId } = useParams();

  const [applications, setApplications] = useState<any[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<number[]>([]);
  const [reportTarget, setReportTarget] = useState<{ id: number; name?: string } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: number; name?: string } | null>(null);

  useEffect(() => {
    if (jobId) {
      fetchApplications();
      fetchBlockedUserIds();
    }
  }, [jobId]);

  const fetchBlockedUserIds = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/blocked-user-ids`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setBlockedUserIds(data);
      }
    } catch (e) {
      console.error('Failed to load blocked user IDs:', e);
    }
  };

  const handleUnblock = async (workerId: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/blocks/${workerId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setBlockedUserIds((prev) => prev.filter((id) => id !== workerId));
        alert('Worker unblocked successfully.');
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.message || 'Failed to unblock worker');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to unblock worker');
    }
  };

  const fetchApplications = async () => {

    try {

      const response = await fetch(
        `${API_BASE_URL}/applications/${jobId}`,
        {
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      console.log(data);

      setApplications(data);

    } catch (error) {

      console.log(error);
    }
  };

  const handleHire = async (id: number) => {

    try {

      const response = await fetch(
        `${API_BASE_URL}/hire-worker/${id}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.text();

      alert(data);

      fetchApplications();

    } catch (error) {

      console.log(error);
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm('Are you sure you want to reject this applicant? The job will be reopened for other workers.')) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/reject-worker/${id}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.text();
      alert(data);
      fetchApplications();
    } catch (error) {
      console.log(error);
      alert('Failed to reject applicant');
    }
  };

  const handleMarkNoShow = async (id: number) => {
    if (!confirm('Are you sure you want to mark this worker as No-Show? The application will become NO_SHOW and the job will immediately be reopened for other workers.')) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/mark-noshow/${id}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
        }
      );

      const data = await response.text();
      alert(data);
      fetchApplications();
    } catch (error) {
      console.log(error);
      alert('Failed to mark worker as No-Show');
    }
  };

  return (

    <div className="space-y-6">

      <h1 className="text-4xl font-bold text-white">

        Job Applicants
      </h1>

      {applications.length === 0 ? (

        <div className="glass-card p-8 text-center text-slate-400 text-xl">

          No applicants yet
        </div>

      ) : (

        applications.map((applicant) => (

          <div
            key={applicant.id}
            className="glass-card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >

            <div>

              <div className="flex items-center gap-3">

                <User className="w-6 h-6 text-cyan-400" />

                <h2 className="text-2xl font-semibold text-white">

                  {applicant.worker_name}
                </h2>
              </div>

              <div className="mt-4">

                {applicant.status === 'Hired' && (
                  <div className="flex items-center gap-2 text-green-400 font-semibold text-lg">
                    <CheckCircle className="w-5 h-5" />
                    Hired
                  </div>
                )}

                {applicant.status === 'Pending' && (
                  <div className="flex items-center gap-2 text-yellow-400 font-semibold text-lg">
                    <Clock className="w-5 h-5" />
                    Pending Review
                  </div>
                )}

                {applicant.status === 'Rejected' && (
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-lg">
                    <XCircle className="w-5 h-5" />
                    Rejected (Job Reopened)
                  </div>
                )}

                {(applicant.status === 'NO_SHOW' || applicant.status === 'No Show') && (
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-lg">
                    <AlertTriangle className="w-5 h-5" />
                    NO_SHOW (Job Reopened)
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 mr-1">
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({
                      id: Number(applicant.worker_id),
                      name: applicant.worker_name,
                    })
                  }
                  className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  title="Report Worker"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>

                {blockedUserIds.includes(Number(applicant.worker_id)) ? (
                  <button
                    type="button"
                    onClick={() => handleUnblock(Number(applicant.worker_id))}
                    className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                    title="Unblock Worker"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Unblock</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setBlockTarget({
                        id: Number(applicant.worker_id),
                        name: applicant.worker_name,
                      })
                    }
                    className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                    title="Block Worker"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Block</span>
                  </button>
                )}
              </div>

              {applicant.status === 'Pending' && (
                <>
                  <button
                    onClick={() =>
                      handleHire(applicant.id)
                    }
                    className="px-6 py-3 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-semibold cursor-pointer transition"
                  >
                    Hire Worker
                  </button>

                  <button
                    onClick={() =>
                      handleReject(applicant.id)
                    }
                    className="px-5 py-3 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold cursor-pointer transition"
                  >
                    Reject
                  </button>
                </>
              )}

              {applicant.status === 'Hired' && (
                <button
                  onClick={() =>
                    handleMarkNoShow(applicant.id)
                  }
                  className="px-4 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-sm cursor-pointer transition flex items-center gap-2"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Worker No-Show</span>
                </button>
              )}
            </div>
          </div>
        ))
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
        onSuccess={() => fetchBlockedUserIds()}
      />
    </div>
  );
}