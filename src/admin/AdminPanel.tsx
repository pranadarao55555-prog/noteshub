import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../config/supabase';
import { useAuth } from '../auth/AuthProvider';
import ExistingUploader from '../dashboard/existing/Uploader';
import type { UserDoc } from '../auth/AuthProvider';
import './admin.css';

// ---------------------------------------------------------------------------
// Error Boundary to prevent admin realtime or UI failures from crashing dashboard
// ---------------------------------------------------------------------------
interface ErrorBoundaryProps {
  fallback?: ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class AdminErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('AdminPanel caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Realtime Pending Access Requests Hook
// ---------------------------------------------------------------------------
function useRequests(): UserDoc[] {
  const [rows, setRows] = useState<UserDoc[]>([]);

  useEffect(() => {
    let isMounted = true;

    const fetchPending = async () => {
      if (isSupabaseConfigured) {
        try {
          // Check 'users' table
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('status', 'pending')
            .order('requested_at', { ascending: false });

          if (!error && data && isMounted) {
            setRows(
              data.map((d: any) => ({
                id: d.id,
                name: d.name || d.display_name || d.email?.split('@')[0] || 'Student',
                email: d.email,
                role: d.role,
                status: d.status,
                requestedAt: d.requested_at || d.created_at,
                reviewedAt: d.reviewed_at,
                reviewedBy: d.reviewed_by,
              }))
            );
            return;
          }

          // Fallback to 'profiles' table if schema uses profiles
          const { data: profData, error: profError } = await supabase
            .from('profiles')
            .select('*')
            .eq('status', 'pending');

          if (!profError && profData && isMounted) {
            setRows(
              profData.map((d: any) => ({
                id: d.id,
                name: d.name || d.display_name || d.email?.split('@')[0] || 'Student',
                email: d.email,
                role: d.role,
                status: d.status,
                requestedAt: d.requested_at || d.created_at,
                reviewedAt: d.reviewed_at,
                reviewedBy: d.reviewed_by,
              }))
            );
            return;
          }
        } catch (err) {
          console.warn('AdminPanel: Error querying remote requests:', err);
        }
      }

      // Check localStorage for simulated/local student sign-ups
      try {
        const localRows: UserDoc[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('nh_profile_')) {
            try {
              const doc = JSON.parse(localStorage.getItem(key) || '{}');
              if (doc.status === 'pending') {
                localRows.push(doc);
              }
            } catch {
              // ignore
            }
          }
        }
        if (isMounted) {
          setRows(localRows);
        }
      } catch {
        // ignore
      }
    };

    fetchPending();

    // Setup Supabase Realtime channel: chain .on() listeners BEFORE calling .subscribe()
    let channel: any = null;
    if (isSupabaseConfigured) {
      try {
        channel = supabase
          .channel('admin-users-pending')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'users' },
            () => {
              fetchPending();
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'profiles' },
            () => {
              fetchPending();
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
              console.warn('Realtime channel error on admin-users-pending');
            }
          });
      } catch (err) {
        console.warn('AdminPanel: Realtime subscription failed:', err);
      }
    }

    const interval = setInterval(fetchPending, 4000);
    const onRequestsUpdated = () => fetchPending();
    window.addEventListener('nh:requests-updated', onRequestsUpdated);

    // Clean removal of channel to avoid duplicate subscriptions
    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('nh:requests-updated', onRequestsUpdated);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          console.warn('AdminPanel: Error removing realtime channel:', err);
        }
      }
    };
  }, []);

  return rows;
}

// ---------------------------------------------------------------------------
// Trigger Component
// ---------------------------------------------------------------------------
function TriggerContent() {
  const rows = useRequests();
  return (
    <button
      className="pill pill-sm"
      onClick={() => window.dispatchEvent(new Event('nh:toggle-requests'))}
    >
      Access Requests {rows.length > 0 && <span className="badge">{rows.length}</span>}
    </button>
  );
}

function Trigger() {
  return (
    <AdminErrorBoundary>
      <TriggerContent />
    </AdminErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Drawer Component
// ---------------------------------------------------------------------------
function formatRequestedDate(ts?: any): string {
  if (!ts) return 'just now';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 'just now' : d.toLocaleDateString();
  } catch {
    return 'just now';
  }
}

function DrawerContent() {
  const { user } = useAuth();
  const rows = useRequests();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = () => setOpen((o) => !o);
    window.addEventListener('nh:toggle-requests', t);
    return () => window.removeEventListener('nh:toggle-requests', t);
  }, []);

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    if (isSupabaseConfigured) {
      try {
        const payload = {
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id || user?.uid || 'admin',
        };
        const { error: userErr } = await supabase
          .from('users')
          .update(payload)
          .eq('id', id);

        if (userErr) {
          // Try profiles
          await supabase
            .from('profiles')
            .update(payload)
            .eq('id', id);
        }
      } catch (err) {
        console.warn('Error updating user status:', err);
      }
    }

    // Update local storage and broadcast to open client tabs
    try {
      const localKey = `nh_profile_${id}`;
      const existing = localStorage.getItem(localKey);
      if (existing) {
        const doc = JSON.parse(existing);
        doc.status = status;
        doc.reviewedAt = Date.now();
        localStorage.setItem(localKey, JSON.stringify(doc));
      }

      const bc = new BroadcastChannel('nh_auth_gate_channel');
      bc.postMessage({ userId: id, status });
      bc.close();
    } catch {
      // ignore
    }

    // Force re-dispatch so lists update locally
    window.dispatchEvent(new Event('nh:requests-updated'));
  };

  return (
    <aside className={`req-drawer glass-card ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <header>
        <h2>Access Requests</h2>
        <button className="pill pill-sm pill-ghost" onClick={() => setOpen(false)}>
          Close
        </button>
      </header>
      {rows.length === 0 && <p className="nh-dim">No pending requests.</p>}
      <ul>
        {rows.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <div className="nh-dim">{r.email}</div>
              <div className="nh-dim">
                Requested {formatRequestedDate(r.requestedAt)}
              </div>
            </div>
            <div className="req-actions">
              <button
                className="pill pill-sm pill-ok"
                onClick={() => r.id && decide(r.id, 'approved')}
              >
                Accept
              </button>
              <button
                className="pill pill-sm pill-no"
                onClick={() => r.id && decide(r.id, 'rejected')}
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Drawer() {
  return (
    <AdminErrorBoundary>
      <DrawerContent />
    </AdminErrorBoundary>
  );
}

// ---------------------------------------------------------------------------
// Upload Component
// ---------------------------------------------------------------------------
function UploadContent() {
  return (
    <section className="glass-card dash-panel" style={{ marginTop: 20 }}>
      <h2>Upload Notes</h2>
      <ExistingUploader
        onSuccess={() => {
          window.dispatchEvent(new Event('nh:notes-updated'));
        }}
      />
    </section>
  );
}

function Upload() {
  return (
    <AdminErrorBoundary>
      <UploadContent />
    </AdminErrorBoundary>
  );
}

export default { Trigger, Drawer, Upload, ErrorBoundary: AdminErrorBoundary };
