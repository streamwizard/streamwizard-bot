import axios from "axios";
import type { TwitchEventSubMessage, EventSubscription, EventSubNotification, subscription_type } from "../types/twitch";
import { env } from "../lib/env.js";

export class WebSocketService {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private reconnectUrl: string | null = null;
  private keepaliveTimer: Timer | null = null;
  private keepaliveInterval: number = 10; // Default, will be updated from session
  private lastKeepaliveTime: number = Date.now();
  private missedKeepalives: number = 0;
  private readonly MAX_MISSED_KEEPALIVES = 10;

  private conduitId: string | null = null;

  constructor(private wsUrl: string = "wss://eventsub.wss.twitch.tv/ws") {
    this.conduitId = "2781ae49-eba5-4f19-a4f0-c69d0d9a75e1";
  }

  async connect(): Promise<void> {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = () => {};

      this.ws.onmessage = async (event) => {
        try {
          const message: TwitchEventSubMessage = JSON.parse(event.data as string);
          await this.handleMessage(message);
        } catch (error) {}
      };

      this.ws.onclose = (event) => this.handleClose(event);

      this.ws.onerror = (error) => {};
    } catch (error) {
      throw error;
    }
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectUrl) {
      try {
        this.ws = new WebSocket(this.reconnectUrl);
        this.setupEventHandlers();
      } catch (error) {
        console.error("❌ Reconnection failed:", error);
      }
    }
  }

  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = async (event) => {
      try {
        const message: TwitchEventSubMessage = JSON.parse(event.data as string);
        await this.handleMessage(message);
      } catch (error) {
        console.error("❌ Error parsing WebSocket message:", error);
      }
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
            console.error("❌ Failed to update conduit shards with session ID:");
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

        console.log(event);
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
    // Log the close event

    // Clear keepalive timer
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }

    // Handle specific close codes
    switch (closeCode) {
      case 4000:
        // Attempt reconnection after a delay
        setTimeout(() => this.connect(), 5000);
        break;

      case 4001:
        // Don't reconnect as this is a client error
        break;

      case 4002:
        // Attempt reconnection after a delay
        setTimeout(() => this.connect(), 5000);
        break;

      case 4003:
        // Attempt reconnection and ensure subscriptions are created
        setTimeout(async () => {
          await this.connect();
        }, 5000);
        break;

      case 4004:
        // Attempt a fresh connection
        setTimeout(() => this.connect(), 5000);
        break;

      case 4005:
        // Attempt reconnection after a delay
        setTimeout(() => this.connect(), 5000);
        break;

      case 4006:
        // Attempt reconnection after a delay
        setTimeout(() => this.connect(), 5000);
        break;

      case 4007:
        // Attempt a fresh connection
        setTimeout(() => this.connect(), 5000);
        break;

      default:
        // For normal closure (1000) or unknown codes, attempt reconnection if we have a reconnect URL
        if (this.reconnectUrl) {
          setTimeout(() => this.reconnect(), 5000);
        }
    }
  }

  // Add cleanup method to delete conduit when service is stopped
  disconnect(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
