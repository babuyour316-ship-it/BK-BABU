const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync('.env')) {
    dotenv.config({ path: '.env' });
}

module.exports = {

    // =============================
    // DATABASE
    // =============================
    DATABASE_URL:
        process.env.MONGODB_URI ||
        process.env.DATABASE_URL ||
        "",

    // =============================
    // BOT CORE SETTINGS
    // =============================
    OWNER_NUMBER:
        process.env.OWNER_NUMBER ||
        "923253617422",
    
    PREFIX: process.env.PREFIX || ".",

    // =============================
    // GLOBAL BRANDING
    // =============================
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

    NEWSLETTER_JID:
        process.env.NEWSLETTER_JID ||
        "120363175375282051@newsletter",

    MENU_IMG:
        process.env.MENU_IMG ||
        "https://raw.githubusercontent.com/babuyour316-ship-it/BK-BABU/main/1790162918643.png

    // =============================
    // SITE URL FOR PAIR CMD
    // =============================
    SITE_URL:
        process.env.SITE_URL ||
        "https://mr-shaban.vercel.app",

    PORT:
        process.env.PORT ||
        "21604"
};
