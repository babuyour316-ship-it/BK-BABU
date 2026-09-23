const express = require("express");
const fs = require("fs");

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const P = require("pino");

const app = express();
const PORT = process.env.PORT || 9090;

const AUTH_DIR = "./auth_info_baileys";

const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/\D/g, "");

let sock = null;
let pairingReady = false;
let pairingInProgress = false;
let pairingReadyResolve = null;

let pairingReadyPromise = new Promise((resolve) => {
  pairingReadyResolve = resolve;
});

app.use(express.json());


/* =========================================================
   BK BABU WEBSITE
   ========================================================= */

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">

<head>

<meta charset="UTF-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1.0"
>

<title>BK BABU BOT</title>

<style>

*{
box-sizing:border-box;
margin:0;
padding:0;
}

body{

min-height:100vh;

font-family:
Arial,
Helvetica,
sans-serif;

background:
radial-gradient(
circle at top,
#263b72 0%,
#111827 45%,
#05070c 100%
);

color:#fff;

display:flex;

justify-content:center;

align-items:center;

padding:20px;

}

.card{

width:100%;

max-width:430px;

background:
rgba(15,20,34,.95);

border:
1px solid rgba(255,255,255,.12);

border-radius:26px;

padding:30px 22px;

text-align:center;

box-shadow:
0 25px 80px rgba(0,0,0,.55);

}

.logo{

width:85px;

height:85px;

border-radius:22px;

object-fit:cover;

margin-bottom:15px;

border:
2px solid rgba(255,255,255,.18);

}

h1{

font-size:28px;

margin-bottom:8px;

}

.subtitle{

color:#aeb8cc;

font-size:14px;

margin-bottom:27px;

}

.label{

text-align:left;

color:#bac4d8;

font-size:13px;

margin-bottom:8px;

}

input{

width:100%;

padding:16px;

border-radius:14px;

border:
1px solid rgba(255,255,255,.12);

background:#0b101b;

color:white;

font-size:16px;

outline:none;

margin-bottom:15px;

}

button{

width:100%;

padding:16px;

border:0;

border-radius:14px;

background:
linear-gradient(
135deg,
#586cff,
#8b5cf6
);

color:white;

font-size:16px;

font-weight:bold;

cursor:pointer;

}

button:disabled{

opacity:.55;

}

.codeBox{

display:none;

margin-top:22px;

padding:20px;

border-radius:17px;

background:#080d17;

border:
1px solid rgba(255,255,255,.1);

}

.codeTitle{

color:#aeb8cc;

font-size:13px;

margin-bottom:10px;

}

.code{

font-size:28px;

font-weight:bold;

letter-spacing:4px;

margin-bottom:15px;

}

.copy{

background:#202a42;

}

.message{

margin-top:16px;

color:#9da9bd;

font-size:13px;

line-height:1.5;

}

.steps{

margin-top:22px;

padding-top:20px;

border-top:
1px solid rgba(255,255,255,.08);

text-align:left;

color:#aeb8cc;

font-size:13px;

line-height:1.8;

}

.footer{

margin-top:22px;

font-size:11px;

color:#68758d;

}

</style>

</head>

<body>

<div class="card">

<img
class="logo"
src="https://raw.githubusercontent.com/babuyour316-ship-it/BK-BABU/main/1790162918643.png"
>

<h1>🤖 BK BABU BOT</h1>

<div class="subtitle">
WhatsApp Pairing Portal
</div>

<div class="label">
WhatsApp Number
</div>

<input
id="number"
type="tel"
inputmode="numeric"
placeholder="Country code + number"
>

<button
id="pairButton"
onclick="pair()"
>
🔐 GET PAIRING CODE
</button>

<div
class="codeBox"
id="codeBox"
>

<div class="codeTitle">
YOUR PAIRING CODE
</div>

<div
class="code"
id="code"
>
--------
</div>

<button
class="copy"
onclick="copyCode()"
>
📋 COPY CODE
</button>

</div>

<div
class="message"
id="message"
>
Enter your WhatsApp number.
</div>

<div class="steps">

<b>📱 How to connect</b><br>

1. Enter your WhatsApp number.<br>

2. Tap GET PAIRING CODE.<br>

3. Copy the code.<br>

4. WhatsApp → Linked Devices.<br>

5. Link a device → Link with phone number instead.<br>

6. Enter the code.

</div>

<div class="footer">
⚡ POWERED BY BK BABU
</div>

</div>

<script>

async function pair(){

const input =
document.getElementById("number");

const button =
document.getElementById("pairButton");

const message =
document.getElementById("message");

const box =
document.getElementById("codeBox");

const code =
document.getElementById("code");

const number =
input.value.replace(/\\D/g,"");

if(!number){

message.innerText =
"❌ Enter your WhatsApp number.";

return;

}

if(number.length < 10){

message.innerText =
"❌ Enter a valid WhatsApp number.";

return;

}

button.disabled = true;

button.innerText =
"⏳ GENERATING...";

box.style.display =
"none";

message.innerText =
"🔄 Connecting to WhatsApp...";

try{

const response =
await fetch(
"/api/pair",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({
number:number
})

}
);

const data =
await response.json();

if(!response.ok){

throw new Error(
data.error ||
"Pairing failed"
);

}

code.innerText =
data.code;

box.style.display =
"block";

message.innerText =
"✅ Code generated. Copy it to WhatsApp.";

}catch(error){

message.innerText =
"❌ " + error.message;

}

button.disabled = false;

button.innerText =
"🔐 GET PAIRING CODE";

}


async function copyCode(){

const code =
document
.getElementById("code")
.innerText;

try{

await navigator
.clipboard
.writeText(code);

document
.getElementById("message")
.innerText =
"✅ Pairing code copied!";

}catch(error){

document
.getElementById("message")
.innerText =
"❌ Copy failed.";

}

}

</script>

</body>
</html>
`);
});


/* =========================================================
   STATUS
   ========================================================= */

app.get("/status", (req, res) => {

  res.json({

    bot: "BK BABU BOT",

    status:
      sock ? "running" : "starting",

    whatsapp:
      sock ? "connected-or-connecting" : "offline",

    pairingReady

  });

});


/* =========================================================
   PAIRING API
   ========================================================= */

app.post("/api/pair", async (req, res) => {

  try {

    const number =
      String(
        req.body.number || ""
      ).replace(/\D/g, "");

    if (!number) {

      return res.status(400).json({

        error:
          "WhatsApp number is required."

      });

    }


    /*
     * Only the number configured
     * in Render OWNER_NUMBER
     * can request a pairing code.
     */

    if (
      !OWNER_NUMBER ||
      number !== OWNER_NUMBER
    ) {

      return res.status(403).json({

        error:
          "This pairing page is configured for the bot owner number only."

      });

    }


    if (pairingInProgress) {

      return res.status(429).json({

        error:
          "A pairing request is already running. Please wait."

      });

    }


    if (
      sock &&
      sock.user
    ) {

      return res.status(400).json({

        error:
          "BK BABU BOT is already linked to WhatsApp."

      });

    }


    pairingInProgress = true;


    await Promise.race([

      pairingReadyPromise,

      new Promise(
        (_, reject) => {

          setTimeout(
            () => {

              reject(
                new Error(
                  "WhatsApp pairing service is not ready yet."
                )
              );

            },
            60000
          );

        }
      )

    ]);


    if (
      !sock ||
      !pairingReady
    ) {

      throw new Error(
        "WhatsApp pairing service is not ready."
      );

    }


    const code =
      await sock.requestPairingCode(
        number
      );


    const formatted =
      String(code)
        .replace(/\s/g, "")
        .match(/.{1,4}/g)
        ?.join("-") ||
      String(code);


    console.log(
      "🔐 Pairing code generated from website."
    );


    res.json({

      success:true,

      code:formatted

    });


  } catch (error) {

    console.error(
      "❌ Pairing Error:",
      error.message
    );

    res.status(500).json({

      error:
        error.message ||
        "Pairing failed."

    });

  } finally {

    pairingInProgress = false;

  }

});


/* =========================================================
   SERVER
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `🌐 BK BABU website running on port ${PORT}`
    );

  }
);


/* =========================================================
   WHATSAPP BOT
   ========================================================= */

async function startBot(){

  try{

    pairingReady = false;

    pairingReadyPromise =
      new Promise(
        (resolve) => {

          pairingReadyResolve =
            resolve;

        }
      );


    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        AUTH_DIR
      );


    const {
      version,
      isLatest
    } =
      await fetchLatestBaileysVersion();


    console.log(
      `🌐 WhatsApp version: ${version.join(".")}`
    );

    console.log(
      `📌 Latest: ${isLatest}`
    );


    sock =
      makeWASocket({

        version,

        auth:state,

        logger:
          P({
            level:"silent"
          }),

        browser:
          Browsers.ubuntu(
            "BK-BABU"
          ),

        markOnlineOnConnect:false,

        connectTimeoutMs:60000

      });


    sock.ev.on(
      "creds.update",
      saveCreds
    );


    sock.ev.on(
      "connection.update",
      async (update) => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;


        if(qr){

          pairingReady = true;

          if(
            pairingReadyResolve
          ){

            pairingReadyResolve(true);

            pairingReadyResolve = null;

          }

          console.log(
            "🔐 BK BABU pairing service ready."
          );

        }


        if(
          connection ===
          "connecting"
        ){

          console.log(
            "🔄 BK BABU connecting..."
          );

        }


        if(
          connection ===
          "open"
        ){

          pairingReady = false;

          console.log(
            "╔══════════════════════════════════╗"
          );

          console.log(
            "║      🤖 BK BABU BOT ONLINE      ║"
          );

          console.log(
            "╚══════════════════════════════════╝"
          );

        }


        if(
          connection ===
          "close"
        ){

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;


          console.log(
            "❌ WhatsApp connection closed:",
            statusCode
          );


          sock = null;

          pairingReady = false;


          if(
            statusCode ===
            DisconnectReason.loggedOut
          ){

            console.log(
              "⚠️ WhatsApp session logged out."
            );

            return;

          }


          setTimeout(
            () => {

              startBot();

            },
            5000
          );

        }

      }
    );


    /* =====================================================
       MESSAGE HANDLER
       ===================================================== */

    sock.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {

        try{

          const msg =
            messages[0];


          if(
            !msg ||
            !msg.message
          ){

            return;

          }


          /*
           * IMPORTANT:
           *
           * We DO NOT use:
           *
           * if(msg.key.fromMe) return;
           *
           * because we want commands typed
           * from the bot owner's own WhatsApp
           * profile/self-chat to work.
           *
           * Bot replies are not processed as
           * commands because they do not contain
           * a valid command prefix.
           */


          const jid =
            msg.key.remoteJid;


          if(!jid){

            return;

          }


          const text =
            msg.message.conversation ||

            msg.message.extendedTextMessage
              ?.text ||

            msg.message.imageMessage
              ?.caption ||

            msg.message.videoMessage
              ?.caption ||

            "";


          const command =
            text
              .trim()
              .toLowerCase();


          if(!command){

            return;

          }


          console.log(
            `📩 Message received: ${command}`
          );


          /* =================================================
             PING
             ================================================= */

          if(
            command ===
            ".ping"
          ){

            await sock.sendMessage(
              jid,
              {

                text:
                  "🏓 *PONG!*\n\n" +

                  "🤖 BK BABU BOT is online.\n" +

                  "⚡ System is working."

              }
            );

            return;

          }


          /* =================================================
             MENU
             ================================================= */

          if(
            command ===
            ".menu"
          ){

            await sock.sendMessage(
              jid,
              {

                text:

                  "╭━━━〔 🤖 BK BABU BOT 〕━━━╮\n" +

                  "┃\n" +

                  "┃ 🏓 .ping\n" +

                  "┃ 📋 .menu\n" +

                  "┃ ℹ️ .about\n" +

                  "┃ ❤️ .alive\n" +

                  "┃ 👑 .owner\n" +

                  "┃ 🆘 .help\n" +

                  "┃\n" +

                  "╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n" +

                  "⚡ POWERED BY BK BABU"

              }
            );

            return;

          }


          /* =================================================
             ABOUT
             ================================================= */

          if(
            command ===
            ".about"
          ){

            await sock.sendMessage(
              jid,
              {

                text:

                  "🤖 *BK BABU BOT*\n\n" +

                  "⚡ WhatsApp Bot powered by Baileys\n" +

                  "👑 Owner: BK BABU\n" +

                  "🚀 Status: Online"

              }
            );

            return;

          }


          /* =================================================
             ALIVE
             ================================================= */

          if(
            command ===
            ".alive"
          ){

            await sock.sendMessage(
              jid,
              {

                text:
                  "❤️ *BK BABU BOT IS ALIVE!*\n\n" +

                  "🟢 Online\n" +

                  "⚡ Ready\n" +

                  "🤖 Powered by BK BABU"

              }
            );

            return;

          }


          /* =================================================
             OWNER
             ================================================= */

          if(
            command ===
            ".owner"
          ){

            await sock.sendMessage(
              jid,
              {

                text:
                  "👑 *BK BABU*\n\n" +

                  "🤖 BK BABU BOT"

              }
            );

            return;

          }


          /* =================================================
             HELP
             ================================================= */

          if(
            command ===
            ".help"
          ){

            await sock.sendMessage(
              jid,
              {

                text:

                  "🆘 *BK BABU HELP*\n\n" +

                  "🏓 .ping — Check bot\n" +

                  "📋 .menu — Show menu\n" +

                  "ℹ️ .about — About bot\n" +

                  "❤️ .alive — Bot status\n" +

                  "👑 .owner — Owner info\n\n" +

                  "⚡ POWERED BY BK BABU"

              }
            );

            return;

          }


        }catch(error){

          console.error(
            "❌ Message Error:",
            error.message
          );

        }

      }
    );


  }catch(error){

    console.error(
      "❌ BK BABU START ERROR:",
      error.message
    );


    sock = null;

    setTimeout(
      () => {

        startBot();

      },
      10000
    );

  }

}


/* =========================================================
   START BOT
   ========================================================= */

startBot();
