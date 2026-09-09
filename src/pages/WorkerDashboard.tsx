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

    <div className="space-y-8">

      {/* HERO */}

      <div className="rounded-3xl p-10 bg-gradient-to-r from-cyan-500 to-indigo-700">

        <h1 className="text-5xl font-bold text-white">

          Welcome {profile?.name} 👋
        </h1>

        <p className="text-white/80 mt-4 text-lg">

          Explore nearby daily wage opportunities.
        </p>

        <button
          onClick={() => navigate('/jobs')}
          className="mt-8 px-6 py-3 bg-white text-slate-900 rounded-2xl font-semibold hover:scale-105 transition-all"
        >

          Explore Jobs →
        </button>
      </div>

      {/* SEARCH */}

      <div className="glass-card p-6 grid md:grid-cols-3 gap-5">

        <input
          type="text"
          placeholder="Search Jobs"
          value={searchTitle}
          onChange={(e) =>
            setSearchTitle(
              e.target.value
            )
          }
          className="px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white"
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
          className="px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white"
        />

        <button
          onClick={handleSearch}
          className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold"
        >

          Search
        </button>
      </div>

      {/* JOBS */}

      <div className="space-y-5">

        {filteredJobs.map((job) => (

          <div
            key={job.id}
            className="glass-card p-6 flex items-center justify-between"
          >

            <div>

              <div className="flex items-center gap-3">

                <Briefcase className="w-5 h-5 text-cyan-400" />

                <h3 className="text-2xl font-semibold text-white">

                  {job.title}
                </h3>
              </div>

              <p className="text-slate-400 mt-3">

                {job.description}
              </p>

              <div className="flex items-center gap-2 mt-4 text-slate-400">

                <MapPin className="w-4 h-4" />

                {job.location}
              </div>
            </div>

            <div className="text-right">

              <h2 className="text-4xl font-bold text-cyan-400">

                ₹{job.wage}
              </h2>

              <p className="text-slate-400 mb-4">

                /day
              </p>

              <button
                onClick={() =>
                  handleApply(job.id)
                }
                className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-semibold"
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