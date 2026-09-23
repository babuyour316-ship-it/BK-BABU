/*
 * ╔════════════════════════════════════════════╗
 * ║             🤖 BK BABU BOT 🤖             ║
 * ║       WhatsApp Bot powered by Baileys     ║
 * ╚════════════════════════════════════════════╝
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const P = require("pino");

const AUTH_DIR = "./auth_info_baileys";
const OWNER_NUMBER = process.env.OWNER_NUMBER || "";

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    browser: Browsers.ubuntu("BK-BABU"),
    markOnlineOnConnect: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "connecting") {
      console.log("🔄 BK BABU BOT connecting...");
    }

    if (connection === "open") {
      console.log("╔════════════════════════════════════╗");
      console.log("║       🤖 BK BABU BOT ONLINE       ║");
      console.log("╚════════════════════════════════════╝");
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("🔄 Connection closed. Reconnecting...");
        setTimeout(startBot, 3000);
      } else {
        console.log("❌ WhatsApp session logged out.");
      }
    }
  });

  // Pairing code
  if (!state.creds.registered) {
    if (!OWNER_NUMBER) {
      console.log("");
      console.log("⚠️ OWNER_NUMBER is not configured.");
      console.log("Set OWNER_NUMBER in your hosting environment.");
      console.log("Example: 919XXXXXXXXX");
      return;
    }

    try {
      const number = OWNER_NUMBER.replace(/\D/g, "");

      const code = await sock.requestPairingCode(number);

      console.log("");
      console.log("╔════════════════════════════════════╗");
      console.log("║       🔐 BK BABU PAIRING CODE     ║");
      console.log("╠════════════════════════════════════╣");
      console.log(`║              ${code}              ║`);
      console.log("╚════════════════════════════════════╝");
      console.log("");
      console.log(
        "WhatsApp → Linked Devices → Link a device → Link with phone number"
      );
    } catch (error) {
      console.error("❌ Pairing Code Error:", error.message);
    }
  }

  // Message handler
  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];

      if (!msg || !msg.message || msg.key.fromMe) return;

      const jid = msg.key.remoteJid;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "";

      const command = text.trim().toLowerCase();

      if (command === ".ping") {
        await sock.sendMessage(jid, {
          text: "🏓 Pong!\n\n🤖 BK BABU BOT is online."
        });
      }

      if (command === ".menu") {
        await sock.sendMessage(jid, {
          text:
            "🤖 *BK BABU BOT*\n\n" +
            "━━━━━━━━━━━━━━\n" +
            "🏓 .ping\n" +
            "📋 .menu\n" +
            "ℹ️ .about\n" +
            "━━━━━━━━━━━━━━\n\n" +
            "⚡ Powered by BK BABU"
        });
      }

      if (command === ".about") {
        await sock.sendMessage(jid, {
          text:
            "🤖 BK BABU BOT\n\n" +
            "⚡ WhatsApp Bot powered by Baileys\n" +
            "👑 Owner: BK BABU"
        });
      }
    } catch (error) {
      console.error("❌ Message Error:", error.message);
    }
  });
}

startBot().catch((error) => {
  console.error("❌ BK BABU BOT START ERROR:", error);
});
