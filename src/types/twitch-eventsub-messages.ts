export interface ChannelChatMessageEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: {
    text: string;
    fragments: [
      {
        type: string;
        text: string;
        cheermote: string | null;
        emote: string | null;
        mention: string | null;
      }
    ];
  };
  color: string;
  badges: [
    {
      set_id: string;
      id: string;
      info: string;
    },
    {
      set_id: string;
      id: string;
      info: string;
    },
    {
      set_id: string;
      id: string;
      info: string;
    }
  ];
  message_type: string;
  cheer: string | null;
  reply: string | null;
  channel_points_custom_reward_id: string | null;
  source_broadcaster_user_id: null;
  source_broadcaster_user_login: string | null;
  source_broadcaster_user_name: string | null;
  source_message_id: string | null;
  source_badges: string | null;
}
