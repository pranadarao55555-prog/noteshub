import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldCheck, 
  Check, 
  X, 
  ArrowLeft, 
  Search, 
  Clock, 
  Users, 
  LogOut,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../config/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { UserDoc } from '../auth/AuthProvider';
import './admin.css';
import '../entry/entry.css';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [requests, setRequests] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // Show transient alert message
  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  };

  // Fetch all user access requests (both from Supabase users/profiles and local fallback)
  const fetchAllRequests = useCallback(async () => {
    setLoading(true);
    const map = new Map<string, UserDoc>();

    // 1. Fetch from Supabase
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('requested_at', { ascending: false });

        if (!error && data) {
          data.forEach((d: any) => {
            const key = d.id || d.email;
            map.set(key, {
              id: d.id,
              name: d.name || d.display_name || d.email?.split('@')[0] || 'Student',
              email: d.email,
              role: d.role || 'student',
              status: d.status || 'pending',
              requestedAt: d.requested_at || d.created_at,
              reviewedAt: d.reviewed_at,
              reviewedBy: d.reviewed_by,
            });
          });
        }
      } catch (err) {
        console.warn('AdminDashboard: Error reading users from Supabase:', err);
      }
    }

    // 2. Merge local storage simulated requests
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('nh_profile_')) {
          try {
            const doc: UserDoc = JSON.parse(localStorage.getItem(key) || '{}');
            if (doc.email && doc.status) {
              const itemKey = doc.id || doc.email;
              if (!map.has(itemKey)) {
                map.set(itemKey, doc);
              }
            }
          } catch {
            // ignore
          }
        }
      }

      // Also check noteshub_access_requests map
      const rawReqs = localStorage.getItem('noteshub_access_requests');
      if (rawReqs) {
        const rawMap = JSON.parse(rawReqs);
        Object.values(rawMap).forEach((r: any) => {
          const itemKey = r.uid || r.id || r.email;
          if (!map.has(itemKey)) {
            map.set(itemKey, {
              id: r.uid || r.id,
              name: r.displayName || r.name || r.email?.split('@')[0],
              email: r.email,
              role: 'student',
              status: r.status || 'pending',
              requestedAt: r.requestedAt,
              reviewedAt: r.reviewedAt,
              reviewedBy: r.reviewedBy,
            });
          }
        });
      }
    } catch {
      // ignore
    }

    // Sort by requested date descending
    const sorted = Array.from(map.values()).sort((a, b) => {
      const ta = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const tb = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return tb - ta;
    });

    setRequests(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAllRequests();

    // Setup Supabase Realtime for instant updates
    let channel: any = null;
    if (isSupabaseConfigured) {
      try {
        channel = supabase
          .channel('admin-dashboard-users-sync')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'users' },
            () => {
              fetchAllRequests();
            }
          )
          .subscribe();
      } catch (err) {
        console.warn('Realtime channel subscribe failed:', err);
      }
    }

    const onRequestsUpdated = () => fetchAllRequests();
    window.addEventListener('nh:requests-updated', onRequestsUpdated);

    return () => {
      window.removeEventListener('nh:requests-updated', onRequestsUpdated);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore
        }
      }
    };
  }, [fetchAllRequests]);

  // Update status action (Approve / Reject)
  const handleUpdateStatus = async (userId: string | undefined, newStatus: 'approved' | 'rejected') => {
    if (!userId) return;
    setBusyId(userId);

    const reviewerEmail = user?.email || 'admin@noteshub.com';

    // 1. Optimistic UI update
    setRequests((prev) =>
      prev.map((r) =>
        r.id === userId
          ? { ...r, status: newStatus, reviewedAt: new Date().toISOString(), reviewedBy: reviewerEmail }
          : r
      )
    );

    // 2. Persist to Supabase
    if (isSupabaseConfigured) {
      try {
        const payload = {
          status: newStatus,
          reviewed_at: new Date().toISOString(),
          reviewed_by: reviewerEmail,
        };

        const { error: updateErr } = await supabase
          .from('users')
          .update(payload)
          .eq('id', userId);

        if (updateErr) {
          // Try fallback by email
          const target = requests.find((r) => r.id === userId);
          if (target?.email) {
            await supabase.from('users').update(payload).eq('email', target.email);
          }
        }
      } catch (err: any) {
        console.warn('AdminDashboard: error updating Supabase:', err);
        notify(err.message || 'Failed to sync with database', 'error');
      }
    }

    // 3. Persist to local storage
    try {
      const localKey = `nh_profile_${userId}`;
      const saved = localStorage.getItem(localKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        parsed.status = newStatus;
        parsed.reviewedAt = Date.now();
        parsed.reviewedBy = reviewerEmail;
        localStorage.setItem(localKey, JSON.stringify(parsed));
      }

      const raw = localStorage.getItem('noteshub_access_requests');
      if (raw) {
        const map = JSON.parse(raw);
        if (map[userId]) {
          map[userId].status = newStatus;
          map[userId].reviewedAt = Date.now();
          map[userId].reviewedBy = reviewerEmail;
          localStorage.setItem('noteshub_access_requests', JSON.stringify(map));
        }
      }

      // Broadcast immediately to student client tabs so they unlock live
      const bc = new BroadcastChannel('nh_auth_gate_channel');
      bc.postMessage({ userId, status: newStatus });
      bc.close();
    } catch {
      // ignore
    }

    window.dispatchEvent(new Event('nh:requests-updated'));
    notify(`User access status marked as "${newStatus}".`, 'success');
    setBusyId(null);
  };

  // Format requested date cleanly
  const formatDate = (val?: string | number) => {
    if (!val) return 'Just now';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return 'Recently';
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recently';
    }
  };

  // Filtered requests based on search query & status chip
  const filtered = useMemo(() => {
    return requests.filter((r) => {
      const matchesSearch =
        search.trim() === '' ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        r.email.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        filterStatus === 'all' || r.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [requests, search, filterStatus]);

  // Status Counts
  const counts = useMemo(() => {
    return {
      total: requests.length,
      pending: requests.filter((r) => r.status === 'pending').length,
      approved: requests.filter((r) => r.status === 'approved').length,
      rejected: requests.filter((r) => r.status === 'rejected').length,
    };
  }, [requests]);

  return (
    <div className="nh-dash dash min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Header */}
      <header className="dash-top border-b border-slate-800/80 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="nh-logo">Notes Hub<span className="nh-dot" /></h1>
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>Admin Console</span>
          </span>
        </div>

        <nav className="dash-nav flex items-center gap-2.5" aria-label="Admin Navigation">
          <Link
            to="/dashboard"
            className="pill pill-sm pill-ghost inline-flex items-center gap-1.5 btn-spring text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Notes</span>
          </Link>
          <button
            type="button"
            className="pill pill-sm pill-ghost inline-flex items-center gap-1.5 btn-spring text-rose-300 hover:text-rose-200"
            onClick={logout}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
              <Users className="w-7 h-7 text-indigo-400" />
              <span>Access Requests &amp; Approvals</span>
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Review, approve, or reject student registration requests for Notes Hub.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchAllRequests}
            disabled={loading}
            className="pill pill-sm pill-ghost self-start sm:self-auto inline-flex items-center gap-1.5 btn-spring border border-slate-800"
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Transient Notification */}
        {notification && (
          <div
            className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center gap-2.5 animate-nh-card ${
              notification.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
            role="status"
          >
            {notification.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            )}
            <span>{notification.msg}</span>
          </div>
        )}

        {/* Filter Pills & Metric Chips */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`pill pill-sm ${filterStatus === 'all' ? 'is-active bg-white/20' : 'pill-ghost'} btn-spring`}
            >
              All Requests ({counts.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('pending')}
              className={`pill pill-sm ${filterStatus === 'pending' ? 'is-active bg-amber-500/20 text-amber-300 border-amber-500/40' : 'pill-ghost'} btn-spring`}
            >
              Pending ({counts.pending})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('approved')}
              className={`pill pill-sm ${filterStatus === 'approved' ? 'is-active bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'pill-ghost'} btn-spring`}
            >
              Approved ({counts.approved})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('rejected')}
              className={`pill pill-sm ${filterStatus === 'rejected' ? 'is-active bg-rose-500/20 text-rose-300 border-rose-500/40' : 'pill-ghost'} btn-spring`}
            >
              Rejected ({counts.rejected})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              className="field text-xs sm:text-sm py-2 pl-9 pr-4"
              placeholder="Filter by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Access Requests Table */}
        <div className="glass-card rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4 sm:px-6">Name</th>
                  <th className="py-3.5 px-4 sm:px-6">Email</th>
                  <th className="py-3.5 px-4 sm:px-6">Requested Date</th>
                  <th className="py-3.5 px-4 sm:px-6">Current Status</th>
                  <th className="py-3.5 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {loading && requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                      <span>Loading access requests...</span>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="font-semibold text-slate-300">No requests match this view</p>
                      <span className="text-xs text-slate-500">
                        {search ? 'Try clearing your search query.' : 'New student requests will appear here.'}
                      </span>
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const isBusy = busyId === r.id;
                    const initial = (r.name || r.email || 'S').charAt(0).toUpperCase();

                    return (
                      <tr 
                        key={r.id || r.email}
                        className="hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Name */}
                        <td className="py-3.5 px-4 sm:px-6 font-medium text-white">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm">
                              {initial}
                            </div>
                            <span className="truncate max-w-[160px] sm:max-w-none">{r.name}</span>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="py-3.5 px-4 sm:px-6 text-slate-300 font-mono text-xs">
                          {r.email}
                        </td>

                        {/* Requested Date */}
                        <td className="py-3.5 px-4 sm:px-6 text-slate-400 text-xs whitespace-nowrap">
                          {formatDate(r.requestedAt)}
                        </td>

                        {/* Current Status */}
                        <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                          {r.status === 'approved' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Approved
                            </span>
                          )}
                          {r.status === 'pending' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                              Pending
                            </span>
                          )}
                          {r.status === 'rejected' && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              Rejected
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {/* Approve Button (Green) */}
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(r.id, 'approved')}
                              disabled={isBusy || r.status === 'approved'}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/25 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Approve access immediately"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>

                            {/* Reject Button (Red) */}
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(r.id, 'rejected')}
                              disabled={isBusy || r.status === 'rejected'}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/25 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title="Reject access"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
