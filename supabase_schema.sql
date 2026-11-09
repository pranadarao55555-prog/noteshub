-- ==============================================================================
-- NotesHub: Supabase PostgreSQL Schema, Storage Bucket & Row Level Security (RLS)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Table: users (Step 1 Data Model)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);

-- 3. Create Table: subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subjects_name ON public.subjects(name);

-- 4. Create Table: notes
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  unit TEXT NOT NULL DEFAULT 'Unit 1',
  semester TEXT DEFAULT 'Sem 6',
  description TEXT,
  file_url TEXT NOT NULL,
  file_size TEXT DEFAULT '0 Bytes',
  file_type TEXT DEFAULT 'application/pdf',
  is_lab_record BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_subject_id ON public.notes(subject_id);
CREATE INDEX IF NOT EXISTS idx_notes_unit ON public.notes(unit);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at DESC);

-- 5. Helper Functions for RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() ->> 'email' IN ('pranadarao55555@.com', 'pranadarao55555@gmail.com', 'pranada@example.com')
    OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin' AND status = 'approved'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND status = 'approved'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- RLS Policies for 'users'
-- ------------------------------------------------------------------------------

-- Allow user to insert their own profile on registration with default 'student' & 'pending'
DROP POLICY IF EXISTS "Allow self insert pending student" ON public.users;
CREATE POLICY "Allow self insert pending student"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND role = 'student'
  AND status = 'pending'
);

-- Allow user to view their own profile, or admin to view all
DROP POLICY IF EXISTS "Allow user self read or admin read on users" ON public.users;
CREATE POLICY "Allow user self read or admin read on users"
ON public.users
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR public.is_admin()
);

-- Allow admin only to update user status/role (e.g. approve/reject)
DROP POLICY IF EXISTS "Allow admin update on users" ON public.users;
CREATE POLICY "Allow admin update on users"
ON public.users
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS Policies for 'subjects'
-- ------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Allow approved read access on subjects" ON public.subjects;
CREATE POLICY "Allow approved read access on subjects"
ON public.subjects
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "Allow admin modify on subjects" ON public.subjects;
CREATE POLICY "Allow admin modify on subjects"
ON public.subjects
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- RLS Policies for 'notes'
-- ------------------------------------------------------------------------------

-- Allow approved users (admin or approved student) to read notes
DROP POLICY IF EXISTS "Allow approved users read on notes" ON public.notes;
CREATE POLICY "Allow approved users read on notes"
ON public.notes
FOR SELECT
TO authenticated
USING (public.is_approved());

-- Allow Admin only to insert, update, delete notes
DROP POLICY IF EXISTS "Allow admin insert on notes" ON public.notes;
CREATE POLICY "Allow admin insert on notes"
ON public.notes
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow admin update on notes" ON public.notes;
CREATE POLICY "Allow admin update on notes"
ON public.notes
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Allow admin delete on notes" ON public.notes;
CREATE POLICY "Allow admin delete on notes"
ON public.notes
FOR DELETE
TO authenticated
USING (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. Supabase Storage: 'notes' Bucket Setup & Policies
-- ------------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('notes', 'notes', true, 524288000, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "Allow approved download on notes bucket" ON storage.objects;
CREATE POLICY "Allow approved download on notes bucket"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'notes' AND public.is_approved());

DROP POLICY IF EXISTS "Allow admin upload to notes bucket" ON storage.objects;
CREATE POLICY "Allow admin upload to notes bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'notes' AND public.is_admin());

DROP POLICY IF EXISTS "Allow admin delete from notes bucket" ON storage.objects;
CREATE POLICY "Allow admin delete from notes bucket"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'notes' AND public.is_admin());

-- ------------------------------------------------------------------------------
-- 8. Auth Trigger for Automatic User Creation (Google OAuth & Email Sign-up)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, name, email, role, status, requested_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    CASE 
      WHEN LOWER(NEW.email) IN ('pranadarao55555@gmail.com') THEN 'admin'
      ELSE 'student'
    END,
    CASE 
      WHEN LOWER(NEW.email) IN ('pranadarao55555@gmail.com') THEN 'approved'
      ELSE 'pending'
    END,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 9. Initial Admin Seeding (Pranada Rao)
-- ------------------------------------------------------------------------------
-- To seed the admin profile for Pranada Rao:
-- INSERT INTO public.users (id, name, email, role, status)
-- VALUES ('<YOUR_ADMIN_AUTH_UID>', 'Pranada Rao', 'pranada@example.com', 'admin', 'approved')
-- ON CONFLICT (id) DO UPDATE SET role = 'admin', status = 'approved';
