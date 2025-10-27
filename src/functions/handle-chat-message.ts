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
    // Get all enabled commands for this channel, fetching both custom and default command details
    const { data, error } = await supabase
      .from("commands")
      .select(`
        custom_commands(id, message, action, command),
        default_chat_commands(id, message, action, command)
      `)
      .eq("enabled", true)
      .eq("channel_id", message.broadcaster_user_id);

    if (error) {
      console.error(error);
      return;
    }

    if (!data || data.length === 0) {
      console.log("No commands found for this channel");
      return;
    }

    // Find the command that matches (check both custom and default)
    const matchingCommand = data.find((cmd) => {
      return (cmd.custom_commands && cmd.custom_commands.command === command) ||
             (cmd.default_chat_commands && cmd.default_chat_commands.command === command);
    });

    if (!matchingCommand) {
      return;
    }

    // Use the matching command data (check which one actually matches)
    let commandData = null;
    if (matchingCommand.custom_commands && matchingCommand.custom_commands.command === command) {
      commandData = matchingCommand.custom_commands;
    } else if (matchingCommand.default_chat_commands && matchingCommand.default_chat_commands.command === command) {
      commandData = matchingCommand.default_chat_commands;
    }

    if (!commandData) {
      return;
    }

    returnMessage = commandData.message || "";
    action = commandData.action || "";

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
    [commandData.id]: message,
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
