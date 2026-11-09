import { supabase, isSupabaseConfigured } from '../config/supabase';
import type { WhitelistEntry } from '../types';

export async function checkIsWhitelisted(email: string, adminEmail: string, _uid?: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return false;

  // Admin is always authorized
  if (cleanEmail === adminEmail.trim().toLowerCase()) {
    return true;
  }

  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase
        .from('whitelist')
        .select('*')
        .eq('email', cleanEmail)
        .limit(1);
      if (data && data.length > 0) return true;
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem('noteshub_whitelist');
    if (raw) {
      const list: WhitelistEntry[] = JSON.parse(raw);
      if (list.some((w) => w.email.toLowerCase() === cleanEmail)) return true;
    }
  } catch {
    // ignore
  }

  return false;
}

export async function fetchWhitelist(): Promise<WhitelistEntry[]> {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('whitelist')
        .select('*')
        .order('added_at', { ascending: false });

      if (!error && data) {
        return data.map((d: any) => ({
          id: String(d.id),
          email: d.email,
          addedAt: d.added_at ? new Date(d.added_at).getTime() : Date.now(),
          addedBy: d.added_by,
          notes: d.notes,
        }));
      }
    } catch {
      // ignore
    }
  }

  try {
    const raw = localStorage.getItem('noteshub_whitelist');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function subscribeToWhitelist(callback: (list: WhitelistEntry[]) => void): () => void {
  fetchWhitelist().then(callback);

  if (isSupabaseConfigured) {
    const channel = supabase
      .channel('whitelist-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whitelist' },
        () => {
          fetchWhitelist().then(callback);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  return () => {};
}

export async function addWhitelistEmails(
  input: string,
  adminEmail: string
): Promise<{ added: number; invalid: string[] }> {
  const emails = input
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  if (emails.length === 0) {
    return { added: 0, invalid: ['Invalid email format'] };
  }

  if (isSupabaseConfigured) {
    try {
      const rows = emails.map((email) => ({
        email,
        added_by: adminEmail,
      }));
      await supabase.from('whitelist').upsert(rows, { onConflict: 'email' });
      return { added: emails.length, invalid: [] };
    } catch {
      // fallback to local storage
    }
  }

  const existing = await fetchWhitelist();
  const existingSet = new Set(existing.map((e) => e.email.toLowerCase()));
  const newEntries: WhitelistEntry[] = [];

  emails.forEach((email) => {
    if (!existingSet.has(email)) {
      newEntries.push({
        id: 'wl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        email,
        addedAt: Date.now(),
        addedBy: adminEmail,
      });
    }
  });

  const updated = [...newEntries, ...existing];
  localStorage.setItem('noteshub_whitelist', JSON.stringify(updated));
  return { added: newEntries.length, invalid: [] };
}

export async function removeWhitelistEmail(entry: WhitelistEntry): Promise<void> {
  if (isSupabaseConfigured) {
    try {
      await supabase.from('whitelist').delete().eq('email', entry.email);
    } catch {
      // ignore
    }
  }

  const existing = await fetchWhitelist();
  const filtered = existing.filter((e) => e.id !== entry.id && e.email !== entry.email);
  localStorage.setItem('noteshub_whitelist', JSON.stringify(filtered));
}
