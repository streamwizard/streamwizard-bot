import { getTwitchIntegration } from "../../lib/supabase.js";
import { TwitchApiBaseClient } from "./base-client.js";

export type TransportMethod = "webhook" | "websocket" | "conduit";

export interface Transport {
  method: TransportMethod;
  callback?: string;
  secret?: string;
  session_id?: string;
  conduit_id?: string;
  shard_id?: string;
}

export interface EventSubSubscription {
  id: string;
  status:
    | "enabled"
    | "webhook_callback_verification_pending"
    | "webhook_callback_verification_failed"
    | "notification_failures_exceeded"
    | "authorization_revoked"
    | "user_removed"
    | "version_removed";
  type: string;
  version: string;
  condition: Record<string, unknown>;
  created_at: string;
  transport: Transport;
  cost: number;
}

export interface CreateEventSubSubscriptionOptions {
  type: string;
  version: string;
  condition: Record<string, unknown>;
  transport: Transport;
}

export interface ConduitShard {
  id: string;
  status: "enabled" | "disabled";
  transport: Transport;
}

export interface CreateConduitOptions {
  shard_count: number;
}

export interface Conduit {
  id: string;
  shard_count: number;
  shards: ConduitShard[];
}

interface RequiredScopes {
  [key: string]: string[];
}

export class TwitchEventSubClient extends TwitchApiBaseClient {
  private readonly requiredScopes: RequiredScopes = {
    "channel.chat.message": ["moderator:read:chat_messages", "moderator:read:chatters"],
    "channel.follow": ["moderator:read:followers"],
    "channel.subscribe": ["channel:read:subscriptions"],
    "channel.cheer": ["bits:read"],
    "channel.raid": ["channel:read:raids"],
    "stream.online": ["channel:read:stream_key"],
    "stream.offline": ["channel:read:stream_key"],
    "channel.moderation.user.ban": ["channel:moderate", "moderator:manage:banned_users"],
  };

  private async verifySubscriptionScopes(type: string, channelId: string): Promise<boolean> {
    try {
      const integration = await getTwitchIntegration(channelId);
      if (!integration) {
        console.error(`❌ No Twitch integration found for channel ${channelId}`);
        return false;
      }

      const scopes = integration.scopes || [];
      const requiredScopes = this.requiredScopes[type] || [];

      if (requiredScopes.length === 0) {
        console.warn(`⚠️ No required scopes defined for subscription type ${type}`);
        return true;
      }

      const missingScopes = requiredScopes.filter((scope) => !scopes.includes(scope));

      if (missingScopes.length > 0) {
        console.error(`❌ Missing required scopes for ${type}:`, missingScopes);
        console.log("Required scopes:", requiredScopes);
        console.log("Current scopes:", scopes);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`❌ Failed to verify scopes for ${type}:`, error);
      return false;
    }
  }

  async createSubscription(options: CreateEventSubSubscriptionOptions, channelId: string): Promise<{ data: EventSubSubscription[] }> {
    // Verify scopes before creating subscription
    // if (!await this.verifySubscriptionScopes(options.type, channelId)) {
    //   throw new Error(`Missing required scopes for subscription type ${options.type}`);
    // }

    const response = await this.appApi().post("/eventsub/subscriptions", options);
    return response.data;
  }

  async deleteSubscription(subscriptionId: string, channelId: string): Promise<void> {
    await this.appApi().delete(`/eventsub/subscriptions?id=${subscriptionId}`);
  }

  async getSubscriptions(channelId: string): Promise<{ data: EventSubSubscription[] }> {
    const response = await this.appApi().get("/eventsub/subscriptions");
    return response.data;
  }

  // Conduit-specific methods
  async createConduit(options: CreateConduitOptions): Promise<{ data: Conduit[] }> {
    const response = await this.appApi().post("/eventsub/conduits", options);
    return response.data;
  }

  async getConduits(): Promise<{ data: Conduit[] }> {
    const response = await this.appApi().get("/eventsub/conduits");
    return response.data;
  }

  async getConduitShards(conduitId: string, ): Promise<{ data: ConduitShard[] }> {
    const response = await this.appApi().get("/eventsub/conduits/shards", {
      params: {
        conduit_id: conduitId,
      },
    });
    return response.data;
  }

  async getConduitWithShards(conduitId: string): Promise<Conduit | null> {
    try {
      const [conduitResponse, shardsResponse] = await Promise.all([this.getConduits(), this.getConduitShards(conduitId)]);

      const conduit = conduitResponse.data.find((c) => c.id === conduitId);
      if (!conduit) {
        return null;
      }

      return {
        ...conduit,
        shards: shardsResponse.data,
      };
    } catch (error) {
      console.error(`❌ Failed to get conduit ${conduitId} with shards:`, error);
      return null;
    }
  }

  async updateConduitShards(conduitId: string, shardCount: number): Promise<{ data: Conduit[] }> {
    const response = await this.appApi().patch(`/eventsub/conduits/${conduitId}/shards`, {
      shard_count: shardCount,
    });
    return response.data;
  }

  async updateAllShardTransports(conduitId: string, transport: Transport): Promise<void> {
    const conduit = await this.getConduits();
    const conduitData = conduit.data.find((c) => c.id === conduitId);

    if (!conduitData) {
      throw new Error(`Conduit ${conduitId} not found`);
    }

    // Update each shard's transport
    await this.updateShardTransport(conduitId, "0", transport);
  }

  async updateShardTransport(conduitId: string, shardId: string, transport: Transport): Promise<{ data: Conduit[] }> {

    const response = await this.appApi().patch("/eventsub/conduits/shards", {
      conduit_id: conduitId,
      shards: [
        {
          id: shardId,
          transport: transport,
        },
      ],
    });
    return response.data;
  }

  async deleteConduit(conduitId: string, ): Promise<void> {
    await this.appApi().delete(`/eventsub/conduits/${conduitId}`);
  }

  // Helper method to create a subscription with conduit transport
  async createConduitSubscription(
    conduitId: string,
    type: string,
    version: string,
    condition: Record<string, unknown>,
    channelId: string
  ): Promise<EventSubSubscription> {
    const subscription = await this.createSubscription(
      {
        type,
        version,
        condition,
        transport: {
          method: "conduit",
          conduit_id: conduitId,
        },
      },
      channelId
    );

    return subscription.data[0];
  }

  // Helper method to create multiple subscriptions across conduit shards
  async createShardedSubscriptions(
    conduitId: string,
    type: string,
    version: string,
    conditions: Record<string, unknown>[],
    channelId: string
  ): Promise<EventSubSubscription[]> {
    const conduit = await this.getConduits();
    const conduitData = conduit.data.find((c) => c.id === conduitId);

    if (!conduitData) {
      throw new Error(`Conduit ${conduitId} not found`);
    }

    if (conditions.length > conduitData.shard_count) {
      throw new Error(`Too many conditions (${conditions.length}) for conduit with ${conduitData.shard_count} shards`);
    }

    const subscriptions = await Promise.all(
      conditions.map((condition) => this.createConduitSubscription(conduitId, type, version, condition, channelId))
    );

    return subscriptions;
  }

  async updateShardStatus(conduitId: string, shardId: string, status: "enabled" | "disabled"): Promise<{ data: ConduitShard[] }> {
    console.log("Updating shard status:");

    const response = await this.appApi().patch("/eventsub/conduits/shards", {
      conduit_id: conduitId,
      shard_id: shardId,
      status,
    });
    console.log(response.data);
    return response.data;
  }

  async enableAllShards(conduitId: string): Promise<void> {
    const conduit = await this.getConduitWithShards(conduitId);
    if (!conduit || !conduit.shards) {
      throw new Error(`No shards found for conduit ${conduitId}`);
    }

    // Enable each shard
    await Promise.all(conduit.shards.map((shard) => this.updateShardStatus(conduitId, shard.id, "enabled")));
  }
}
