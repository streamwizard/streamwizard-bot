import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "../types/supabase";
import axios from "axios";
import type { subscription_type } from "@/types/twitch";
import type { RefreshTwitchTokenResponse } from "@/types/twitch-api";

export const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

type TwitchIntegration = Database["public"]["Tables"]["integrations_twitch"]["Row"];

// get twitch integration by channel id
export async function getChannelAccessToken(channelId: string): Promise<string> {
  const { data, error } = await supabase.from("integrations_twitch").select("access_token").eq("twitch_user_id", channelId).single();

  if (error || !data.access_token) {
    if (error) {
      throw error;
    }
    if (!data.access_token) {
      throw new Error("No access token found for channel");
    }
  }

  return data.access_token;
}

export async function getChannelRefreshToken(channelId: string): Promise<string> {
  const { data, error } = await supabase.from("integrations_twitch").select("refresh_token").eq("twitch_user_id", channelId).single();
  if (error || !data.refresh_token) {
    if (error) {
      throw error;
    }
    if (!data.refresh_token) {
      throw new Error("No refresh token found for channel");
    }
  }

  return data.refresh_token;
}

export async function updateChannelAccessToken(newToken: RefreshTwitchTokenResponse, channelId: string): Promise<TwitchIntegration> {
  const { data, error } = await supabase
    .from("integrations_twitch")
    .update({
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      token_expires_at: new Date(Date.now() + newToken.expires_in * 1000).toISOString(),
    })
    .eq("twitch_user_id", channelId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

// fetch the twitch app token from supabase
export async function getTwitchAppToken(): Promise<string> {
  const { data, error } = await supabase.from("twitch_app_token").select("*").single();

  if (error) {
    throw error;
  }

  // Check if token is expired by comparing current time with updated_at + expires_in
  const updatedAtTimestamp = new Date(data.updated_at).getTime();
  const expiresInMs = data.expires_in * 1000; // Convert seconds to milliseconds
  const isExpired = Date.now() > updatedAtTimestamp + expiresInMs;

  if (isExpired) {
    // Refresh token
    const response = await axios.post("https://id.twitch.tv/oauth2/token", null, {
      params: {
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials",
      },
    });
    const { access_token, expires_in } = response.data;
    await updateTwitchAppToken(access_token, expires_in);
    return access_token;
  }

  return data.access_token;
}

// update twitch app token in supabase
export async function updateTwitchAppToken(accessToken: string, expiresIn: number): Promise<void> {
  const { data, error } = await supabase.from("twitch_app_token").update({ access_token: accessToken, expires_in: expiresIn }).single();

  if (error) {
    throw error;
  }
}
