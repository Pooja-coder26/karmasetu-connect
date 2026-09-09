import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Award,
  Building2,
  Camera,
  Trash2,
  Edit3,
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Ban,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  playNotificationSound,
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from '../lib/notificationSound';

/**
 * Compresses and scales an image file on the client side using HTML5 Canvas.
 * Keeps output below ~35KB so it easily fits within default JSON request limits
 * without requiring any large body-parser configuration or external storage.
 */
function compressImage(file: File, maxDim = 256, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      return reject(new Error('Please select a valid image file.'));
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas rendering failed.'));
        }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error('Failed to process image.'));
      img.src = readerEvent.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export default function ProfilePage() {
  const { profile, updateProfileState } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isEmployer = profile?.role === 'employer';

  // Loading & View States
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Worker-Specific Fields
  const [skills, setSkills] = useState('');
  const [experience, setExperience] = useState('');
  const [preferredWorkType, setPreferredWorkType] = useState('');

  // Employer-Specific Fields
  const [companyName, setCompanyName] = useState('');
  const [employerType, setEmployerType] = useState('Individual Employer');

  // Track initial values to cancel edits cleanly
  const [initialData, setInitialData] = useState<any>(null);

  // Notification Sound setting state
  const [soundEnabled, setSoundEnabled] = useState(() => isNotificationSoundEnabled());

  useEffect(() => {
    const handleSoundChange = (e: any) => {
      if (typeof e?.detail?.enabled === 'boolean') {
        setSoundEnabled(e.detail.enabled);
      } else {
        setSoundEnabled(isNotificationSoundEnabled());
      }
    };
    window.addEventListener('notificationSoundSettingChanged', handleSoundChange);
    return () => {
      window.removeEventListener('notificationSoundSettingChanged', handleSoundChange);
    };
  }, []);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setNotificationSoundEnabled(next);
    if (next) {
      playNotificationSound('sound_test');
    }
  };

  // Blocked Users Management State
  interface BlockedUser {
    id: number;
    blocked_user_id: number;
    created_at: string;
    blocked_user_name?: string;
    blocked_user_role?: string;
    blocked_user_email?: string;
  }

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);
  const [blockFeedback, setBlockFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchBlockedUsers = async () => {
    setLoadingBlocked(true);
    try {
      const res = await fetch(`${API_BASE_URL}/blocked-users`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setBlockedUsers(data);
      }
    } catch (err) {
      console.error('Failed to load blocked users:', err);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblockUser = async (blockedUserId: number, userName?: string) => {
    if (!confirm(`Are you sure you want to unblock ${userName || 'this user'}? You will be able to interact with them again.`)) {
      return;
    }
    setUnblockingId(blockedUserId);
    setBlockFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/blocks/${blockedUserId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to unblock user');
      }
      setBlockedUsers((prev) => prev.filter((u) => u.blocked_user_id !== blockedUserId));
      setBlockFeedback({ type: 'success', message: `${userName || 'User'} unblocked successfully. Normal interaction can now resume.` });
      setTimeout(() => setBlockFeedback(null), 4000);
    } catch (err: any) {
      setBlockFeedback({ type: 'error', message: err.message || 'Error unblocking user.' });
    } finally {
      setUnblockingId(null);
    }
  };

  /* =====================================================
     LOAD PROFILE FROM BACKEND
  ===================================================== */

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to load profile data.');
      }

      const data = await response.json();

      setName(data.name || '');
      setEmail(data.email || '');
      setPhone(data.phone || '');
      setLocation(data.location || '');
      setProfilePhoto(data.profile_photo || null);
      setSkills(data.skills || '');
      setExperience(data.experience || '');
      setPreferredWorkType(data.preferred_work_type || '');
      setCompanyName(data.company_name || '');
      // Derive employer type from API or from company_name
      setEmployerType(
        data.employer_type ||
        (data.company_name ? 'Company / Organization' : 'Individual Employer')
      );

      setInitialData(data);

      // Keep AuthContext synchronized
      updateProfileState({
        name: data.name,
        profile_photo: data.profile_photo || null,
      });
    } catch (err: any) {
      console.error('Profile fetch error:', err);
      setErrorMessage(err.message || 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchBlockedUsers();
  }, []);

  /* =====================================================
     PHOTO HANDLERS
  ===================================================== */

  const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setErrorMessage(null);
      // Compress to max 256x256 at 80% quality
      const compressedDataUrl = await compressImage(file, 256, 0.8);
      setProfilePhoto(compressedDataUrl);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process selected image.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemovePhoto = () => {
    setProfilePhoto(null);
  };

  /* =====================================================
     CANCEL EDITING
  ===================================================== */

  const handleCancelEdit = () => {
    if (initialData) {
      setName(initialData.name || '');
      setEmail(initialData.email || '');
      setPhone(initialData.phone || '');
      setLocation(initialData.location || '');
      setProfilePhoto(initialData.profile_photo || null);
      setSkills(initialData.skills || '');
      setExperience(initialData.experience || '');
      setPreferredWorkType(initialData.preferred_work_type || '');
      setCompanyName(initialData.company_name || '');
      setEmployerType(
        initialData.employer_type ||
        (initialData.company_name ? 'Company / Organization' : 'Individual Employer')
      );
    }
    setErrorMessage(null);
    setIsEditing(false);
  };

  /* =====================================================
     SAVE PROFILE
  ===================================================== */

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setErrorMessage('Please enter your full name (minimum 2 characters).');
      return;
    }

    if (email && email.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setErrorMessage('Please enter a valid email address.');
        return;
      }
    }

    try {
      setSaving(true);

      const payload = {
        name: trimmedName,
        email: email ? email.trim() : null,
        location: location ? location.trim() : null,
        profile_photo: profilePhoto,
        ...(isEmployer
          ? {
              employer_type: employerType,
              company_name:
                employerType === 'Company / Organization'
                  ? companyName
                    ? companyName.trim()
                    : null
                  : null,
            }
          : {
              skills: skills ? skills.trim() : null,
              experience: experience ? experience.trim() : null,
              preferred_work_type: preferredWorkType ? preferredWorkType.trim() : null,
            }),
      };

      const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save profile.');
      }

      const updated = data.user;
      setInitialData(updated);

      // Reflect updated values in local state
      setCompanyName(updated.company_name || '');
      setEmployerType(
        updated.employer_type ||
        (updated.company_name ? 'Company / Organization' : 'Individual Employer')
      );

      // Synchronize AuthContext & localStorage immediately
      updateProfileState({
        name: updated.name,
        email: updated.email,
        location: updated.location,
        profile_photo: updated.profile_photo,
        skills: updated.skills,
        experience: updated.experience,
        preferred_work_type: updated.preferred_work_type,
        company_name: updated.company_name,
        employer_type: updated.employer_type,
      });

      setIsEditing(false);
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Profile save error:', err);
      setErrorMessage(err.message || 'Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /* =====================================================
     RENDER
  ===================================================== */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        <p className="text-sm font-medium">Loading profile information...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            {isEmployer ? 'Employer Profile' : 'Worker Profile'}
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Manage your personal and professional details on KarmaSetu Connect.
          </p>
        </div>

        {!isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            <Edit3 className="w-4 h-4" />
            <span>Edit Profile</span>
          </button>
        )}
      </div>

      {/* SUCCESS / ERROR ALERTS */}
      {successMessage && (
        <div className="flex items-center gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-medium shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2.5 sm:gap-3 p-3.5 sm:p-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs sm:text-sm font-medium shadow-lg animate-in fade-in">
          <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-5 sm:space-y-6">
        {/* CARD 1: IDENTITY & AVATAR */}
        <div className="glass-card p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            {/* AVATAR DISPLAY */}
            <div className="relative group shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-slate-700/80 flex items-center justify-center shadow-xl">
                {profilePhoto ? (
                  <img
                    src={profilePhoto}
                    alt={name || 'Profile Avatar'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                    {(name || 'U').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>

              {isEditing && (
                <div className="absolute -bottom-2 -right-2 flex gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload photo"
                    className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg border border-cyan-400/40 transition-all cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  {profilePhoto && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      title="Remove photo"
                      className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg border border-rose-400/40 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>

            {/* IDENTITY SUMMARY */}
            <div className="text-center sm:text-left flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h2 className="text-2xl font-bold text-white truncate">
                  {name || 'Anonymous User'}
                </h2>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                    isEmployer
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {isEmployer ? 'Employer' : 'Worker'}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-slate-400">
                {phone && (
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    {phone}
                    <span title="Phone verified via OTP">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    </span>
                  </span>
                )}
                {email && (
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <Mail className="w-3.5 h-3.5 text-cyan-400" />
                    {email}
                  </span>
                )}
                {location && (
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    {location}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: DETAILS FORM */}
        <div className="glass-card p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
          <h3 className="text-base sm:text-lg font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            <User className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            <span>General Information</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* FULL NAME */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Full Name <span className="text-rose-400">*</span>
              </label>
              {isEditing ? (
                <div className="relative">
                  <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter full name"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm transition"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-200 font-medium py-1">{name || 'Not provided'}</p>
              )}
            </div>

            {/* PHONE NUMBER (READ-ONLY) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Phone Number
                </label>
                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3 h-3" /> OTP Verified
                </span>
              </div>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={phone || ''}
                  disabled
                  title="Phone number is secured by OTP verification and cannot be changed here."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-400 text-sm cursor-not-allowed"
                />
              </div>
              {isEditing && (
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Phone number is bound to OTP authentication and cannot be edited directly.
                </p>
              )}
            </div>

            {/* EMAIL */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Email Address
              </label>
              {isEditing ? (
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm transition"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-200 font-medium py-1">{email || 'Not provided'}</p>
              )}
            </div>

            {/* LOCATION */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Location / City
              </label>
              {isEditing ? (
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Bengaluru, Karnataka"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm transition"
                  />
                </div>
              ) : (
                <p className="text-sm text-slate-200 font-medium py-1">{location || 'Not provided'}</p>
              )}
            </div>
          </div>
        </div>

        {/* CARD 3: ROLE-SPECIFIC DETAILS */}
        <div className="glass-card p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6">
          <h3 className="text-base sm:text-lg font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
            {isEmployer ? (
              <>
                <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                <span>Company Details</span>
              </>
            ) : (
              <>
                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                <span>Professional & Work Details</span>
              </>
            )}
          </h3>

          {isEmployer ? (
            /* EMPLOYER FIELDS */
            <div className="space-y-4 sm:space-y-5">
              {/* EMPLOYER TYPE */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Employer Type
                </label>
                {isEditing ? (
                  <select
                    value={employerType}
                    onChange={(e) => {
                      setEmployerType(e.target.value);
                      if (e.target.value === 'Individual Employer') setCompanyName('');
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-amber-500 text-sm transition"
                  >
                    <option value="Individual Employer">Individual Employer</option>
                    <option value="Company / Organization">Company / Organization</option>
                  </select>
                ) : (
                  <p className="text-sm text-slate-200 font-medium py-1">
                    {employerType || 'Individual Employer'}
                  </p>
                )}
              </div>

              {/* COMPANY NAME — only shown for Company / Organization */}
              {(employerType === 'Company / Organization' || (!isEditing && companyName)) && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Company / Organization Name{isEditing && employerType === 'Company / Organization' ? <span className="text-red-400 ml-1">*</span> : ''}
                  </label>
                  {isEditing ? (
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Acme Construction Pvt Ltd"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-sm transition"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-200 font-medium py-1">
                      {companyName || 'Not specified'}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* WORKER FIELDS */
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* SKILLS */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Skills / Trade
                  </label>
                  {isEditing ? (
                    <div className="relative">
                      <Award className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={skills}
                        onChange={(e) => setSkills(e.target.value)}
                        placeholder="e.g. Carpentry, Painting, Masonry, Plumbing"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm transition"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-200 font-medium py-1">{skills || 'Not specified'}</p>
                  )}
                </div>

                {/* EXPERIENCE */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Experience Level
                  </label>
                  {isEditing ? (
                    <div className="relative">
                      <Briefcase className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                      <input
                        type="text"
                        value={experience}
                        onChange={(e) => setExperience(e.target.value)}
                        placeholder="e.g. 5 Years, Experienced, Beginner"
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm transition"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-200 font-medium py-1">{experience || 'Not specified'}</p>
                  )}
                </div>
              </div>

              {/* PREFERRED WORK TYPE */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Preferred Work Type
                </label>
                {isEditing ? (
                  <div className="relative">
                    <Briefcase className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      value={preferredWorkType}
                      onChange={(e) => setPreferredWorkType(e.target.value)}
                      placeholder="e.g. Daily Wage, Full-time Contract, Part-time"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm transition"
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-200 font-medium py-1">
                    {preferredWorkType || 'Any Daily Wage Work'}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ACTION BUTTONS (IN EDIT MODE) */}
        {isEditing && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-medium border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              <span>Cancel</span>
            </button>

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs sm:text-sm font-semibold shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        )}
      </form>

      {/* NOTIFICATION SOUND PREFERENCES */}
      <div className="glass-card bg-slate-900/90 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              {soundEnabled ? <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <VolumeX className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" />}
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>🔔</span>
                <span>Notification Sound</span>
              </h3>
              <p className="text-xs text-slate-400">Play chime for incoming notifications, OTP events, and login/registration success</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleSound}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                soundEnabled ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
              title={soundEnabled ? 'Disable notification sound' : 'Enable notification sound'}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  soundEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-xs font-semibold text-slate-300 w-8">
              {soundEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      </div>

      {/* BLOCKED USERS MANAGEMENT SECTION */}
      <div className="glass-card bg-slate-900/90 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Ban className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Blocked Users</h3>
              <p className="text-xs text-slate-400">Manage users you have blocked from contacting or interacting with you</p>
            </div>
          </div>
          <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {blockedUsers.length} blocked
          </span>
        </div>

        {blockFeedback && (
          <div className={`p-3 rounded-xl text-xs font-medium border flex items-center gap-2 ${
            blockFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}>
            {blockFeedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{blockFeedback.message}</span>
          </div>
        )}

        {loadingBlocked ? (
          <div className="py-6 flex items-center justify-center text-slate-400 text-xs sm:text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            <span>Loading blocked users...</span>
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs sm:text-sm italic">
            You have not blocked any users.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {blockedUsers.map((bu) => (
              <div key={bu.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-semibold text-sm shrink-0">
                    {bu.blocked_user_name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs sm:text-sm font-semibold text-white truncate">{bu.blocked_user_name || 'User'}</p>
                      {bu.blocked_user_role && (
                        <span className="px-1.5 sm:px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                          {bu.blocked_user_role}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-500">
                      Blocked on {new Date(bu.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={unblockingId === bu.blocked_user_id}
                  onClick={() => handleUnblockUser(bu.blocked_user_id, bu.blocked_user_name)}
                  className="self-end sm:self-auto px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/40 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {unblockingId === bu.blocked_user_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  )}
                  <span>Unblock User</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
