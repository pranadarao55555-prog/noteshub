import { Navigate } from 'react-router-dom';
import { useAuth, isEmailAdmin } from './AuthProvider';
import '../entry/entry.css';

export default function AccessStatusScreen() {
  const { access, profile, user, logout } = useAuth();
  
  // Instant hard check: Admin is NEVER shown the waiting screen
  const isAdmin = isEmailAdmin(user?.email || profile?.email) || access === 'admin';
  if (isAdmin || access === 'approved') return <Navigate to="/dashboard" replace />;
  
  if (access === 'loading') return <div className="nh-boot" />;
  if (access === 'signed-out') return <Navigate to="/" replace />;
  const rejected = access === 'rejected';
  return (
    <main className="nh-wait">
      <section className="glass-card nh-wait-card">
        <div className={`nh-orb ${rejected ? 'is-rejected' : ''}`} aria-hidden="true" />
        <h1>{rejected ? 'Access Not Approved' : 'Waiting for Approval'}</h1>
        <p className="font-semibold text-white text-base">
          {rejected
            ? 'Your request was not approved. Please contact the administrator.'
            : 'Your request is still awaiting admin approval.'}
        </p>
        <p className="text-sm text-slate-400">
          {rejected
            ? 'If you think this is a mistake, contact your class admin directly.'
            : 'Please wait until the admin approves your access to class notes. This page updates in real-time once you are approved.'}
        </p>
        <p className="nh-dim">Signed in as {profile?.email || user?.email}</p>
        <button className="pill pill-ghost" onClick={logout}>Sign out</button>
      </section>
    </main>
  );
}
