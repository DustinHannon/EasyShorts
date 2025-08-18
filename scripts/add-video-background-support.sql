-- Add background information to generated_videos table
-- This allows videos to remember their background even if the project is deleted

-- Add background columns to generated_videos table
ALTER TABLE generated_videos 
ADD COLUMN IF NOT EXISTS background_url TEXT,
ADD COLUMN IF NOT EXISTS background_type TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_generated_videos_background_url ON generated_videos(background_url);

-- Update existing videos to have background info from their projects (if project still exists)
UPDATE generated_videos 
SET 
  background_url = projects.background_url,
  background_type = projects.background_type
FROM projects 
WHERE generated_videos.project_id = projects.id 
  AND generated_videos.background_url IS NULL;
