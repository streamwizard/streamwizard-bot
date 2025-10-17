import { TwitchApi } from "@/classes/twitchApi";
import type { ChannelChatMessageEvent } from "@/types/twitch-eventsub-messages";

export async function handleChatMessage(message: ChannelChatMessageEvent) {
  const twitchApi = new TwitchApi(message.broadcaster_user_id);
  const chat = twitchApi.chat;
  
  if(message.message.text.toLowerCase().includes("!test")) {
    await chat.sendMessage({
      message: "test message",
      replyToMessageId: message.message_id,
    });
  }  

  return message;
}