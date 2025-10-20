-- Test queries to verify the RLS function works correctly
-- Your credentials:
-- user_id: 8099140f-66cd-4b51-ab21-e3b60a6982b8
-- channel_id: 122604941

-- 1. First, verify the relationship exists in integrations_twitch
SELECT 
  user_id,
  twitch_user_id,
  twitch_username
FROM public.integrations_twitch
WHERE user_id = '8099140f-66cd-4b51-ab21-e3b60a6982b8';
-- Expected result: Should show twitch_user_id = '122604941'

-- 2. Test the get_user_twitch_ids() function
-- (This simulates what happens when you're authenticated)
-- Note: This won't work in SQL editor without being authenticated,
-- but shows the logic
SELECT auth.get_user_twitch_ids();
-- Expected result when authenticated: {'122604941'}

-- 3. Test the user_owns_channel() function
SELECT auth.user_owns_channel('122604941');
-- Expected result when authenticated: true

SELECT auth.user_owns_channel('999999999');
-- Expected result when authenticated: false (not your channel)

-- 4. Test what commands you would see with RLS enabled
-- This simulates the RLS policy
SELECT *
FROM public.commands
WHERE channel_id = ANY(
  ARRAY(
    SELECT it.twitch_user_id
    FROM public.integrations_twitch it
    WHERE it.user_id = '8099140f-66cd-4b51-ab21-e3b60a6982b8'
  )
);
-- Expected result: Only commands where channel_id = '122604941'

-- 5. Show all commands and which ones you own
SELECT 
  c.*,
  CASE 
    WHEN c.channel_id = '122604941' THEN 'YOUR COMMAND ✓'
    ELSE 'NOT YOUR COMMAND ✗'
  END as ownership
FROM public.commands c;
-- This shows all commands and marks which ones are yours





