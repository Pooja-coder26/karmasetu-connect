import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, NavLink } from 'react-router-dom';

import {
  Briefcase,
  LogOut,
  LayoutDashboard,
  PlusCircle,
  FileText,
  Search,
  ClipboardList,
  Bell,
  Check,
  CheckCheck,
  X,
  User,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

import { socket } from '../lib/socket';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';

interface Notification {
  id: number | string;
  user_id?: number;
  type: string;
  title: string;
  message: string;
  job_id?: number | null;
  application_id?: number | null;
  is_read: boolean;
  created_at?: string;
}

export default function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const isAdmin = profile?.role === 'admin';
  const isEmployer = profile?.role === 'employer';

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [showNotifications, setShowNotifications] =
    useState(false);

  const notificationRef =
    useRef<HTMLDivElement | null>(null);
  const isNavigatingRef =
    useRef(false);

  /* ==========================================
     LOAD NOTIFICATIONS FROM DATABASE
  ========================================== */

  const fetchNotifications = async () => {
    if (!profile?.id) {
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/notifications/${profile.id}`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load notifications');
      }

      const data = await response.json();

      setNotifications(data);
    } catch (error) {
      console.log(
        'Notification loading error:',
        error
      );
    }
  };

  /* ==========================================
     LOAD WHEN USER CHANGES
  ========================================== */

  useEffect(() => {
    if (profile?.id) {
      fetchNotifications();
    } else {
      setNotifications([]);
    }
  }, [profile?.id]);

  /* ==========================================
     SOCKET.IO REAL-TIME NOTIFICATIONS
  ========================================== */

  useEffect(() => {
    if (!profile?.id) {
      return;
    }

    if (!socket.connected) {
      socket.connect();
    }

    /* ---------- NEW JOB ---------- */

    const handleJobNotification = (
      data: any
    ) => {
      if (
        Number(data.user_id) !==
        Number(profile.id)
      ) {
        return;
      }

      const notification =
        data.notification;

      if (!notification) {
        return;
      }

      setNotifications((prev) => {
        if (
          notification.id &&
          prev.some(
            (item) =>
              Number(item.id) ===
              Number(notification.id)
          )
        ) {
          return prev;
        }

        return [
          {
            ...notification,
            is_read: false,
          },
          ...prev,
        ];
      });
    };

    /* ---------- NEW APPLICATION ---------- */

    const handleApplicationNotification = (
      data: any
    ) => {
      if (
        Number(data.user_id) !==
        Number(profile.id)
      ) {
        return;
      }

      const notification =
        data.notification;

      if (!notification) {
        return;
      }

      setNotifications((prev) => {
        if (
          notification.id &&
          prev.some(
            (item) =>
              Number(item.id) ===
              Number(notification.id)
          )
        ) {
          return prev;
        }

        return [
          {
            ...notification,
            is_read: false,
          },
          ...prev,
        ];
      });
    };

    /* ---------- WORKER HIRED ---------- */

    const handleHiredNotification = (
      data: any
    ) => {
      if (
        Number(data.user_id) !==
        Number(profile.id)
      ) {
        return;
      }

      const notification =
        data.notification;

      if (!notification) {
        return;
      }

      setNotifications((prev) => {
        if (
          notification.id &&
          prev.some(
            (item) =>
              Number(item.id) ===
              Number(notification.id)
          )
        ) {
          return prev;
        }

        return [
          {
            ...notification,
            is_read: false,
          },
          ...prev,
        ];
      });
    };

    /* ==========================================
       SOCKET EVENTS
    ========================================== */

    socket.on(
      'jobNotification',
      handleJobNotification
    );

    socket.on(
      'applicationNotification',
      handleApplicationNotification
    );

    socket.on(
      'hiredNotification',
      handleHiredNotification
    );

    socket.on(
      'jobCompletedNotification',
      handleHiredNotification
    );

    /* ==========================================
       CLEANUP
    ========================================== */

    return () => {
      socket.off(
        'jobNotification',
        handleJobNotification
      );

      socket.off(
        'applicationNotification',
        handleApplicationNotification
      );

      socket.off(
        'hiredNotification',
        handleHiredNotification
      );

      socket.off(
        'jobCompletedNotification',
        handleHiredNotification
      );
    };
  }, [profile?.id]);

  /* ==========================================
     CLOSE NOTIFICATIONS ON OUTSIDE CLICK
  ========================================== */

  useEffect(() => {
    const handleClickOutside = (
      event: MouseEvent
    ) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(
          event.target as Node
        )
      ) {
        setShowNotifications(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handleClickOutside
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside
      );
    };
  }, []);

  /* ==========================================
     UNREAD COUNT
  ========================================== */

  const unreadCount =
    notifications.filter(
      (notification) =>
        !notification.is_read
    ).length;

  /* ==========================================
     MARK ONE AS READ
  ========================================== */

  const markAsRead = async (
    notification: Notification
  ) => {
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id
          ? {
              ...item,
              is_read: true,
            }
          : item
      )
    );

    if (
      notification.id &&
      typeof notification.id === 'number'
    ) {
      try {
        await fetch(
          `${API_BASE_URL}/notifications/${notification.id}/read`,
          {
            method: 'PUT',
            headers: getAuthHeaders(),
          }
        );
      } catch (error) {
        console.log(
          'Mark notification read error:',
          error
        );
      }
    }
  };

  /* ==========================================
     MARK ALL AS READ
  ========================================== */

  const markAllAsRead = async () => {
    if (!profile?.id) {
      return;
    }

    setNotifications((prev) =>
      prev.map((item) => ({
        ...item,
        is_read: true,
      }))
    );

    try {
      await fetch(
        `${API_BASE_URL}/notifications/user/${profile.id}/read-all`,
        {
          method: 'PUT',
          headers: getAuthHeaders(),
        }
      );
    } catch (error) {
      console.log(
        'Mark all read error:',
        error
      );
    }
  };

  /* ==========================================
     DELETE NOTIFICATION
  ========================================== */

  const removeNotification = async (
    notification: Notification
  ) => {
    setNotifications((prev) =>
      prev.filter(
        (item) =>
          item.id !== notification.id
      )
    );

    if (
      notification.id &&
      typeof notification.id === 'number'
    ) {
      try {
        await fetch(
          `${API_BASE_URL}/notifications/${notification.id}`,
          {
            method: 'DELETE',
            headers: getAuthHeaders(),
          }
        );
      } catch (error) {
        console.log(
          'Delete notification error:',
          error
        );
      }
    }
  };

  /* ==========================================
     CLEAR ALL NOTIFICATIONS
  ========================================== */

  const clearAll = async () => {
    const current =
      [...notifications];

    setNotifications([]);

    try {
      await Promise.all(
        current
          .filter(
            (notification) =>
              typeof notification.id ===
              'number'
          )
          .map(
            (notification) =>
              fetch(
                `${API_BASE_URL}/notifications/${notification.id}`,
                {
                  method: 'DELETE',
                  headers: getAuthHeaders(),
                }
              )
          )
      );
    } catch (error) {
      console.log(
        'Clear notifications error:',
        error
      );

      fetchNotifications();
    }
  };

  /* ==========================================
     CLICK NOTIFICATION
  ========================================== */

  const handleNotificationClick = (
    notification: Notification
  ) => {
    // Prevent double-clicks / rapid re-entry
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 600);

    // Optimistically mark as read in local state & trigger background update
    markAsRead(notification);

    // Close notification dropdown
    setShowNotifications(false);

    const userRole = profile?.role;
    const isEmployerRole = userRole === 'employer';
    const isAdminRole = userRole === 'admin';

    // 1. ADMIN
    if (isAdminRole) {
      navigate('/admin');
      return;
    }

    // 2. EMPLOYER NAVIGATION
    if (isEmployerRole) {
      if (notification.type === 'application') {
        if (notification.job_id) {
          navigate(`/applicants/${notification.job_id}`);
        } else {
          navigate('/my-jobs');
        }
        return;
      }

      if (notification.type === 'job' || notification.type === 'new_job') {
        navigate('/my-jobs', {
          state: { jobId: notification.job_id },
        });
        return;
      }

      if (notification.job_id) {
        navigate(`/applicants/${notification.job_id}`);
      } else {
        navigate('/my-jobs');
      }
      return;
    }

    // 3. WORKER NAVIGATION
    if (notification.type === 'job' || notification.type === 'new_job') {
      navigate('/jobs', {
        state: { jobId: notification.job_id },
      });
      return;
    }

    if (
      notification.type === 'hired' ||
      notification.type === 'completed' ||
      notification.type === 'rejected' ||
      notification.type === 'noshow' ||
      notification.type === 'application'
    ) {
      navigate('/applied-jobs', {
        state: {
          jobId: notification.job_id,
          applicationId: notification.application_id,
          notifType: notification.type,
        },
      });
      return;
    }

    // Fallback for any unknown notification types
    if (notification.job_id) {
      navigate('/jobs', {
        state: { jobId: notification.job_id },
      });
    } else {
      navigate('/jobs');
    }
  };

  /* ==========================================
     FORMAT NOTIFICATION TIME
  ========================================== */

  const formatTime = (
    createdAt?: string
  ) => {
    if (!createdAt) {
      return 'Just now';
    }

    const date =
      new Date(createdAt);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return 'Just now';
    }

    const now =
      new Date();

    const difference =
      now.getTime() -
      date.getTime();

    const minutes =
      Math.floor(
        difference / 60000
      );

    if (minutes < 1) {
      return 'Just now';
    }

    if (minutes < 60) {
      return `${minutes} min ago`;
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    if (hours < 24) {
      return `${hours} hr ago`;
    }

    const days =
      Math.floor(
        hours / 24
      );

    if (days < 7) {
      return `${days} day${
        days > 1 ? 's' : ''
      } ago`;
    }

    return date.toLocaleDateString();
  };

  /* ==========================================
     LOGOUT
  ========================================== */

  const handleSignOut = async () => {
    await signOut();

    setNotifications([]);

    navigate('/auth');
  };

  /* ==========================================
     NAVIGATION STYLE
  ========================================== */

  const navLinkClass = ({
    isActive,
  }: {
    isActive: boolean;
  }) =>
    `flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all duration-300 ${
      isActive
        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
        : 'text-slate-300 hover:text-white hover:bg-slate-700/40'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* HEADER */}

      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/70 border-b border-slate-700/40 shadow-lg">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          <div className="flex items-center justify-between h-16">

            {/* LOGO */}

            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">

              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">

                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-white" />

              </div>

              <div className="min-w-0">

                <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">
                  KarmaSetu Connect
                </h1>

                <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                  Daily Wage Hiring Platform
                </p>

              </div>

            </div>

            {/* DESKTOP NAVIGATION */}

            <nav className="hidden md:flex items-center gap-2">

              {isAdmin ? (
                <NavLink
                  to="/admin"
                  className={navLinkClass}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin Dashboard
                </NavLink>
              ) : (
                <>
                  <NavLink
                    to="/"
                    className={navLinkClass}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </NavLink>

                  {isEmployer ? (
                    <>
                      <NavLink
                        to="/post-job"
                        className={navLinkClass}
                      >
                        <PlusCircle className="w-4 h-4" />
                        Post Job
                      </NavLink>

                      <NavLink
                        to="/my-jobs"
                        className={navLinkClass}
                      >
                        <FileText className="w-4 h-4" />
                        My Jobs
                      </NavLink>
                    </>
                  ) : (
                    <>
                      <NavLink
                        to="/jobs"
                        className={navLinkClass}
                      >
                        <Search className="w-4 h-4" />
                        Find Jobs
                      </NavLink>

                      <NavLink
                        to="/applied-jobs"
                        className={navLinkClass}
                      >
                        <ClipboardList className="w-4 h-4" />
                        Applied Jobs
                      </NavLink>
                    </>
                  )}
                </>
              )}

              <NavLink
                to="/profile"
                className={navLinkClass}
              >
                <User className="w-4 h-4" />
                Profile
              </NavLink>

            </nav>

            {/* RIGHT SIDE */}

            <div className="flex items-center gap-3">

              {/* NOTIFICATIONS */}

              <div
                ref={notificationRef}
                className="relative"
              >

                <button
                  onClick={() =>
                    setShowNotifications(
                      !showNotifications
                    )
                  }
                  className="relative p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 hover:text-white hover:border-cyan-500/40 hover:bg-slate-800 transition-all duration-300"
                  title="Notifications"
                >

                  <Bell className="w-5 h-5" />

                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center border-2 border-slate-900 animate-pulse">
                      {unreadCount > 99
                        ? '99+'
                        : unreadCount}
                    </span>
                  )}

                </button>

                {/* DROPDOWN */}

                {showNotifications && (
                  <div className="fixed sm:absolute top-16 sm:top-full left-3 right-3 sm:left-auto sm:right-0 sm:mt-3 w-auto sm:w-96 max-w-sm sm:max-w-none rounded-2xl bg-slate-900 border border-slate-700/60 shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">

                    {/* HEADER */}

                    <div className="p-4 border-b border-slate-700/50 flex items-center justify-between bg-slate-800/40">

                      <div className="flex items-center gap-2">

                        <h3 className="font-semibold text-white text-sm">
                          Notifications
                        </h3>

                        {unreadCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-medium">
                            {unreadCount} new
                          </span>
                        )}

                      </div>

                      <div className="flex items-center gap-2">

                        {unreadCount > 0 && (
                          <button
                            onClick={
                              markAllAsRead
                            }
                            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                            title="Mark all as read"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Mark all read
                          </button>
                        )}

                        {notifications.length >
                          0 && (
                          <button
                            onClick={
                              clearAll
                            }
                            className="text-xs text-slate-400 hover:text-red-400 transition ml-2"
                            title="Clear all"
                          >
                            Clear
                          </button>
                        )}

                      </div>

                    </div>

                    {/* LIST */}

                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60">

                      {notifications.length ===
                      0 ? (
                        <div className="p-8 text-center text-slate-400">
                          <Bell className="w-8 h-8 mx-auto mb-2 text-slate-500 opacity-40" />
                          <p className="text-sm">
                            No notifications yet
                          </p>
                        </div>
                      ) : (
                        notifications.map(
                          (notification) => (
                            <div
                              key={
                                notification.id
                              }
                              onClick={() =>
                                handleNotificationClick(
                                  notification
                                )
                              }
                              className={`p-4 transition-colors cursor-pointer flex gap-3 relative group ${
                                !notification.is_read
                                  ? 'bg-cyan-950/20 hover:bg-cyan-900/30'
                                  : 'hover:bg-slate-800/40'
                              }`}
                            >

                              <div className="mt-0.5 shrink-0">
                                {(notification.type === 'job' ||
                                  notification.type === 'new_job') && (
                                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                                    <Briefcase className="w-4 h-4" />
                                  </div>
                                )}

                                {notification.type ===
                                  'application' && (
                                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                                    <ClipboardList className="w-4 h-4" />
                                  </div>
                                )}

                                {notification.type ===
                                  'hired' && (
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                    <Check className="w-4 h-4" />
                                  </div>
                                )}

                                {notification.type ===
                                  'completed' && (
                                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                                    <CheckCheck className="w-4 h-4" />
                                  </div>
                                )}

                                {(notification.type === 'rejected' ||
                                  notification.type === 'noshow') && (
                                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                                    <AlertCircle className="w-4 h-4" />
                                  </div>
                                )}

                                {!['job', 'new_job', 'application', 'hired', 'completed', 'rejected', 'noshow'].includes(notification.type) && (
                                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                                    <Bell className="w-4 h-4" />
                                  </div>
                                )}
                              </div>

                              <div className="flex-1 pr-6">

                                <div className="flex items-center gap-2">

                                  <h4
                                    className={`text-sm ${
                                      !notification.is_read
                                        ? 'font-semibold text-white'
                                        : 'font-medium text-slate-300'
                                    }`}
                                  >
                                    {
                                      notification.title
                                    }
                                  </h4>

                                  {!notification.is_read && (
                                    <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                                  )}

                                </div>

                                <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                                  {
                                    notification.message
                                  }
                                </p>

                                <span className="text-[10px] text-slate-400 mt-2 block">
                                  {formatTime(
                                    notification.created_at
                                  )}
                                </span>

                              </div>

                              <button
                                type="button"
                                onClick={(
                                  event
                                ) => {
                                  event.stopPropagation();

                                  removeNotification(
                                    notification
                                  );
                                }}
                                className="absolute right-3 bottom-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition"
                                title="Remove"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>

                            </div>

                          )
                        )

                      )}

                    </div>

                  </div>

                )}

              </div>

              {/* USER PROFILE CHIP (TABLET/DESKTOP) */}

              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="hidden sm:flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-cyan-500/40 shadow-md transition-all cursor-pointer text-left group shrink-0"
                title="View and Edit Profile"
              >

                {profile?.profile_photo ? (
                  <img
                    src={profile.profile_photo}
                    alt={profile.name}
                    className="w-7 h-7 rounded-full object-cover border border-slate-600"
                  />
                ) : (
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isAdmin
                        ? 'bg-purple-400'
                        : isEmployer
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                )}

                <div className="min-w-0">

                  <p className="text-sm font-medium text-white group-hover:text-cyan-300 transition-colors truncate max-w-[120px]">
                    {profile?.name}
                  </p>

                  <p className="text-xs text-slate-400 capitalize">
                    {profile?.role}
                  </p>

                </div>

              </button>

              {/* MOBILE USER AVATAR */}
              <button
                type="button"
                onClick={() => navigate('/profile')}
                className="sm:hidden p-1.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 hover:text-white"
                title="Profile"
              >
                {profile?.profile_photo ? (
                  <img
                    src={profile.profile_photo}
                    alt={profile.name}
                    className="w-6 h-6 rounded-full object-cover border border-slate-600"
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-cyan-600/30 text-cyan-400 flex items-center justify-center text-[10px] font-bold">
                    {(profile?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
              </button>

              {/* LOGOUT */}

              <button
                onClick={
                  handleSignOut
                }
                className="p-2 sm:p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-300 hover:text-red-400 hover:border-red-400/40 hover:bg-red-500/10 transition-all duration-300"
                title="Sign out"
              >
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

            </div>

          </div>

        </div>

      </header>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-2 py-1.5 flex items-center justify-around shadow-2xl"
      >
        {isAdmin ? (
          <>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl text-xs font-medium transition-colors ${
                  isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <ShieldCheck className="w-5 h-5 mb-0.5" />
              <span>Admin</span>
            </NavLink>

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-xl text-xs font-medium transition-colors ${
                  isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <User className="w-5 h-5 mb-0.5" />
              <span>Profile</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[11px] font-medium transition-colors ${
                  isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <LayoutDashboard className="w-5 h-5 mb-0.5" />
              <span>Dashboard</span>
            </NavLink>

            {isEmployer ? (
              <>
                <NavLink
                  to="/post-job"
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[11px] font-medium transition-colors ${
                      isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`
                  }
                >
                  <PlusCircle className="w-5 h-5 mb-0.5" />
                  <span>Post Job</span>
                </NavLink>

                <NavLink
                  to="/my-jobs"
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[11px] font-medium transition-colors ${
                      isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`
                  }
                >
                  <FileText className="w-5 h-5 mb-0.5" />
                  <span>My Jobs</span>
                </NavLink>
              </>
            ) : (
              <>
                <NavLink
                  to="/jobs"
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[11px] font-medium transition-colors ${
                      isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`
                  }
                >
                  <Search className="w-5 h-5 mb-0.5" />
                  <span>Find Jobs</span>
                </NavLink>

                <NavLink
                  to="/applied-jobs"
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[11px] font-medium transition-colors ${
                      isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`
                  }
                >
                  <ClipboardList className="w-5 h-5 mb-0.5" />
                  <span>Applied</span>
                </NavLink>
              </>
            )}

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[11px] font-medium transition-colors ${
                  isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              <User className="w-5 h-5 mb-0.5" />
              <span>Profile</span>
            </NavLink>
          </>
        )}
      </nav>

      {/* MAIN */}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 pb-24 md:pb-8">
        {children}
      </main>

    </div>
  );
}