import { useState } from 'react';
import { useAuth, isEmailAdmin } from '../auth/AuthProvider';
import { supabase, isSupabaseConfigured } from '../config/supabase';

export default function LoginCard() {
  const { loginGoogle, loginEmail, error: authError } = useAuth();
  const [view, setView] = useState<'signin' | 'request' | 'submitted'>('signin');

  // Sign In inputs
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');

  // Request Access inputs
  const [fullName, setFullName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqPw, setReqPw] = useState('');

  const [busy, setBusy] = useState(false);
  const [reqError, setReqError] = useState('');
  const [statusAlert, setStatusAlert] = useState<{ title: string; message: string; type: 'pending' | 'rejected' } | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setStatusAlert(null);
    try {
      await fn();
    } catch {
      // handled in provider
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async () => {
    if (!email || !pw) return;
    setBusy(true);
    setStatusAlert(null);
    try {
      const cleanEmail = email.trim().toLowerCase();

      // Check status in database if available for immediate alert notice
      if (!isEmailAdmin(cleanEmail) && isSupabaseConfigured) {
        try {
          const { data: userRec } = await supabase
            .from('users')
            .select('status')
            .eq('email', cleanEmail)
            .maybeSingle();

          if (userRec?.status === 'pending') {
            setStatusAlert({
              title: 'Waiting for Approval',
              message: 'Your request is still awaiting admin approval.',
              type: 'pending',
            });
          } else if (userRec?.status === 'rejected') {
            setStatusAlert({
              title: 'Access Not Approved',
              message: 'Your request was not approved. Please contact the administrator.',
              type: 'rejected',
            });
          }
        } catch {
          // ignore
        }
      }

      await loginEmail(cleanEmail, pw, false);
    } catch {
      // handled in provider
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !reqEmail.trim() || !reqPw.trim()) {
      setReqError('Please fill in all fields.');
      return;
    }
    if (reqPw.length < 6) {
      setReqError('Use a password with at least 6 characters.');
      return;
    }

    setBusy(true);
    setReqError('');
    try {
      const cleanEmail = reqEmail.trim().toLowerCase();
      const cleanName = fullName.trim();
      let createdUid = 'req_' + Date.now();

      if (isSupabaseConfigured) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: reqPw,
          options: {
            data: {
              name: cleanName,
              display_name: cleanName,
            },
          },
        });

        if (signUpError) {
          if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
            throw new Error('An account with this email already exists. Try signing in instead.');
          }
          throw signUpError;
        }

        if (signUpData?.user) {
          createdUid = signUpData.user.id;
          try {
            await supabase.from('users').upsert([
              {
                id: createdUid,
                name: cleanName,
                email: cleanEmail,
                role: 'student',
                status: 'pending',
                requested_at: new Date().toISOString(),
              },
            ]);
          } catch (dbErr) {
            console.warn('Could not insert to public.users directly:', dbErr);
          }

          // Sign out immediately so pending user stays on the landing experience
          await supabase.auth.signOut().catch(() => {});
        }
      }

      // Store in local storage for local/demo/fallback access and admin dashboard
      const localDoc = {
        id: createdUid,
        name: cleanName,
        email: cleanEmail,
        role: 'student' as const,
        status: 'pending' as const,
        requestedAt: Date.now(),
      };
      try {
        localStorage.setItem(`nh_profile_${createdUid}`, JSON.stringify(localDoc));
        const raw = localStorage.getItem('noteshub_access_requests');
        const map = raw ? JSON.parse(raw) : {};
        map[createdUid] = {
          id: createdUid,
          uid: createdUid,
          displayName: cleanName,
          email: cleanEmail,
          status: 'pending',
          requestedAt: Date.now(),
        };
        localStorage.setItem('noteshub_access_requests', JSON.stringify(map));
        window.dispatchEvent(new Event('nh:requests-updated'));
      } catch {
        // ignore
      }

      // Transition card to confirmation state
      setView('submitted');
    } catch (err: any) {
      setReqError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nh-login glass-card" role="dialog" aria-label="Sign in to NotesHub">
      {/* 1. Sign In State */}
      {view === 'signin' && (
        <>
          <h1 className="nh-logo">Notes Hub<span className="nh-dot" /></h1>
          <p className="nh-sub">Sign in to open your class notes</p>
          <button
            className="pill pill-google flex items-center justify-center gap-2"
            disabled={busy}
            onClick={() => run(loginGoogle)}
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>
          <div className="nh-or"><span>or use email</span></div>
          <input
            className="field"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="field"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />

          {/* Status Alert for Pending / Rejected */}
          {statusAlert && (
            <div
              className={`p-3 rounded-xl border text-xs leading-relaxed ${
                statusAlert.type === 'pending'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
              }`}
              role="alert"
            >
              <strong className="block font-bold mb-0.5">{statusAlert.title}</strong>
              <p>{statusAlert.message}</p>
            </div>
          )}

          {authError && !statusAlert && <p className="nh-error" role="alert">{authError}</p>}

          <button
            className="pill pill-primary"
            disabled={busy || !email || !pw}
            onClick={handleSignIn}
          >
            Sign in
          </button>
          <button
            className="pill pill-ghost"
            onClick={() => {
              setView('request');
              setReqError('');
              setStatusAlert(null);
            }}
          >
            New here? Request access
          </button>
        </>
      )}

      {/* 2. Request Access State */}
      {view === 'request' && (
        <form onSubmit={handleSubmitRequest} className="flex flex-col gap-3">
          <h1 className="nh-logo" style={{ fontSize: 'clamp(28px, 3.2vw, 38px)' }}>
            Join Notes Hub<span className="nh-dot" />
          </h1>
          <p className="nh-sub">Submit a request to access class notes</p>

          <input
            className="field"
            type="text"
            placeholder="Your Full Name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
          <input
            className="field"
            type="email"
            placeholder="Student Email"
            autoComplete="email"
            value={reqEmail}
            onChange={(e) => setReqEmail(e.target.value)}
            required
          />
          <input
            className="field"
            type="password"
            placeholder="Create a Password"
            autoComplete="new-password"
            value={reqPw}
            onChange={(e) => setReqPw(e.target.value)}
            required
          />

          {reqError && <p className="nh-error" role="alert">{reqError}</p>}

          <button
            type="submit"
            className="pill pill-primary"
            disabled={busy || !fullName.trim() || !reqEmail.trim() || !reqPw.trim()}
          >
            {busy ? 'Submitting...' : 'Submit Request'}
          </button>
          <button
            type="button"
            className="pill pill-ghost"
            onClick={() => {
              setView('signin');
              setReqError('');
              setStatusAlert(null);
            }}
          >
            Already have an account? Sign in
          </button>
        </form>
      )}

      {/* 3. Confirmation State */}
      {view === 'submitted' && (
        <div className="flex flex-col gap-3">
          <h1 className="nh-logo" style={{ fontSize: 'clamp(26px, 3vw, 34px)' }}>
            Join Notes Hub<span className="nh-dot" />
          </h1>
          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/25 text-indigo-100 text-xs sm:text-sm leading-relaxed my-1">
            <div className="flex items-center gap-2 text-indigo-300 font-bold mb-1.5 text-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Request Submitted!</span>
            </div>
            <p className="text-slate-300">
              Waiting for admin approval. You will be able to sign in once the admin verifies your request.
            </p>
          </div>
          <button
            type="button"
            className="pill pill-primary mt-1"
            onClick={() => {
              setView('signin');
              setFullName('');
              setReqEmail('');
              setReqPw('');
              setReqError('');
              setStatusAlert(null);
            }}
          >
            Back to Sign In
          </button>
        </div>
      )}
    </div>
  );
}

