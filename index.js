const express = require("express");
const fs = require("fs");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");
const P = require("pino");

const app = express();
const PORT = process.env.PORT || 9090;

const AUTH_DIR = "./auth_info_baileys";
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/\D/g, "");

app.get("/", (req, res) => {
  res.send("🤖 BK BABU BOT is running!");
});

app.get("/status", (req, res) => {
  res.json({
    bot: "BK BABU BOT",
    status: "running"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 BK BABU WEB SERVER RUNNING ON PORT ${PORT}`);
});

async function startBot() {
  try {
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
        console.log("🔄 BK BABU connecting to WhatsApp...");
      }

      if (connection === "open") {
        console.log("");
        console.log("╔════════════════════════════════════╗");
        console.log("║       🤖 BK BABU BOT ONLINE       ║");
        console.log("╚════════════════════════════════════╝");
        console.log("");
      }

      if (connection === "close") {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log("❌ WhatsApp connection closed.");

        if (statusCode === DisconnectReason.loggedOut) {
          console.log("⚠️ WhatsApp session logged out.");
          console.log("🧹 Clearing old session...");

          try {
            fs.rmSync(AUTH_DIR, {
              recursive: true,
              force: true
            });
          } catch (e) {
            console.log("Session cleanup error:", e.message);
          }

          console.log("🔄 Restarting for a new pairing code...");

          setTimeout(() => {
            startBot();
          }, 3000);

          return;
        }

        console.log("🔄 Reconnecting...");
        setTimeout(() => {
          startBot();
        }, 3000);
      }
    });

    // ==============================
    // WHATSAPP PAIRING CODE
    // ==============================

    if (!state.creds.registered) {
      if (!OWNER_NUMBER) {
        console.log("");
        console.log("❌ OWNER_NUMBER is missing.");
        console.log("Set OWNER_NUMBER in Render Environment Variables.");
        return;
      }

      console.log("");
      console.log("🔐 Preparing WhatsApp pairing code...");
      console.log(`📱 Pairing number: ${OWNER_NUMBER}`);
      console.log("");

      try {
        // Give the WhatsApp socket time to initialize
        await new Promise(resolve => setTimeout(resolve, 5000));

        const code = await sock.requestPairingCode(
          OWNER_NUMBER
        );

        console.log("");
        console.log("╔════════════════════════════════════╗");
        console.log("║       🔐 BK BABU PAIRING CODE     ║");
        console.log("╠════════════════════════════════════╣");
        console.log(`║            ${code}            ║`);
        console.log("╚════════════════════════════════════╝");
        console.log("");
        console.log("📱 WhatsApp → Linked Devices");
        console.log("→ Link a device");
        console.log("→ Link with phone number instead");
        console.log("→ Enter the pairing code shown above");
        console.log("");
      } catch (error) {
        console.error(
          "❌ Pairing Code Error:",
          error.message
        );
      }
    } else {
      console.log("✅ Existing WhatsApp session found.");
    }

    // ==============================
    // MESSAGE HANDLER
    // ==============================

    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
        const msg = messages[0];

        if (!msg || !msg.message || msg.key.fromMe) {
          return;
        }

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
        console.error(
          "❌ Message Error:",
          error.message
        );
      }
    });

  } catch (error) {
    console.error(
      "❌ BK BABU START ERROR:",
      error
    );

    setTimeout(() => {
      startBot();
    }, 5000);
  }
}

startBot();
