import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import type { Role } from '../types/database';
import { API_BASE_URL } from '../lib/config';

export interface Profile {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  token?: string | null;
  location?: string | null;
  profile_photo?: string | null;
  skills?: string | null;
  experience?: string | null;
  preferred_work_type?: string | null;
  company_name?: string | null;
  employer_type?: string | null;
}

interface AuthContextType {
  user: Profile | null;
  profile: Profile | null;
  loading: boolean;

  signUp: (
    email: string,
    password: string,
    name: string,
    role: Role,
    phone?: string,
    phoneVerified?: boolean,
    profileData?: {
      location?: string;
      skills?: string;
      experience?: string;
      preferred_work_type?: string;
      employer_type?: string;
      company_name?: string;
      profile_photo?: string;
    }
  ) => Promise<void>;

  signIn: (
    identifier: string,
    password: string
  ) => Promise<void>;

  signOut: () => Promise<void>;

  updateProfileState: (updatedFields: Partial<Profile>) => void;
}

const AuthContext =
  createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<Profile | null>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [loading, setLoading] =
    useState(true);

  /* =====================================================
     RESTORE CURRENT USER
  ===================================================== */

  useEffect(() => {
    try {
      const storedUser =
        localStorage.getItem('user');
      const storedToken =
        localStorage.getItem('auth_token');

      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        const token = storedToken || parsedUser?.token || null;

        if (
          parsedUser &&
          parsedUser.id &&
          parsedUser.role
        ) {
          const userWithToken = { ...parsedUser, token };
          setUser(userWithToken);
          setProfile(userWithToken);
          if (token && !storedToken) {
            localStorage.setItem('auth_token', token);
          }
        } else {
          localStorage.removeItem('user');
          localStorage.removeItem('auth_token');
        }
      }
    } catch (error) {
      console.log(
        'Session restore error:',
        error
      );

      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  }, []);

  /* =====================================================
     SIGN UP
  ===================================================== */

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: Role,
    phone?: string,
    phoneVerified: boolean = false,
    profileData?: {
      location?: string;
      skills?: string;
      experience?: string;
      preferred_work_type?: string;
      employer_type?: string;
      company_name?: string;
      profile_photo?: string;
    }
  ) => {
    // Clear old session
    setUser(null);
    setProfile(null);
    localStorage.removeItem('user');

    const response = await fetch(
      `${API_BASE_URL}/register`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          name,
          email: email || null,
          phone: phone || null,
          password,
          role,
          otpVerified: phoneVerified,
          // Profile fields
          location: profileData?.location || null,
          skills: profileData?.skills || null,
          experience: profileData?.experience || null,
          preferred_work_type: profileData?.preferred_work_type || null,
          employer_type: profileData?.employer_type || null,
          company_name: profileData?.company_name || null,
          profile_photo: profileData?.profile_photo || null,
        }),
      }
    );

    const responseText =
      await response.text();

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = {
        message: responseText,
      };
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
          'Registration failed'
      );
    }

    console.log(
      'Registration successful:',
      data
    );

    /*
     * IMPORTANT:
     * Automatically login after registration.
     */

    const loginIdentifier =
      phone || email;

    if (!loginIdentifier) {
      throw new Error(
        'No email or phone number available for login'
      );
    }

    await signIn(
      loginIdentifier,
      password
    );
  };

  /* =====================================================
     SIGN IN
  ===================================================== */

  const signIn = async (
    identifier: string,
    password: string
  ) => {
    // Clear previous session
    setUser(null);
    setProfile(null);
    localStorage.removeItem('user');

    /*
     * If user enters a 10-digit Indian phone number,
     * convert it to +91 format.
     */

    const cleanedIdentifier =
      identifier.replace(/\s/g, '');

    const isPhone =
      /^\d{10}$/.test(
        cleanedIdentifier
      );

    const loginIdentifier =
      isPhone
        ? `+91${cleanedIdentifier}`
        : cleanedIdentifier;

    const response = await fetch(
      `${API_BASE_URL}/login`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          identifier: loginIdentifier,
          password,
        }),
      }
    );

    const responseText =
      await response.text();

    let data: any;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }

    if (!response.ok) {
      throw new Error(
        typeof data === 'string'
          ? data
          : data?.message ||
              'Invalid Email/Phone or Password'
      );
    }

    /*
     * Validate returned user
     */

    if (
      !data ||
      !data.id ||
      !data.role
    ) {
      throw new Error(
        'Invalid user information received from server'
      );
    }

    const token = data.token || null;

    const loggedInUser: Profile = {
      id: Number(data.id),
      name: data.name,
      email: data.email || '',
      role: data.role,
      phone: data.phone || null,
      token,
    };

    /*
     * Update React state
     */

    setUser(loggedInUser);
    setProfile(loggedInUser);

    /*
     * Save current user & token
     */

    if (token) {
      localStorage.setItem('auth_token', token);
    }
    localStorage.setItem(
      'user',
      JSON.stringify(loggedInUser)
    );

    console.log(
      'Logged in user:',
      loggedInUser
    );
  };

  /* =====================================================
     SIGN OUT
  ===================================================== */

  const signOut = async () => {
    setUser(null);
    setProfile(null);

    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('profile');
    localStorage.removeItem('currentUser');

    console.log(
      'User signed out successfully'
    );
  };

  const updateProfileState = (updatedFields: Partial<Profile>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updatedFields };
      try {
        localStorage.setItem('user', JSON.stringify(updated));
      } catch {
        // Ignore storage error
      }
      return updated;
    });

    setProfile((prev) => {
      if (!prev) return null;
      return { ...prev, ...updatedFields };
    });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfileState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within AuthProvider'
    );
  }

  return context;
}