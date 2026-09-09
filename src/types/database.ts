export type Role = 'worker' | 'employer' | 'admin';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  wage: number;
  location: string;
  employer_id: string;
  created_at: string;
  profiles?: Pick<Profile, 'name' | 'email'>;
}

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';

export interface Application {
  id: string;
  worker_id: string;
  job_id: string;
  status: ApplicationStatus;
  created_at: string;
  jobs?: Job;
  profiles?: Pick<Profile, 'name' | 'email'>;
}
