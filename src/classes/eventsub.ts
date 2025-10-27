import axios from "axios";
import type { TwitchEventSubMessage, EventSubscription, EventSubNotification, subscription_type } from "../types/twitch";
import { env } from "../lib/env.js";
import { handleChatMessage } from "@/functions/handle-chat-message.js";
import type { ChannelChatMessageEvent } from "@/types/twitch-eventsub-messages.js";

export class WebSocketService {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectUrl: string | null = null;
  private keepaliveTimer: Timer | null = null;
  private keepaliveInterval: number = 10; // Default, will be updated from session
  private lastKeepaliveTime: number = Date.now();
  private missedKeepalives: number = 0;
  private readonly MAX_MISSED_KEEPALIVES = 10;

  // Connection state management
  private connectionState: "disconnected" | "connecting" | "connected" | "reconnecting" = "disconnected";
  private reconnectAttempts: number = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly BASE_RECONNECT_DELAY = 1000; // Start at 1 second
  private readonly MAX_RECONNECT_DELAY = 30000; // Cap at 30 seconds

  private conduitId: string | null = null;

  constructor(private wsUrl: string = "wss://eventsub.wss.twitch.tv/ws") {
    this.conduitId = "ddd2762d-c642-4ecf-905d-b60bf67f0e80";
  }

  async connect(): Promise<void> {
    if (this.connectionState === "connecting" || this.connectionState === "connected") {
      console.log("⏳ Already connected or connecting");
      return;
    }

    try {
      this.connectionState = "connecting";
      console.log("🔌 Connecting to Twitch EventSub WebSocket...");

      this.cleanup(); // Ensure clean state
      this.ws = new WebSocket(this.wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error("❌ Connection failed:", error);
      this.connectionState = "disconnected";
      throw error;
    }
  }

  // Improved reconnect with exponential backoff
  private getReconnectDelay(): number {
    const delay = Math.min(this.BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts), this.MAX_RECONNECT_DELAY);
    // Add jitter to prevent thundering herd
    return delay + Math.random() * 1000;
  }

  private async reconnect(): Promise<void> {
    if (this.connectionState === "connecting" || this.connectionState === "reconnecting") {
      console.log("⏳ Already attempting to connect, skipping duplicate reconnect");
      return;
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error("❌ Max reconnection attempts reached. Giving up.");
      this.connectionState = "disconnected";
      return;
    }

    this.connectionState = "reconnecting";
    this.reconnectAttempts++;

    if (this.reconnectUrl) {
      try {
        console.log(`🔄 Reconnecting (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}) using reconnect URL...`);
        this.cleanup(); // Clean up old connection
        this.ws = new WebSocket(this.reconnectUrl);
        this.setupEventHandlers();
        this.connectionState = "connected";
        this.reconnectAttempts = 0; // Reset on success
      } catch (error) {
        console.error("❌ Reconnection failed:", error);
        this.scheduleReconnect();
      }
    } else {
      // Fall back to fresh connection
      await this.connect();
    }
  }

  private scheduleReconnect(): void {
    const delay = this.getReconnectDelay();
    console.log(`⏰ Scheduling reconnect in ${delay}ms...`);
    setTimeout(() => this.reconnect(), delay);
  }

  private cleanup(): void {
    // Clear keepalive timer
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }

    // Close old WebSocket if exists
    if (this.ws) {
      // Remove event listeners to prevent duplicate handling
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log("✅ WebSocket connected");
      this.connectionState = "connected";
      this.reconnectAttempts = 0; // Reset on successful connection
    };

    this.ws.onmessage = async (event) => {
      try {
        const message: TwitchEventSubMessage = JSON.parse(event.data as string);
        await this.handleMessage(message);
      } catch (error) {
        console.error("❌ Error parsing WebSocket message:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
    };

    this.ws.onclose = (event) => this.handleClose(event);
  }

  private startKeepaliveTimer(timeoutSeconds: number): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
    }

    this.keepaliveInterval = timeoutSeconds;
    // Set timeout to check for missed keepalives
    // Add some buffer for network delays
    const checkInterval = (timeoutSeconds + 2) * 1000;

    this.keepaliveTimer = setTimeout(() => {
      this.checkKeepalive();
    }, checkInterval);
  }

  private async checkKeepalive(): Promise<void> {
    const now = Date.now();
    const timeSinceLastKeepalive = now - this.lastKeepaliveTime;
    const expectedInterval = this.keepaliveInterval * 1000;

    // If we haven't received a keepalive in the expected time (plus buffer)
    if (timeSinceLastKeepalive > expectedInterval + 2000) {
      this.missedKeepalives++;

      if (this.missedKeepalives >= this.MAX_MISSED_KEEPALIVES) {
        this.ws?.close();
        return;
      }
    }

    // Continue checking
    const nextCheckIn = this.keepaliveInterval * 1000;
    this.keepaliveTimer = setTimeout(() => {
      this.checkKeepalive();
    }, nextCheckIn);
  }

  private async handleMessage(message: TwitchEventSubMessage): Promise<void> {
    const { metadata, payload } = message;
    // Determine shard_id if available (from payload.subscription?.transport?.shard_id)
    let shard_id: string | undefined = undefined;

    switch (metadata.message_type) {
      case "session_welcome":
        this.sessionId = payload.session?.id || null;
        this.reconnectUrl = payload.session?.reconnect_url || null;
        this.lastKeepaliveTime = Date.now(); // Initialize keepalive timestamp

        if (payload.session?.keepalive_timeout_seconds) {
          this.startKeepaliveTimer(payload.session.keepalive_timeout_seconds);
        }

        // Update conduit shards with the new session ID
        if (this.conduitId && this.sessionId) {
          try {
            console.log("Updating conduit shards with session ID:", this.sessionId);
            await axios.patch(
              `https://api.twitch.tv/helix/eventsub/conduits/shards`,
              {
                conduit_id: this.conduitId,
                shards: [
                  {
                    id: 0,
                    transport: {
                      method: "websocket",
                      session_id: this.sessionId,
                    },
                  },
                ],
              },
              {
                headers: {
                  "Client-ID": env.TWITCH_CLIENT_ID,
                  Authorization: `Bearer ${env.TWITCH_APP_TOKEN}`,
                },
              }
            );
            // Log the event
          } catch (error) {
            console.error("❌ Failed to update conduit shards:", error);
          }
        }

        break;

      case "session_keepalive":
        this.lastKeepaliveTime = Date.now();
        this.missedKeepalives = 0; // Reset missed counter

        // Update keepalive interval if provided
        if (payload.session?.keepalive_timeout_seconds) {
          this.keepaliveInterval = payload.session.keepalive_timeout_seconds;
        }
        break;

      case "notification":
        const event = {
          metadata,
          payload,
        } as EventSubNotification;

        if (event.payload.subscription.type === "channel.chat.message") {
          await handleChatMessage(event.payload.event as ChannelChatMessageEvent);
        }
        break;

      case "session_reconnect":
        console.log("🔄 Session reconnect requested");
        this.reconnectUrl = payload.session?.reconnect_url || null;
        if (this.reconnectUrl) {
          // Give a small delay to ensure any pending messages are processed
          setTimeout(() => {
            this.ws?.close();
          }, 5000);
        } else {
          console.error("❌ Reconnect URL not provided in session_reconnect message");
          // log the event
        }
        break;

      case "revocation":
        // Handle different revocation reasons
        switch (payload.subscription?.status) {
          case "user_removed":
            // log the event

            break;
          case "authorization_revoked":
            // log the event

            break;
          case "version_removed":
            // log the event

            break;
          default:
        }
        break;

      default:
    }
  }

  private getRevocationReason(status: string | undefined): string {
    switch (status) {
      case "user_removed":
        return "The user no longer exists";
      case "authorization_revoked":
        return "The authorization token was revoked";
      case "version_removed":
        return "The subscription type/version is no longer supported";
      default:
        return "Unknown reason";
    }
  }

  private getCloseReason(code: number): string {
    switch (code) {
      case 4000:
        return "Internal server error";
      case 4001:
        return "Client sent inbound traffic";
      case 4002:
        return "Client failed ping-pong";
      case 4003:
        return "Connection unused";
      case 4004:
        return "Reconnect grace time expired";
      case 4005:
        return "Network timeout";
      case 4006:
        return "Network error";
      case 4007:
        return "Invalid reconnect URL";
      case 1000:
        return "Normal closure";
      default:
        return "Unknown close code";
    }
  }

  private async handleClose(event: CloseEvent): Promise<void> {
    const closeCode = event.code;
    const closeReason = this.getCloseReason(closeCode);
    console.log(`🔌 WebSocket closed: ${closeCode} - ${closeReason}`);

    this.connectionState = "disconnected";
    this.cleanup();

    // Handle specific close codes
    switch (closeCode) {
      case 4001: // Client sent inbound traffic - don't reconnect
        console.error("❌ Client error - not reconnecting");
        return;

      case 4003: // Connection unused
        console.warn("⚠️ Connection unused - reconnecting with fresh connection");
        this.reconnectUrl = null; // Force fresh connection
        this.scheduleReconnect();
        break;

      case 4007: // Invalid reconnect URL
        console.warn("⚠️ Invalid reconnect URL - will use fresh connection");
        this.reconnectUrl = null; // Clear invalid URL
        this.scheduleReconnect();
        break;

      case 1000: // Normal closure
        console.log("✅ Normal closure");
        if (this.reconnectUrl) {
          this.scheduleReconnect();
        }
        break;

      default:
        // For all other errors, use reconnect URL if available
        if (this.reconnectUrl) {
          console.log("🔄 Using reconnect URL for recovery");
          this.scheduleReconnect();
        } else {
          console.log("🔄 No reconnect URL, will create fresh connection");
          this.scheduleReconnect();
        }
    }
  }

  // Add graceful shutdown method
  async disconnect(): Promise<void> {
    console.log("🛑 Disconnecting from Twitch EventSub...");
    this.connectionState = "disconnected";
    this.reconnectAttempts = this.MAX_RECONNECT_ATTEMPTS; // Prevent reconnection
    this.cleanup();
  }
}
