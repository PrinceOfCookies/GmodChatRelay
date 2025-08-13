require("dotenv").config();

const { TOKEN, WS, PORT, RELAY_CHANNEL, SERVER_IP, MY_IP } = process.env;
const { Client, GatewayIntentBits, MessageFlags } = require("discord.js");
const WebSocket = require("ws");

let wsClient;
let relayChannel;
let lastMessageTime = 0;
let lastGot = 0;
const TEXT_LIMIT = 1028;
const RECONNECT_DELAY = 3000;

// Util
function hexToRGB(hex) {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return [r, g, b].join(", ");
}

function wsSend(ws, type, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN)
    throw new Error("WebSocket isn't open");
  ws.send(JSON.stringify({ type, payload }));
}

// Discord Bot
const client = new Client({
  intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: ["CHANNEL", "GUILD_MEMBER", "MESSAGE", "USER"],
  allowedMentions: {
    parse: ["users", "roles"],
    repliedUser: true,
  },
});

client.once("ready", () => {
  console.log("Bot is online!");

  relayChannel = client.channels.cache.get(RELAY_CHANNEL);
  if (!relayChannel || !relayChannel.isTextBased()) {
    console.log("Invalid relay channel.");
    process.exit(1);
  }

  connectWebsocket();
  startWebsocketServer();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || message.channel.type === ChannelType.DM) return;
  if (message.channel.id !== RELAY_CHANNEL) return;
  if (!message.content || message.content.startsWith("(h) ")) return;

  if (message.content.length > TEXT_LIMIT) {
    await message.reply({
      content: `Your message exceeds the text limit (${message.content.length}/${TEXT_LIMIT} characters).`,
      flags: MessageFlags.Ephemeral,
    });
    return message.delete().catch(console.error);
  }

  const curTime = Date.now();
  if (now < lastGot + 1000) {
    await message.reply({
      content: "Please wait a moment before sending another message.",
      flags: MessageFlags.Ephemeral,
    });
    return message.delete().catch(console.error);
  }

  lastGot = curTime;

  const highestRole = message.member.roles.highest;
  const rgbColor = hexToRGB(highestRole.color ? highestRole.color : "#DEADED");
  const name = message.author.globalName || message.author.username;

  let text = message.content;

  for (const [_, user] of message.mentions.users) {
    const globalName = user.globalName || user.username;
    const mentionRegex = new RegExp(`<@!?${user.id}>`, "g");
    text = text.replace(mentionRegex, globalName);
  }

  const payloadToSend = {
    text,
    time: now / 1000,
    rgbColor,
    name,
  };

  try {
    wsSend(wsClient, "sendMessage2", payloadToSend);
    if (relayChannel.topic === "Server status: Online") {
      await msg.react("👍").catch(console.error);
    } else {
      await msg.react("👎").catch(console.error);
    }
  } catch (err) {
    console.error("Error sending message to WebSocket:", err);
    await msg.reply({
      content: "Failed to send message to the server.",
      flags: MessageFlags.Ephemeral,
    });
    return msg.delete().catch(console.error);
  }
});

// WS Client
function connectWebsocket() {
  wsClient = new WebSocket(`ws://${WS}:${PORT}`);

  wsClient.on("open", () => {
    console.log("✅ WebSocket connection established.");
  });

  wsClient.on("message", (data) => {
    try {
      const { type, payload } = JSON.parse(data);

      switch (type) {
        case "newMessage": {
          console.log(`Received Message: ${payload}`);

          const [text, time, name] = payload.split(" ");

          if (!text || !time || !name) return;

          if (text.length > TEXT_LIMIT) {
            console.warn(`Message exceeds limit: ${text.length}/${TEXT_LIMIT}`);
            return;
          }

          // Prevents duplicate messages coming through
          if (time == lastMessageTime && time != 0) return;
          if (time != 0) lastMessageTime = time;

          let format =
            time != 0 ? `**${name}**: ${text}` : `**${name}** ${text}`;

          relayChannel
            .send({
              content: format,
              allowedMentions: {
                parse: ["users", "roles"],
                repliedUser: true,
              },
            })
            .catch((err) => {
              console.error("Failed to send message to channel:", err);
            });
          break;
        }

        case "ping": {
          const pingStatus = payload || "Unknown";
          const displayStatus =
            pingStatus === "Offline" ? "Offline/Unreachable" : pingStatus;
          const desiredTopic = "Server Status: " + displayStatus;
          if (relayChannel.topic !== desiredTopic) {
            relayChannel.setTopic(desiredTopic).catch(console.error);
          }
          break;
        }

        default:
          console.log("Unknown message type:", type);
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  });

  wsClient.on("close", () => {
    console.warn("⚠️ WebSocket disconnected. Reconnecting...");
    setTimeout(connectWebsocket, RECONNECT_DELAY);
  });

  wsClient.on("error", (err) => {
    console.error("❌ WebSocket error:", err.message);
    wsClient.close();
  });
}

// WS Server
function startWebsocketServer() {
  const wsServer = new WebSocket.Server({ port: PORT }, () => {
    console.log(`WebSocket server running on ws://${WS}:${PORT}`);
  });

  const allowedIPs = [WS, SERVER_IP, MY_IP];
  function broadcast(data) {
    const payload = JSON.stringify(data);
    wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
  }

  wsServer.on("connection", (wes, req) => {
    const clientIP = (
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      ""
    )
      .split(",")[0]
      .replace("::ffff:", "")
      .trim();

    if (!allowedIPs.includes(clientIP)) {
      console.warn(`❌ Unauthorized IP: ${clientIP}`);
      wes.close();
      return;
    }

    console.log(`🔌 Connection from ${clientIP}`);
    if (clientIP === SERVER_IP) broadcast({ type: "ping", payload: "Online" });

    wes.on("message", (msg) => {
      try {
        const { type, payload } = JSON.parse(msg);
        switch (type) {
          case "sendMessage2":
            broadcast({ type: "newMessage2", payload });
            break;
          case "sendMessage":
            console.log(payload);
            broadcast({ type: "newMessage", payload });
            break;
          default:
            wes.send(JSON.stringify({ error: "Unknown message type" }));
        }
      } catch (err) {
        console.error("❗ Error processing message:", err);
        wes.send(JSON.stringify({ error: "Invalid message format" }));
      }
    });

    wes.on("close", () => {
      console.log(`🔌 Connection closed with ${clientIP}`);
      if (clientIP === SERVER_IP)
        broadcast({ type: "ping", payload: "Offline" });
    });
  });
}

client.login(TOKEN).catch((err) => {
  console.error("❌ Failed to login:", err);
});