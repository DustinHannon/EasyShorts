-- =============================================================================
-- COMPLETE DATABASE SETUP FOR VIDEO CREATOR APP
-- =============================================================================
-- This script creates the entire database schema and can be run multiple times safely
-- Combines all migrations and setup steps into one comprehensive script
-- =============================================================================

-- =============================================================================
-- 1. USER PROFILES SETUP
-- =============================================================================

-- Create user profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create profiles policies (with error handling)
DO $$ 
BEGIN
  CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Policy already exists, ignore
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Policy already exists, ignore
END $$;

-- Create function to handle new user profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user profiles
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 2. PROJECTS TABLE SETUP
-- =============================================================================

-- Create projects table
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add progress tracking columns (safe to run multiple times)
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_stage TEXT DEFAULT 'waiting',
ADD COLUMN IF NOT EXISTS progress_message TEXT DEFAULT 'Waiting to start...';

-- Update existing projects to have default progress values
UPDATE public.projects 
SET progress = 0, progress_stage = 'waiting', progress_message = 'Waiting to start...'
WHERE progress IS NULL OR progress_stage IS NULL OR progress_message IS NULL;

-- Enable RLS on projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create projects policies (with error handling)
DO $$ 
BEGIN
  CREATE POLICY "Users can view own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can create own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =============================================================================
-- 3. BACKGROUNDS TABLE SETUP
-- =============================================================================

-- Create backgrounds table
CREATE TABLE IF NOT EXISTS public.backgrounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT CHECK (type IN ('image', 'video')) NOT NULL,
  size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on backgrounds
ALTER TABLE public.backgrounds ENABLE ROW LEVEL SECURITY;

-- Create backgrounds policies (with error handling)
DO $$ 
BEGIN
  CREATE POLICY "Users can view own backgrounds" ON public.backgrounds
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can create own backgrounds" ON public.backgrounds
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can delete own backgrounds" ON public.backgrounds
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =============================================================================
-- 4. GENERATED VIDEOS TABLE SETUP (WITH BACKGROUND SUPPORT)
-- =============================================================================

-- Create generated_videos table
CREATE TABLE IF NOT EXISTS public.generated_videos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID, -- Made nullable to allow videos without projects
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  format TEXT NOT NULL,
  quality TEXT NOT NULL,
  duration INTEGER,
  size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add background support columns to generated_videos table
ALTER TABLE public.generated_videos 
ADD COLUMN IF NOT EXISTS background_url TEXT,
ADD COLUMN IF NOT EXISTS background_type TEXT;

-- Add index for better query performance on background_url
CREATE INDEX IF NOT EXISTS idx_generated_videos_background_url ON public.generated_videos(background_url);

-- Fix project-video relationship to prevent cascade deletion
-- Remove existing CASCADE constraint if it exists
ALTER TABLE public.generated_videos 
DROP CONSTRAINT IF EXISTS generated_videos_project_id_fkey;

-- Add foreign key WITHOUT CASCADE deletion (allows videos to exist after project deletion)
ALTER TABLE public.generated_videos 
ADD CONSTRAINT generated_videos_project_id_fkey 
FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- Ensure project_id can be nullable
ALTER TABLE public.generated_videos 
ALTER COLUMN project_id DROP NOT NULL;

-- Update any existing videos to ensure they have proper user_id references
UPDATE public.generated_videos 
SET user_id = p.user_id 
FROM public.projects p 
WHERE generated_videos.project_id = p.id 
AND generated_videos.user_id IS NULL;

-- Update existing videos to have background info from their projects (if project still exists)
UPDATE public.generated_videos 
SET 
  background_url = projects.background_url,
  background_type = projects.background_type
FROM public.projects 
WHERE generated_videos.project_id = projects.id 
  AND generated_videos.background_url IS NULL;

-- Enable RLS on generated_videos
ALTER TABLE public.generated_videos ENABLE ROW LEVEL SECURITY;

-- Create generated_videos policies (with error handling)
DO $$ 
BEGIN
  CREATE POLICY "Users can view own videos" ON public.generated_videos
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can create own videos" ON public.generated_videos
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$ 
BEGIN
  CREATE POLICY "Users can delete own videos" ON public.generated_videos
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- =============================================================================
-- 5. ADDITIONAL INDEXES FOR PERFORMANCE
-- =============================================================================

-- Create additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_backgrounds_user_id ON public.backgrounds(user_id);
CREATE INDEX IF NOT EXISTS idx_backgrounds_type ON public.backgrounds(type);
CREATE INDEX IF NOT EXISTS idx_generated_videos_user_id ON public.generated_videos(user_id);
CREATE INDEX IF NOT EXISTS idx_generated_videos_project_id ON public.generated_videos(project_id);

-- =============================================================================
-- SETUP COMPLETE
-- =============================================================================

-- This consolidated script includes:
-- ✅ User profiles with RLS policies and triggers
-- ✅ Projects table with progress tracking columns
-- ✅ Backgrounds table with RLS policies  
-- ✅ Generated videos table with background support columns and fixed project relationship
-- ✅ All policies and constraints with proper error handling
-- ✅ Performance indexes for all major query patterns
-- ✅ Safe to run multiple times (fully idempotent)
-- ✅ Combines all previous migration scripts into one comprehensive setup
