import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  MapPin,
  Briefcase,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { socket } from '../lib/socket';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';

export default function WorkerDashboard() {
  const navigate = useNavigate();

  const { profile } = useAuth();

  const [jobs, setJobs] = useState<any[]>([]);

  const [filteredJobs, setFilteredJobs] =
    useState<any[]>([]);

  const [searchTitle, setSearchTitle] =
    useState('');

  const [searchLocation, setSearchLocation] =
    useState('');

  useEffect(() => {

    fetchJobs();

    const handleJobUnavailable = (data: any) => {
      const claimedId = data?.job_id;
      if (claimedId) {
        setJobs((prev) => prev.filter((j) => j.id !== claimedId));
        setFilteredJobs((prev) => prev.filter((j) => j.id !== claimedId));
      }
    };

    const handleJobReopened = () => {
      fetchJobs();
    };

    const handleJobStatusUpdated = (data: any) => {
      if (data?.status === 'OPEN') {
        fetchJobs();
      } else if (data?.status === 'RESERVED' || data?.status === 'HIRED' || data?.status === 'COMPLETED') {
        handleJobUnavailable(data);
      }
    };

    socket.on('applicationAdded', handleJobUnavailable);
    socket.on('jobClaimed', handleJobUnavailable);
    socket.on('jobReopened', handleJobReopened);
    socket.on('jobStatusUpdated', handleJobStatusUpdated);

    return () => {
      socket.off('applicationAdded', handleJobUnavailable);
      socket.off('jobClaimed', handleJobUnavailable);
      socket.off('jobReopened', handleJobReopened);
      socket.off('jobStatusUpdated', handleJobStatusUpdated);
    };

  }, []);

  const fetchJobs = async () => {

    try {

      const response = await fetch(
        `${API_BASE_URL}/jobs`,
        {
          headers: getAuthHeaders(),
        }
      );

      const data = await response.json();

      setJobs(data);

      setFilteredJobs(data);

    } catch (error) {

      console.log(error);
    }
  };

  const handleSearch = () => {

    const filtered = jobs.filter((job) => {

      const titleMatch =

        searchTitle === '' ||

        job.title
          .toLowerCase()
          .includes(
            searchTitle.toLowerCase()
          );

      const locationMatch =

        searchLocation === '' ||

        job.location
          .toLowerCase()
          .includes(
            searchLocation.toLowerCase()
          );

      return (
        titleMatch &&
        locationMatch
      );
    });

    setFilteredJobs(filtered);
  };

  const handleApply = async (
    jobId: number
  ) => {

    try {

      const response = await fetch(
        `${API_BASE_URL}/apply-job`,
        {
          method: 'POST',

          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({

            worker_id:
              profile?.id,

            worker_name:
              profile?.name,

            job_id:
              jobId,
          }),
        }
      );

      const data =
        await response.text();

      alert(data);

      if (response.ok) {
        navigate('/applied-jobs');
      } else {
        fetchJobs();
      }

    } catch (error) {

      console.log(error);

      alert(
        'Application Failed'
      );
    }
  };

  return (

    <div className="space-y-6 sm:space-y-8">

      {/* HERO */}

      <div className="rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-10 bg-gradient-to-r from-cyan-500 to-indigo-700 shadow-xl">

        <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold text-white tracking-tight break-words">
          Welcome {profile?.name} 👋
        </h1>

        <p className="text-white/90 mt-2 sm:mt-4 text-sm sm:text-base md:text-lg">
          Explore nearby daily wage opportunities.
        </p>

        <button
          onClick={() => navigate('/jobs')}
          className="mt-5 sm:mt-8 px-5 sm:px-6 py-2.5 sm:py-3 bg-white text-slate-900 rounded-xl sm:rounded-2xl font-semibold text-sm sm:text-base hover:scale-105 transition-all inline-flex items-center justify-center shadow-md"
        >
          Explore Jobs →
        </button>
      </div>

      {/* SEARCH */}

      <div className="glass-card p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-5">

        <input
          type="text"
          placeholder="Search Jobs"
          value={searchTitle}
          onChange={(e) =>
            setSearchTitle(
              e.target.value
            )
          }
          className="px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm sm:text-base"
        />

        <input
          type="text"
          placeholder="Search Location"
          value={searchLocation}
          onChange={(e) =>
            setSearchLocation(
              e.target.value
            )
          }
          className="px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm sm:text-base"
        />

        <button
          onClick={handleSearch}
          className="py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm sm:text-base sm:col-span-2 md:col-span-1 shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
        >
          Search
        </button>
      </div>

      {/* JOBS */}

      <div className="space-y-4 sm:space-y-5">

        {filteredJobs.map((job) => (

          <div
            key={job.id}
            className="glass-card p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >

            <div className="flex-1 min-w-0">

              <div className="flex items-center gap-2.5 sm:gap-3">

                <Briefcase className="w-5 h-5 text-cyan-400 shrink-0" />

                <h3 className="text-lg sm:text-xl md:text-2xl font-semibold text-white break-words">
                  {job.title}
                </h3>
              </div>

              <p className="text-slate-400 mt-2 text-xs sm:text-sm line-clamp-2">
                {job.description}
              </p>

              <div className="flex items-center gap-1.5 mt-3 text-xs sm:text-sm text-slate-300 truncate">

                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />

                <span className="truncate">{job.location}</span>
              </div>
            </div>

            <div className="w-full sm:w-auto flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 pt-3 sm:pt-0 border-t border-slate-700/50 sm:border-0 shrink-0">

              <div className="flex items-baseline gap-1 sm:block sm:text-right">
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-cyan-400">
                  ₹{job.wage}
                </h2>
                <span className="text-slate-400 text-xs sm:text-sm">/day</span>
              </div>

              <button
                onClick={() =>
                  handleApply(job.id)
                }
                className="px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm sm:text-base shadow-md transition-all cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}