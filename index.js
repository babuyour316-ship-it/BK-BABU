const express = require("express");
const fs = require("fs");
const path = require("path");
const P = require("pino");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestWaWebVersion
} = require("@whiskeysockets/baileys");

const ytSearch = require("yt-search");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 9090;
const PREFIX = process.env.PREFIX || ".";
const BOT_NAME = process.env.BOT_NAME || "BK-BABU";
const OWNER_NAME = process.env.OWNER_NAME || "BK BABU";

const OWNER_NUMBER = String(
  process.env.OWNER_NUMBER || ""
).replace(/\D/g, "");

const MENU_IMG =
  process.env.MENU_IMG ||
  "https://raw.githubusercontent.com/babuyour316-ship-it/BK-BABU/main/1790162918643.png";

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

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, {
    recursive: true
  });
}

let settings = {};

if (fs.existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(
      fs.readFileSync(
        SETTINGS_FILE,
        "utf8"
      )
    );
  } catch {
    settings = {};
  }
}

function saveSettings() {
  fs.writeFileSync(
    SETTINGS_FILE,
    JSON.stringify(
      settings,
      null,
      2
    )
  );
}

function getSettings(jid) {
  if (!settings[jid]) {
    settings[jid] = {
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
      warnings: {}
    };

    saveSettings();
  }

  return settings[jid];
}

let sock = null;
let starting = false;
let pairBusy = false;
let botOnline = false;

const floodMap = new Map();
const spamMap = new Map();
const blockedUsers = new Set();

function cleanNumber(number) {
  return String(number || "")
    .replace(/\D/g, "");
}

function jidFromNumber(number) {
  const n = cleanNumber(number);

  if (!n) {
    return null;
  }

  return `${n}@s.whatsapp.net`;
}

function senderNumber(jid) {
  return String(jid || "")
    .split("@")[0]
    .split(":")[0];
}

function isOwner(jid) {
  return (
    senderNumber(jid) ===
    OWNER_NUMBER
  );
}

function isGroup(jid) {
  return String(jid || "")
    .endsWith("@g.us");
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
    ""
  ).trim();
}

function mentionedUsers(message) {
  return (
    message?.extendedTextMessage
      ?.contextInfo
      ?.mentionedJid ||
    message?.contextInfo
      ?.mentionedJid ||
    []
  );
}

function getQuoted(message) {
  return (
    message?.extendedTextMessage
      ?.contextInfo
      ?.quotedMessage ||
    null
  );
}

function getTarget(message, args) {
  const mentions =
    mentionedUsers(message);

  if (mentions.length) {
    return mentions[0];
  }

  const quoted =
    message?.extendedTextMessage
      ?.contextInfo
      ?.participant;

  if (quoted) {
    return quoted;
  }

  const num =
    cleanNumber(args[0]);

  if (num) {
    return jidFromNumber(num);
  }

  return null;
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
      text
    },
    quoted
      ? {
          quoted
        }
      : {}
  );
}

async function react(
  jid,
  key,
  emoji
) {
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
      p => p.id === userJid
    );

  return !!user?.admin;
}

async function botIsAdmin(
  groupJid
) {
  if (!sock?.user?.id) {
    return false;
  }

  return isAdmin(
    groupJid,
    sock.user.id
  );
}

function menuText() {
  return `
╭━━━〔 🤖 ${BOT_NAME} 〕━━━╮
┃
┃ 👑 Owner : ${OWNER_NAME}
┃ ⚡ Prefix : ${PREFIX}
┃ 📡 Status : ${
    botOnline
      ? "Online"
      : "Offline"
  }
┃
┣━━〔 📋 MAIN 〕━━
┃ ${PREFIX}menu
┃ ${PREFIX}ping
┃ ${PREFIX}alive
┃ ${PREFIX}about
┃ ${PREFIX}owner
┃ ${PREFIX}help
┃
┣━━〔 👥 GROUP 〕━━
┃ ${PREFIX}kick @user
┃ ${PREFIX}add number
┃ ${PREFIX}promote @user
┃ ${PREFIX}demote @user
┃ ${PREFIX}admins
┃ ${PREFIX}members
┃ ${PREFIX}groupinfo
┃ ${PREFIX}tagall
┃ ${PREFIX}hidetag
┃ ${PREFIX}everyone
┃ ${PREFIX}open
┃ ${PREFIX}close
┃ ${PREFIX}setname
┃ ${PREFIX}setdesc
┃
┣━━〔 🛡️ SECURITY 〕━━
┃ ${PREFIX}antilink on/off
┃ ${PREFIX}antimention on/off
┃ ${PREFIX}antispam on/off
┃ ${PREFIX}antiflood on/off
┃ ${PREFIX}antibadword on/off
┃ ${PREFIX}antisticker on/off
┃ ${PREFIX}warn @user
┃ ${PREFIX}warnings
┃ ${PREFIX}resetwarn @user
┃
┣━━〔 👋 WELCOME 〕━━
┃ ${PREFIX}welcome on/off
┃ ${PREFIX}goodbye on/off
┃
┣━━〔 ⚡ AUTO 〕━━
┃ ${PREFIX}autoread on/off
┃ ${PREFIX}autoreact on/off
┃
┣━━〔 🛠️ TOOLS 〕━━
┃ ${PREFIX}calc 10+20
┃ ${PREFIX}time
┃ ${PREFIX}weather city
┃ ${PREFIX}ytsearch query
┃ ${PREFIX}status text
┃
┣━━〔 🎵 MUSIC 〕━━
┃ ${PREFIX}play query
┃ ${PREFIX}song query
┃
┣━━〔 🤖 AI 〕━━
┃ ${PREFIX}ai question
┃
┣━━〔 👑 OWNER 〕━━
┃ ${PREFIX}botinfo
┃ ${PREFIX}restart
┃ ${PREFIX}block @user
┃ ${PREFIX}unblock @user
┃ ${PREFIX}botoff
┃
╰━━━━━━━━━━━━━━━━━━━━━━╯

⚡ POWERED BY ${OWNER_NAME}
`;
}

function helpText() {
  return `
╭━━〔 📚 BK-BABU HELP 〕━━╮

• Group commands → ${PREFIX}menu
• Security → ${PREFIX}antilink on
• Welcome → ${PREFIX}welcome on
• Auto Read → ${PREFIX}autoread on
• Auto React → ${PREFIX}autoreact on
• Search → ${PREFIX}ytsearch song name
• Music → ${PREFIX}play song name
• AI → ${PREFIX}ai your question
• Calculator → ${PREFIX}calc 100/5
• Weather → ${PREFIX}weather Siliguri
• Bot status → ${PREFIX}botinfo

⚡ ${BOT_NAME}
`;
}

async function sendMenu(
  jid,
  quoted
) {
  const text = menuText();

  try {
    await sock.sendMessage(
      jid,
      {
        image: {
          url: MENU_IMG
        },
        caption: text
      },
      {
        quoted
      }
    );
  } catch {
    await reply(
      jid,
      text,
      quoted
    );
  }
}

function safeMath(expression) {
  const exp =
    String(expression || "")
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
      !Number.isFinite(result)
    ) {
      return null;
    }

    return result;
  } catch {
    return null;
  }
}
async function commandHandler(
  msg,
  jid,
  sender,
  text
) {
  const body = text.trim();

  if (!body.startsWith(PREFIX)) {
    return;
  }

  const parts =
    body
      .slice(PREFIX.length)
      .trim()
      .split(/\s+/);

  const command =
    (parts.shift() || "")
      .toLowerCase();

  const args = parts;
  const group = isGroup(jid);
  const quoted = msg;

  if (
    blockedUsers.has(sender) &&
    !isOwner(sender)
  ) {
    return;
  }

  const s =
    group
      ? getSettings(jid)
      : null;

  if (
    command === "menu" ||
    command === "help"
  ) {
    return sendMenu(
      jid,
      quoted
    );
  }

  if (command === "ping") {
    const start = Date.now();

    await reply(
      jid,
      "🏓 Pinging...",
      quoted
    );

    return reply(
      jid,
      `🏓 Pong!\n⚡ Response: ${
        Date.now() - start
      }ms`,
      quoted
    );
  }

  if (command === "alive") {
    return reply(
      jid,
      `╭━━〔 🤖 ${BOT_NAME} 〕━━╮
┃ 🟢 Online
┃ ⚡ Prefix: ${PREFIX}
┃ 👑 ${OWNER_NAME}
╰━━━━━━━━━━━━━━━━╯`,
      quoted
    );
  }

  if (command === "about") {
    return reply(
      jid,
      `🤖 ${BOT_NAME}

A WhatsApp automation bot powered by Baileys.

⚡ ${OWNER_NAME}`,
      quoted
    );
  }

  if (command === "owner") {
    return reply(
      jid,
      `👑 Owner: ${OWNER_NAME}
📱 Owner contact is configured privately.`,
      quoted
    );
  }

  if (command === "botinfo") {
    return reply(
      jid,
      `╭━━〔 🤖 BOT INFO 〕━━╮
┃ Name: ${BOT_NAME}
┃ Status: ${
        botOnline
          ? "Online 🟢"
          : "Offline 🔴"
      }
┃ Prefix: ${PREFIX}
┃ Node: ${process.version}
┃ Platform: ${process.platform}
╰━━━━━━━━━━━━━━━━━━━━╯`,
      quoted
    );
  }

  if (command === "status") {
    if (!args.length) {
      return reply(
        jid,
        `❌ Example: ${PREFIX}status Hello World`,
        quoted
      );
    }

    if (!isOwner(sender)) {
      return reply(
        jid,
        "❌ Owner only.",
        quoted
      );
    }

    try {
      await sock.updateProfileStatus(
        args.join(" ")
      );

      return reply(
        jid,
        "✅ Bot profile status updated.",
        quoted
      );
    } catch (e) {
      return reply(
        jid,
        `❌ ${e.message}`,
        quoted
      );
    }
  }

  if (command === "calc") {
    const result =
      safeMath(
        args.join(" ")
      );

    if (result === null) {
      return reply(
        jid,
        "❌ Invalid calculation.",
        quoted
      );
    }

    return reply(
      jid,
      `🧮 Result: ${result}`,
      quoted
    );
  }

  if (command === "time") {
    return reply(
      jid,
      `🕒 Server Time:\n${new Date().toString()}`,
      quoted
    );
  }

  if (command === "weather") {
    if (!args.length) {
      return reply(
        jid,
        `❌ Example: ${PREFIX}weather Siliguri`,
        quoted
      );
    }

    try {
      const city =
        encodeURIComponent(
          args.join(" ")
        );

      const response =
        await fetch(
          `https://wttr.in/${city}?format=j1`
        );

      const data =
        await response.json();

      const current =
        data.current_condition?.[0];

      if (!current) {
        throw new Error(
          "Weather unavailable"
        );
      }

      return reply(
        jid,
        `🌤️ Weather: ${args.join(" ")}
🌡️ Temperature: ${current.temp_C}°C
💧 Humidity: ${current.humidity}%
💨 Wind: ${current.windspeedKmph} km/h
☁️ Condition: ${
          current.weatherDesc?.[0]?.value ||
          "Unknown"
        }`,
        quoted
      );
    } catch {
      return reply(
        jid,
        "❌ Weather data পাওয়া যাচ্ছে না।",
        quoted
      );
    }
  }

  if (
    command === "ytsearch" ||
    command === "yts"
  ) {
    if (!args.length) {
      return reply(
        jid,
        `❌ Example: ${PREFIX}ytsearch Arijit Singh`,
        quoted
      );
    }

    try {
      const result =
        await ytSearch(
          args.join(" ")
        );

      const videos =
        result.videos.slice(0, 5);

      if (!videos.length) {
        return reply(
          jid,
          "❌ No results found.",
          quoted
        );
      }

      let out =
        "🔎 YouTube Search\n\n";

      videos.forEach(
        (v, i) => {
          out +=
            `${i + 1}. ${v.title}\n`;
          out +=
            `⏱️ ${v.timestamp}\n`;
          out +=
            `🔗 ${v.url}\n\n`;
        }
      );

      return reply(
        jid,
        out,
        quoted
      );
    } catch {
      return reply(
        jid,
        "❌ Search failed.",
        quoted
      );
    }
  }

  if (
    command === "play" ||
    command === "song"
  ) {
    if (!args.length) {
      return reply(
        jid,
        `❌ Example: ${PREFIX}play song name`,
        quoted
      );
    }

    try {
      const result =
        await ytSearch(
          args.join(" ")
        );

      const v =
        result.videos?.[0];

      if (!v) {
        return reply(
          jid,
          "❌ Song not found.",
          quoted
        );
      }

      return reply(
        jid,
        `🎵 ${v.title}

⏱️ Duration: ${v.timestamp}
👁️ Views: ${v.views}

🔗 ${v.url}

ℹ️ This command returns the YouTube result link. It does not bypass copyright or download restrictions.`,
        quoted
      );
    } catch {
      return reply(
        jid,
        "❌ Music search failed.",
        quoted
      );
    }
  }

  if (command === "ai") {
    if (!args.length) {
      return reply(
        jid,
        `❌ Example: ${PREFIX}ai explain JavaScript`,
        quoted
      );
    }

    if (
      !process.env.OPENAI_API_KEY
    ) {
      return reply(
        jid,
        "⚠️ AI is not configured yet. Add OPENAI_API_KEY in Render Environment Variables.",
        quoted
      );
    }

    try {
      const response =
        await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
              model:
                process.env.OPENAI_MODEL ||
                "gpt-5-mini",
              input:
                args.join(" ")
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message ||
          "AI request failed"
        );
      }

      const answer =
        data.output_text ||
        data.output
          ?.flatMap(
            x => x.content || []
          )
          ?.map(
            x => x.text || ""
          )
          ?.join("") ||
        "No response.";

      return reply(
        jid,
        `🤖 AI\n\n${answer}`,
        quoted
      );
    } catch (e) {
      return reply(
        jid,
        `❌ AI Error: ${e.message}`,
        quoted
      );
    }
  }

  if (!group) {
    const groupCommands = [
      "kick",
      "add",
      "promote",
      "demote",
      "admins",
      "members",
      "groupinfo",
      "tagall",
      "hidetag",
      "everyone",
      "open",
      "close",
      "welcome",
      "goodbye",
      "antilink",
      "antimention",
      "antispam",
      "antiflood",
      "antibadword",
      "antisticker",
      "warn",
      "warnings",
      "resetwarn",
      "autoread",
      "autoreact",
      "setname",
      "setdesc"
    ];

    if (
      groupCommands.includes(
        command
      )
    ) {
      return reply(
        jid,
        "❌ এই command শুধু Group-এ কাজ করবে।",
        quoted
      );
    }
  }

  if (group) {
    const adminOnly = [
      "kick",
      "add",
      "promote",
      "demote",
      "open",
      "close",
      "setname",
      "setdesc",
      "welcome",
      "goodbye",
      "antilink",
      "antimention",
      "antispam",
      "antiflood",
      "antibadword",
      "antisticker",
      "autoread",
      "autoreact"
    ];

    if (
      adminOnly.includes(
        command
      )
    ) {
      const admin =
        await isAdmin(
          jid,
          sender
        );

      if (
        !admin &&
        !isOwner(sender)
      ) {
        return reply(
          jid,
          "❌ Admin only.",
          quoted
        );
      }

      if (
        !(await botIsAdmin(jid))
      ) {
        return reply(
          jid,
          "❌ আগে আমাকে Group Admin বানাও।",
          quoted
        );
      }
    }

    if (command === "groupinfo") {
      const metadata =
        await groupMetadata(
          jid
        );

      if (!metadata) {
        return reply(
          jid,
          "❌ Group info পাওয়া গেল না.",
          quoted
        );
      }

      const admins =
        metadata.participants
          .filter(
            p => p.admin
          )
          .length;

      return reply(
        jid,
        `╭━━〔 👥 GROUP INFO 〕━━╮
┃ 📝 Name: ${metadata.subject}
┃ 👤 Members: ${metadata.participants.length}
┃ 👑 Admins: ${admins}
┃ 🆔 ${jid}
╰━━━━━━━━━━━━━━━━━━━━╯`,
        quoted
      );
    }

    if (command === "admins") {
      const metadata =
        await groupMetadata(
          jid
        );

      const list =
        metadata.participants
          .filter(
            p => p.admin
          );

      let out =
        "👑 GROUP ADMINS\n\n";

      list.forEach(
        (p, i) => {
          out +=
            `${i + 1}. @${senderNumber(p.id)}\n`;
        }
      );

      return sock.sendMessage(
        jid,
        {
          text: out,
          mentions:
            list.map(
              p => p.id
            )
        },
        {
          quoted
        }
      );
    }

    if (command === "members") {
      const metadata =
        await groupMetadata(
          jid
        );

      let out =
        `👥 MEMBERS: ${metadata.participants.length}\n\n`;

      metadata.participants
        .slice(0, 100)
        .forEach(
          (p, i) => {
            out +=
              `${i + 1}. @${senderNumber(p.id)}\n`;
          }
        );

      return sock.sendMessage(
        jid,
        {
          text: out,
          mentions:
            metadata.participants
              .slice(0, 100)
              .map(
                p => p.id
              )
        },
        {
          quoted
        }
      );
    }

    if (command === "kick") {
      const target =
        getTarget(
          msg.message,
          args
        );

      if (!target) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}kick @user`,
          quoted
        );
      }

      if (
        target ===
        sock.user.id
      ) {
        return reply(
          jid,
          "❌ আমাকে kick করা যাবে না।",
          quoted
        );
      }

      await sock.groupParticipantsUpdate(
        jid,
        [target],
        "remove"
      );

      return reply(
        jid,
        `✅ @${senderNumber(target)} removed.`,
        quoted
      );
    }

    if (command === "add") {
      const target =
        getTarget(
          msg.message,
          args
        );

      if (!target) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}add 919xxxxxxxxxx`,
          quoted
        );
      }

      await sock.groupParticipantsUpdate(
        jid,
        [target],
        "add"
      );

      return reply(
        jid,
        `✅ Add request sent for @${senderNumber(target)}.`,
        quoted
      );
    }

    if (
      command === "promote" ||
      command === "demote"
    ) {
      const target =
        getTarget(
          msg.message,
          args
        );

      if (!target) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}${command} @user`,
          quoted
        );
      }

      await sock.groupParticipantsUpdate(
        jid,
        [target],
        command === "promote"
          ? "promote"
          : "demote"
      );

      return reply(
        jid,
        `✅ @${senderNumber(target)} ${command}d.`,
        quoted
      );
    }

    if (
      command === "open" ||
      command === "close"
    ) {
      await sock.groupSettingUpdate(
        jid,
        command === "open"
          ? "not_announcement"
          : "announcement"
      );

      return reply(
        jid,
        command === "open"
          ? "🔓 Group opened for everyone."
          : "🔒 Group closed. Only admins can send messages.",
        quoted
      );
    }

    if (command === "setname") {
      if (!args.length) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}setname BK-BABU GROUP`,
          quoted
        );
      }

      await sock.groupUpdateSubject(
        jid,
        args.join(" ")
      );

      return reply(
        jid,
        "✅ Group name updated.",
        quoted
      );
    }

    if (command === "setdesc") {
      if (!args.length) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}setdesc New description`,
          quoted
        );
      }

      await sock.groupUpdateDescription(
        jid,
        args.join(" ")
      );

      return reply(
        jid,
        "✅ Group description updated.",
        quoted
      );
    }

    if (command === "tagall") {
      const metadata =
        await groupMetadata(
          jid
        );

      const mentions =
        metadata.participants.map(
          p => p.id
        );

      let textOut =
        "📢 TAG ALL\n\n";

      metadata.participants.forEach(
        (p, i) => {
          textOut +=
            `${i + 1}. @${senderNumber(p.id)}\n`;
        }
      );

      return sock.sendMessage(
        jid,
        {
          text: textOut,
          mentions
        },
        {
          quoted
        }
      );
    }

    if (command === "everyone") {
      const metadata =
        await groupMetadata(
          jid
        );

      const mentions =
        metadata.participants.map(
          p => p.id
        );

      return sock.sendMessage(
        jid,
        {
          text:
            `📢 Everyone — ${metadata.subject}`,
          mentions
        },
        {
          quoted
        }
      );
    }

    if (command === "hidetag") {
      const metadata =
        await groupMetadata(
          jid
        );

      const mentions =
        metadata.participants.map(
          p => p.id
        );

      return sock.sendMessage(
        jid,
        {
          text:
            args.join(" ") ||
            "📢 Attention everyone!",
          mentions
        },
        {
          quoted
        }
      );
    }

    const toggleCommands = [
      "welcome",
      "goodbye",
      "antilink",
      "antimention",
      "antispam",
      "antiflood",
      "antibadword",
      "antisticker",
      "autoread",
      "autoreact"
    ];

    if (
      toggleCommands.includes(
        command
      )
    ) {
      const value =
        args[0]?.toLowerCase();

      if (
        !["on", "off"].includes(
          value
        )
      ) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}${command} on`,
          quoted
        );
      }

      s[command] =
        value === "on";

      saveSettings();

      return reply(
        jid,
        `✅ ${command} turned ${value}.`,
        quoted
      );
    }

    if (command === "warn") {
      const target =
        getTarget(
          msg.message,
          args
        );

      if (!target) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}warn @user`,
          quoted
        );
      }

      const key =
        senderNumber(target);

      s.warnings[key] =
        (s.warnings[key] || 0) + 1;

      saveSettings();

      const count =
        s.warnings[key];

      return reply(
        jid,
        `⚠️ Warning given to @${key}\nWarnings: ${count}/3`,
        quoted
      );
    }

    if (command === "warnings") {
      const target =
        getTarget(
          msg.message,
          args
        );

      if (!target) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}warnings @user`,
          quoted
        );
      }

      const count =
        s.warnings[
          senderNumber(target)
        ] || 0;

      return reply(
        jid,
        `⚠️ @${senderNumber(target)} has ${count} warning(s).`,
        quoted
      );
    }

    if (command === "resetwarn") {
      const target =
        getTarget(
          msg.message,
          args
        );

      if (!target) {
        return reply(
          jid,
          `❌ Example: ${PREFIX}resetwarn @user`,
          quoted
        );
      }

      delete s.warnings[
        senderNumber(target)
      ];

      saveSettings();

      return reply(
        jid,
        `✅ Warnings reset for @${senderNumber(target)}.`,
        quoted
      );
    }
                      }
  async function messageHandler(msg) {
  if (!msg?.message) {
    return;
  }

  const jid =
    msg.key.remoteJid;

  if (
    !jid ||
    jid === "status@broadcast"
  ) {
    return;
  }

  const sender =
    msg.key.participant ||
    jid;

  const text =
    getText(msg.message);

  if (!text) {
    return;
  }

  if (isGroup(jid)) {
    const s =
      getSettings(jid);

    if (s.autoread) {
      try {
        await sock.readMessages([
          msg.key
        ]);
      } catch {}
    }

    if (
      s.autoreact &&
      !msg.key.fromMe
    ) {
      await react(
        jid,
        msg.key,
        "❤️"
      );
    }

    if (
      s.antilink &&
      !msg.key.fromMe &&
      /(https?:\/\/|www\.|chat\.whatsapp\.com\/|t\.me\/)/i.test(text)
    ) {
      const admin =
        await isAdmin(
          jid,
          sender
        );

      if (
        !admin &&
        !isOwner(sender)
      ) {
        try {
          await sock.sendMessage(
            jid,
            {
              delete: msg.key
            }
          );
        } catch {}

        await reply(
          jid,
          `🚫 @${senderNumber(sender)} link removed.`,
          msg
        );

        return;
      }
    }

    if (
      s.antimention &&
      mentionedUsers(
        msg.message
      ).length >= 5 &&
      !msg.key.fromMe
    ) {
      const admin =
        await isAdmin(
          jid,
          sender
        );

      if (
        !admin &&
        !isOwner(sender)
      ) {
        try {
          await sock.sendMessage(
            jid,
            {
              delete: msg.key
            }
          );
        } catch {}

        await reply(
          jid,
          "🚫 Mass mention removed.",
          msg
        );

        return;
      }
    }

    if (
      s.antisticker &&
      msg.message.stickerMessage &&
      !msg.key.fromMe
    ) {
      const admin =
        await isAdmin(
          jid,
          sender
        );

      if (
        !admin &&
        !isOwner(sender)
      ) {
        try {
          await sock.sendMessage(
            jid,
            {
              delete: msg.key
            }
          );
        } catch {}

        await reply(
          jid,
          "🚫 Sticker blocked by group security.",
          msg
        );

        return;
      }
    }

    if (
      s.antibadword &&
      !msg.key.fromMe
    ) {
      const badWords = [
        "fuck",
        "porn",
        "xxx",
        "sex",
        "spamword"
      ];

      const found =
        badWords.some(
          word =>
            text
              .toLowerCase()
              .includes(word)
        );

      if (found) {
        const admin =
          await isAdmin(
            jid,
            sender
          );

        if (
          !admin &&
          !isOwner(sender)
        ) {
          try {
            await sock.sendMessage(
              jid,
              {
                delete: msg.key
              }
            );
          } catch {}

          await reply(
            jid,
            "🚫 Inappropriate message removed.",
            msg
          );

          return;
        }
      }
    }

    if (
      s.antiflood &&
      !msg.key.fromMe
    ) {
      const key =
        `${jid}:${sender}`;

      const now =
        Date.now();

      const arr =
        floodMap.get(key) ||
        [];

      arr.push(now);

      const recent =
        arr.filter(
          t =>
            now - t < 5000
        );

      floodMap.set(
        key,
        recent
      );

      if (
        recent.length >= 6
      ) {
        const admin =
          await isAdmin(
            jid,
            sender
          );

        if (
          !admin &&
          !isOwner(sender)
        ) {
          try {
            await sock.sendMessage(
              jid,
              {
                delete: msg.key
              }
            );
          } catch {}

          await reply(
            jid,
            `⚠️ @${senderNumber(sender)} flood protection activated.`,
            msg
          );

          floodMap.delete(
            key
          );

          return;
        }
      }
    }

    if (
      s.antispam &&
      !msg.key.fromMe
    ) {
      const key =
        `${jid}:${sender}`;

      const now =
        Date.now();

      const arr =
        spamMap.get(key) ||
        [];

      arr.push({
        text:
          text.toLowerCase(),
        time: now
      });

      const recent =
        arr.filter(
          x =>
            now - x.time <
            10000
        );

      spamMap.set(
        key,
        recent
      );

      const duplicates =
        recent.filter(
          x =>
            x.text ===
            text.toLowerCase()
        ).length;

      if (
        duplicates >= 4
      ) {
        const admin =
          await isAdmin(
            jid,
            sender
          );

        if (
          !admin &&
          !isOwner(sender)
        ) {
          try {
            await sock.sendMessage(
              jid,
              {
                delete: msg.key
              }
            );
          } catch {}

          await reply(
            jid,
            `⚠️ Spam protection activated for @${senderNumber(sender)}.`,
            msg
          );

          spamMap.delete(
            key
          );

          return;
        }
      }
    }
  }

  await commandHandler(
    msg,
    jid,
    sender,
    text
  );
}

let registered = false;

async function startBot() {
  if (starting) {
    return;
  }

  starting = true;

  try {
    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        AUTH_DIR
      );

    registered =
      !!state.creds.registered;

    let version;

    try {
      const latest =
        await fetchLatestWaWebVersion();

      version =
        latest.version;

      console.log(
        "WhatsApp Web version:",
        version.join(".")
      );
    } catch {
      console.log(
        "Using Baileys default WhatsApp Web version."
      );
    }

    const options = {
      auth: state,
      logger:
        P({
          level: "silent"
        }),
      browser:
        Browsers.macOS(
          "Chrome"
        ),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false
    };

    if (version) {
      options.version =
        version;
    }

    sock =
      makeWASocket(
        options
      );

    sock.ev.on(
      "creds.update",
      saveCreds
    );

    sock.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {
        for (
          const msg of messages
        ) {
          try {
            await messageHandler(
              msg
            );
          } catch (e) {
            console.error(
              "Message error:",
              e.message
            );
          }
        }
      }
    );

    sock.ev.on(
      "group-participants.update",
      async update => {
        try {
          const {
            id,
            participants,
            action
          } = update;

          const s =
            getSettings(id);

          if (
            action === "add" &&
            s.welcome
          ) {
            for (
              const user of participants
            ) {
              await sock.sendMessage(
                id,
                {
                  text:
                    `╭━━〔 👋 WELCOME 〕━━╮

🎉 Welcome @${senderNumber(user)}!

🤖 ${BOT_NAME} is here to help.

📋 Type ${PREFIX}menu to see commands.

╰━━━━━━━━━━━━━━━━━━━━╯`,
                  mentions: [
                    user
                  ]
                }
              );
            }
          }

          if (
            action === "remove" &&
            s.goodbye
          ) {
            for (
              const user of participants
            ) {
              await sock.sendMessage(
                id,
                {
                  text:
                    `👋 @${senderNumber(user)} left the group.

🤖 ${BOT_NAME} says goodbye!`,
                  mentions: [
                    user
                  ]
                }
              );
            }
          }
        } catch {}
      }
    );

    sock.ev.on(
      "connection.update",
      async update => {
        const {
          connection,
          lastDisconnect
        } = update;

        if (
          connection === "open"
        ) {
          botOnline = true;
          registered = true;
          starting = false;

          console.log(
            `✅ ${BOT_NAME} connected successfully.`
          );
        }

        if (
          connection === "close"
        ) {
          botOnline = false;
          starting = false;

          const code =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;

          console.log(
            "Connection closed:",
            code
          );

          if (
            code !==
            DisconnectReason.loggedOut
          ) {
            setTimeout(
              startBot,
              5000
            );
          } else {
            registered = false;

            console.log(
              "❌ Logged out. Pair again."
            );
          }
        }
      }
    );
  } catch (e) {
    starting = false;

    console.error(
      "START ERROR:",
      e.message
    );

    setTimeout(
      startBot,
      10000
    );
  }
}

/* =========================
   PAIRING WEBSITE
========================= */

app.get(
  "/",
  (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${BOT_NAME} Pairing</title>

<style>

body{
  margin:0;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  font-family:Arial,sans-serif;
  background:#0b0f14;
  color:white;
}

.card{
  width:90%;
  max-width:430px;
  background:#151b22;
  padding:25px;
  border-radius:20px;
  box-shadow:0 10px 40px #0008;
  text-align:center;
}

h1{
  margin-top:0;
}

input{
  width:90%;
  padding:14px;
  border:0;
  border-radius:12px;
  margin:10px 0;
  font-size:16px;
}

button{
  width:96%;
  padding:14px;
  border:0;
  border-radius:12px;
  background:#25d366;
  color:#07130b;
  font-weight:bold;
  font-size:16px;
}

#result{
  margin-top:20px;
  font-size:24px;
  font-weight:bold;
  letter-spacing:4px;
  word-break:break-all;
}

small{
  color:#aaa;
}

</style>
</head>

<body>

<div class="card">

<h1>🤖 ${BOT_NAME}</h1>

<p>WhatsApp Pairing</p>

<input
 id="number"
 type="tel"
 placeholder="Country code + number"
/>

<button onclick="pair()">
🔗 Generate Pairing Code
</button>

<div id="result"></div>

<br>

<small>
Enter country code + number.<br>
Do not enter +, spaces or -
</small>

</div>

<script>

async function pair(){

  const number =
    document
      .getElementById("number")
      .value
      .trim();

  const result =
    document
      .getElementById("result");

  result.innerText =
    "Generating...";

  try{

    const r =
      await fetch(
        "/api/pair",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({
              number
            })
        }
      );

    const data =
      await r.json();

    if(data.code){

      result.innerText =
        data.code;

    }else{

      result.innerText =
        data.error ||
        "Pairing failed";
    }

  }catch(e){

    result.innerText =
      "Server error";
  }
}

</script>

</body>
</html>
`);
  }
);

app.get(
  "/status",
  (req, res) => {
    res.json({
      bot: BOT_NAME,
      online: botOnline,
      paired: registered,
      time:
        new Date()
          .toISOString()
    });
  }
);

app.post(
  "/api/pair",
  async (req, res) => {

    try {

      const number =
        cleanNumber(
          req.body?.number
        );

      if (!number) {
        return res
          .status(400)
          .json({
            error:
              "Enter a valid phone number."
          });
      }

      if (
        OWNER_NUMBER &&
        number !==
          OWNER_NUMBER
      ) {
        return res
          .status(403)
          .json({
            error:
              "Pairing is restricted to the configured owner number."
          });
      }

      if (pairBusy) {
        return res
          .status(429)
          .json({
            error:
              "Pairing is already in progress. Wait a moment."
          });
      }

      if (!sock) {
        return res
          .status(503)
          .json({
            error:
              "Bot is starting. Try again in a few seconds."
          });
      }

      if (registered) {
        return res
          .status(409)
          .json({
            error:
              "This session is already paired."
          });
      }

      pairBusy = true;

      const code =
        await sock.requestPairingCode(
          number
        );

      return res.json({
        success: true,
        code
      });

    } catch (e) {

      console.error(
        "PAIR ERROR:",
        e.message
      );

      return res
        .status(500)
        .json({
          error:
            e.message ||
            "Pairing failed."
        });

    } finally {

      setTimeout(
        () => {
          pairBusy = false;
        },
        15000
      );
    }
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      `${BOT_NAME} website running on port ${PORT}`
    );
  }
);

startBot();
