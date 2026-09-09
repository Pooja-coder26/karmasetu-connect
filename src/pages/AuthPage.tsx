import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import {
  Briefcase,
  Users,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Phone,
  Mail,
  Lock,
  ArrowLeft,
  CheckCircle,
} from 'lucide-react';

import type { Role } from '../types/database';
import { API_BASE_URL } from '../lib/config';

type AuthMode = 'login' | 'register' | 'forgot';

export default function AuthPage() {

  const [mode, setMode] =
    useState<AuthMode>('login');

  const [name, setName] =
    useState('');

  const [identifier, setIdentifier] =
    useState('');

  const [password, setPassword] =
    useState('');

  const [confirmPassword, setConfirmPassword] =
    useState('');

  const [role, setRole] =
    useState<Role>('worker');

  const [otp, setOtp] =
    useState('');

  const [otpSent, setOtpSent] =
    useState(false);

  const [otpVerified, setOtpVerified] =
    useState(false);

  const [showPassword, setShowPassword] =
    useState(false);

  const [showConfirmPassword, setShowConfirmPassword] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  const [loading, setLoading] =
    useState(false);

  const isSendingOtpRef = useRef(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const isVerifyingOtpRef = useRef(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // --- Profile fields for registration ---
  const [regLocation, setRegLocation] = useState('');
  const [regSkills, setRegSkills] = useState('');
  const [regExperience, setRegExperience] = useState('');
  const [regPrefWorkType, setRegPrefWorkType] = useState('');
  const [regEmployerType, setRegEmployerType] = useState('Individual Employer');
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regPhoto, setRegPhoto] = useState('');
  const [regPhotoPreview, setRegPhotoPreview] = useState('');
  const regPhotoInputRef = useRef<HTMLInputElement>(null);


  // Countdown timer for Resend OTP button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const { signUp, signIn } =
    useAuth();

  const navigate =
    useNavigate();


  /* =====================================================
     HELPERS
  ===================================================== */

  const validateAndFormatPhone = (
    raw: string
  ): { valid: boolean; error?: string; formatted?: string } => {
    const trimmed = (raw || '').trim();
    if (!trimmed) {
      return {
        valid: false,
        error: 'Please enter your phone number before requesting an OTP',
      };
    }

    // Strip spaces, dashes, parentheses
    let digits = trimmed.replace(/[\s()-]/g, '');

    // Normalize common Indian prefixes
    if (digits.startsWith('+91')) {
      digits = digits.slice(3);
    } else if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.slice(1);
    }

    // Must be exactly 10 digits
    if (!/^\d{10}$/.test(digits)) {
      return {
        valid: false,
        error: 'Please enter a valid 10-digit Indian phone number',
      };
    }

    // Must start with 6, 7, 8, or 9
    if (!/^[6-9]/.test(digits)) {
      return {
        valid: false,
        error:
          'Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9',
      };
    }

    return {
      valid: true,
      formatted: `+91${digits}`,
    };
  };

  const isPhone =
    /^\+?[0-9]{10,15}$/.test(
      identifier.replace(/\s/g, '')
    );

  const cleanPhone =
    identifier.replace(/\s/g, '');


  const resetMessages = () => {
    setError('');
    setSuccess('');
  };

  // Compress an image file to a base64 data URI (max 256x256, 80% quality)
  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const MAX = 256;
          let w = img.width;
          let h = img.height;
          if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
          else { w = Math.round((w * MAX) / h); h = MAX; }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas not available')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => reject(new Error('Invalid image'));
        img.src = ev.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });


  const switchMode = (
    newMode: AuthMode
  ) => {
    setMode(newMode);

    setError('');
    setSuccess('');

    setOtp('');
    setOtpSent(false);
    setOtpVerified(false);
    setResendCooldown(0);
    isSendingOtpRef.current = false;
    setIsSendingOtp(false);
    isVerifyingOtpRef.current = false;
    setIsVerifyingOtp(false);
    setLoading(false);

    setPassword('');
    setConfirmPassword('');

    // Reset profile registration fields
    setRegLocation('');
    setRegSkills('');
    setRegExperience('');
    setRegPrefWorkType('');
    setRegEmployerType('Individual Employer');
    setRegCompanyName('');
    setRegPhoto('');
    setRegPhotoPreview('');
  };


  /* =====================================================
     SEND OTP (WITH IN-FLIGHT DEDUPLICATION & COOLDOWN)
  ===================================================== */

  const sendOtp = async (isResend: boolean = false) => {
    resetMessages();

    // Line 1: Immediate synchronous lock to prevent duplicate requests before re-render
    if (isSendingOtpRef.current || isSendingOtp || loading) {
      return;
    }
    isSendingOtpRef.current = true;
    setIsSendingOtp(true);

    // Cooldown check for resend
    if (isResend && resendCooldown > 0) {
      setError(
        `Please wait ${resendCooldown} seconds before requesting another OTP`
      );
      isSendingOtpRef.current = false;
      setIsSendingOtp(false);
      return;
    }

    // Strict client-side phone validation
    const validation = validateAndFormatPhone(identifier);
    if (!validation.valid || !validation.formatted) {
      setError(
        validation.error || 'Please enter a valid phone number'
      );
      isSendingOtpRef.current = false;
      setIsSendingOtp(false);
      return;
    }

    const phone = validation.formatted;
    setLoading(true);

    try {
      const endpoint =
        mode === 'forgot'
          ? `${API_BASE_URL}/forgot-password/send-otp`
          : `${API_BASE_URL}/send-otp`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone,
        }),
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        // Fallback for non-JSON or empty response
      }

      if (!response.ok) {
        throw new Error(
          data.message || 'Failed to send OTP'
        );
      }

      setOtpSent(true);
      setResendCooldown(30);

      setSuccess(
        isResend
          ? 'New OTP sent successfully to your phone.'
          : 'OTP sent successfully to your phone.'
      );

    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to send OTP'
      );
    } finally {
      isSendingOtpRef.current = false;
      setIsSendingOtp(false);
      setLoading(false);
    }
  };


  /* =====================================================
     VERIFY OTP
  ===================================================== */

  const verifyOtp = async () => {
    resetMessages();

    if (isVerifyingOtpRef.current || isVerifyingOtp || loading) {
      return;
    }

    const cleanOtp = String(otp || '').trim();
    if (!cleanOtp) {
      setError('Please enter the OTP');
      return;
    }

    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    const validation = validateAndFormatPhone(identifier);
    if (!validation.valid || !validation.formatted) {
      setError(validation.error || 'Please enter a valid phone number');
      return;
    }

    const phone = validation.formatted;

    isVerifyingOtpRef.current = true;
    setIsVerifyingOtp(true);
    setLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/verify-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone,
            code: cleanOtp,
          }),
        }
      );

      let data: any = {};
      try {
        data = await response.json();
      } catch {}

      if (!response.ok) {
        throw new Error(
          data.message || 'Invalid OTP'
        );
      }

      setOtpVerified(true);
      setSuccess('Phone number verified successfully!');

    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Invalid OTP'
      );
    } finally {
      isVerifyingOtpRef.current = false;
      setIsVerifyingOtp(false);
      setLoading(false);
    }
  };


  /* =====================================================
     SUBMIT LOGIN / REGISTER
  ===================================================== */

  const handleSubmit =
    async (
      e: React.FormEvent
    ) => {

      e.preventDefault();

      resetMessages();


      /* =========================
         LOGIN
      ========================= */

      if (mode === 'login') {
        const formEl = e.currentTarget as HTMLFormElement;
        const formUsername = (formEl.elements.namedItem('username') as HTMLInputElement)?.value;
        const formPassword = (formEl.elements.namedItem('password') as HTMLInputElement)?.value;

        const effectiveIdentifier = (identifier || formUsername || '').trim();
        const effectivePassword = password || formPassword || '';

        if (!effectiveIdentifier) {
          setError(
            'Enter your email or phone number'
          );

          return;
        }

        if (!effectivePassword) {
          setError(
            'Enter your password'
          );

          return;
        }

        setLoading(true);

        try {
          await signIn(
            effectiveIdentifier,
            effectivePassword
          );

          // Allow the browser's native password manager (Chrome, Edge, etc.) to prompt to remember credentials
          if (
            typeof window !== 'undefined' &&
            'PasswordCredential' in window &&
            navigator.credentials?.store
          ) {
            try {
              const cred = new (window as any).PasswordCredential({
                id: effectiveIdentifier,
                password: effectivePassword,
                name: effectiveIdentifier,
              });
              await navigator.credentials.store(cred);
            } catch {
              // Ignore if browser permission or user declines
            }
          }

          navigate('/');

        } catch (err: unknown) {

          setError(
            err instanceof Error
              ? err.message
              : 'Login failed'
          );

        } finally {

          setLoading(false);
        }

        return;
      }


      /* =========================
         REGISTER
      ========================= */

      if (mode === 'register') {

        if (!name.trim()) {

          setError(
            'Please enter your full name'
          );

          return;
        }


        if (!identifier) {

          setError(
            'Enter your email or phone number'
          );

          return;
        }


        if (!password) {

          setError(
            'Please enter a password'
          );

          return;
        }


        if (password.length < 6) {

          setError(
            'Password must contain at least 6 characters'
          );

          return;
        }


        if (
          password !==
          confirmPassword
        ) {

          setError(
            'Passwords do not match'
          );

          return;
        }

        // --- Profile field validation ---
        if (!regLocation.trim()) {
          setError('Please enter your location / city');
          return;
        }

        if (role === 'worker') {
          if (!regSkills.trim()) {
            setError('Please enter your skills / trade');
            return;
          }
          if (!regExperience) {
            setError('Please select your experience level');
            return;
          }
          if (!regPrefWorkType) {
            setError('Please select your preferred work type');
            return;
          }
        }

        if (role === 'employer') {
          if (!regEmployerType) {
            setError('Please select your employer type');
            return;
          }
          if (regEmployerType === 'Company / Organization' && !regCompanyName.trim()) {
            setError('Please enter your company name');
            return;
          }
        }

        // Build profileData object
        const profileData = {
          location: regLocation.trim(),
          skills: role === 'worker' ? regSkills.trim() : undefined,
          experience: role === 'worker' ? regExperience : undefined,
          preferred_work_type: role === 'worker' ? regPrefWorkType : undefined,
          employer_type: role === 'employer' ? regEmployerType : undefined,
          company_name: role === 'employer' && regEmployerType === 'Company / Organization' ? regCompanyName.trim() : undefined,
          profile_photo: regPhoto || undefined,
        };

        /*
         * PHONE REGISTRATION
         */

        if (isPhone) {

          if (!otpVerified) {

            setError(
              'Please verify your phone number with OTP first'
            );

            return;
          }


          const validation = validateAndFormatPhone(identifier);
          if (!validation.valid || !validation.formatted) {
            setError(validation.error || 'Please enter a valid phone number');
            return;
          }

          const phone = validation.formatted;


          setLoading(true);

          try {

            await signUp(
              '',
              password,
              name,
              role,
              phone,
              true,
              profileData
            );

            navigate('/');

          } catch (err: unknown) {

            setError(
              err instanceof Error
                ? err.message
                : 'Registration failed'
            );

          } finally {

            setLoading(false);
          }

          return;
        }


        /*
         * EMAIL REGISTRATION
         */

        if (
          !identifier.includes('@')
        ) {

          setError(
            'Enter a valid email address or phone number'
          );

          return;
        }


        setLoading(true);

        try {

          await signUp(
            identifier,
            password,
            name,
            role,
            undefined,
            false,
            profileData
          );

          navigate('/');

        } catch (err: unknown) {

          setError(
            err instanceof Error
              ? err.message
              : 'Registration failed'
          );

        } finally {

          setLoading(false);
        }

        return;
      }
    };



  /* =====================================================
     RESET PASSWORD
  ===================================================== */

  const resetPassword =
    async () => {

      resetMessages();


      if (!otp) {

        setError(
          'Please enter the OTP'
        );

        return;
      }


      if (!password) {

        setError(
          'Enter your new password'
        );

        return;
      }


      if (password.length < 6) {

        setError(
          'Password must contain at least 6 characters'
        );

        return;
      }


      if (
        password !==
        confirmPassword
      ) {

        setError(
          'Passwords do not match'
        );

        return;
      }


      const phone =
        cleanPhone.startsWith('+')
          ? cleanPhone
          : `+91${cleanPhone}`;


      setLoading(true);

      try {

        const response =
          await fetch(
            `${API_BASE_URL}/forgot-password/reset`,
            {
              method: 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                phone,
                code: otp,
                newPassword:
                  password,
              }),
            }
          );


        const data =
          await response.json();


        if (!response.ok) {

          throw new Error(
            data.message ||
            'Password reset failed'
          );
        }


        setSuccess(
          'Password reset successfully! You can now login.'
        );


        setTimeout(() => {

          switchMode('login');

        }, 1500);

      } catch (err: unknown) {

        setError(
          err instanceof Error
            ? err.message
            : 'Password reset failed'
        );

      } finally {

        setLoading(false);
      }
    };


  /* =====================================================
     UI
  ===================================================== */

  return (

    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950">

      {/* Background */}

      <div className="absolute top-0 left-0 w-96 h-96 bg-cyan-500/20 blur-[120px] rounded-full" />

      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/20 blur-[120px] rounded-full" />


      <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-2 gap-10 items-center">


        {/* =================================================
            LEFT SIDE
        ================================================= */}

        <div className="hidden lg:block">

          <div className="inline-flex items-center gap-3 mb-6">

            <div className="w-14 h-14 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-cyan-500/30">

              <Briefcase className="w-7 h-7 text-white" />

            </div>


            <div>

              <h1 className="text-4xl font-bold text-white">
                KarmaSetu Connect
              </h1>

              <p className="text-slate-400 mt-1">
                Daily Wage Hiring Platform
              </p>

            </div>

          </div>


          <h2 className="text-5xl font-bold leading-tight text-white max-w-xl">

            Connecting workers with opportunities in real-time.

          </h2>


          <p className="text-slate-400 mt-6 text-lg max-w-lg">

            Empowering employers and workers through a smart,
            location-based labour hiring ecosystem.

          </p>


          <div className="mt-10 space-y-5">

            <div className="flex items-center gap-4">

              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">

                <ShieldCheck className="w-6 h-6 text-cyan-400" />

              </div>

              <div>

                <h3 className="text-white font-semibold">
                  Secure Authentication
                </h3>

                <p className="text-slate-400 text-sm">
                  SMS OTP and secure password authentication.
                </p>

              </div>

            </div>


            <div className="flex items-center gap-4">

              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">

                <Users className="w-6 h-6 text-emerald-400" />

              </div>

              <div>

                <h3 className="text-white font-semibold">
                  Simplified Hiring
                </h3>

                <p className="text-slate-400 text-sm">
                  Easy job posting and worker application workflow.
                </p>

              </div>

            </div>

          </div>

        </div>


        {/* =================================================
            AUTH CARD
        ================================================= */}

        <div className="w-full max-w-md mx-auto">

          <div className="bg-slate-900/70 backdrop-blur-2xl border border-slate-700/40 rounded-3xl p-8 shadow-2xl">


            {/* MOBILE LOGO */}

            <div className="lg:hidden text-center mb-8">

              <div className="inline-flex items-center gap-3">

                <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center">

                  <Briefcase className="w-6 h-6 text-white" />

                </div>

                <div className="text-left">

                  <h1 className="text-2xl font-bold text-white">
                    KarmaSetu
                  </h1>

                  <p className="text-slate-400 text-sm">
                    Hiring Platform
                  </p>

                </div>

              </div>

            </div>


            {/* =================================================
                LOGIN / REGISTER TABS
            ================================================= */}

            {mode !== 'forgot' && (

              <div className="flex bg-slate-800/60 rounded-2xl p-1 mb-7">

                <button
                  type="button"
                  onClick={() =>
                    switchMode('login')
                  }
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                    mode === 'login'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Login
                </button>


                <button
                  type="button"
                  onClick={() =>
                    switchMode('register')
                  }
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
                    mode === 'register'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Register
                </button>

              </div>

            )}


            {/* FORGOT HEADER */}

            {mode === 'forgot' && (

              <div className="mb-7">

                <button
                  type="button"
                  onClick={() =>
                    switchMode('login')
                  }
                  className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </button>


                <h2 className="text-2xl font-bold text-white">
                  Reset Password
                </h2>

                <p className="text-slate-400 text-sm mt-2">
                  We'll send an OTP to your registered phone number.
                </p>

              </div>

            )}


            {/* ERROR */}

            {error && (

              <div className="mb-5 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm">

                {error}

              </div>

            )}


            {/* SUCCESS */}

            {success && (

              <div className="mb-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">

                <CheckCircle className="w-4 h-4 flex-shrink-0" />

                {success}

              </div>

            )}


            {/* =================================================
                FORGOT PASSWORD
            ================================================= */}

            {mode === 'forgot' ? (

              <div className="space-y-5">


                {/* PHONE */}

                <div>

                  <label className="block text-sm font-medium text-slate-300 mb-2">

                    Registered Phone Number

                  </label>

                  <div className="relative">

                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

                    <input
                      type="tel"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(
                          e.target.value
                        );
                        setOtpSent(false);
                        setOtpVerified(false);
                      }}
                      disabled={otpSent}
                      placeholder="+91 9876543210"
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white disabled:opacity-60"
                    />

                  </div>

                </div>


                {/* SEND OTP */}

                {!otpSent && (

                  <button
                    type="button"
                    onClick={() => sendOtp(false)}
                    disabled={isSendingOtp || loading || !identifier.trim() || resendCooldown > 0}
                    className="w-full py-3 rounded-2xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >

                    {isSendingOtp
                      ? 'Sending OTP...'
                      : 'Send OTP'}

                  </button>

                )}


                {/* OTP */}

                {otpSent && (

                  <>

                    <div>

                      <label className="block text-sm font-medium text-slate-300 mb-2">

                        Enter OTP

                      </label>

                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) =>
                          setOtp(
                            e.target.value.replace(
                              /\D/g,
                              ''
                            )
                          )
                        }
                        placeholder="6-digit OTP"
                        className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white text-center tracking-[0.5em] text-lg"
                      />

                    </div>


                    <div>

                      <label className="block text-sm font-medium text-slate-300 mb-2">

                        New Password

                      </label>

                      <div className="relative">

                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

                        <input
                          type={
                            showPassword
                              ? 'text'
                              : 'password'
                          }
                          value={password}
                          onChange={(e) =>
                            setPassword(
                              e.target.value
                            )
                          }
                          placeholder="Minimum 6 characters"
                          className="w-full pl-12 pr-12 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setShowPassword(
                              !showPassword
                            )
                          }
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                        >

                          {showPassword ? (
                            <EyeOff className="w-5 h-5" />
                          ) : (
                            <Eye className="w-5 h-5" />
                          )}

                        </button>

                      </div>

                    </div>


                    <div>

                      <label className="block text-sm font-medium text-slate-300 mb-2">

                        Confirm Password

                      </label>

                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) =>
                          setConfirmPassword(
                            e.target.value
                          )
                        }
                        placeholder="Confirm new password"
                        className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                      />

                    </div>


                    <button
                      type="button"
                      onClick={resetPassword}
                      disabled={loading}
                      className="w-full py-3 rounded-2xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
                    >

                      {loading
                        ? 'Resetting...'
                        : 'Reset Password'}

                    </button>


                    <div className="flex items-center justify-between text-xs pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setOtp('');
                          sendOtp(true);
                        }}
                        disabled={isSendingOtp || loading || resendCooldown > 0 || !identifier.trim()}
                        className="text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        {isSendingOtp
                          ? 'Sending...'
                          : resendCooldown > 0
                          ? `Resend OTP in ${resendCooldown}s`
                          : 'Resend OTP'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setOtp('');
                          setResendCooldown(0);
                        }}
                        className="text-slate-400 hover:text-white"
                      >
                        Change phone number
                      </button>
                    </div>

                  </>

                )}

              </div>

            ) : mode === 'login' ? (

              /* =================================================
                 LOGIN FORM
              ================================================= */

              <form
                id="login-form"
                name="login"
                method="POST"
                action="/login"
                onSubmit={handleSubmit}
                className="space-y-5"
              >

                {/* EMAIL / PHONE */}

                <div>

                  <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">

                    Email or Phone Number

                  </label>


                  <div className="relative">

                    {isPhone ? (

                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

                    ) : (

                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

                    )}


                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => {

                        setIdentifier(
                          e.target.value
                        );

                        setOtpSent(false);
                        setOtpVerified(false);
                      }}
                      required
                      placeholder="Email or +91 phone number"
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                    />

                  </div>

                </div>


                {/* PASSWORD */}

                <div>

                  <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">

                    Password

                  </label>


                  <div className="relative">

                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />


                    <input
                      id="password"
                      name="password"
                      type={
                        showPassword
                          ? 'text'
                          : 'password'
                      }
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) =>
                        setPassword(
                          e.target.value
                        )
                      }
                      required
                      minLength={6}
                      placeholder="Minimum 6 characters"
                      className="w-full px-4 py-3 pl-12 pr-12 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                    />


                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          !showPassword
                        )
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >

                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}

                    </button>

                  </div>

                </div>


                {/* FORGOT PASSWORD */}

                <div className="text-right">

                  <button
                    type="button"
                    onClick={() =>
                      switchMode('forgot')
                    }
                    className="text-sm text-cyan-400 hover:text-cyan-300"
                  >

                    Forgot Password?

                  </button>

                </div>


                {/* SUBMIT */}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-2xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:scale-[1.02] transition-all duration-300 shadow-xl shadow-cyan-500/20 disabled:opacity-60"
                >

                  <span className="flex items-center justify-center gap-2">

                    {loading
                      ? 'Please wait...'
                      : 'Sign In'}

                    <ArrowRight className="w-4 h-4" />

                  </span>

                </button>

              </form>

            ) : (

              /* =================================================
                 REGISTER FORM
              ================================================= */

              <form
                id="register-form"
                name="register"
                method="POST"
                action="/register"
                onSubmit={handleSubmit}
                className="space-y-5"
              >

                {/* NAME */}

                <div>

                  <label htmlFor="register-name" className="block text-sm font-medium text-slate-300 mb-2">

                    Full Name

                  </label>

                  <input
                    id="register-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) =>
                      setName(
                        e.target.value
                      )
                    }
                    required
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                  />

                </div>


                {/* ROLE */}

                <div>

                  <label className="block text-sm font-medium text-slate-300 mb-2">

                    Select Role

                  </label>


                  <div className="grid grid-cols-2 gap-4">

                    <button
                      type="button"
                      onClick={() =>
                        setRole('worker')
                      }
                      className={`p-4 rounded-2xl border transition-all ${
                        role === 'worker'
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-slate-700 bg-slate-800/40 text-slate-400'
                      }`}
                    >

                      <Users className="w-6 h-6 mx-auto mb-2" />

                      Worker

                    </button>


                    <button
                      type="button"
                      onClick={() =>
                        setRole('employer')
                      }
                      className={`p-4 rounded-2xl border transition-all ${
                        role === 'employer'
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-slate-700 bg-slate-800/40 text-slate-400'
                      }`}
                    >

                      <Briefcase className="w-6 h-6 mx-auto mb-2" />

                      Employer

                    </button>

                  </div>

                </div>


                {/* EMAIL / PHONE */}

                <div>

                  <label htmlFor="register-username" className="block text-sm font-medium text-slate-300 mb-2">

                    Email or Phone Number

                  </label>


                  <div className="relative">

                    {isPhone ? (

                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

                    ) : (

                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />

                    )}


                    <input
                      id="register-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => {

                        setIdentifier(
                          e.target.value
                        );

                        setOtpSent(false);
                        setOtpVerified(false);
                      }}
                      required
                      placeholder="Email or +91 phone number"
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                    />

                  </div>


                  {isPhone && (

                    <p className="text-xs text-slate-500 mt-2">

                      We'll send a verification OTP by SMS.

                    </p>

                  )}

                </div>


                {/* PHONE OTP */}

                {isPhone && (

                  <div className="space-y-3">

                    {!otpSent && (

                      <button
                        type="button"
                        onClick={() => sendOtp(false)}
                        disabled={isSendingOtp || loading || !identifier.trim() || resendCooldown > 0}
                        className="w-full py-3 rounded-2xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 font-semibold hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      >

                        {isSendingOtp
                          ? 'Sending OTP...'
                          : 'Send SMS OTP'}

                      </button>

                    )}


                    {otpSent && !otpVerified && (

                      <>

                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={otp}
                          onChange={(e) =>
                            setOtp(
                              e.target.value.replace(
                                /\D/g,
                                ''
                              )
                            )
                          }
                          placeholder="Enter 6-digit OTP"
                          className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white text-center tracking-[0.5em] text-lg"
                        />


                        <button
                          type="button"
                          onClick={verifyOtp}
                          disabled={isVerifyingOtp || loading || otp.trim().length !== 6}
                          className="w-full py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >

                          {isVerifyingOtp
                            ? 'Verifying...'
                            : 'Verify OTP'}

                        </button>


                        <div className="flex items-center justify-between text-xs pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setOtp('');
                              sendOtp(true);
                            }}
                            disabled={isSendingOtp || loading || resendCooldown > 0 || !identifier.trim()}
                            className="text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                          >
                            {isSendingOtp
                              ? 'Sending...'
                              : resendCooldown > 0
                              ? `Resend OTP in ${resendCooldown}s`
                              : 'Resend OTP'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setOtpSent(false);
                              setOtp('');
                              setResendCooldown(0);
                            }}
                            className="text-slate-400 hover:text-white"
                          >
                            Change number
                          </button>
                        </div>

                      </>

                    )}


                    {otpVerified && (

                      <div className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-xl">

                        <CheckCircle className="w-5 h-5" />

                        Phone number verified

                      </div>

                    )}

                  </div>

                )}


                {/* =============================================
                    PROFILE FIELDS (shown after OTP OR always for email)
                ============================================= */}

                {/* LOCATION — Required for all roles */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Location / City <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={regLocation}
                    onChange={(e) => setRegLocation(e.target.value)}
                    placeholder="e.g. Mumbai, Delhi, Bangalore"
                    className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white placeholder-slate-500"
                  />
                </div>

                {/* WORKER-SPECIFIC FIELDS */}
                {role === 'worker' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Skills / Trade <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={regSkills}
                        onChange={(e) => setRegSkills(e.target.value)}
                        placeholder="e.g. Plumbing, Carpentry, Electrician"
                        className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white placeholder-slate-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Experience Level <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={regExperience}
                        onChange={(e) => setRegExperience(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                      >
                        <option value="">Select experience level</option>
                        <option value="Fresher (0 years)">Fresher (0 years)</option>
                        <option value="1-2 years">1-2 years</option>
                        <option value="3-5 years">3-5 years</option>
                        <option value="5-10 years">5-10 years</option>
                        <option value="10+ years">10+ years</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Preferred Work Type <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={regPrefWorkType}
                        onChange={(e) => setRegPrefWorkType(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                      >
                        <option value="">Select work type</option>
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Daily Wage">Daily Wage</option>
                        <option value="Flexible">Flexible</option>
                      </select>
                    </div>
                  </>
                )}

                {/* EMPLOYER-SPECIFIC FIELDS */}
                {role === 'employer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Employer Type <span className="text-red-400">*</span>
                      </label>
                      <select
                        value={regEmployerType}
                        onChange={(e) => {
                          setRegEmployerType(e.target.value);
                          if (e.target.value === 'Individual Employer') setRegCompanyName('');
                        }}
                        className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                      >
                        <option value="Individual Employer">Individual Employer</option>
                        <option value="Company / Organization">Company / Organization</option>
                      </select>
                    </div>

                    {regEmployerType === 'Company / Organization' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Company Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={regCompanyName}
                          onChange={(e) => setRegCompanyName(e.target.value)}
                          placeholder="Enter your company or organization name"
                          className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700 rounded-2xl text-white placeholder-slate-500"
                        />
                      </div>
                    )}

                    {/* Company Logo — OPTIONAL */}
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Company Logo <span className="text-slate-500 text-xs">(Optional)</span>
                      </label>
                      <div className="flex items-center gap-4">
                        {regPhotoPreview && (
                          <img
                            src={regPhotoPreview}
                            alt="Logo preview"
                            className="w-14 h-14 rounded-xl object-cover border border-slate-600"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => regPhotoInputRef.current?.click()}
                          className="px-4 py-2 rounded-xl border border-slate-600 bg-slate-800/60 text-slate-300 text-sm hover:border-cyan-500/50 hover:text-cyan-400 transition-colors"
                        >
                          {regPhotoPreview ? 'Change Logo' : 'Upload Logo'}
                        </button>
                        {regPhotoPreview && (
                          <button
                            type="button"
                            onClick={() => { setRegPhoto(''); setRegPhotoPreview(''); }}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <input
                        ref={regPhotoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) {
                            setError('Logo file is too large (max 5MB)');
                            return;
                          }
                          try {
                            const compressed = await compressImage(file);
                            setRegPhoto(compressed);
                            setRegPhotoPreview(compressed);
                          } catch {
                            setError('Failed to process image. Please try a different file.');
                          }
                        }}
                      />
                    </div>
                  </>
                )}


                {/* PASSWORD */}

                <div>

                  <label htmlFor="register-password" className="block text-sm font-medium text-slate-300 mb-2">

                    Password

                  </label>


                  <div className="relative">

                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />


                    <input
                      id="register-password"
                      name="password"
                      type={
                        showPassword
                          ? 'text'
                          : 'password'
                      }
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) =>
                        setPassword(
                          e.target.value
                        )
                      }
                      required
                      minLength={6}
                      placeholder="Minimum 6 characters"
                      className="w-full px-4 py-3 pl-12 pr-12 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                    />


                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword(
                          !showPassword
                        )
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >

                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}

                    </button>

                  </div>

                </div>


                {/* CONFIRM PASSWORD */}

                <div>

                  <label htmlFor="register-confirm-password" className="block text-sm font-medium text-slate-300 mb-2">

                    Confirm Password

                  </label>


                  <div className="relative">

                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />


                    <input
                      id="register-confirm-password"
                      name="confirm-password"
                      type={
                        showConfirmPassword
                          ? 'text'
                          : 'password'
                      }
                      autoComplete="new-password"
                      value={
                        confirmPassword
                      }
                      onChange={(e) =>
                        setConfirmPassword(
                          e.target.value
                        )
                      }
                      required
                      minLength={6}
                      placeholder="Confirm password"
                      className="w-full px-4 py-3 pl-12 pr-12 bg-slate-800/60 border border-slate-700 rounded-2xl text-white"
                    />


                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(
                          !showConfirmPassword
                        )
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                    >

                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}

                    </button>

                  </div>

                </div>


                {/* SUBMIT */}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-2xl font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:scale-[1.02] transition-all duration-300 shadow-xl shadow-cyan-500/20 disabled:opacity-60"
                >

                  <span className="flex items-center justify-center gap-2">

                    {loading
                      ? 'Please wait...'
                      : 'Create Account'}

                    <ArrowRight className="w-4 h-4" />

                  </span>

                </button>

              </form>

            )}

          </div>


          <p className="text-center text-slate-500 text-sm mt-6">

            Empowering daily wage workers through digital hiring.

          </p>

        </div>

      </div>

    </div>
  );
}