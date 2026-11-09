import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./config/database.js";
import { createServer } from "node:http";
import { attachChatServer } from "./realtime/chat.js";
import dotenv from "dotenv";

dotenv.config({ override: true });


const port = Number(process.env.PORT ?? 4000);

async function startServer() {
  await connectDB();

  const httpServer = createServer(app);
  const chatIo = attachChatServer(httpServer);

  app.set("chatIo", chatIo);

  httpServer.listen(port, () => {
    console.log(`API and chat listening on port ${port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error("Failed to start API", error);
  process.exit(1);
});