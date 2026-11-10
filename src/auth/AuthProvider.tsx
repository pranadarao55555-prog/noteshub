import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../config/supabase';

export type AccessStatus = 'loading' | 'signed-out' | 'admin' | 'approved' | 'pending' | 'rejected';

export interface UserDoc {
  id?: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  status: 'pending' | 'approved' | 'rejected';
  requestedAt?: number | string;
  reviewedAt?: number | string;
  reviewedBy?: string;
}

interface AuthContextType {
  user: any | null;
  profile: UserDoc | null;
  access: AccessStatus;
  error: string;
  loginGoogle: () => Promise<void>;
  loginEmail: (email: string, password: string, createAccount?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  // Backward compatibility helpers
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithPassword: (email: string, password: string, name?: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  isSupabaseReady: boolean;
  currentUser: {
    uid: string;
    email: string;
    displayName: string;
    isAdmin: boolean;
    photoURL?: string;
    role?: 'admin' | 'student';
  } | null;
  adminEmail: string;
  signOut: () => Promise<void>;
  claimAdminKey: (secretKey: string) => Promise<{ success: boolean; message?: string }>;
}

const AuthCtx = createContext<AuthContextType | null>(null);
export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export const getAdminEmails = (): string[] => {
  const raw = import.meta.env.VITE_ADMIN_EMAIL || '';
  const unquoted = raw.replace(/^["']|["']$/g, '');
  const parsed = unquoted
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const fallbackAdmins = [
    'pranadarao55555@gmail.com',
    'nikhiltholamatti@gmail.com',
    'krishnaadiga26@gmail.com',
  ];

  return Array.from(new Set([...parsed, ...fallbackAdmins]));
};

export const isEmailAdmin = (email?: string | null): boolean => {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  const admins = getAdminEmails();
  return admins.includes(clean);
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || 'pranadarao55555@gmail.com')
    .replace(/^["']|["']$/g, '')
    .split(',')[0]
    .toLowerCase()
    .trim();

  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 4B: Detect and handle Supabase redirect errors in URL (e.g. ?error=... or #error=...)
  useEffect(() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const errorParam =
        searchParams.get('error_description') ||
        searchParams.get('error') ||
        hashParams.get('error_description') ||
        hashParams.get('error');

      if (errorParam) {
        const decoded = decodeURIComponent(errorParam.replace(/\+/g, ' '));
        setError(decoded);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {
      // ignore
    }
  }, []);

  // 1. Initial auth state and user profile sync
  useEffect(() => {
    let activeChannel: any = null;

    const syncUserProfile = async (authUser: any) => {
      if (!authUser || !authUser.email) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(authUser);
      const cleanEmail = authUser.email.toLowerCase().trim();

      // Check if user is in authorized admin emails, has claimed admin key, or has admin metadata
      const isClaimed = Boolean(
        authUser.id && localStorage.getItem(`nh_admin_claimed_${authUser.id}`) === 'true'
      );
      const isMetaAdmin = authUser.user_metadata?.role === 'admin' || authUser.app_metadata?.role === 'admin';
      const isAdmin = isEmailAdmin(cleanEmail) || isClaimed || isMetaAdmin;

      if (isAdmin) {
        const defaultName = cleanEmail === 'pranadarao55555@gmail.com'
          ? 'Pranada Rao'
          : cleanEmail === 'nikhiltholamatti@gmail.com'
          ? 'Nikhil Tholamatti'
          : cleanEmail === 'krishnaadiga26@gmail.com'
          ? 'Krishna Adiga'
          : authUser.user_metadata?.name || authUser.user_metadata?.display_name || cleanEmail.split('@')[0] || 'Admin';

        const adminProfile: UserDoc = {
          id: authUser.id,
          name: authUser.user_metadata?.name || authUser.user_metadata?.display_name || defaultName,
          email: cleanEmail,
          role: 'admin',
          status: 'approved',
          requestedAt: Date.now(),
          reviewedAt: Date.now(),
          reviewedBy: isClaimed ? 'secret-key' : 'system',
        };
        setProfile(adminProfile);
        try {
          localStorage.setItem(`nh_profile_${authUser.id}`, JSON.stringify(adminProfile));
        } catch {
          // ignore
        }
        setLoading(false);
        return; // BYPASS ALL DATABASE / WHITELIST LOOKUPS FOR ADMIN
      }

      // Check remote database or local user profile
      let loadedProfile: UserDoc | null = null;

      if (isSupabaseConfigured) {
        try {
          const { data, error: fetchErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .maybeSingle();

          if (!fetchErr && data) {
            loadedProfile = {
              id: data.id,
              name: data.name,
              email: data.email,
              role: data.role || 'student',
              status: data.status || 'pending',
              requestedAt: data.requested_at,
              reviewedAt: data.reviewed_at,
              reviewedBy: data.reviewed_by,
            };
          } else if (!data) {
            // New user registration -> Insert new student pending record
            const newDoc = {
              id: authUser.id,
              name: authUser.user_metadata?.name || authUser.user_metadata?.display_name || cleanEmail.split('@')[0],
              email: cleanEmail,
              role: 'student',
              status: 'pending',
            };
            const { data: inserted } = await supabase
              .from('users')
              .insert([newDoc])
              .select()
              .maybeSingle();

            if (inserted) {
              loadedProfile = {
                id: inserted.id,
                name: inserted.name,
                email: inserted.email,
                role: inserted.role,
                status: inserted.status,
                requestedAt: inserted.created_at,
              };
            }
          }
        } catch (err) {
          console.warn('Error reading/writing users table in Supabase:', err);
        }
      }

      // Fallback local persistence if database table is initializing
      if (!loadedProfile) {
        try {
          const savedLocal = localStorage.getItem(`nh_profile_${authUser.id}`);
          if (savedLocal) {
            loadedProfile = JSON.parse(savedLocal);
          } else {
            loadedProfile = {
              id: authUser.id,
              name: authUser.user_metadata?.name || authUser.user_metadata?.display_name || cleanEmail.split('@')[0],
              email: cleanEmail,
              role: 'student',
              status: 'pending',
              requestedAt: Date.now(),
            };
            localStorage.setItem(`nh_profile_${authUser.id}`, JSON.stringify(loadedProfile));
          }
        } catch {
          loadedProfile = {
            id: authUser.id,
            name: cleanEmail.split('@')[0],
            email: cleanEmail,
            role: 'student',
            status: 'pending',
          };
        }
      }

      setProfile(loadedProfile);
      setLoading(false);
      // Live listener: approval/rejection reflects without page refresh
      if (isSupabaseConfigured) {
        if (activeChannel) {
          supabase.removeChannel(activeChannel);
        }

        const channel = supabase
          .channel(`user-profile-${authUser.id}-${Date.now()}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'users' },
            (payload: any) => {
              const data = payload.new;
              if (data && (data.id === authUser.id || data.email === cleanEmail)) {
                const updated: UserDoc = {
                  id: data.id,
                  name: data.name || cleanEmail.split('@')[0],
                  email: data.email,
                  role: data.role || 'student',
                  status: data.status,
                  requestedAt: data.requested_at,
                  reviewedAt: data.reviewed_at,
                  reviewedBy: data.reviewed_by,
                };
                setProfile(updated);
                localStorage.setItem(`nh_profile_${authUser.id}`, JSON.stringify(updated));
              }
            }
          )
          .subscribe();

        activeChannel = channel;
      }

      // Also listen to cross-tab BroadcastChannel for immediate local approval sync
      try {
        const bc = new BroadcastChannel('nh_auth_gate_channel');
        bc.onmessage = (msg) => {
          if (msg.data?.userId === authUser.id && msg.data?.status) {
            setProfile((prev) => {
              if (!prev) return null;
              const next: UserDoc = { ...prev, status: msg.data.status };
              localStorage.setItem(`nh_profile_${authUser.id}`, JSON.stringify(next));
              return next;
            });
          }
        };
      } catch {
        // ignore
      }
    };

    // Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      syncUserProfile(session?.user || null);
    }).catch(() => {
      setLoading(false);
    });

    // Listen to Supabase Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncUserProfile(session?.user || null);
    });

    return () => {
      subscription.unsubscribe();
      if (activeChannel) supabase.removeChannel(activeChannel);
    };
  }, [adminEmail]);

  // Derived Access State
  const access: AccessStatus = useMemo(() => {
    if (!user && !loading) return 'signed-out';
    const isClaimed = Boolean(user?.id && localStorage.getItem(`nh_admin_claimed_${user.id}`) === 'true');
    const isMeta = user?.user_metadata?.role === 'admin' || user?.app_metadata?.role === 'admin';
    if (user && (isEmailAdmin(user.email) || isClaimed || isMeta)) return 'admin';
    if (loading) return 'loading';
    if (!user) return 'signed-out';
    if (!profile) return 'loading';
    if (profile.role === 'admin' && profile.status === 'approved') return 'admin';
    return profile.status; // 'approved' | 'pending' | 'rejected'
  }, [loading, user, profile]);

  const claimAdminKey = useCallback(async (secretKey: string): Promise<{ success: boolean; message?: string }> => {
    const configuredSecret = (import.meta.env.VITE_ADMIN_SECRET_KEY || 'NotesHubPRRAO7002').trim();
    if (!secretKey || secretKey.trim() !== configuredSecret) {
      return { success: false, message: 'Invalid Admin Secret Key.' };
    }

    if (!user) {
      return { success: false, message: 'You must be signed in to claim admin privileges.' };
    }

    const cleanEmail = (user.email || '').toLowerCase().trim();
    const defaultName = cleanEmail === 'pranadarao55555@gmail.com'
      ? 'Pranada Rao'
      : cleanEmail === 'nikhiltholamatti@gmail.com'
      ? 'Nikhil Tholamatti'
      : cleanEmail === 'krishnaadiga26@gmail.com'
      ? 'Krishna Adiga'
      : user.user_metadata?.name || user.user_metadata?.display_name || cleanEmail.split('@')[0] || 'Admin';

    const updatedProfile: UserDoc = {
      id: user.id,
      name: user.user_metadata?.name || user.user_metadata?.display_name || defaultName,
      email: cleanEmail,
      role: 'admin',
      status: 'approved',
      requestedAt: Date.now(),
      reviewedAt: Date.now(),
      reviewedBy: 'secret-key',
    };

    setProfile(updatedProfile);

    try {
      localStorage.setItem(`nh_admin_claimed_${user.id}`, 'true');
      localStorage.setItem(`nh_profile_${user.id}`, JSON.stringify(updatedProfile));
    } catch {}

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('users')
          .upsert([
            {
              id: user.id,
              name: updatedProfile.name,
              email: cleanEmail,
              role: 'admin',
              status: 'approved',
              reviewed_at: new Date().toISOString(),
              reviewed_by: 'secret-key',
            },
          ]);
      } catch (err) {
        console.warn('Could not update role in Supabase users table:', err);
      }
    }

    return { success: true };
  }, [user]);

  const friendly = (e: any): string => {
    const msg = e?.message || String(e || '');
    if (msg.includes('Invalid login credentials') || msg.includes('invalid-credential')) {
      return 'Email or password is incorrect.';
    }
    if (msg.includes('already registered') || msg.includes('email-already-in-use')) {
      return 'That email already has an account. Sign in instead.';
    }
    if (msg.includes('Password should be') || msg.includes('weak-password')) {
      return 'Use a password with at least 6 characters.';
    }
    if (msg.includes('popup') || msg.includes('closed')) {
      return 'The Google window was closed before sign-in finished.';
    }
    return msg || 'Sign-in failed. Check your connection and try again.';
  };

  const loginGoogle = useCallback(async () => {
    setError('');
    try {
      const { error: oAuthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (oAuthError) throw oAuthError;
    } catch (e: any) {
      const msg = friendly(e);
      setError(msg);
      throw e;
    }
  }, []);

  const loginEmail = useCallback(async (email: string, password: string, createAccount = false) => {
    setError('');
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (createAccount) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              name: cleanEmail.split('@')[0],
            },
          },
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (e: any) {
      const msg = friendly(e);
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    setProfile(null);
  }, []);

  // Backward compatibility user object for existing components
  const currentUser = useMemo(() => {
    if (!user) return null;
    const cleanEmail = (user.email || profile?.email || '').toLowerCase().trim();
    const isClaimed = Boolean(user.id && localStorage.getItem(`nh_admin_claimed_${user.id}`) === 'true');
    const isMeta = user.user_metadata?.role === 'admin' || user.app_metadata?.role === 'admin';
    const isAdmin = isEmailAdmin(cleanEmail) || access === 'admin' || profile?.role === 'admin' || isClaimed || isMeta;
    const defaultDisplayName = cleanEmail === 'pranadarao55555@gmail.com'
      ? 'Pranada Rao'
      : cleanEmail === 'nikhiltholamatti@gmail.com'
      ? 'Nikhil Tholamatti'
      : cleanEmail === 'krishnaadiga26@gmail.com'
      ? 'Krishna Adiga'
      : (isAdmin ? 'Admin' : 'Student');

    return {
      uid: user.id,
      email: cleanEmail,
      displayName: profile?.name || user.user_metadata?.name || defaultDisplayName,
      isAdmin,
      role: (isAdmin ? 'admin' : (profile?.role || 'student')) as 'admin' | 'student',
      photoURL: user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(profile?.name || cleanEmail)}`,
    };
  }, [user, profile, access]);

  return (
    <AuthCtx.Provider
      value={{
        user,
        profile,
        access,
        error,
        loginGoogle,
        loginEmail,
        logout,
        currentUser,
        adminEmail,
        signOut: logout,
        claimAdminKey,
        isSupabaseReady: isSupabaseConfigured,
        signInWithPassword: async (email: string, pass: string) => {
          try {
            await loginEmail(email, pass, false);
            return { error: null };
          } catch (err: any) {
            return { error: err };
          }
        },
        signUpWithPassword: async (email: string, pass: string) => {
          try {
            await loginEmail(email, pass, true);
            return { error: null, needsEmailConfirmation: false };
          } catch (err: any) {
            return { error: err };
          }
        },
        signInWithGoogle: async () => {
          try {
            await loginGoogle();
            return { error: null };
          } catch (err: any) {
            return { error: err };
          }
        },
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}
