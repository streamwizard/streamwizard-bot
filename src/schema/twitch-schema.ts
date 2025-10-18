import { z } from "zod";

// Base Schemas
const BaseUserSchema = z.object({
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
});

const BaseBroadcasterSchema = z.object({
  broadcaster_user_id: z.string(),
  broadcaster_user_login: z.string(),
  broadcaster_user_name: z.string(),
});

const BaseModeratorSchema = z.object({
  moderator_user_id: z.string(),
  moderator_user_login: z.string(),
  moderator_user_name: z.string(),
});

// Common Component Schemas
const FragmentSchema = z.object({
  type: z.enum(["text", "emote", "cheermote", "mention"]),
  text: z.string(),
  cheermote: z.nullable(
    z.object({
      // Add cheermote specific properties if needed
    })
  ),
  emote: z.nullable(
    z.object({
      // Add emote specific properties if needed
    })
  ),
  mention: z.nullable(
    z.object({
      // Add mention specific properties if needed
    })
  ),
});

const BadgeSchema = z.object({
  set_id: z.string(),
  id: z.string(),
  info: z.string(),
});

// Channel Update Schema

// Follow Schema
export const ChannelFollowSchema = z.object({
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
  ...BaseBroadcasterSchema.shape,
  followed_at: z.string().datetime(),
});

// Subscription Schemas
export const SubscriptionEventSchema = z.object({
  ...BaseUserSchema.shape,
  ...BaseBroadcasterSchema.shape,
  tier: z.string(),
  is_gift: z.boolean(),
  cumulative_months: z.number().optional(),
  streak_months: z.number().nullable().optional(),
});

// Raid Schema
export const ChannelRaidSchema = z.object({
  ...BaseUserSchema.shape,
  ...BaseBroadcasterSchema.shape,
  viewer_count: z.number(),
});

// stream online
export const StreamOnlineSchema = z.object({
  ...BaseBroadcasterSchema.shape,
  title: z.string(),
  viewer_count: z.number(),
});

// stream offline
export const StreamOfflineSchema = z.object({
  ...BaseBroadcasterSchema.shape,
});

// Chat Message Schema
export const ChatMessageSchema = z.object({
  broadcaster_user_id: z.string(),
  broadcaster_user_login: z.string(),
  broadcaster_user_name: z.string(),
  chatter_user_id: z.string(),
  chatter_user_login: z.string(),
  chatter_user_name: z.string(),
  message_id: z.string().uuid(),
  message: z.object({
    text: z.string(),
    fragments: z.array(FragmentSchema),
  }),
  color: z.string(),
  badges: z.array(BadgeSchema),
  message_type: z.enum(["text", "reply", "action"]),
  cheer: z.nullable(
    z.object({
      // Add cheer specific properties if needed
    })
  ),
  reply: z.nullable(
    z.object({
      // Add reply specific properties if needed
    })
  ),
  channel_points_custom_reward_id: z.nullable(z.string()),
  source_broadcaster_user_id: z.nullable(z.string()),
  source_broadcaster_user_login: z.nullable(z.string()),
  source_broadcaster_user_name: z.nullable(z.string()),
  source_message_id: z.nullable(z.string()),
  source_badges: z.nullable(z.array(BadgeSchema)),
});

// channel_points_custom_reward_redemption.add
export const ChannelPointsCustomRewardRedemptionAddSchema = z.object({
  id: z.string().uuid(),
  broadcaster_user_id: z.string(),
  broadcaster_user_login: z.string(),
  broadcaster_user_name: z.string(),
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
  user_input: z.string(),
  status: z.enum(["unfulfilled", "fulfilled", "canceled"]),
  reward: z.object({
    id: z.string().uuid(),
    title: z.string(),
    cost: z.number().int().positive(),
    prompt: z.string(),
  }),
  redeemed_at: z.string().datetime(),
});


export const SubscriptionGiftSchema = z.object({
  user_id: z.string().nullable(),
  user_login: z.string().nullable(),
  user_name: z.string().nullable(),
  broadcaster_user_id: z.string(),
  broadcaster_user_login: z.string(),
  broadcaster_user_name: z.string(),
  total: z.number().int(),
  tier: z.string(),
  cumulative_total: z.number().int().nullable(),
  is_anonymous: z.boolean(),
});