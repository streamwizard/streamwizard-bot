import type { Env } from '../../utils/env.js';
import { BaseTwitchClient } from './base-client.js';

export interface Vod {
  id: string;
  stream_id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
}

export interface GetVodsOptions {
  userId?: string;
  gameId?: string;
  first?: number;
  after?: string;
  before?: string;
  language?: string;
  period?: 'all' | 'day' | 'week' | 'month';
  sort?: 'time' | 'trending' | 'views';
  type?: 'all' | 'upload' | 'archive' | 'highlight';
}

export class TwitchVodsClient extends BaseTwitchClient {
  async getVods(options: GetVodsOptions, channelId?: string): Promise<{ data: Vod[]; pagination: { cursor?: string } }> {
    const api = channelId ? this.withChannel(channelId) : this.api;
    const response = await api.get('/videos', { params: options });
    return response.data;
  }

  async getVodById(vodId: string, channelId?: string): Promise<Vod> {
    const api = channelId ? this.withChannel(channelId) : this.api;
    const response = await api.get('/videos', { params: { id: vodId } });
    return response.data.data[0];
  }

  async deleteVod(vodId: string, channelId: string): Promise<void> {
    const api = this.withChannel(channelId);
    await api.delete(`/videos?id=${vodId}`);
  }

  async updateVodInfo(vodId: string, updates: { title?: string; description?: string; tags?: string[] }, channelId: string): Promise<void> {
    const api = this.withChannel(channelId);
    await api.patch(`/videos?id=${vodId}`, updates);
  }
} 