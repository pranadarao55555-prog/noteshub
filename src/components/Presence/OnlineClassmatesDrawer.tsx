import React, { useEffect, useState, useMemo, useRef } from 'react';
import { X, Users, BookOpen, Clock } from 'lucide-react';
import { usePresence } from '../../context/PresenceContext';
import { useAuth } from '../../context/AuthContext';
import { 
  fetchPendingRequests, 
  subscribeToPendingRequests, 
  approveAccessRequest, 
  rejectAccessRequest 
} from '../../services/accessRequestService';
import type { PresenceUser, AccessRequest } from '../../types';

function formatActiveDuration(since?: string | number): string {
  if (!since) return 'Just joined';
  const start = typeof since === 'string' ? new Date(since).getTime() : since;
  const diff = Date.now() - start;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Active just now';
  if (minutes === 1) return 'Active for 1 min';
  if (minutes < 60) return `Active for ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `Active for ${hours}h ${remMinutes}m`;
}

interface ClassmateCardProps {
  user: PresenceUser;
  index: number;
}

const ClassmateCard = React.memo<ClassmateCardProps>(({ user, index }) => {
  const staggerClass = `stagger-${(index % 8) + 1}`;
  const activeSince = user.onlineSince || user.joinedAt;
  const noteTitle = user.currentNoteTitle && user.currentNoteTitle !== 'Browsing' 
    ? user.currentNoteTitle 
    : null;

  return (
    <div
      className={`p-3 rounded-2xl border transition-all animate-nh-card ${staggerClass} bg-slate-800/60 border-slate-700/60 hover:bg-slate-800/90 hover:border-slate-600/80`}
    >
      <div className="flex items-start gap-3">
        {/* Peer Avatar with Green Online Beacon */}
        <div className="relative shrink-0">
          <img
            src={
              user.photoURL ||
              `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                user.displayName || user.email
              )}`
            }
            alt={user.displayName}
            className="w-10 h-10 rounded-full border border-slate-700 object-cover bg-slate-800"
          />
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
        </div>

        {/* Peer Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="text-xs sm:text-sm font-semibold text-slate-100 truncate">
              {user.displayName}
            </span>
            <div className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0 font-mono">
              <Clock className="w-3 h-3" />
              <span className="whitespace-nowrap">{formatActiveDuration(activeSince)}</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 truncate">
            {user.email}
          </div>

          {/* Active Note or Browsing Pill */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] sm:text-xs text-indigo-300 bg-indigo-950/60 px-2.5 py-1.5 rounded-xl border border-indigo-900/60 min-w-0">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">
              {noteTitle ? `Reading: ${noteTitle}` : 'Browsing library'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

ClassmateCard.displayName = 'ClassmateCard';

export const OnlineClassmatesDrawer: React.FC = () => {
  const { 
    onlineUsers, 
    peerCount,
    isPresenceDrawerOpen, 
    setPresenceDrawerOpen, 
    isAdminStealth 
  } = usePresence();
  const { currentUser } = useAuth();
  const isAdmin = Boolean(currentUser?.isAdmin);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const [showAccessRequests, setShowAccessRequests] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<AccessRequest[]>([]);

  // Only admins fetch or subscribe to access requests
  useEffect(() => {
    if (!isAdmin) {
      setPendingRequests([]);
      return;
    }
    fetchPendingRequests().then(setPendingRequests);
    const unsub = subscribeToPendingRequests(setPendingRequests);
    return () => unsub();
  }, [isAdmin]);

  // Guard against non-admin leftover state
  useEffect(() => {
    if (!isAdmin && showAccessRequests) {
      setShowAccessRequests(false);
    }
  }, [isAdmin, showAccessRequests]);

  // Live timer tick every 30 seconds to update active durations
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isPresenceDrawerOpen) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [isPresenceDrawerOpen]);

  // Focus close button when drawer opens & handle Escape key
  useEffect(() => {
    if (!isPresenceDrawerOpen) return;
    const timeout = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAccessRequests) {
          setShowAccessRequests(false);
        } else {
          setPresenceDrawerOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPresenceDrawerOpen, setPresenceDrawerOpen, showAccessRequests]);

  // Filter peers list:
  // - Strict Admin Stealth: filter out ANY accounts with role === 'admin'
  // - Students see other online peers
  // - Admins see all active students
  const peerList = useMemo(() => {
    const nonAdminUsers = onlineUsers.filter((u) => u.role !== 'admin');
    const list = isAdminStealth
      ? nonAdminUsers
      : nonAdminUsers.filter((u) => u.uid !== currentUser?.uid);
    // Sort most recently joined / active at the top
    return [...list].sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
  }, [onlineUsers, isAdminStealth, currentUser?.uid]);

  if (!isPresenceDrawerOpen) return null;

  return (
    <>
      {/* Dimmed backdrop overlay */}
      <div 
        className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-40 transition-opacity animate-nh-fade"
        onClick={() => {
          setShowAccessRequests(false);
          setPresenceDrawerOpen(false);
        }}
        aria-hidden="true"
      />

      {/* Main Drawer Container */}
      <div className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] max-w-full">
        <aside 
          role="dialog"
          aria-modal="true"
          aria-label="Online Classmates Drawer"
          className="w-full sm:w-96 max-w-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-[100dvh] overscroll-contain animate-nh-drawer select-none will-change-transform"
        >
          {/* Header */}
          <div className="p-3.5 sm:p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative shrink-0">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Users className="w-5 h-5" />
                </div>
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-950 rounded-full animate-ping" />
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-950 rounded-full" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">Online Classmates</h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono shrink-0 whitespace-nowrap">
                    {peerCount} online
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  {isAdminStealth ? 'Live Student Presence • Read-only' : 'Live Peer Presence • Cohort 76'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAccessRequests(prev => !prev)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
                    showAccessRequests 
                      ? 'bg-indigo-600 text-white border-indigo-500' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  Access Requests
                  {pendingRequests.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.2 bg-amber-500 text-slate-950 font-bold rounded-full text-[10px]">
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
              )}

              <button
                ref={closeButtonRef}
                onClick={() => {
                  setShowAccessRequests(false);
                  setPresenceDrawerOpen(false);
                }}
                aria-label="Close classmates drawer"
                title="Close drawer (Esc)"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Sub-bar showing live presence status */}
          <div className="px-3.5 sm:px-4 py-2 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate">Real-time presence tracking</span>
          </div>

          {/* Classmates Scrollable List */}
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-2.5">
            {peerList.length === 0 ? (
              <div className="py-16 px-4 text-center animate-nh-fade">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 opacity-60" />
                </div>
                <h4 className="text-sm sm:text-base font-semibold text-white mb-1.5">
                  No classmates currently active in this cohort
                </h4>
                <p className="text-xs sm:text-sm text-slate-400 max-w-xs mx-auto leading-relaxed">
                  When your cohort peers join NotesHub to study notes, their real-time reading activity will appear here.
                </p>
              </div>
            ) : (
              peerList.map((user: PresenceUser, idx: number) => (
                <ClassmateCard key={user.uid} user={user} index={idx} />
              ))
            )}
          </div>
        </aside>

        {isAdmin && showAccessRequests && (
          <aside className="fixed inset-0 sm:static sm:w-80 border-l border-slate-800 bg-[#111933]/95 backdrop-blur-md p-5 flex flex-col shrink-0 animate-in fade-in duration-150 z-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white tracking-tight">Access Requests</h3>
              <button
                type="button"
                onClick={() => setShowAccessRequests(false)}
                className="text-xs px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>

            {/* Preserve the existing pending request list / empty state completely */}
            <div className="flex-1 overflow-y-auto">
              {pendingRequests.length === 0 ? (
                <p className="text-xs text-slate-400">No pending requests.</p>
              ) : (
                <div className="space-y-2.5">
                  {pendingRequests.map((req) => (
                    <div key={req.uid} className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/60 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white">{req.displayName || req.email}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">Pending</span>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate">{req.email}</span>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            const reviewerEmail = currentUser?.email || 'admin@noteshub.edu';
                            await approveAccessRequest(req, reviewerEmail);
                            setPendingRequests((prev) => prev.filter((r) => r.uid !== req.uid));
                          }}
                          className="flex-1 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const reviewerEmail = currentUser?.email || 'admin@noteshub.edu';
                            await rejectAccessRequest(req, reviewerEmail);
                            setPendingRequests((prev) => prev.filter((r) => r.uid !== req.uid));
                          }}
                          className="flex-1 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </>
  );
};
