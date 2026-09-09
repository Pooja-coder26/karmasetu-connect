import { useEffect, useState } from 'react';

import {
  Briefcase,
  FileText,
  Users,
  TrendingUp,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { socket } from '../lib/socket';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';

interface Job {
  id: number;
  title: string;
  description: string;
  wage: number;
  location: string;
  employer_id: number;
}

export default function EmployerDashboard() {
  const { profile } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState({
    jobsPosted: 0,
    totalApplications: 0,
    pendingApplications: 0,
    acceptedApplications: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      fetchDashboardData();
    }

    const handleRealtimeUpdate = () => {
      console.log('Real-time event received on EmployerDashboard');
      fetchDashboardData();
    };

    socket.on('applicationAdded', handleRealtimeUpdate);
    socket.on('workerHired', handleRealtimeUpdate);
    socket.on('applicationStatusUpdated', handleRealtimeUpdate);

    return () => {
      socket.off('applicationAdded', handleRealtimeUpdate);
      socket.off('workerHired', handleRealtimeUpdate);
      socket.off('applicationStatusUpdated', handleRealtimeUpdate);
    };
  }, [profile?.id]);

  const fetchDashboardData = async () => {
    const employerId = profile?.id;
    if (!employerId) {
      setLoading(false);
      return;
    }

    try {
      // 1. Fetch live MySQL statistics for this employer
      const statsRes = await fetch(
        `${API_BASE_URL}/employer-stats/${employerId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats({
          jobsPosted: Number(statsData.jobsPosted || 0),
          totalApplications: Number(statsData.totalApplications || 0),
          pendingApplications: Number(statsData.pendingApplications || 0),
          acceptedApplications: Number(statsData.acceptedApplications || 0),
        });
      }

      // 2. Fetch this employer's jobs for the Recent Jobs list
      const jobsResponse = await fetch(
        `${API_BASE_URL}/my-jobs/${employerId}`,
        {
          headers: getAuthHeaders(),
        }
      );
      if (jobsResponse.ok) {
        const employerJobs = await jobsResponse.json();
        setJobs(employerJobs);
      }
    } catch (error) {
      console.log('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

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

  return (

    <div className="space-y-6 sm:space-y-8">

      {/* WELCOME */}

      <div>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">

          Welcome back, {profile?.name}

        </h1>

        <p className="text-slate-400 mt-1 sm:mt-2 text-sm sm:text-base">

          Here is your live hiring overview.

        </p>

      </div>

      {/* STATS */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">

        {/* JOBS POSTED */}

        <div className="glass-card p-4 sm:p-5 lg:p-6">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-slate-400 text-xs sm:text-sm font-medium">
                Jobs Posted
              </p>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mt-2 sm:mt-4">

                {stats.jobsPosted}

              </h2>

            </div>

            <Briefcase className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-400 shrink-0" />

          </div>

        </div>

        {/* APPLICATIONS */}

        <div className="glass-card p-4 sm:p-5 lg:p-6">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-slate-400 text-xs sm:text-sm font-medium">
                Total Applications
              </p>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mt-2 sm:mt-4">

                {stats.totalApplications}

              </h2>

            </div>

            <FileText className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400 shrink-0" />

          </div>

        </div>

        {/* PENDING */}

        <div className="glass-card p-4 sm:p-5 lg:p-6">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-slate-400 text-xs sm:text-sm font-medium">
                Pending Review
              </p>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-yellow-400 mt-2 sm:mt-4">

                {stats.pendingApplications}

              </h2>

            </div>

            <Users className="w-8 h-8 sm:w-10 sm:h-10 text-yellow-400 shrink-0" />

          </div>

        </div>

        {/* ACCEPTED */}

        <div className="glass-card p-4 sm:p-5 lg:p-6">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-slate-400 text-xs sm:text-sm font-medium">
                Accepted
              </p>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-green-400 mt-2 sm:mt-4">

                {stats.acceptedApplications}

              </h2>

            </div>

            <TrendingUp className="w-8 h-8 sm:w-10 sm:h-10 text-green-400 shrink-0" />

          </div>

        </div>

      </div>

      {/* RECENT JOBS */}

      <div className="glass-card p-4 sm:p-6">

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">

          Recent Jobs

        </h2>

        {jobs.length === 0 ? (

          <div className="py-8 sm:py-10 text-center">

            <Briefcase className="w-10 h-10 sm:w-12 sm:h-12 text-slate-600 mx-auto" />

            <p className="text-slate-400 mt-3 sm:mt-4 text-base sm:text-lg">

              You haven't posted any jobs yet.

            </p>

            <p className="text-slate-500 text-xs sm:text-sm mt-1">

              Post your first job to start hiring workers.

            </p>

          </div>

        ) : (

          <div className="space-y-3 sm:space-y-4">

            {jobs.map((job) => (

              <div
                key={job.id}
                className="p-4 sm:p-5 rounded-2xl bg-slate-800/80 border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4"
              >

                <div className="min-w-0 flex-1">

                  <h3 className="text-base sm:text-lg md:text-xl font-semibold text-white break-words">

                    {job.title}

                  </h3>

                  <p className="text-slate-400 text-xs sm:text-sm mt-1 truncate">

                    {job.location}

                  </p>

                </div>

                <div className="text-left sm:text-right shrink-0 pt-2 sm:pt-0 border-t sm:border-0 border-slate-700/50">

                  <p className="text-cyan-400 text-lg sm:text-xl font-bold">

                    ₹{job.wage}/day

                  </p>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>

  );
}