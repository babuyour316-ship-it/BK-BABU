const fs = require("fs");
const dotenv = require("dotenv");

// Load .env file if available
if (fs.existsSync(".env")) {
    dotenv.config({ path: ".env" });
}

module.exports = {

    // ==============================
    // DATABASE
    // ==============================

    DATABASE_URL:
        process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        "",


    // ==============================
    // BOT CORE SETTINGS
    // ==============================

    OWNER_NUMBER:
        process.env.OWNER_NUMBER ||
        "+917001490182",

    PREFIX:
        process.env.PREFIX ||
        ".",


    // ==============================
    // BK BABU BOT BRANDING
    // ==============================

    BOT_NAME:
        process.env.BOT_NAME ||
        "BK-BABU",

    OWNER_NAME:
        process.env.OWNER_NAME ||
        "BK BABU",

    CAPTION:
        process.env.CAPTION ||
        "POWERED BY BK BABU",

    STATUS_MSG:
        process.env.STATUS_MSG ||
        "Hello From BK BABU",


    // ==============================
    // WHATSAPP CHANNEL
    // ==============================

    NEWSLETTER_JID:
        process.env.NEWSLETTER_JID ||
        "",


    // ==============================
    // MENU IMAGE
    // ==============================

    MENU_IMG:
        process.env.MENU_IMG ||
        "https://raw.githubusercontent.com/babuyour316-ship-it/BK-BABU/main/1790162918643.png",


    // ==============================
    // PAIRING WEBSITE
    // ==============================

    SITE_URL:
        process.env.SITE_URL ||
        "",


    // ==============================
    // SERVER PORT
    // ==============================

    PORT:
        process.env.PORT ||
        "9090"
};
