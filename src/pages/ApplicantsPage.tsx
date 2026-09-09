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
  Phone,
  PhoneCall,
  MessageCircle,
} from 'lucide-react';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';
import { normalizeCallPhone, getWhatsAppUrl } from '../lib/contactUtils';
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

      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
        Job Applicants
      </h1>

      {applications.length === 0 ? (

        <div className="glass-card p-8 text-center text-slate-400 text-base sm:text-lg">
          No applicants yet
        </div>

      ) : (

        applications.map((applicant) => (

          <div
            key={applicant.id}
            className="glass-card p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >

            <div className="min-w-0 flex-1">

              <div className="flex items-center gap-2.5 sm:gap-3">

                <User className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />

                <h2 className="text-lg sm:text-xl md:text-2xl font-semibold text-white break-words">
                  {applicant.worker_name}
                </h2>
              </div>

              <div className="mt-3 sm:mt-4">

                {applicant.status === 'Hired' && (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-green-400 font-semibold text-sm sm:text-base">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Hired</span>
                  </div>
                )}

                {applicant.status === 'Pending' && (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-yellow-400 font-semibold text-sm sm:text-base">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Pending Review</span>
                  </div>
                )}

                {applicant.status === 'Rejected' && (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-rose-400 font-semibold text-sm sm:text-base">
                    <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Rejected (Job Reopened)</span>
                  </div>
                )}

                {(applicant.status === 'NO_SHOW' || applicant.status === 'No Show') && (
                  <div className="flex items-center gap-1.5 sm:gap-2 text-amber-400 font-semibold text-sm sm:text-base">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>NO_SHOW (Job Reopened)</span>
                  </div>
                )}

                {/* 📞 WORKER CONTACT DETAILS (AVAILABLE ONLY AFTER HIRING) */}
                {['Hired', 'hired', 'Completed', 'completed'].includes(applicant.status) && (
                  <div className="mt-3.5 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-900/90 border border-cyan-500/30 shadow-md space-y-2.5">
                    <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs sm:text-sm">
                      <Phone className="w-4 h-4" />
                      <span>📞 Worker Contact Details</span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-800">
                      <div className="space-y-0.5">
                        <p className="text-xs text-slate-400">Worker Name: <strong className="text-white font-medium">{applicant.worker_name}</strong></p>
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                          <span>Phone:</span>
                          {applicant.worker_phone ? (
                            <strong className="text-cyan-300 font-mono tracking-wide">{applicant.worker_phone}</strong>
                          ) : (
                            <span className="text-slate-500 italic">Contact number is not available.</span>
                          )}
                        </p>
                      </div>

                      {applicant.worker_phone ? (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <a
                            href={`tel:${normalizeCallPhone(applicant.worker_phone)}`}
                            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-cyan-500/20"
                            title={`Call ${applicant.worker_name}`}
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>Call Worker</span>
                          </a>

                          <a
                            href={getWhatsAppUrl(applicant.worker_phone, `Hi ${applicant.worker_name}, I am contacting you regarding your hired application on KarmaSetu Connect.`) || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                            title={`WhatsApp ${applicant.worker_name}`}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="w-full md:w-auto flex flex-wrap items-center justify-between sm:justify-start md:justify-end gap-2 sm:gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800/80 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({
                      id: Number(applicant.worker_id),
                      name: applicant.worker_name,
                    })
                  }
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                  title="Report Worker"
                >
                  <Flag className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>

                {blockedUserIds.includes(Number(applicant.worker_id)) ? (
                  <button
                    type="button"
                    onClick={() => handleUnblock(Number(applicant.worker_id))}
                    className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
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
                    className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-slate-800/80 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                    title="Block Worker"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Block</span>
                  </button>
                )}
              </div>

              {applicant.status === 'Pending' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleHire(applicant.id)
                    }
                    className="px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-green-500 hover:bg-green-600 text-white font-semibold text-xs sm:text-sm cursor-pointer transition shadow-md"
                  >
                    Hire Worker
                  </button>

                  <button
                    onClick={() =>
                      handleReject(applicant.id)
                    }
                    className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-semibold text-xs sm:text-sm cursor-pointer transition"
                  >
                    Reject
                  </button>
                </div>
              )}

              {applicant.status === 'Hired' && (
                <button
                  onClick={() =>
                    handleMarkNoShow(applicant.id)
                  }
                  className="px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 font-semibold text-xs sm:text-sm cursor-pointer transition flex items-center gap-1.5"
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