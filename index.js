const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const P = require("pino");
const ytSearch = require("yt-search");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  downloadMediaMessage,
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  fetchLatestWaWebVersion,
  areJidsSameUser
} = require("@whiskeysockets/baileys");

const { Sticker, StickerTypes } = require("wa-sticker-formatter");

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({
  extended: true,
  limit: "2mb"
}));

const PORT = Number(
  process.env.PORT || 9090
);

const PREFIX =
  process.env.PREFIX || "!";

const BOT_NAME =
  process.env.BOT_NAME || "BK-BABU";

const OWNER_NAME =
  process.env.OWNER_NAME || "BK BABU";

const OWNER_NUMBER =
  String(
    process.env.OWNER_NUMBER || ""
  ).replace(/\D/g, "");

const MENU_IMG =
  process.env.MENU_IMG ||
  "https://raw.githubusercontent.com/babuyour316-ship-it/BK-BABU/main/1790162918643.png";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "";

const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-5-mini";

const AUTH_DIR = path.join(
  __dirname,
  "auth_info_baileys"
);

const DATA_DIR = path.join(
  __dirname,
  "data"
);

const SETTINGS_FILE = path.join(
  DATA_DIR,
  "group-settings.json"
);

const WARN_FILE = path.join(
  DATA_DIR,
  "warnings.json"
);

const BLOCK_FILE = path.join(
  DATA_DIR,
  "blocked.json"
);

fs.mkdirSync(DATA_DIR, {
  recursive: true
});

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  try {
    fs.writeFileSync(
      file,
      JSON.stringify(
        value,
        null,
        2
      )
    );
  } catch {}
}

let settings =
  readJson(
    SETTINGS_FILE,
    {}
  );

let warnings =
  readJson(
    WARN_FILE,
    {}
  );

let blocked =
  new Set(
    readJson(
      BLOCK_FILE,
      []
    )
  );

function saveSettings() {
  writeJson(
    SETTINGS_FILE,
    settings
  );
}

function saveWarnings() {
  writeJson(
    WARN_FILE,
    warnings
  );
}

function saveBlocked() {
  writeJson(
    BLOCK_FILE,
    [...blocked]
  );
}

function defaultSettings() {
  return {
    welcome: false,
    goodbye: false,

    antilink: false,
    antimention: false,
    antispam: false,
    antiflood: false,
    antibadword: false,
    antisticker: false,

    autoread: false,
    autoreact: false,

    welcomeText:
      `Welcome to the group, @user! 👋`,

    goodbyeText:
      `Goodbye @user! Take care. 👋`,

    badwords: [
      "scamword",
      "spamword"
    ],

    warnings: {}
  };
}

function getSettings(jid) {
  if (!settings[jid]) {
    settings[jid] =
      defaultSettings();

    saveSettings();
  }

  return settings[jid];
}

let sock = null;
let authState = null;

let starting = false;

let botOnline = false;

let pairingCode = null;

let pairingNumber = null;

let pairingBusy = false;

let lastConnectionError = "";

const floodMap =
  new Map();

const spamMap =
  new Map();

const warnedMap =
  new Map();

function cleanNumber(value) {
  return String(
    value || ""
  ).replace(
    /\D/g,
    ""
  );
}

function jidFromNumber(value) {
  const n =
    cleanNumber(value);

  return n
    ? `${n}@s.whatsapp.net`
    : null;
}

function senderNumber(jid) {
  return String(
    jid || ""
  )
    .split("@")[0]
    .split(":")[0];
}

function isOwner(jid) {
  return (
    !!OWNER_NUMBER &&
    senderNumber(jid) ===
      OWNER_NUMBER
  );
}

function isGroup(jid) {
  return String(
    jid || ""
  ).endsWith("@g.us");
}

function isStatus(jid) {
  return (
    String(jid || "") ===
    "status@broadcast"
  );
}

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );
}

function getText(message) {
  if (!message) {
    return "";
  }

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage
      ?.singleSelectReply
      ?.selectedRowId ||
    message.templateButtonReplyMessage
      ?.selectedId ||
    ""
  ).trim();
}

function getContext(message) {
  return (
    message
      ?.extendedTextMessage
      ?.contextInfo ||
    message?.contextInfo ||
    {}
  );
}

function mentionedUsers(message) {
  return (
    getContext(message)
      .mentionedJid ||
    []
  );
}

function getQuoted(message) {
  return (
    getContext(message)
      .quotedMessage ||
    null
  );
}

function getQuotedParticipant(message) {
  return (
    getContext(message)
      .participant ||
    null
  );
}

function getTarget(
  message,
  args
) {
  const mentions =
    mentionedUsers(message);

  if (mentions.length) {
    return mentions[0];
  }

  const quoted =
    getQuotedParticipant(
      message
    );

  if (quoted) {
    return quoted;
  }

  return jidFromNumber(
    args[0]
  );
}

async function reply(
  jid,
  text,
  quoted
) {
  if (!sock) {
    return;
  }

  return sock.sendMessage(
    jid,
    {
      text: String(text)
    },
    quoted
      ? { quoted }
      : {}
  );
}

async function react(
  jid,
  key,
  emoji
) {
  if (!sock || !key) {
    return;
  }

  try {
    await sock.sendMessage(
      jid,
      {
        react: {
          text: emoji,
          key
        }
      }
    );
  } catch {}
}

async function sendImage(
  jid,
  imageUrl,
  caption,
  quoted
) {
  try {
    return await sock.sendMessage(
      jid,
      {
        image: {
          url: imageUrl
        },
        caption
      },
      quoted
        ? { quoted }
        : {}
    );
  } catch {
    return reply(
      jid,
      caption,
      quoted
    );
  }
}

async function groupMetadata(jid) {
  try {
    return await sock.groupMetadata(
      jid
    );
  } catch {
    return null;
  }
}

async function isAdmin(
  groupJid,
  userJid
) {
  const metadata =
    await groupMetadata(
      groupJid
    );

  if (!metadata) {
    return false;
  }

  const user =
    metadata.participants.find(
      p =>
        areJidsSameUser(
          p.id,
          userJid
        ) ||
        p.lid === userJid ||
        p.phoneNumber === userJid
    );

  return !!user?.admin;
}

async function botIsAdmin(
  groupJid
) {
  const metadata =
    await groupMetadata(
      groupJid
    );

  if (!metadata) {
    return false;
  }

  const botIds = [
    sock?.user?.id,
    sock?.user?.lid,
    authState?.state?.creds?.me?.id,
    authState?.state?.creds?.me?.lid
  ].filter(Boolean);

  const botParticipant =
    metadata.participants.find(
      p =>
        botIds.some(
          id =>
            areJidsSameUser(
              p.id,
              id
            ) ||
            areJidsSameUser(
              p.lid,
              id
            ) ||
            areJidsSameUser(
              p.phoneNumber,
              id
            )
        )
    );

  return !!botParticipant?.admin;
}

function requireGroup(jid) {
  return isGroup(jid);
}

function parseOnOff(value) {
  const v =
    String(
      value || ""
    ).toLowerCase();

  if (
    [
      "on",
      "enable",
      "enabled",
      "1",
      "yes"
    ].includes(v)
  ) {
    return true;
  }

  if (
    [
      "off",
      "disable",
      "disabled",
      "0",
      "no"
    ].includes(v)
  ) {
    return false;
  }

  return null;
}

function formatDuration(ms) {
  const s =
    Math.floor(
      ms / 1000
    );

  const m =
    Math.floor(
      s / 60
    );

  const sec =
    s % 60;

  return `${m}m ${sec}s`;
}

function menuText() {
  return `
╭━━━〔 🤖 ${BOT_NAME} 〕━━━╮
┃ 👑 Owner : ${OWNER_NAME}
┃ ⚡ Prefix : ${PREFIX}
┃ 📡 Status : ${
    botOnline
      ? "Online"
      : "Offline"
  }

┣━━〔 🏠 MAIN 〕━━
┃ ${PREFIX}menu
┃ ${PREFIX}help
┃ ${PREFIX}ping
┃ ${PREFIX}alive
┃ ${PREFIX}about
┃ ${PREFIX}owner
┃ ${PREFIX}botinfo
┃ ${PREFIX}status

┣━━〔 👥 GROUP 〕━━
┃ ${PREFIX}groupinfo
┃ ${PREFIX}groupid
┃ ${PREFIX}admins
┃ ${PREFIX}members
┃ ${PREFIX}tagall
┃ ${PREFIX}hidetag text
┃ ${PREFIX}everyone
┃ ${PREFIX}kick @user
┃ ${PREFIX}add number
┃ ${PREFIX}promote @user
┃ ${PREFIX}demote @user
┃ ${PREFIX}mute / ${PREFIX}unmute
┃ ${PREFIX}open / ${PREFIX}close
┃ ${PREFIX}setname text
┃ ${PREFIX}setdesc text
┃ ${PREFIX}gstatus

┣━━〔 🛡️ SECURITY 〕━━
┃ ${PREFIX}antilink on/off
┃ ${PREFIX}antimention on/off
┃ ${PREFIX}antispam on/off
┃ ${PREFIX}antiflood on/off
┃ ${PREFIX}antibadword on/off
┃ ${PREFIX}antisticker on/off
┃ ${PREFIX}warn @user
┃ ${PREFIX}warnings @user
┃ ${PREFIX}resetwarn @user

┣━━〔 👋 WELCOME 〕━━
┃ ${PREFIX}welcome on/off
┃ ${PREFIX}goodbye on/off
┃ ${PREFIX}setwelcome text
┃ ${PREFIX}setgoodbye text

┣━━〔 ⚡ AUTO 〕━━
┃ ${PREFIX}autoread on/off
┃ ${PREFIX}autoreact on/off

┣━━〔 🧰 TOOLS 〕━━
┃ ${PREFIX}calc 10+20
┃ ${PREFIX}time
┃ ${PREFIX}weather city
┃ ${PREFIX}translate en|hello
┃ ${PREFIX}define word
┃ ${PREFIX}ytsearch query
┃ ${PREFIX}wiki query
┃ ${PREFIX}short url
┃ ${PREFIX}qr text

┣━━〔 🎵 MEDIA 〕━━
┃ ${PREFIX}play query
┃ ${PREFIX}song query
┃ ${PREFIX}sticker

┣━━〔 🤖 AI 〕━━
┃ ${PREFIX}ai question

┣━━〔 👑 OWNER 〕━━
┃ ${PREFIX}block @user
┃ ${PREFIX}unblock @user
┃ ${PREFIX}restart
┃ ${PREFIX}botoff
┃ ${PREFIX}boton

╰━━━━━━━━━━━━━━━━━━━━━━╯

⚡ POWERED BY ${OWNER_NAME}
`;
  }
async function safeGroupAdmin(
  jid,
  sender,
  replyJid,
  quoted
) {
  if (!requireGroup(jid)) {
    await reply(
      replyJid,
      "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
      quoted
    );
    return false;
  }

  if (!isOwner(sender)) {
    const admin =
      await isAdmin(
        jid,
        sender
      );

    if (!admin) {
      await reply(
        replyJid,
        "❌ এই কমান্ড ব্যবহার করতে হলে তোমাকে Group Admin হতে হবে।",
        quoted
      );
      return false;
    }
  }

  if (
    !(await botIsAdmin(jid))
  ) {
    await reply(
      replyJid,
      "❌ আমাকে আগে Group Admin বানাও।",
      quoted
    );
    return false;
  }

  return true;
}

async function sendHelp(
  jid,
  quoted
) {
  const text = `
╭━━〔 📚 ${BOT_NAME} HELP 〕━━╮

🏠 MAIN
• ${PREFIX}menu
• ${PREFIX}help
• ${PREFIX}ping
• ${PREFIX}alive
• ${PREFIX}about
• ${PREFIX}owner
• ${PREFIX}botinfo
• ${PREFIX}status

👥 GROUP
• ${PREFIX}groupinfo
• ${PREFIX}admins
• ${PREFIX}members
• ${PREFIX}tagall
• ${PREFIX}hidetag text
• ${PREFIX}kick @user
• ${PREFIX}add number
• ${PREFIX}promote @user
• ${PREFIX}demote @user
• ${PREFIX}open
• ${PREFIX}close
• ${PREFIX}setname
• ${PREFIX}setdesc

🛡️ SECURITY
• ${PREFIX}antilink on/off
• ${PREFIX}antimention on/off
• ${PREFIX}antispam on/off
• ${PREFIX}antiflood on/off
• ${PREFIX}antibadword on/off
• ${PREFIX}antisticker on/off
• ${PREFIX}warn @user
• ${PREFIX}warnings
• ${PREFIX}resetwarn

👋 WELCOME
• ${PREFIX}welcome on/off
• ${PREFIX}goodbye on/off
• ${PREFIX}setwelcome text
• ${PREFIX}setgoodbye text

⚡ AUTO
• ${PREFIX}autoread on/off
• ${PREFIX}autoreact on/off

🧰 TOOLS
• ${PREFIX}calc 25*4
• ${PREFIX}time
• ${PREFIX}weather city
• ${PREFIX}translate en|hello
• ${PREFIX}define word
• ${PREFIX}ytsearch query
• ${PREFIX}wiki query
• ${PREFIX}short url
• ${PREFIX}qr text

🎵 MEDIA
• ${PREFIX}play query
• ${PREFIX}song query
• ${PREFIX}sticker

🤖 AI
• ${PREFIX}ai question

👑 OWNER
• ${PREFIX}block @user
• ${PREFIX}unblock @user
• ${PREFIX}restart
• ${PREFIX}botoff
• ${PREFIX}boton

⚡ ${BOT_NAME}
`;

  await reply(
    jid,
    text,
    quoted
  );
}

function getWarnings(
  groupJid,
  userJid
) {
  if (!warnings[groupJid]) {
    warnings[groupJid] = {};
  }

  if (
    typeof warnings[groupJid][userJid] !==
    "number"
  ) {
    warnings[groupJid][userJid] = 0;
  }

  return warnings[groupJid][userJid];
}

function addWarning(
  groupJid,
  userJid
) {
  const count =
    getWarnings(
      groupJid,
      userJid
    ) + 1;

  warnings[groupJid][userJid] =
    count;

  saveWarnings();

  return count;
}

function resetWarning(
  groupJid,
  userJid
) {
  if (
    warnings[groupJid]
  ) {
    delete warnings[groupJid][userJid];
    saveWarnings();
  }
}

function containsLink(text) {
  if (!text) return false;

  return /\b(?:https?:\/\/|www\.)\S+/i.test(text) ||
    /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i.test(text);
}

function containsBadWord(
  text,
  list
) {
  const lower =
    String(text || "")
      .toLowerCase();

  return list.some(
    word =>
      word &&
      lower.includes(
        String(word)
          .toLowerCase()
      )
  );
}

function getTimeText() {
  return new Date().toLocaleString(
    "en-IN",
    {
      timeZone:
        "Asia/Kolkata",
      dateStyle:
        "full",
      timeStyle:
        "medium"
    }
  );
}

function safeMath(
  expression
) {
  const exp =
    String(
      expression || ""
    )
      .replace(
        /[^0-9+\-*/().% ]/g,
        ""
      )
      .trim();

  if (!exp) {
    return null;
  }

  if (exp.length > 100) {
    return null;
  }

  try {
    const result =
      Function(
        `"use strict"; return (${exp})`
      )();

    if (
      typeof result !==
        "number" ||
      !Number.isFinite(
        result
      )
    ) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}
async function sendGroupStatus(
  groupJid,
  sourceMessage,
  caption = ""
) {
  if (!sock) {
    throw new Error(
      "WhatsApp connection is not ready."
    );
  }

  const message =
    sourceMessage?.message || {};

  const senderJid =
    sock?.user?.id ||
    authState?.state?.creds?.me?.id ||
    "";

  const mediaMessage =
    message.imageMessage ||
    message.videoMessage ||
    null;

  if (mediaMessage) {
    const mediaType =
      message.imageMessage
        ? "image"
        : "video";

    const buffer =
      await downloadMediaMessage(
        sourceMessage,
        "buffer",
        {},
        {
          logger: P({
            level: "silent"
          }),
          reuploadRequest:
            sock.updateMediaMessage
        }
      );

    let mediaInput;
    let messageKey;

    if (
      mediaType ===
      "video"
    ) {
      mediaInput = {
        video: buffer,
        mimetype:
          mediaMessage.mimetype ||
          "video/mp4",
        caption
      };

      messageKey =
        "videoMessage";
    } else {
      mediaInput = {
        image: buffer,
        mimetype:
          mediaMessage.mimetype ||
          "image/jpeg",
        caption
      };

      messageKey =
        "imageMessage";
    }

    const prepared =
  await prepareWAMessageMedia(
    mediaInput,
    {
      upload:
        sock.waUploadToServer
    }
  );

prepared[
  messageKey
].contextInfo = {
  forwardingScore: 0,
  isGroupStatus: true,
  pairedMediaType: 0,
  statusSourceType: 4,
  featureEligibilities: {
    canBeReshared: true,
    canReceiveMultiReact: true
  },
  statusAttributions: [
    {
      type: 10
    }
  ]
};

await sock.sendMessage(
  groupJid,
  prepared
);

return;
  }
  const text =
    caption ||
    getText(message) ||
    "Group Status";

  const messageContent = {
    groupStatusMessageV2: {
      message: {
        extendedTextMessage: {
          text,
          font: 1,
          backgroundArgb:
            0xFF23313A,
          contextInfo: {
            forwardingScore: 0,
            pairedMediaType: 0,
            isGroupStatus: true,
            featureEligibilities: {
              canBeReshared: true,
              canReceiveMultiReact: true
            },
            statusAttributions: [
              {
                type: 6,
                groupStatus: {
                  authorJid:
                    senderJid
                }
              }
            ]
          }
        }
      }
    }
  };

  const generated =
    generateWAMessageFromContent(
      groupJid,
      messageContent,
      {
        userJid:
          senderJid
      }
    );

  await sock.relayMessage(
    groupJid,
    generated.message,
    {
      messageId:
        generated.key.id
    }
  );
}
async function commandHandler(
  msg,
  jid,
  sender,
  text
) {
  if (!text) {
    return;
  }

  if (
    !text.startsWith(
      PREFIX
    )
  ) {
    return;
  }

  const raw =
    text.slice(
      PREFIX.length
    ).trim();

  if (!raw) {
    return;
  }

  const parts =
    raw.split(/\s+/);
    const command =
    String(
      parts.shift() || ""
    ).toLowerCase();

  const args = parts;

  const argText =
    args.join(" ").trim();

  const quoted =
  msg;

  const group =
    isGroup(jid);

  const groupSettings =
    group
      ? getSettings(jid)
      : null;

  if (
    blocked.has(
      sender
    ) &&
    !isOwner(sender)
  ) {
    return;
  }

  if (
    command === "menu" ||
    command === "start"
  ) {
    await sendImage(
      jid,
      MENU_IMG,
      menuText(),
      quoted
    );
    return;
  }

  if (
    command === "help"
  ) {
    await sendHelp(
      jid,
      quoted
    );
    return;
  }

  if (
    command === "ping"
  ) {
    const started =
      Date.now();

    await reply(
      jid,
      "🏓 Checking...",
      quoted
    );

    const ms =
      Date.now() -
      started;

    await reply(
      jid,
      `🏓 Pong!\n⚡ Response: ${ms}ms`,
      quoted
    );

    return;
  }

  if (
    command === "alive"
  ) {
    await reply(
      jid,
      `╭━━〔 🤖 ${BOT_NAME} 〕━━╮
┃ 🟢 Bot is online
┃ ⚡ Prefix: ${PREFIX}
┃ 👑 Owner: ${OWNER_NAME}
┃ 📡 WhatsApp: ${
        botOnline
          ? "Connected"
          : "Disconnected"
      }
╰━━━━━━━━━━━━━━━━━━━━╯`,
      quoted
    );

    return;
  }

  if (
    command === "about"
  ) {
    await reply(
      jid,
      `╭━━〔 ℹ️ ABOUT 〕━━╮
┃ 🤖 ${BOT_NAME}
┃ ⚡ WhatsApp Automation Bot
┃ 🛠️ Built with Node.js
┃ 🔌 Powered by Baileys
┃ 👑 ${OWNER_NAME}
╰━━━━━━━━━━━━━━━━━━━━╯`,
      quoted
    );

    return;
  }

  if (
    command === "owner"
  ) {
    const ownerJid =
      OWNER_NUMBER
        ? `${OWNER_NUMBER}@s.whatsapp.net`
        : null;

    if (ownerJid) {
      await sock.sendMessage(
        jid,
        {
          contacts: {
            displayName:
              OWNER_NAME,
            contacts: [
              {
                vcard:
`BEGIN:VCARD
VERSION:3.0
FN:${OWNER_NAME}
TEL;type=CELL;type=VOICE:+${OWNER_NUMBER}
END:VCARD`
              }
            ]
          }
        },
        {
          quoted
        }
      );
    } else {
      await reply(
        jid,
        `👑 Owner: ${OWNER_NAME}`,
        quoted
      );
    }

    return;
  }

  if (
    command === "botinfo"
  ) {
    await reply(
      jid,
      `╭━━〔 🤖 BOT INFO 〕━━╮
┃ Name: ${BOT_NAME}
┃ Owner: ${OWNER_NAME}
┃ Prefix: ${PREFIX}
┃ Status: ${
        botOnline
          ? "Online 🟢"
          : "Offline 🔴"
      }
┃ Node: ${process.version}
┃ Platform: ${process.platform}
┃ Uptime: ${formatDuration(
        process.uptime() * 1000
      )}
╰━━━━━━━━━━━━━━━━━━━━╯`,
      quoted
    );

    return;
  }

  if (
    command === "status"
  ) {
    await reply(
      jid,
      `📡 ${BOT_NAME} STATUS

🟢 Bot: ${
        botOnline
          ? "Online"
          : "Offline"
      }

🌐 Web Server: Online
⚡ Port: ${PORT}
🧠 Node: ${process.version}
⏱️ Uptime: ${formatDuration(
        process.uptime() * 1000
      )}

${lastConnectionError
  ? `⚠️ Last connection note: ${lastConnectionError}`
  : "✅ No recent connection error."}`,
      quoted
    );

    return;
  }

  if (
    command === "calc" ||
    command === "calculate"
  ) {
    const result =
      safeMath(
        argText
      );

    if (
      result === null
    ) {
      await reply(
        jid,
        `❌ Example:\n${PREFIX}calc 100/5`,
        quoted
      );
      return;
    }

    await reply(
      jid,
      `🧮 Result: ${result}`,
      quoted
    );

    return;
  }

  if (
    command === "time"
  ) {
    await reply(
      jid,
      `🕐 India Time\n${getTimeText()}`,
      quoted
    );

    return;
  }

  if (
    command === "weather"
  ) {
    if (!argText) {
      await reply(
        jid,
        `🌤️ Example:\n${PREFIX}weather Siliguri`,
        quoted
      );
      return;
    }

    try {
      const url =
        `https://wttr.in/${encodeURIComponent(
          argText
        )}?format=j1`;

      const response =
        await axios.get(
          url,
          {
            timeout: 10000
          }
        );

      const current =
        response.data
          ?.current_condition
          ?.[0];

      const area =
        response.data
          ?.nearest_area
          ?.[0];

      if (!current) {
        throw new Error(
          "Weather unavailable"
        );
      }

      const location =
        area
          ?.areaName?.[0]
          ?.value ||
        argText;

      await reply(
        jid,
        `🌤️ WEATHER

📍 ${location}
🌡️ Temperature: ${current.temp_C}°C
🤗 Feels like: ${current.FeelsLikeC}°C
💧 Humidity: ${current.humidity}%
💨 Wind: ${current.windspeedKmph} km/h
☁️ Condition: ${
          current.weatherDesc
            ?.[0]?.value ||
          "Unknown"
        }`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Weather data পাওয়া যাচ্ছে না। কিছুক্ষণ পরে আবার চেষ্টা করো।",
        quoted
      );
    }

    return;
  }

  if (
    command === "ytsearch" ||
    command === "yts"
  ) {
    if (!argText) {
      await reply(
        jid,
        `🔎 Example:\n${PREFIX}ytsearch Arijit Singh`,
        quoted
      );
      return;
    }

    try {
      const result =
        await ytSearch(
          argText
        );

      const videos =
        result.videos
          .slice(0, 8);

      if (!videos.length) {
        await reply(
          jid,
          "❌ কোনো YouTube result পাওয়া যায়নি।",
          quoted
        );
        return;
      }

      let out =
        `🔎 YouTube Search\n\n`;

      videos.forEach(
        (video, index) => {
          out +=
`\n${index + 1}. ${video.title}
⏱️ ${video.timestamp}
👁️ ${video.views}
🔗 ${video.url}\n`;
        }
      );

      await reply(
        jid,
        out,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ YouTube search এখন কাজ করছে না।",
        quoted
      );
    }

    return;
  }

  if (
    command === "play" ||
    command === "song"
  ) {
    if (!argText) {
      await reply(
        jid,
        `🎵 Example:\n${PREFIX}play song name`,
        quoted
      );
      return;
    }

    try {
      const result =
        await ytSearch(
          argText
        );

      const video =
        result.videos?.[0];

      if (!video) {
        await reply(
          jid,
          "❌ গান পাওয়া যায়নি।",
          quoted
        );
        return;
      }

      await reply(
        jid,
        `🎵 MUSIC RESULT

🎧 Title: ${video.title}
⏱️ Duration: ${video.timestamp}
👁️ Views: ${video.views}

🔗 ${video.url}

ℹ️ এটি YouTube search result link।`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Music search failed.",
        quoted
      );
    }

    return;
  }

  if (
    command === "translate" ||
    command === "tr"
  ) {
    if (!argText) {
      await reply(
        jid,
        `🌐 Example:\n${PREFIX}translate en|hello world`,
        quoted
      );
      return;
    }

    const split =
      argText.split("|");

    if (
      split.length < 2
    ) {
      await reply(
        jid,
        `🌐 Format:\n${PREFIX}translate language|text`,
        quoted
      );
      return;
    }

    const language =
      split.shift()
        .trim();

    const source =
      split.join("|")
        .trim();

    try {
      const url =
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
          language
        )}&dt=t&q=${encodeURIComponent(
          source
        )}`;

      const response =
        await axios.get(
          url,
          {
            timeout: 10000
          }
        );

      const translated =
        response.data?.[0]
          ?.map(
            x => x?.[0] || ""
          )
          .join("");

      if (!translated) {
        throw new Error(
          "Translation unavailable"
        );
      }

      await reply(
        jid,
        `🌐 Translation\n\n${translated}`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Translation failed.",
        quoted
      );
    }

    return;
  }

  if (
    command === "define" ||
    command === "meaning"
  ) {
    if (!argText) {
      await reply(
        jid,
        `📖 Example:\n${PREFIX}define technology`,
        quoted
      );
      return;
    }

    try {
      const url =
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
          argText
        )}`;

      const response =
        await axios.get(
          url,
          {
            timeout: 10000
          }
        );

      const data =
        response.data?.[0];

      const meaning =
        data
          ?.meanings?.[0];

      const definition =
        meaning
          ?.definitions?.[0]
          ?.definition;

      const example =
        meaning
          ?.definitions?.[0]
          ?.example;

      await reply(
        jid,
        `📖 DICTIONARY

🔤 Word: ${data?.word || argText}
🏷️ Type: ${
          meaning?.partOfSpeech ||
          "Unknown"
        }

📚 Meaning:
${definition || "Not found"}

${
  example
    ? `📝 Example:\n${example}`
    : ""
}`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ এই শব্দটির definition পাওয়া যায়নি।",
        quoted
      );
    }

    return;
  }

  if (
    command === "wiki" ||
    command === "wikipedia"
  ) {
    if (!argText) {
      await reply(
        jid,
        `📚 Example:\n${PREFIX}wiki Bangladesh`,
        quoted
      );
      return;
    }

    try {
      const url =
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          argText.replace(
            /\s+/g,
            "_"
          )
        )}`;

      const response =
        await axios.get(
          url,
          {
            timeout: 10000
          }
        );

      const data =
        response.data;

      await reply(
        jid,
        `📚 WIKIPEDIA

📌 ${data.title || argText}

${data.extract || "No summary found."}

🔗 ${
          data.content_urls
            ?.desktop?.page ||
          ""
        }`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Wikipedia result পাওয়া যায়নি।",
        quoted
      );
    }

    return;
  }

  if (
    command === "short"
  ) {
    if (!argText) {
      await reply(
        jid,
        `🔗 Example:\n${PREFIX}short https://example.com`,
        quoted
      );
      return;
    }

    if (
      !/^https?:\/\//i.test(
        argText
      )
    ) {
      await reply(
        jid,
        "❌ Valid http/https URL দাও।",
        quoted
      );
      return;
    }

    try {
      const response =
        await axios.get(
          `https://is.gd/create.php?format=simple&url=${encodeURIComponent(
            argText
          )}`,
          {
            timeout: 10000
          }
        );

      await reply(
        jid,
        `🔗 Short URL:\n${String(
          response.data
        ).trim()}`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ URL shortener এখন কাজ করছে না।",
        quoted
      );
    }

    return;
  }

  if (
    command === "qr"
  ) {
    if (!argText) {
      await reply(
        jid,
        `🔳 Example:\n${PREFIX}qr Hello BK-BABU`,
        quoted
      );
      return;
    }

    const qrUrl =
      `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(
        argText
      )}`;

    try {
      await sock.sendMessage(
        jid,
        {
          image: {
            url: qrUrl
          },
          caption:
            "🔳 QR Code generated by BK-BABU"
        },
        {
          quoted
        }
      );
    } catch {
      await reply(
        jid,
        `🔳 QR:\n${qrUrl}`,
        quoted
      );
    }

    return;
  }
  if (
    command === "gstatus" ||
    command === "gs"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু Group-এ ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    try {
      const currentMessage =
        msg?.message || {};

      const context =
        getContext(
          currentMessage
        );

      const quotedMessage =
        getQuoted(
          currentMessage
        );

      let sourceMessage =
        msg;

      let caption =
        argText;

      if (
        quotedMessage
      ) {
        const quotedKey = {
          remoteJid:
            jid,
          id:
            context?.stanzaId,
          participant:
            context?.participant,
          fromMe:
            false
        };

        sourceMessage = {
          key: quotedKey,
          message:
            quotedMessage
        };
      }

      const rawSource =
  sourceMessage?.message ||
  {};

if (
  rawSource.viewOnceMessage ||
  rawSource.viewOnceMessageV2 ||
  rawSource.viewOnceMessageV2Extension
) {
  await reply(
    jid,
    "❌ View Once / One-Time media Group Status-এ পাঠানো যাবে না।",
    quoted
  );
  return;
}

let source =
  rawSource;

for (
  let i = 0;
  i < 5;
  i++
) {
  const inner =
    source?.ephemeralMessage?.message ||
    source?.viewOnceMessage?.message ||
    source?.viewOnceMessageV2?.message ||
    source?.viewOnceMessageV2Extension?.message ||
    source?.documentWithCaptionMessage?.message ||
    source?.editedMessage?.message ||
    source?.associatedChildMessage?.message;

  if (!inner) {
    break;
  }

  source =
    inner;
}

const hasMedia =
  !!(
    source.imageMessage ||
    source.videoMessage
  );

      if (
  quotedMessage &&
  hasMedia
) {
  sourceMessage = {
    ...sourceMessage,
    message:
      source
  };

  await sendGroupStatus(
    jid,
    sourceMessage,
    caption
  );
      } else {
        const statusText =
          argText ||
          getText(
            source
          );

        if (!statusText) {
          await reply(
            jid,
            `❌ Example:\n${PREFIX}gstatus Hello ❤️\n\n📷 Photo/Video-তে Reply করে ${PREFIX}gstatus লিখতে পারো।`,
            quoted
          );
          return;
        }

        await sendGroupStatus(
          jid,
          {
            message: {
              conversation:
                statusText
            }
          },
          statusText
        );
      }

      await reply(
        jid,
        "✅ Group Status সফলভাবে পোস্ট করা হয়েছে।",
        quoted
      );

    } catch (error) {
      console.error(
        "❌ Group Status error:",
        error?.message ||
          error
      );

      await reply(
        jid,
        `❌ Group Status পোস্ট করা যায়নি।\n\n${error?.message || "Unknown error"}`,
        quoted
      );
    }

    return;
            }
  if (
    command === "ai"
  ) {
    if (!argText) {
      await reply(
        jid,
        `🤖 Example:\n${PREFIX}ai Explain JavaScript in simple words`,
        quoted
      );
      return;
    }

    if (!OPENAI_API_KEY) {
      await reply(
        jid,
        "⚠️ AI চালু করতে OPENAI_API_KEY environment variable সেট করতে হবে।",
        quoted
      );
      return;
    }

    try {
      const response =
        await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model:
              OPENAI_MODEL,
            messages: [
              {
                role:
                  "system",
                content:
                  "You are a helpful WhatsApp bot assistant. Keep answers clear and reasonably concise."
              },
              {
                role:
                  "user",
                content:
                  argText
              }
            ],
            temperature:
              0.7
          },
          {
            headers: {
              Authorization:
                `Bearer ${OPENAI_API_KEY}`,
              "Content-Type":
                "application/json"
            },
            timeout:
              30000
          }
        );

      const answer =
        response.data
          ?.choices?.[0]
          ?.message
          ?.content;

      await reply(
        jid,
        answer ||
          "❌ AI কোনো উত্তর দেয়নি।",
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ AI request failed। API key/model settings পরীক্ষা করো।",
        quoted
      );
    }

    return;
  }

  if (
    command === "groupinfo"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const metadata =
      await groupMetadata(
        jid
      );

    if (!metadata) {
      await reply(
        jid,
        "❌ Group information পাওয়া যাচ্ছে না।",
        quoted
      );
      return;
    }

    const admins =
      metadata.participants.filter(
        p => !!p.admin
      );

    await reply(
      jid,
      `╭━━〔 👥 GROUP INFO 〕━━╮
┃ 📌 Name:
┃ ${metadata.subject || "Unknown"}
┃
┃ 👤 Members:
┃ ${metadata.participants.length}
┃
┃ 👑 Admins:
┃ ${admins.length}
┃
┃ 🆔 Group ID:
┃ ${jid}
╰━━━━━━━━━━━━━━━━━━━━╯`,
      quoted
    );

    return;
  }

  if (
    command === "groupid"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    await reply(
      jid,
      `🆔 Group ID:\n${jid}`,
      quoted
    );

    return;
  }

  if (
    command === "admins"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const metadata =
      await groupMetadata(
        jid
      );

    if (!metadata) {
      return;
    }

    const admins =
      metadata.participants
        .filter(
          p => !!p.admin
        )
        .map(
          p => `@${senderNumber(p.id)}`
        );

    await sock.sendMessage(
      jid,
      {
        text:
          `👑 GROUP ADMINS\n\n${admins.join(
            "\n"
          )}`,
        mentions:
          metadata.participants
            .filter(
              p => !!p.admin
            )
            .map(
              p => p.id
            )
      },
      {
        quoted
      }
    );

    return;
  }

  if (
    command === "members"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const metadata =
      await groupMetadata(
        jid
      );

    if (!metadata) {
      return;
    }

    let text =
      `👥 GROUP MEMBERS\n\n`;

    metadata.participants
      .forEach(
        (p, index) => {
          text +=
            `${index + 1}. @${senderNumber(
              p.id
            )}${
              p.admin
                ? " 👑"
                : ""
            }\n`;
        }
      );

    await sock.sendMessage(
      jid,
      {
        text,
        mentions:
          metadata.participants.map(
            p => p.id
          )
      },
      {
        quoted
      }
    );

    return;
  }

  if (
    command === "tagall" ||
    command === "everyone"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    const metadata =
      await groupMetadata(
        jid
      );

    if (!metadata) {
      return;
    }

    const members =
      metadata.participants
        .map(
          p => p.id
        );

    const message =
      argText ||
      "📢 Everyone attention please!";

    let text =
      `${message}\n\n`;

    members.forEach(
      user => {
        text +=
          `@${senderNumber(
            user
          )} `;
      }
    );

    await sock.sendMessage(
      jid,
      {
        text,
        mentions:
          members
      },
      {
        quoted
      }
    );

    return;
  }

  if (
    command === "hidetag"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    const metadata =
      await groupMetadata(
        jid
      );

    if (!metadata) {
      return;
    }

    const members =
      metadata.participants
        .map(
          p => p.id
        );

    await sock.sendMessage(
      jid,
      {
        text:
          argText ||
          "📢 Group notification!",
        mentions:
          members
      },
      {
        quoted
      }
    );

    return;
  }

  if (
    command === "kick"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    const target =
      getTarget(
        msg.message,
        args
      );

    if (!target) {
      await reply(
        jid,
        `❌ একজন user mention/reply করো।\nExample: ${PREFIX}kick @user`,
        quoted
      );
      return;
    }

    if (
      target ===
      sock.user.id
    ) {
      await reply(
        jid,
        "❌ আমি নিজেকে kick করতে পারি না।",
        quoted
      );
      return;
    }
        const targetAdmin =
      await isAdmin(
        jid,
        target
      );

    if (
      targetAdmin &&
      !isOwner(sender)
    ) {
      await reply(
        jid,
        "❌ অন্য একজন admin-কে remove করার অনুমতি নেই।",
        quoted
      );
      return;
    }

    try {
      await sock.groupParticipantsUpdate(
        jid,
        [target],
        "remove"
      );

      await reply(
        jid,
        `✅ @${senderNumber(
          target
        )} removed.`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ User remove করা যায়নি।",
        quoted
      );
    }

    return;
  }

  if (
    command === "add"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    const target =
      jidFromNumber(
        args[0]
      );

    if (!target) {
      await reply(
        jid,
        `❌ Example:\n${PREFIX}add 919876543210`,
        quoted
      );
      return;
    }

    try {
      await sock.groupParticipantsUpdate(
        jid,
        [target],
        "add"
      );

      await reply(
        jid,
        `✅ Add request sent for @${senderNumber(
          target
        )}.`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ User add করা যায়নি। WhatsApp-এর group privacy/settings-এর কারণে হতে পারে।",
        quoted
      );
    }

    return;
  }

  if (
    command === "promote" ||
    command === "demote"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    const target =
      getTarget(
        msg.message,
        args
      );

    if (!target) {
      await reply(
        jid,
        `❌ User mention/reply করো।`,
        quoted
      );
      return;
    }

    if (
      target ===
      sock.user.id
    ) {
      await reply(
        jid,
        "❌ আমাকে এইভাবে পরিবর্তন করার দরকার নেই।",
        quoted
      );
      return;
    }

    try {
      await sock.groupParticipantsUpdate(
        jid,
        [target],
        command ===
          "promote"
          ? "promote"
          : "demote"
      );

      await reply(
        jid,
        command ===
          "promote"
          ? `👑 @${senderNumber(
              target
            )} promoted.`
          : `⬇️ @${senderNumber(
              target
            )} demoted.`,
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Group role update করা যায়নি।",
        quoted
      );
    }

    return;
  }

  if (
    command === "open" ||
    command === "close"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    try {
      await sock.groupSettingUpdate(
        jid,
        command ===
          "close"
          ? "announcement"
          : "not_announcement"
      );

      await reply(
        jid,
        command ===
          "close"
          ? "🔒 Group closed. শুধু admins message করতে পারবে।"
          : "🔓 Group opened. সবাই message করতে পারবে।",
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Group setting update করা যায়নি।",
        quoted
      );
    }

    return;
  }

  if (
    command === "setname"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    if (!argText) {
      await reply(
        jid,
        `❌ Example:\n${PREFIX}setname BK BABU FAMILY`,
        quoted
      );
      return;
    }

    try {
      await sock.groupUpdateSubject(
        jid,
        argText
      );

      await reply(
        jid,
        "✅ Group name updated.",
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Group name update করা যায়নি।",
        quoted
      );
    }

    return;
  }

  if (
    command === "setdesc"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই কমান্ড শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    if (!argText) {
      await reply(
        jid,
        `❌ Example:\n${PREFIX}setdesc Welcome to BK BABU`,
        quoted
      );
      return;
    }

    try {
      await sock.groupUpdateDescription(
        jid,
        argText
      );

      await reply(
        jid,
        "✅ Group description updated.",
        quoted
      );
    } catch {
      await reply(
        jid,
        "❌ Group description update করা যায়নি।",
        quoted
      );
    }

    return;
  }

  if (
    command === "welcome" ||
    command === "goodbye" ||
    command === "autoread" ||
    command === "autoreact" ||
    command === "antilink" ||
    command === "antimention" ||
    command === "antispam" ||
    command === "antiflood" ||
    command === "antibadword" ||
    command === "antisticker"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই setting শুধু গ্রুপে ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    let value;

if (!args[0]) {
  value = true;
} else {
  value = parseOnOff(args[0]);
}

if (value === null) {
  await reply(
    jid,
    `⚙️ ব্যবহার:\n${PREFIX}${command}\nঅথবা\n${PREFIX}${command} off`,
    quoted
  );
  return;
}

    groupSettings[
      command
    ] = value;

    saveSettings();

    await reply(
      jid,
      `✅ ${command} ${
        value
          ? "enabled 🟢"
          : "disabled 🔴"
      }`,
      quoted
    );

    return;
  }

  if (
    command === "setwelcome" ||
    command === "setgoodbye"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই command শুধু group-এ ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    if (!argText) {
      await reply(
        jid,
        `❌ Example:\n${PREFIX}${command} Welcome @user 👋`,
        quoted
      );
      return;
    }

    if (
      command ===
      "setwelcome"
    ) {
      groupSettings.welcomeText =
        argText;
    } else {
      groupSettings.goodbyeText =
        argText;
    }

    saveSettings();

    await reply(
      jid,
      "✅ Message saved.",
      quoted
    );

    return;
  }

  if (
    command === "warn"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই command শুধু group-এ ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    const target =
      getTarget(
        msg.message,
        args
      );

    if (!target) {
      await reply(
        jid,
        `⚠️ Example:\n${PREFIX}warn @user`,
        quoted
      );
      return;
    }

    if (
      await isAdmin(
        jid,
        target
      )
    ) {
      await reply(
        jid,
        "❌ Admin-কে warning দেওয়া যাবে না।",
        quoted
      );
      return;
    }

    const count =
      addWarning(
        jid,
        target
      );

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ @${senderNumber(
            target
          )} warned.\n\n📊 Warnings: ${count}/3`,
        mentions: [
          target
        ]
      },
      {
        quoted
      }
    );

    if (
      count >= 3
    ) {
      resetWarning(
        jid,
        target
      );

      try {
        await sock.groupParticipantsUpdate(
          jid,
          [target],
          "remove"
        );

        await reply(
          jid,
          `🚫 @${senderNumber(
            target
          )} reached 3 warnings and was removed.`,
          quoted
        );
      } catch {
        await reply(
          jid,
          "⚠️ 3 warnings পূর্ণ হয়েছে, কিন্তু user remove করা যায়নি।",
          quoted
        );
      }
    }

    return;
    }
    if (
    command === "warnings" ||
    command === "warns"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই command শুধু group-এ ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const target =
      getTarget(
        msg.message,
        args
      ) || sender;

    const count =
      getWarnings(
        jid,
        target
      );

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ @${senderNumber(
            target
          )} has ${count}/3 warnings.`,
        mentions: [
          target
        ]
      },
      {
        quoted
      }
    );

    return;
  }

  if (
    command === "resetwarn" ||
    command === "resetwarnings"
  ) {
    if (!group) {
      await reply(
        jid,
        "❌ এই command শুধু group-এ ব্যবহার করা যাবে।",
        quoted
      );
      return;
    }

    const allowed =
      await safeGroupAdmin(
        jid,
        sender,
        jid,
        quoted
      );

    if (!allowed) {
      return;
    }

    const target =
      getTarget(
        msg.message,
        args
      );

    if (!target) {
      await reply(
        jid,
        `❌ User mention/reply করো।`,
        quoted
      );
      return;
    }

    resetWarning(
      jid,
      target
    );

    await reply(
      jid,
      `✅ @${senderNumber(
        target
      )} warnings reset.`,
      quoted
    );

    return;
  }

  if (
    command === "block"
  ) {
    if (!isOwner(sender)) {
      await reply(
        jid,
        "❌ Owner only command.",
        quoted
      );
      return;
    }

    const target =
      getTarget(
        msg.message,
        args
      );

    if (!target) {
      await reply(
        jid,
        `❌ Example:\n${PREFIX}block @user`,
        quoted
      );
      return;
    }

    if (
      target ===
      `${OWNER_NUMBER}@s.whatsapp.net`
    ) {
      await reply(
        jid,
        "❌ Owner-কে block করা যাবে না।",
        quoted
      );
      return;
    }

    blocked.add(
      target
    );

    saveBlocked();

    await reply(
      jid,
      `🚫 @${senderNumber(
        target
      )} blocked from bot commands.`,
      quoted
    );

    return;
  }

  if (
    command === "unblock"
  ) {
    if (!isOwner(sender)) {
      await reply(
        jid,
        "❌ Owner only command.",
        quoted
      );
      return;
    }

    const target =
      getTarget(
        msg.message,
        args
      );

    if (!target) {
      await reply(
        jid,
        `❌ Example:\n${PREFIX}unblock @user`,
        quoted
      );
      return;
    }

    blocked.delete(
      target
    );

    saveBlocked();

    await reply(
      jid,
      `✅ @${senderNumber(
        target
      )} unblocked.`,
      quoted
    );

    return;
  }

  if (
    command === "botoff"
  ) {
    if (!isOwner(sender)) {
      await reply(
        jid,
        "❌ Owner only command.",
        quoted
      );
      return;
    }

    botOnline = false;

    await reply(
      jid,
      "⏸️ Bot command processing temporarily disabled.",
      quoted
    );

    return;
  }

  if (
    command === "boton"
  ) {
    if (!isOwner(sender)) {
      await reply(
        jid,
        "❌ Owner only command.",
        quoted
      );
      return;
    }

    botOnline = true;

    await reply(
      jid,
      "▶️ Bot command processing enabled.",
      quoted
    );

    return;
  }

  if (
    command === "restart"
  ) {
    if (!isOwner(sender)) {
      await reply(
        jid,
        "❌ Owner only command.",
        quoted
      );
      return;
    }

    await reply(
      jid,
      "♻️ Restarting bot...",
      quoted
    );

    setTimeout(
      () => {
        process.exit(0);
      },
      1000
    );

    return;
  }
      }
async function handleGroupProtection(
  msg,
  jid,
  sender,
  text
) {
  if (!isGroup(jid)) {
    return false;
  }

  const cfg =
    getSettings(jid);

  const message =
    msg.message || {};

  const messageType =
    Object.keys(message)[0] ||
    "";

  const mentions =
    mentionedUsers(
      message
    );

  /*
   * Admin এবং Owner-কে automatic protection
   * থেকে বাদ দেওয়া হচ্ছে।
   */
  let senderAdmin =
    isOwner(sender);

  if (!senderAdmin) {
    senderAdmin =
      await isAdmin(
        jid,
        sender
      );
  }

  if (
    senderAdmin
  ) {
    return false;
  }

  /*
 * Anti-link
 */
if (
  cfg.antilink &&
  containsLink(text)
) {

  // Bot must be a group admin
  if (!(await botIsAdmin(jid))) {
    return false;
  }

  // Delete the link message
  try {
    await sock.sendMessage(
      jid,
      {
        delete: msg.key
      }
    );
  } catch {}

  // Remove the person who sent the link
  try {
    await sock.groupParticipantsUpdate(
      jid,
      [sender],
      "remove"
    );

    await sock.sendMessage(
      jid,
      {
        text:
          `🚫 @${senderNumber(sender)} removed.\n🔗 Link sending is not allowed in this group.`,
        mentions: [
          sender
        ]
      }
    );

  } catch (error) {

    console.error(
      "❌ Anti-link remove error:",
      error?.message || error
    );

    await sock.sendMessage(
      jid,
      {
        text:
          `⚠️ @${senderNumber(sender)} link detected, but I couldn't remove the user.`,
        mentions: [
          sender
        ]
      }
    );
  }

  return true;
}

    /*
   * Anti-Status-Mention
   * WhatsApp Story/Status থেকে Group Mention আটকাবে।
   * Normal @number mention আটকাবে না।
   */
  if (
    cfg.antimention &&
    message.groupStatusMentionMessage
  ) {

    // Bot must be Group Admin
    if (!(await botIsAdmin(jid))) {
      return false;
    }

    // Story/Status mention message delete
    try {
      await sock.sendMessage(
        jid,
        {
          delete: msg.key
        }
      );
    } catch {}

    // Warning — sender remove করা হবে না
    try {
      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ @${senderNumber(sender)}\n` +
            `স্ট্যাটাস/স্টোরি মেনশন করা এই গ্রুপে অনুমোদিত নয়।\n\n` +
            `🚫 নেক্সট টাইম বোকাচোদা, কোনো মেনশন দিলে সরাসরি রিমুভ করে দেব। 😡`,
          mentions: [
            sender
          ]
        }
      );
    } catch {}

    return true;
  }

    /*
   * Anti-sticker
   * Normal sticker message block করবে।
   */
  if (
    cfg.antisticker &&
    message.stickerMessage
  ) {

    // Bot must be Group Admin
    if (!(await botIsAdmin(jid))) {
      return false;
    }

    // Delete sticker
    try {
      await sock.sendMessage(
        jid,
        {
          delete: msg.key
        }
      );
    } catch (error) {
      console.error(
        "❌ Anti-sticker delete error:",
        error?.message || error
      );
    }

    // Warning
    try {
      await sock.sendMessage(
        jid,
        {
          text:
            `⚠️ @${senderNumber(sender)}\n` +
            `এই গ্রুপে Sticker পাঠানো নিষিদ্ধ।\n\n` +
            `🚫 নেক্সট টাইম Sticker পাঠালে রিমুভ করে দেব।`,
          mentions: [
            sender
          ]
        }
      );
    } catch {}

    return true;
  }

  /*
   * Anti-badword
   */
  if (
    cfg.antibadword &&
    containsBadWord(
      text,
      cfg.badwords
    )
  ) {
    try {
      await sock.sendMessage(
        jid,
        {
          delete:
            msg.key
        }
      );
    } catch {}

    const count =
      addWarning(
        jid,
        sender
      );

    await reply(
      jid,
      `⚠️ Bad-word detected.\n@${senderNumber(
        sender
      )} warning: ${count}/3`,
      null
    );

    if (
      count >= 3 &&
      await botIsAdmin(jid)
    ) {
      try {
        await sock.groupParticipantsUpdate(
          jid,
          [sender],
          "remove"
        );

        resetWarning(
          jid,
          sender
        );
      } catch {}
    }

    return true;
  }

  /*
   * Anti-flood
   */
  if (
    cfg.antiflood
  ) {
    const key =
      `${jid}:${sender}`;

    const now =
      Date.now();

    const list =
      floodMap.get(key) ||
      [];

    const recent =
      list.filter(
        time =>
          now - time <
          10000
      );

    recent.push(now);

    floodMap.set(
      key,
      recent
    );

    if (
      recent.length >= 6
    ) {
      floodMap.set(
        key,
        []
      );

      try {
        await sock.sendMessage(
          jid,
          {
            delete:
              msg.key
          }
        );
      } catch {}

      await reply(
        jid,
        `🌊 @${senderNumber(
          sender
        )} flood detected.`,
        null
      );

      return true;
    }
  }

  /*
   * Anti-spam
   */
  if (
    cfg.antispam &&
    text
  ) {
    const key =
      `${jid}:${sender}`;

    const now =
      Date.now();

    const previous =
      spamMap.get(key);

    if (
      previous &&
      previous.text === text &&
      now - previous.time <
        5000
    ) {
      try {
        await sock.sendMessage(
          jid,
          {
            delete:
              msg.key
          }
        );
      } catch {}

      await reply(
        jid,
        `🚫 @${senderNumber(
          sender
        )} spam detected.`,
        null
      );

      return true;
    }

    spamMap.set(
      key,
      {
        text,
        time: now
      }
    );
  }

  return false;
    }
async function handleSticker(
  msg,
  jid,
  quoted
) {
  const message =
    msg.message || {};

  const image =
    message.imageMessage ||
    message.videoMessage;

  if (!image) {
    await reply(
      jid,
      `🖼️ Image/video দিয়ে reply করে:\n${PREFIX}sticker`,
      quoted
    );
    return;
  }

  try {
    const buffer =
      await downloadMediaMessage(
        msg,
        "buffer",
        {},
        {
          logger:
            P({
              level:
                "silent"
            })
        }
      );

    const sticker =
      new Sticker(
        buffer,
        {
          pack:
            BOT_NAME,
          author:
            OWNER_NAME,
          type:
            StickerTypes.FULL,
          quality:
            70
        }
      );

    const stickerBuffer =
      await sticker.toBuffer();

    await sock.sendMessage(
      jid,
      {
        sticker:
          stickerBuffer
      },
      {
        quoted
      }
    );
  } catch {
    await reply(
      jid,
      "❌ Sticker তৈরি করা যায়নি।",
      quoted
    );
  }
}

function replaceUser(
  template,
  jid
) {
  return String(
    template || ""
  ).replace(
    /@user/gi,
    `@${senderNumber(
      jid
    )}`
  );
}

async function sendWelcome(
  groupJid,
  userJid
) {
  const cfg =
    getSettings(
      groupJid
    );

  if (
    !cfg.welcome
  ) {
    return;
  }

  let groupName =
    "Our Group";

  try {
    const metadata =
      await groupMetadata(
        groupJid
      );

    groupName =
      metadata?.subject ||
      "Our Group";
  } catch {}

  const text =
    `╭━━━〔 🎉✨ WELCOME ✨🎉 〕━━━╮\n\n` +
    `🏠 Group: *${groupName}*\n\n` +
    `👋 Welcome @${senderNumber(userJid)} 💐\n` +
    `🥳 আমাদের ছোট্ট পরিবারে তোমাকে স্বাগতম! ❤️\n\n` +
    `🌸 আশা করি সবার সাথে সুন্দরভাবে সময় কাটাবে।\n` +
    `🤝 সবাইকে সম্মান করবে এবং সুন্দর পরিবেশ বজায় রাখবে। 🫶\n\n` +
    `📜 ━━━ গ্রুপে থাকার আগে ━━━ 📜\n\n` +
    `👀 আমাদের Group Bio-টা আগে ভালো করে পড়ে নাও।\n` +
    `📖 গ্রুপের নিয়ম-কানুন জেনে ও মেনে তারপর আমাদের সাথে থেকো। 🤍\n\n` +
    `🚫 নিয়ম ভঙ্গ করে গ্রুপের পরিবেশ নষ্ট করো না।\n` +
    `💖 সবাই মিলে গ্রুপটাকে সুন্দর রাখি। 🌸\n\n` +
    `✨ আবারও তোমাকে আমাদের গ্রুপে স্বাগতম! 🥰\n` +
    `🎊 Enjoy & Stay With Us! 🎊\n\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━╯`;

  try {
    await sock.sendMessage(
      groupJid,
      {
        text,
        mentions: [
          userJid
        ]
      }
    );
  } catch (error) {
    console.error(
      "❌ Welcome message error:",
      error?.message ||
        error
    );
  }
}

async function sendGoodbye(
  groupJid,
  userJid
) {
  const cfg =
    getSettings(
      groupJid
    );

  if (
    !cfg.goodbye
  ) {
    return;
  }

  let groupName =
    "Our Group";

  try {
    const metadata =
      await groupMetadata(
        groupJid
      );

    groupName =
      metadata?.subject ||
      "Our Group";
  } catch {}

  const text =
    `╭━━━〔 👋💔 GOODBYE 💔👋 〕━━━╮\n\n` +
    `🏠 গ্রুপ: *${groupName}*\n\n` +
    `👤 @${senderNumber(userJid)}\n\n` +
    `😈 মাদারচোদ, তুই কোথা থেকে এসেছিলি?\n` +
    `আবার ওইখানেই চলে গেলি! 😂🚪\n\n` +
    `💨 যাই হোক, ভালো থাকিস।\n` +
    `👋 আবার দেখা হবে কিনা জানি না! 😎\n\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━╯`;

  try {
    await sock.sendMessage(
      groupJid,
      {
        text,
        mentions: [
          userJid
        ]
      }
    );
  } catch (error) {
    console.error(
      "❌ Goodbye message error:",
      error?.message ||
        error
    );
  }
}

async function handleParticipantsUpdate(
  update
) {
  if (
    !update ||
    !update.id
  ) {
    return;
  }

  const action =
    update.action;

  const participants =
    update.participants ||
    [];

  for (
  const participant of participants
) {
  const user =
    typeof participant === "string"
      ? participant
      : (
          participant?.phoneNumber ||
          participant?.id ||
          participant?.lid ||
          ""
        );

  if (!user) {
    continue;
  }

  if (
    action ===
    "add"
  ) {
    await sendWelcome(
      update.id,
      user
    );
  }

  if (
    action ===
      "remove" ||
    action ===
      "leave"
  ) {
    await sendGoodbye(
      update.id,
      user
    );
  }
  }
}
async function handleMessage(
  msg
) {
  if (!msg) {
    return;
  }

  const jid =
    msg.key?.remoteJid;

  if (!jid) {
    return;
  }

  if (
    isStatus(jid)
  ) {
    return;
  }

  if (
    msg.key?.fromMe &&
    !msg.message
  ) {
    return;
  }

  const message =
    msg.message || {};

  const sender =
    msg.key?.participant ||
    msg.participant ||
    jid;

  const text =
    getText(
      message
    );

  const cfg =
    isGroup(jid)
      ? getSettings(jid)
      : null;

  if (
    cfg?.autoread &&
    msg.key
  ) {
    try {
      await sock.readMessages(
        [msg.key]
      );
    } catch {}
  }

  if (
    cfg?.autoreact &&
    msg.key &&
    text &&
    !text.startsWith(
      PREFIX
    )
  ) {
    const emojis = [
      "❤️",
      "👍",
      "🔥",
      "✨",
      "😂",
      "💯"
    ];

    const emoji =
      emojis[
        Math.floor(
          Math.random() *
            emojis.length
        )
      ];

    await react(
      jid,
      msg.key,
      emoji
    );
  }

  if (
    isGroup(jid)
  ) {
    const blockedByProtection =
      await handleGroupProtection(
        msg,
        jid,
        sender,
        text
      );

    if (
      blockedByProtection
    ) {
      return;
    }
  }

  if (
    text.startsWith(
      `${PREFIX}sticker`
    ) ||
    text.startsWith(
      `${PREFIX}s `
    )
  ) {
    await handleSticker(
      msg,
      jid,
      message
    );

    return;
  }

  if (
    text.startsWith(
      PREFIX
    )
  ) {
    await commandHandler(
      msg,
      jid,
      sender,
      text
    );
  }
}

async function startBot() {
  if (
    starting
  ) {
    return;
  }

  starting = true;

  try {
    fs.mkdirSync(
      AUTH_DIR,
      {
        recursive: true
      }
    );

    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        AUTH_DIR
      );

    authState = {
      state,
      saveCreds
    };

     const {
  version
} = await fetchLatestWaWebVersion();

sock =
  makeWASocket({
    version,
    auth: state,
    logger:
      P({
        level:
          "silent"
      }),
        browser:
      Browsers.ubuntu(
        "Chrome"
      ),
    printQRInTerminal:
      false,
    markOnlineOnConnect:
      true,
    syncFullHistory:
      false,
    generateHighQualityLinkPreview:
      false
  });  
    sock.ev.on(
      "creds.update",
      saveCreds
    );

    sock.ev.on(
  "messages.upsert",
  async ({
    messages,
    type
  }) => {

    console.log(
      `📩 messages.upsert | type=${type} | count=${messages?.length || 0}`
    );

    if (
      type !== "notify"
    ) {
      return;
    }

    for (
      const message of messages || []
    ) {

      try {

        const jid =
          message?.key?.remoteJid || "";

        const fromMe =
          message?.key?.fromMe || false;

        const text =
          getText(
            message?.message || {}
          );

        console.log(
          `📨 Incoming | jid=${jid} | fromMe=${fromMe} | text="${text}"`
        );

        if (!jid) {
          continue;
        }

        await handleMessage(
          message
        );

      } catch (
        error
      ) {

        console.error(
          "❌ Message handler error:",
          error?.message ||
            error
        );

      }
    }
  }
);
    sock.ev.on(
      "group-participants.update",
      async update => {
        try {
          await handleParticipantsUpdate(
            update
          );
        } catch (
          error
        ) {
          console.error(
            "Participant update error:",
            error?.message ||
              error
          );
        }
      }
    );

    sock.ev.on(
  "connection.update",
  async update => {

    const {
      connection,
      lastDisconnect
    } = update;

    console.log(
      "🔌 WhatsApp connection update:",
      connection || "no connection state"
    );

    if (
      connection ===
      "open"
    ) {

      botOnline =
        true;

      starting =
        false;

      lastConnectionError =
        "";

      pairingBusy =
        false;

      console.log(
        `${BOT_NAME} connected successfully.`
      );

      return;
    }

    if (
      connection ===
      "close"
    ) {

      botOnline =
        false;

      starting =
        false;

      const statusCode =
        lastDisconnect
          ?.error
          ?.output
          ?.statusCode;

      lastConnectionError =
        String(
          statusCode ||
            "connection closed"
        );

      console.log(
        `${BOT_NAME} connection closed: ${lastConnectionError}`
      );

      if (
        statusCode ===
        DisconnectReason.loggedOut
      ) {

        console.log(
          "WhatsApp session logged out. Resetting auth session for new pairing."
        );

        try {

          sock =
            null;

          authState =
            null;

          pairingBusy =
            false;

          pairingCode =
            null;

          pairingNumber =
            null;

          if (
            fs.existsSync(
              AUTH_DIR
            )
          ) {

            fs.rmSync(
              AUTH_DIR,
              {
                recursive:
                  true,
                force:
                  true
              }
            );

          }

          console.log(
            "Old WhatsApp auth session deleted."
          );

        } catch (
          resetError
        ) {

          console.error(
            "Auth reset error:",
            resetError?.message ||
              resetError
          );

        }

        await sleep(
          2000
        );

        startBot();

        return;
      }

      await sleep(
        5000
      );

      startBot();
    }
  }
);
  } catch (
    error
  ) {
    starting =
      false;

    botOnline =
      false;

    lastConnectionError =
      error?.message ||
      "Startup failed";

    console.error(
      "Bot startup error:",
      error
    );

    setTimeout(
      startBot,
      10000
    );
  }
}function pageHtml() {
  const code = pairingCode || "WAITING";
  const number = pairingNumber || "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${BOT_NAME} • Pairing</title>

  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background:
        radial-gradient(circle at top, #18233d, #070b14 55%, #03050a);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .card {
      width: 100%;
      max-width: 460px;
      padding: 28px;
      border-radius: 24px;
      background: rgba(15, 22, 38, .92);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 25px 80px rgba(0,0,0,.55);
      text-align: center;
    }

    .logo {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid rgba(255,255,255,.15);
      margin-bottom: 15px;
    }

    h1 {
      font-size: 30px;
      margin-bottom: 8px;
    }

    .sub {
      color: #aab4c7;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 24px;
    }

    label {
      display: block;
      text-align: left;
      font-size: 13px;
      color: #b8c1d1;
      margin-bottom: 8px;
    }

    input {
      width: 100%;
      padding: 15px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.12);
      outline: none;
      background: #0b1220;
      color: #fff;
      font-size: 16px;
      margin-bottom: 14px;
    }

    input:focus {
      border-color: #4f8cff;
    }

    button {
      width: 100%;
      padding: 15px;
      border: 0;
      border-radius: 14px;
      background: linear-gradient(135deg,#4f8cff,#7b4dff);
      color: white;
      font-weight: bold;
      font-size: 16px;
      cursor: pointer;
    }

    button:disabled {
      opacity: .55;
      cursor: not-allowed;
    }

    .codeBox {
      margin-top: 22px;
      padding: 20px;
      border-radius: 18px;
      background: #090f1b;
      border: 1px solid rgba(255,255,255,.10);
    }

    .code {
      font-size: 30px;
      font-weight: 800;
      letter-spacing: 5px;
      margin: 12px 0;
      word-break: break-all;
    }

    .copy {
      background: #202c44;
      margin-top: 8px;
    }

    .status {
      margin-top: 18px;
      font-size: 13px;
      color: #9eabc0;
      min-height: 20px;
    }

    .footer {
      margin-top: 22px;
      font-size: 11px;
      color: #68748a;
    }
  </style>
</head>

<body>

  <div class="card">

    <img
      class="logo"
      src="${MENU_IMG}"
      onerror="this.style.display='none'"
    >

    <h1>${BOT_NAME}</h1>

    <div class="sub">
      WhatsApp Pairing Panel<br>
      Enter your WhatsApp number with country code.
    </div>

    <label for="number">
      WhatsApp Number
    </label>

    <input
      id="number"
      type="tel"
      placeholder="919876543210"
      autocomplete="off"
    >

    <button id="pairBtn" onclick="pair()">
      GET PAIRING CODE
    </button>

    <div class="codeBox">

      <div style="font-size:12px;color:#8e9ab0">
        PAIRING CODE
      </div>

      <div id="code" class="code">
        ${code}
      </div>

      <button class="copy" onclick="copyCode()">
        COPY CODE
      </button>

    </div>

    <div id="status" class="status">
      ${number ? "Pairing session active." : "Ready for pairing."}
    </div>

    <div class="footer">
      ${BOT_NAME} • ${OWNER_NAME}
    </div>

  </div>

<script>

async function pair() {

  const input =
    document.getElementById("number");

  const button =
    document.getElementById("pairBtn");

  const status =
    document.getElementById("status");

  const code =
    document.getElementById("code");

  const number =
    input.value.trim();

  if (!number) {
    status.textContent =
      "Enter your WhatsApp number first.";
    return;
  }

  button.disabled = true;
  button.textContent = "GENERATING...";
  status.textContent =
    "Requesting pairing code...";

  try {

    const response =
      await fetch("/api/pair", {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          number: number
        })
      });

    const data =
      await response.json();

    if (data.success) {

      code.textContent =
        data.code || "WAITING";

      status.textContent =
        data.message ||
        "Pairing code generated.";

    } else {

      status.textContent =
        data.error ||
        "Unable to generate pairing code.";

    }

  } catch (error) {

    status.textContent =
      "Server connection failed.";

  }

  button.disabled = false;
  button.textContent =
    "GET PAIRING CODE";
}


async function copyCode() {

  const code =
    document
      .getElementById("code")
      .textContent
      .trim();

  if (
    !code ||
    code === "WAITING"
  ) {
    return;
  }

  try {

    await navigator.clipboard
      .writeText(code);

    document
      .getElementById("status")
      .textContent =
        "Pairing code copied.";

  } catch (error) {

    document
      .getElementById("status")
      .textContent =
        "Copy failed. Copy it manually.";

  }
}


async function updateStatus() {

  try {

    const response =
      await fetch(
        "/api/pair/status"
      );

    const data =
      await response.json();

    if (data.code) {

      document
        .getElementById("code")
        .textContent =
          data.code;

    }

    if (data.message) {

      document
        .getElementById("status")
        .textContent =
          data.message;

    }

  } catch (error) {}

}


setInterval(
  updateStatus,
  3000
);

</script>

</body>
</html>
`;
}


app.get("/", (req, res) => {

  res.status(200).send(
    pageHtml()
  );

});


app.get("/health", (req, res) => {

  res.status(200).json({

    success: true,

    bot: BOT_NAME,

    online: botOnline,

    pairing:
      Boolean(pairingBusy),

    uptime:
      Math.floor(
        process.uptime()
      ),

    timestamp:
      new Date().toISOString()

  });

});


app.get("/status", (req, res) => {

  res.status(200).json({

    bot: BOT_NAME,

    owner: OWNER_NAME,

    online: botOnline,

    pairingBusy,

    pairingNumber,

    pairingCode,

    uptime:
      formatDuration(
        Math.floor(
          process.uptime()
        )
      ),

    error:
      lastConnectionError ||
      null

  });

});


app.get(
  "/api/pair/status",
  (req, res) => {

    res.status(200).json({

      success: true,

      online: botOnline,

      busy: pairingBusy,

      number:
        pairingNumber,

      code:
        pairingCode,

      message:
        pairingBusy
          ? "Generating pairing code..."
          : pairingCode
            ? "Pairing code ready."
            : "Ready for pairing."

    });

  }
);
// ------------------------------------------------------------
// PAIRING API
// ------------------------------------------------------------

app.post("/api/pair", async (req, res) => {

  if (pairingBusy) {

    return res.status(429).json({

      success: false,

      error:
        "A pairing request is already running. Please wait."

    });

  }

  if (!sock) {

    return res.status(503).json({

      success: false,

      error:
        "WhatsApp connection is not ready yet."

    });

  }

  let number =
    cleanNumber(
      req.body &&
      req.body.number
    );

  if (!number) {

    return res.status(400).json({

      success: false,

      error:
        "Enter a valid WhatsApp number."

    });

  }

  if (
    number.length < 8 ||
    number.length > 15
  ) {

    return res.status(400).json({

      success: false,

      error:
        "Invalid phone number length."

    });

  }

  pairingBusy = true;
  pairingNumber = number;
  pairingCode = "";

  try {

    if (
      authState?.state?.creds?.registered
    ) {

      pairingBusy = false;

      return res.status(409).json({

        success: false,

        error:
          "This WhatsApp session is already registered. Unlink the linked device before requesting a new pairing code."

      });

    }

    const rawCode =
      await sock.requestPairingCode(
        number
      );

    pairingCode =
      String(rawCode || "")
        .replace(
          /(.{4})/g,
          "$1-"
        )
        .replace(
          /-$/,
          ""
        );

    pairingBusy = false;

    return res.status(200).json({

      success: true,

      code: pairingCode,

      number: pairingNumber,

      message:
        "Pairing code generated. Enter it in WhatsApp Linked Devices."

    });

  } catch (error) {

    pairingBusy = false;

    lastConnectionError =
      error &&
      error.message
        ? error.message
        : String(error);

    return res.status(500).json({

      success: false,

      error:
        lastConnectionError

    });

  }

});


// ------------------------------------------------------------
// 404
// ------------------------------------------------------------

app.use((req, res) => {

  res.status(404).json({

    success: false,

    error: "Route not found."

  });

});


// ------------------------------------------------------------
// EXPRESS ERROR HANDLER
// ------------------------------------------------------------

app.use((err, req, res, next) => {

  console.error(
    "WEB ERROR:",
    err
  );

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({

    success: false,

    error:
      "Internal server error."

  });

});


// ------------------------------------------------------------
// PROCESS ERROR HANDLERS
// ------------------------------------------------------------

process.on(
  "uncaughtException",
  (error) => {

    console.error(
      "UNCAUGHT EXCEPTION:",
      error
    );

  }
);


process.on(
  "unhandledRejection",
  (error) => {

    console.error(
      "UNHANDLED REJECTION:",
      error
    );

  }
);


// ------------------------------------------------------------
// START WEB SERVER
// ------------------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 ${BOT_NAME} website running on port ${PORT}`
    );

    console.log(
      `🔗 Pairing panel: http://0.0.0.0:${PORT}`
    );

  }
);


// ------------------------------------------------------------
// START WHATSAPP BOT
// ------------------------------------------------------------

startBot()
  .then(() => {

    console.log(
      `🚀 ${BOT_NAME} startup complete`
    );

  })
  .catch((error) => {

    console.error(
      "BOT START ERROR:",
      error
    );

  });


// ============================================================
// END OF BK-BABU BOT
// ============================================================
