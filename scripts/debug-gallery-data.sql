-- Debug script to check gallery data
-- Check what's in the generated_videos table
SELECT 
  id,
  user_id,
  url,
  size,
  duration,
  format,
  background_url,
  background_type,
  created_at
FROM generated_videos 
ORDER BY created_at DESC 
LIMIT 10;

-- Check what's in the backgrounds table  
SELECT 
  id,
  user_id,
  name,
  url,
  size,
  type,
  created_at
FROM backgrounds 
ORDER BY created_at DESC 
LIMIT 10;

-- Count records by user
SELECT 
  'videos' as table_name,
  user_id,
  COUNT(*) as record_count
FROM generated_videos 
GROUP BY user_id
UNION ALL
SELECT 
  'backgrounds' as table_name,
  user_id,
  COUNT(*) as record_count
FROM backgrounds 
GROUP BY user_id
ORDER BY table_name, user_id;
