/*
 * ╔══════════════════════════════════════════════════════╗
 * ║                 🤖 BK BABU BOT 🤖                  ║
 * ║            WhatsApp Bot powered by Baileys         ║
 * ╚══════════════════════════════════════════════════════╝
 *
 * Project : BK-BABU
 * Owner   : BK BABU
 * GitHub  : https://github.com/babuyour316-ship-it/BK-BABU
 */

// ──────────────────────────────────────────────────────
// BK BABU BOT - Main Loader
// ──────────────────────────────────────────────────────

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const CDN_URL = "https://bandaheali-cdn.koyeb.app/bandaheali/smd-mini.js";
const LOCAL_FILE = path.join(__dirname, "cdn-smd-mini.js");

async function startBot() {
  try {
    console.log("╔══════════════════════════════════════╗");
    console.log("║        🤖 BK BABU BOT STARTING      ║");
    console.log("╚══════════════════════════════════════╝");

    const response = await axios.get(CDN_URL, {
      timeout: 15000
    });

    if (!response.data) {
      throw new Error("Bot source file is empty.");
    }

    fs.writeFileSync(LOCAL_FILE, response.data, "utf8");

    if (require.cache[require.resolve(LOCAL_FILE)]) {
      delete require.cache[require.resolve(LOCAL_FILE)];
    }

    require(LOCAL_FILE);

  } catch (error) {
    console.error("❌ BK BABU BOT ERROR:", error.message);

    // Use previously downloaded local copy if available
    if (fs.existsSync(LOCAL_FILE)) {
      console.log("🔄 Starting from the existing local bot file...");

      if (require.cache[require.resolve(LOCAL_FILE)]) {
        delete require.cache[require.resolve(LOCAL_FILE)];
      }

      require(LOCAL_FILE);
    } else {
      console.error("❌ Bot source is not available.");
      console.error("❌ BK BABU BOT could not be started.");
      process.exit(1);
    }
  }
}

startBot();
