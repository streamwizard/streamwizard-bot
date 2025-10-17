import { WebSocketService } from "./classes/eventsub";

async function main() {
  const eventsub = new WebSocketService();
  await eventsub.connect();
}

main();

