import { supabase, isSupabaseConfigured } from '../config/supabase';
import { addWhitelistEmails } from './whitelistService';
import type { AccessRequest } from '../types';

export async function getAccessRequest(uid: string): Promise<AccessRequest | null> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .eq('uid', uid)
        .maybeSingle();

      if (!error && data) {
        return {
          id: String(data.id || data.uid),
          uid: data.uid,
          displayName: data.display_name || '',
          email: data.email || '',
          photoURL: data.photo_url,
          status: data.status || 'pending',
          requestedAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
          reviewedAt: data.reviewed_at ? new Date(data.reviewed_at).getTime() : undefined,
          reviewedBy: data.reviewed_by,
        };
      }
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem('noteshub_access_requests');
    if (raw) {
      const map: Record<string, AccessRequest> = JSON.parse(raw);
      return map[uid] || null;
    }
  } catch {
    // ignore
  }

  return null;
}

export async function createAccessRequest(user: {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
}): Promise<AccessRequest> {
  const req: AccessRequest = {
    id: user.uid,
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    status: 'pending',
    requestedAt: Date.now(),
  };

  if (isSupabaseConfigured) {
    try {
      await supabase.from('access_requests').upsert([
        {
          uid: user.uid,
          display_name: user.displayName,
          email: user.email,
          photo_url: user.photoURL,
          status: 'pending',
        },
      ]);
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem('noteshub_access_requests');
    const map: Record<string, AccessRequest> = raw ? JSON.parse(raw) : {};
    map[user.uid] = req;
    localStorage.setItem('noteshub_access_requests', JSON.stringify(map));
  } catch {
    // ignore
  }

  return req;
}

export async function fetchPendingRequests(): Promise<AccessRequest[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('access_requests')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((d: any) => ({
          id: String(d.id || d.uid),
          uid: d.uid,
          displayName: d.display_name || '',
          email: d.email || '',
          photoURL: d.photo_url,
          status: d.status,
          requestedAt: d.created_at ? new Date(d.created_at).getTime() : Date.now(),
        }));
      }
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem('noteshub_access_requests');
    if (raw) {
      const map: Record<string, AccessRequest> = JSON.parse(raw);
      return Object.values(map).filter((r) => r.status === 'pending');
    }
  } catch {
    // ignore
  }

  return [];
}

export function subscribeToPendingRequests(callback: (requests: AccessRequest[]) => void): () => void {
  fetchPendingRequests().then(callback);

  if (isSupabaseConfigured) {
    const channel = supabase
      .channel('access-requests-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'access_requests' },
        () => {
          fetchPendingRequests().then(callback);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  return () => {};
}

export async function approveAccessRequest(req: AccessRequest, adminEmail: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('access_requests')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminEmail,
        })
        .eq('uid', req.uid);
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem('noteshub_access_requests');
    if (raw) {
      const map: Record<string, AccessRequest> = JSON.parse(raw);
      if (map[req.uid]) {
        map[req.uid].status = 'approved';
        map[req.uid].reviewedAt = Date.now();
        map[req.uid].reviewedBy = adminEmail;
        localStorage.setItem('noteshub_access_requests', JSON.stringify(map));
      }
    }
  } catch {
    // ignore
  }

  await addWhitelistEmails(req.email, adminEmail);
}

export async function rejectAccessRequest(req: AccessRequest, adminEmail: string): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase
        .from('access_requests')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminEmail,
        })
        .eq('uid', req.uid);
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem('noteshub_access_requests');
    if (raw) {
      const map: Record<string, AccessRequest> = JSON.parse(raw);
      if (map[req.uid]) {
        map[req.uid].status = 'rejected';
        map[req.uid].reviewedAt = Date.now();
        map[req.uid].reviewedBy = adminEmail;
        localStorage.setItem('noteshub_access_requests', JSON.stringify(map));
      }
    }
  } catch {
    // ignore
  }
}
