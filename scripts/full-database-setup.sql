-- =============================================================================
-- COMPLETE DATABASE SETUP FOR EASYSHORTS
-- =============================================================================
-- Idempotent: safe to run multiple times. Mirrors the live schema including the
-- 2026-06-28 hardening migrations (RLS perf, handle_new_user search_path, AI
-- usage quota). RLS is the security boundary — every table is user-scoped.
-- =============================================================================

-- =============================================================================
-- 1. PROFILES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id);

-- New-user profile trigger. SECURITY DEFINER with a pinned empty search_path
-- (all refs schema-qualified); EXECUTE revoked from public/anon/authenticated —
-- it only ever runs via the trigger, which fires as the table owner.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 2. PROJECTS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  script TEXT,
  voice_settings JSONB DEFAULT '{}',
  background_url TEXT,
  background_type TEXT CHECK (background_type IN ('image', 'video', 'color')),
  video_settings JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  progress_stage TEXT DEFAULT 'waiting',
  progress_message TEXT DEFAULT 'Waiting to start...',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS progress_stage TEXT DEFAULT 'waiting';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS progress_message TEXT DEFAULT 'Waiting to start...';

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY "Users can view own projects" ON public.projects
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can create own projects" ON public.projects
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

-- =============================================================================
-- 3. BACKGROUNDS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.backgrounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT CHECK (type IN ('image', 'video')) NOT NULL,
  size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.backgrounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own backgrounds" ON public.backgrounds;
DROP POLICY IF EXISTS "Users can create own backgrounds" ON public.backgrounds;
DROP POLICY IF EXISTS "Users can delete own backgrounds" ON public.backgrounds;

CREATE POLICY "Users can view own backgrounds" ON public.backgrounds
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can create own backgrounds" ON public.backgrounds
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own backgrounds" ON public.backgrounds
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_backgrounds_user_id ON public.backgrounds(user_id);

-- =============================================================================
-- 4. GENERATED VIDEOS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.generated_videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  format TEXT NOT NULL,
  quality TEXT NOT NULL,
  duration INTEGER,
  size INTEGER,
  background_url TEXT,
  background_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.generated_videos ADD COLUMN IF NOT EXISTS background_url TEXT;
ALTER TABLE public.generated_videos ADD COLUMN IF NOT EXISTS background_type TEXT;

ALTER TABLE public.generated_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own videos" ON public.generated_videos;
DROP POLICY IF EXISTS "Users can create own videos" ON public.generated_videos;
DROP POLICY IF EXISTS "Users can update own videos" ON public.generated_videos;
DROP POLICY IF EXISTS "Users can delete own videos" ON public.generated_videos;

CREATE POLICY "Users can view own videos" ON public.generated_videos
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
-- INSERT validates both ownership AND that any attached project belongs to the caller.
CREATE POLICY "Users can create own videos" ON public.generated_videos
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      project_id IS NULL
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = (select auth.uid()))
    )
  );
CREATE POLICY "Users can update own videos" ON public.generated_videos
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own videos" ON public.generated_videos
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- Backs the ON DELETE SET NULL scan on the project FK.
CREATE INDEX IF NOT EXISTS idx_generated_videos_user_id ON public.generated_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_videos_project_id ON public.generated_videos(project_id);

-- =============================================================================
-- 5. AI USAGE QUOTA (per-user daily limit on paid Azure endpoints)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ai usage" ON public.ai_usage;
CREATE POLICY "Users can view own ai usage" ON public.ai_usage
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
-- Mutated only by the SECURITY DEFINER function below (no direct INSERT/UPDATE policy).

CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_kind text, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.ai_usage (user_id, day, kind, count)
  VALUES (v_uid, (now() AT TIME ZONE 'utc')::date, p_kind, 1)
  ON CONFLICT (user_id, day, kind)
  DO UPDATE SET count = public.ai_usage.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text, integer) TO authenticated;

-- =============================================================================
-- NOTE: also enable "Leaked password protection" in the Supabase dashboard
-- (Auth > Policies/Passwords) — it is an Auth config toggle, not SQL.
-- =============================================================================
