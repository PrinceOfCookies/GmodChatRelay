require("dotenv").config();

const { TOKEN, WS, PORT, RELAY_CHANNEL, SERVER_IP, MY_IP } = process.env;
const { Client, GatewayIntentBits, MessageFlags } = require("discord.js");
const WebSocket = require("ws");

const client = new Client({
  intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: ["CHANNEL", "GUILD_MEMBER", "MESSAGE", "USER"],
  allowedMentions: {
    parse: ["users", "roles"],
    repliedUser: true,
  },
});

client
  .login(TOKEN)
  .then(() => {
    console.log("Bot is online!");

    const ws = new WebSocket(`ws://${WS}:${PORT}`);
    let lastMessageTime = 0;

    ws.on("open", () => {
      console.log("✅ WebSocket connection established.");
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data);
        const content = message.payload;
        const type = message.type;

        const channel = client.channels.cache.get(RELAY_CHANNEL);
        if (!channel || !channel.isTextBased?.()) {
          console.error("Invalid channel ID or channel is not text.");
          return;
        }

        switch (type) {
          case "newMessage":
            console.log("Received message:", content);

            const [text, time, name] = content.split(" ");

            if (!text || !time || !name) {
              console.error("Invalid message format:", content);
              return;
            }

            if (text.length > 2000) {
              console.error(
                "Message sent by " + name + " exceeds 2000 characters."
              );
              return;
            }

            if (time == lastMessageTime && time != 0) return; // Duplicate message check
            if (time != 0) lastMessageTime = time;

            let format =
              (time != 0 && `**${name}**: ${text}`) || `**${name}** ${text}`;

            channel
              .send({
                content: format,
                allowedMentions: {
                  parse: ["users"],
                  repliedUser: true,
                },
              })
              .catch((err) => {
                console.error("Failed to send message to channel:", err);
              });
            break;
          case "ping":
            let topic = channel.topic || "No topic set";

            if (topic == ping) return;
            if (ping == "Offline") {
              ping = "Offline/Unreachable";
            }

            channel.setTopic("Server Status: " + ping);
            break;
          default:
            console.log("Unknown message type:", message.type);
            break;
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => {
      console.warn("⚠️ WebSocket disconnected. Reconnecting in 3s...");
      setTimeout(() => {
        ws = new WebSocket(`ws://${WS}:${PORT}`);
        console.log("Reconnecting WebSocket...");
      }, 3000);
    });

    ws.on("error", (err) => {
      console.error("❌ WebSocket error:", err.message);
      ws.close();
    });

    require("dotenv").config();

    const wsServer = new WebSocket.Server({ PORT }, () => {
      console.log(`WebSocket server is running on ws://${WS}:${PORT}`);
    });

    const allowedIPs = [WS, SERVER_IP, MY_IP];

    function broadcast(data) {
      const payload = JSON.stringify(data);
      wsServer.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }

    wsServer.on("connection", (wes, req) => {
      const xForwardedFor = req.headers["x-forwarded-for"];
      const rawIP = req.socket.remoteAddress || "";
      const clientIP = (xForwardedFor || rawIP)
        .split(",")[0]
        .replace("::ffff:", "")
        .trim();

      if (!allowedIPs.includes(clientIP)) {
        console.warn(`❌ Connection from unauthorized IP: ${clientIP}`);
        wes.close();
        return;
      }

      console.log(`🔌 Connection established with ${clientIP}`);
      if (clientIP == SERVER_IP) {
        broadcast({ type: "ping", payload: "Online" });
      }

      wes.on("message", (msg) => {
        try {
          const data = JSON.parse(msg);
          const type = data.type;
          const message = data.payload;

          switch (type) {
            case "sendMessage2": {
              broadcast({ type: "newMessage2", payload: message });
              break;
            }

            case "sendMessage": {
              console.log(message);
              broadcast({ type: "newMessage", payload: message });
              break;
            }

            default:
              ws.send(JSON.stringify({ error: "Unknown message type" }));
          }
        } catch (err) {
          console.error("❗ Error processing message:", err);
          wes.send(JSON.stringify({ error: "Invalid message format" }));
        }
      });

      wes.on("close", () => {
        console.log(`🔌 Connection closed with ${clientIP}`);
        if (clientIP == SERVER_IP) {
          broadcast({ type: "ping", payload: "Offline" });
        }
      });
    });
  })
  .catch((err) => {
    console.error("Failed to login:", err);
  });

const textLimit = 1024;
let lastGot = 0;

function hexToRGB(hex) {
  const bigint = parseInt(hex.replace("#", ""), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot || msg.channel.type === ChannelType.DM) return;
  if (msg.channel.id !== RELAY_CHANNEL) return;
  if (!msg.content) return;
  if (msg.content.startsWith("(h) ")) return;
  if (msg.content.length > textLimit) {
    await msg.reply({
      content: `Your message is too long! The limit is ${textLimit} characters.`,
      flags: MessageFlags.Ephemeral,
    });
    msg.delete().catch(console.error);
    return;
  }

  let topic = msg.channel.topic || "No topic set";

  const now = Date.now();

  if (now < lastGot + 1000) {
    await msg.reply({
      content: "Please wait a moment before sending another message.",
      flags: MessageFlags.Ephemeral,
    });
    msg.delete().catch(console.error);
    return;
  }
  lastGot = now;

  const highestRole = msg.member.roles.highest;
  const roleColor = highestRole ? highestRole.hexColor : "DEADED";
  const rgbColor = hexToRGB(roleColor);
  const name = msg.author.globalName || msg.author.username;
  let text = msg.content;

  const mentionRgex = /<@!?(\d+)>/g;
  const mentionmatches = text.match(mentionRgex);

  if (mentionmatches) {
    for (const mention of mentionmatches) {
      const userId = mention.replace(/<@!?|>/g, "");
      const user = await client.users.fetch(userId).catch(console.error);
      if (user) {
        const globalName = user.globalName || user.username;
        text = text.replace(mention, `@${globalName}`);
      }
    }
  }

  const payload = {
    text,
    time: now / 1000,
    rgbColor,
    name,
  };

  try {
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "sendMessage2",
          payload,
        })
      );

      if (topic == "Server status: Online") {
        return await msg.react("👍").catch(console.error);
      } else {
        await msg.react("👎").catch(console.error); // React with 👀 if the topic is "Server status: Offline"
      }
    } else {
      throw new Error("WebSocket is not connected");
    }
  } catch (error) {
    console.error("Error sending message to WebSocket:", error);
    await msg.reply({
      content: "Failed to send message to the server.",
      flags: MessageFlags.Ephemeral,
    });
    msg.delete().catch(console.error);
  }
});
