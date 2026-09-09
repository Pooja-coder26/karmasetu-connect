import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute, { RoleRoute } from './components/ProtectedRoute';
import Layout from './components/Layout';

import AuthPage from './pages/AuthPage';
import EmployerDashboard from './pages/EmployerDashboard';
import WorkerDashboard from './pages/WorkerDashboard';
import PostJobPage from './pages/PostJobPage';
import MyJobsPage from './pages/MyJobsPage';
import ApplicantsPage from './pages/ApplicantsPage';
import FindJobsPage from './pages/FindJobsPage';
import AppliedJobsPage from './pages/AppliedJobsPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboardPage from './pages/AdminDashboardPage';

import { socket } from './lib/socket';

function DashboardRouter() {
  const { profile } = useAuth();

  if (profile?.role === 'admin') {
    return <AdminDashboardPage />;
  }

  if (profile?.role === 'employer') {
    return <EmployerDashboard />;
  }

  return <WorkerDashboard />;
}

function App() {

  useEffect(() => {
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>

        <Routes>

          {/* Authentication */}
          <Route
            path="/auth"
            element={<AuthPage />}
          />

          {/* Protected Application */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>

                  <Routes>

                    {/* Dashboard */}
                    <Route
                      path="/"
                      element={<DashboardRouter />}
                    />

                    {/* Admin Dashboard */}
                    <Route
                      path="/admin"
                      element={
                        <RoleRoute role="admin">
                          <AdminDashboardPage />
                        </RoleRoute>
                      }
                    />

                    {/* Employer - Post Job */}
                    <Route
                      path="/post-job"
                      element={
                        <RoleRoute role="employer">
                          <PostJobPage />
                        </RoleRoute>
                      }
                    />

                    {/* Employer - My Jobs */}
                    <Route
                      path="/my-jobs"
                      element={
                        <RoleRoute role="employer">
                          <MyJobsPage />
                        </RoleRoute>
                      }
                    />

                    {/* Employer - Applicants */}
                    <Route
                      path="/applicants/:jobId"
                      element={
                        <RoleRoute role="employer">
                          <ApplicantsPage />
                        </RoleRoute>
                      }
                    />

                    {/* Worker - Find Jobs */}
                    <Route
                      path="/jobs"
                      element={
                        <RoleRoute role="worker">
                          <FindJobsPage />
                        </RoleRoute>
                      }
                    />

                    {/* Worker - Applied Jobs */}
                    <Route
                      path="/applied-jobs"
                      element={
                        <RoleRoute role="worker">
                          <AppliedJobsPage />
                        </RoleRoute>
                      }
                    />

                    {/* Profile (Both Worker & Employer) */}
                    <Route
                      path="/profile"
                      element={<ProfilePage />}
                    />

                    {/* Unknown Route */}
                    <Route
                      path="*"
                      element={<Navigate to="/" replace />}
                    />

                  </Routes>

                </Layout>
              </ProtectedRoute>
            }
          />

        </Routes>

      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;