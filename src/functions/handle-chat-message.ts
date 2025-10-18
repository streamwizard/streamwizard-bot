import { TwitchApi } from "@/classes/twitchApi";
import { supabase } from "@/lib/supabase";
import type { ChannelChatMessageEvent } from "@/types/twitch-eventsub-messages";
import { handleAction, type ActionEvent } from "./handle-action";
import { resolveVariables } from "./resolveVariables";

export async function handleChatMessage(message: ChannelChatMessageEvent) {
  console.log(`[${message.broadcaster_user_name}] ${message.chatter_user_name}: ${message.message.text}`);

  const twitchApi = new TwitchApi(message.broadcaster_user_id);

  // split the message into parts
  const parts = message.message.text.split(" ");

  // get the command
  const command = parts[0];

  if (!command) return;

  let returnMessage: string = "";
  let action: string | null = null;
  if (command.startsWith("!")) {
    // check is in the database
    const { data, error } = await supabase
      .from("commands")
      .select("default_chat_commands!inner(id, message, action)")
      .eq("enabled", true)
      .eq("channel_id", message.broadcaster_user_id)
      .eq("default_chat_commands.command", command)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return;
      }
      console.error(error);
      return;
    }



    if (data?.default_chat_commands) {
      returnMessage = data.default_chat_commands.message;
      action = data.default_chat_commands.action || "";
    }

    // if(action) {
    //   const Results: Record<string, any> = {
    //     ["trigger"]: message,
    //   };

    //   const actionEvent: ActionEvent = {
    //     action: action,
    //     module: "twitch",
    //     context: {},
    //     currentActionContext: {},
    //     results: Results,
    //   };

    //   const actionResult = await handleAction(actionEvent, twitchApi, message.broadcaster_user_id);
    // }

   const historyResults: Record<string, any> = {
    [data?.default_chat_commands?.id]: message,
   };
    const resolvedMessage = await resolveVariables(returnMessage, { twitchApi }, historyResults);

    console.log("🔑 Resolved message:", resolvedMessage);

    // send the message to the broadcaster chat
    if (returnMessage) {
      await twitchApi.chat.sendMessage({
        message: resolvedMessage,
        replyToMessageId: message.message_id,
      });
    }
  }
}
