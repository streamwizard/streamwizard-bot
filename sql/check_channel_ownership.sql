-- Helper function to get the authenticated user's twitch_user_ids
-- Returns an array of twitch_user_ids (channel_ids) that belong to the authenticated user
-- Uses auth.uid() from the JWT to look up the user's Twitch integrations
CREATE OR REPLACE FUNCTION public.get_user_twitch_ids()
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT it.twitch_user_id
    FROM public.integrations_twitch it
    WHERE it.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function to check if the authenticated user owns a specific channel
-- This is a convenience wrapper around get_user_twitch_ids()
CREATE OR REPLACE FUNCTION public.user_owns_channel(channel_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN channel_id = ANY(public.get_user_twitch_ids());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Example RLS policies for the commands table
-- You can use either approach:
-- 1. Use get_user_twitch_ids() with ANY or IN
-- 2. Use user_owns_channel() for simpler syntax

-- Enable RLS on the commands table
-- ALTER TABLE public.commands ENABLE ROW LEVEL SECURITY;

-- Approach 1: Using get_user_twitch_ids() directly
-- CREATE POLICY "Users can view their own commands"
--   ON public.commands
--   FOR SELECT
--   USING (channel_id = ANY(public.get_user_twitch_ids()));

-- Approach 2: Using the helper function (recommended for readability)
-- CREATE POLICY "Users can view their own commands"
--   ON public.commands
--   FOR SELECT
--   USING (public.user_owns_channel(channel_id));

-- Policy: Users can only insert commands for their own channels
-- CREATE POLICY "Users can insert commands for their own channels"
--   ON public.commands
--   FOR INSERT
--   WITH CHECK (public.user_owns_channel(channel_id));

-- Policy: Users can only update their own commands
-- CREATE POLICY "Users can update their own commands"
--   ON public.commands
--   FOR UPDATE
--   USING (public.user_owns_channel(channel_id))
--   WITH CHECK (public.user_owns_channel(channel_id));

-- Policy: Users can only delete their own commands
-- CREATE POLICY "Users can delete their own commands"
--   ON public.commands
--   FOR DELETE
--   USING (public.user_owns_channel(channel_id));
