import { TwitchApi } from "@/classes/twitchApi";
import { supabase } from "@/lib/supabase";
import type { ChannelChatMessageEvent } from "@/types/twitch-eventsub-messages";

export async function handleChatMessage(message: ChannelChatMessageEvent) {
  const twitchApi = new TwitchApi(message.broadcaster_user_id);

  // split the message into parts
  const parts = message.message.text.split(" ");

  // get the command
  const command = parts[0];

  if (!command) return;

  let returnMessage: string = "";

  if (command.startsWith("!")) {
    // check is in the database
    const { data, error } = await supabase
      .from("commands")
      .select("default_chat_commands(message)")
      .eq("enabled", true)
      .eq("channel_id", message.broadcaster_user_id)
      .single();

    if (error) {
      console.error(error);
      return;
    }

    if (data?.default_chat_commands) {
      returnMessage = data.default_chat_commands.message;
    }

    // if(data.custom_chat_commands) {
    //   returnMessage = data.custom_chat_commands.message;
    // }

    // send the message to the broadcaster chat
    if (returnMessage) {
      await twitchApi.chat.sendMessage({
        message: returnMessage,
        replyToMessageId: message.message_id,
      });
    }
  }
}
