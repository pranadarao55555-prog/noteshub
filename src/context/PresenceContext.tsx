import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../config/supabase';
import { useAuth, isEmailAdmin } from './AuthContext';
import type { PresenceUser } from '../types';

interface PresenceContextType {
  onlineUsers: PresenceUser[];
  onlineCount: number;
  peerCount: number;
  isPresenceDrawerOpen: boolean;
  setPresenceDrawerOpen: (open: boolean) => void;
  updateCurrentNoteViewing: (noteId?: string, noteTitle?: string) => void;
  isAdminStealth: boolean;
}

const PresenceContext = createContext<PresenceContextType | undefined>(undefined);

export const PresenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, user, access, adminEmail } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [isPresenceDrawerOpen, setPresenceDrawerOpen] = useState(false);
  const channelRef = useRef<any>(null);
  const currentPresenceRef = useRef<PresenceUser | null>(null);

  // Read-only Admin Status Detection
  const isAdminStealth = useMemo(() => {
    return Boolean(
      access === 'admin' ||
      currentUser?.isAdmin ||
      currentUser?.role === 'admin' ||
      isEmailAdmin(currentUser?.email) ||
      isEmailAdmin(user?.email) ||
      (adminEmail && (
        currentUser?.email?.toLowerCase() === adminEmail.toLowerCase() ||
        user?.email?.toLowerCase() === adminEmail.toLowerCase()
      ))
    );
  }, [access, currentUser, user, adminEmail]);

  // Second layer filter: verify if any given presence entry belongs to an admin
  const isEntryAdmin = useCallback((p: PresenceUser): boolean => {
    if (!p) return false;
    if (p.role === 'admin') return true;
    if (p.email && isEmailAdmin(p.email)) return true;
    if (adminEmail && p.email && p.email.toLowerCase() === adminEmail.toLowerCase()) return true;
    return false;
  }, [adminEmail]);

  useEffect(() => {
    if (!currentUser) {
      setOnlineUsers([]);
      if (channelRef.current) {
        channelRef.current.untrack().catch(() => {});
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const nowIso = new Date().toISOString();
    const selfPresence: PresenceUser = {
      uid: currentUser.uid,
      displayName: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Student'),
      email: currentUser.email,
      photoURL: currentUser.photoURL || '',
      joinedAt: Date.now(),
      lastActive: Date.now(),
      onlineSince: nowIso,
      viewingSince: nowIso,
      currentNoteTitle: 'Browsing',
      currentNoteId: '',
      role: isAdminStealth ? 'admin' : 'student',
    };
    currentPresenceRef.current = selfPresence;

    if (isSupabaseConfigured) {
      const channel = supabase.channel('online-cohort', {
        config: {
          presence: {
            key: currentUser.uid,
          },
        },
      });

      channelRef.current = channel;

      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const usersMap = new Map<string, PresenceUser>();

          Object.values(state).forEach((presences: any) => {
            if (Array.isArray(presences)) {
              presences.forEach((p: PresenceUser) => {
                if (p && p.uid) {
                  // Second layer of defense: filter out any admin entries so students NEVER see them
                  if (isEntryAdmin(p)) return;

                  // Deduplicate multiple tabs/devices of the same user by uid
                  const existing = usersMap.get(p.uid);
                  if (!existing || (p.lastActive || p.joinedAt || 0) > (existing.lastActive || existing.joinedAt || 0)) {
                    usersMap.set(p.uid, p);
                  }
                }
              });
            }
          });

          const list = Array.from(usersMap.values());
          // Sort by most recently active / joined at top
          list.sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));
          setOnlineUsers(list);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            // CRITICAL ADMIN STEALTH MODE:
            // If the user is an admin, NEVER call channel.track(...)!
            // Admin connects in listen-only mode and is completely invisible.
            if (!isAdminStealth) {
              await channel.track(selfPresence);
            }
          }
        });

      return () => {
        if (channelRef.current) {
          channelRef.current.untrack().catch(() => {});
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    } else {
      // Local fallback for offline mode
      if (!isAdminStealth) {
        setOnlineUsers([selfPresence]);
      } else {
        setOnlineUsers([]);
      }
    }
  }, [currentUser, isAdminStealth, isEntryAdmin]);

  const lastTrackTimeRef = useRef<number>(0);
  const lastTrackedNoteIdRef = useRef<string>('');

  const updateCurrentNoteViewing = useCallback((noteId?: string, noteTitle?: string) => {
    if (!currentUser) return;

    const now = Date.now();
    const cleanNoteId = noteId || '';
    const cleanTitle = noteTitle || 'Browsing';

    // Throttle: if same note tracked within 10 seconds, skip redundant network broadcast
    if (cleanNoteId === lastTrackedNoteIdRef.current && (now - lastTrackTimeRef.current) < 10000) {
      return;
    }

    lastTrackTimeRef.current = now;
    lastTrackedNoteIdRef.current = cleanNoteId;

    const nowIso = new Date().toISOString();
    if (currentPresenceRef.current) {
      currentPresenceRef.current.currentNoteId = cleanNoteId;
      currentPresenceRef.current.currentNoteTitle = cleanTitle;
      currentPresenceRef.current.viewingSince = nowIso;
      currentPresenceRef.current.lastActive = now;
    }

    // Only broadcast if user is NOT an admin
    if (!isAdminStealth && channelRef.current && isSupabaseConfigured) {
      channelRef.current.track(currentPresenceRef.current).catch(() => {});
    } else if (!isAdminStealth) {
      setOnlineUsers((prev) =>
        prev.map((u) =>
          u.uid === currentUser.uid
            ? {
                ...u,
                currentNoteId: cleanNoteId,
                currentNoteTitle: cleanTitle,
                viewingSince: nowIso,
                lastActive: now,
              }
            : u
        )
      );
    }
  }, [currentUser, isAdminStealth]);

  // Compute peer count: peers online excluding current user (if student) and excluding admin
  const peerCount = useMemo(() => {
    if (isAdminStealth) {
      // Admin sees total active students count
      return onlineUsers.length;
    }
    // Student sees count of other peers online
    return onlineUsers.filter((u) => u.uid !== currentUser?.uid).length;
  }, [onlineUsers, isAdminStealth, currentUser?.uid]);

  return (
    <PresenceContext.Provider
      value={{
        onlineUsers,
        onlineCount: peerCount,
        peerCount,
        isPresenceDrawerOpen,
        setPresenceDrawerOpen,
        updateCurrentNoteViewing,
        isAdminStealth,
      }}
    >
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresence = () => {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresence must be used within a PresenceProvider');
  }
  return context;
};
