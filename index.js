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

// Render Environment Variable
const OWNER_NUMBER = (process.env.OWNER_NUMBER || "").replace(/\D/g, "");

// WhatsApp socket
let pairingSocket = null;
let pairingReady = false;
let pairingReadyResolve = null;

let pairingReadyPromise = new Promise((resolve) => {
  pairingReadyResolve = resolve;
});

// Prevent multiple pairing requests at the same time
let pairingInProgress = false;


/* =========================================================
   BK BABU PAIRING WEBSITE
   ========================================================= */

app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">

<title>BK BABU BOT - Pairing</title>

<style>
*{
  box-sizing:border-box;
  margin:0;
  padding:0;
}

body{
  min-height:100vh;
  font-family:Arial,Helvetica,sans-serif;
  background:
    radial-gradient(circle at top,#25345c 0%,#101522 45%,#070a11 100%);
  color:white;
  display:flex;
  justify-content:center;
  align-items:center;
  padding:20px;
}

.card{
  width:100%;
  max-width:430px;
  background:rgba(18,24,38,.94);
  border:1px solid rgba(255,255,255,.12);
  border-radius:25px;
  padding:30px 22px;
  box-shadow:0 20px 70px rgba(0,0,0,.5);
  text-align:center;
}

.logo{
  width:85px;
  height:85px;
  border-radius:22px;
  object-fit:cover;
  margin-bottom:15px;
  border:2px solid rgba(255,255,255,.2);
}

h1{
  font-size:28px;
  margin-bottom:7px;
}

.subtitle{
  color:#aeb8cb;
  font-size:14px;
  margin-bottom:27px;
}

.label{
  text-align:left;
  font-size:13px;
  color:#b8c2d5;
  margin-bottom:8px;
}

input{
  width:100%;
  padding:16px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.12);
  background:#0d1320;
  color:white;
  font-size:16px;
  outline:none;
  margin-bottom:15px;
}

input:focus{
  border-color:#728cff;
}

button{
  width:100%;
  padding:16px;
  border:0;
  border-radius:14px;
  background:linear-gradient(135deg,#6378ff,#8b5cf6);
  color:white;
  font-size:16px;
  font-weight:bold;
  cursor:pointer;
}

button:disabled{
  opacity:.55;
  cursor:not-allowed;
}

.codeBox{
  display:none;
  margin-top:22px;
  padding:20px;
  border-radius:17px;
  background:#0b111d;
  border:1px solid rgba(255,255,255,.12);
}

.codeTitle{
  color:#aeb8cb;
  font-size:13px;
  margin-bottom:10px;
}

.code{
  font-size:28px;
  font-weight:bold;
  letter-spacing:4px;
  margin-bottom:15px;
}

.copyBtn{
  background:#202b43;
}

.message{
  margin-top:16px;
  color:#9facbf;
  font-size:13px;
  line-height:1.5;
}

.steps{
  margin-top:22px;
  padding-top:20px;
  border-top:1px solid rgba(255,255,255,.08);
  text-align:left;
  color:#aeb8cb;
  font-size:13px;
  line-height:1.8;
}

.footer{
  margin-top:22px;
  color:#68758c;
  font-size:11px;
}
</style>
</head>

<body>

<div class="card">

<img
class="logo"
src="https://raw.githubusercontent.com/babuyour316-ship-it/BK-BABU/main/1790162918643.png"
onerror="this.style.display='none'"
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
placeholder="Enter number with country code"
autocomplete="off"
>

<button id="pairBtn" onclick="getPairingCode()">
🔐 GET PAIRING CODE
</button>

<div class="codeBox" id="codeBox">

<div class="codeTitle">
Your WhatsApp Pairing Code
</div>

<div class="code" id="code">
--------
</div>

<button
class="copyBtn"
onclick="copyCode()"
>
📋 COPY CODE
</button>

</div>

<div class="message" id="message">
Enter your WhatsApp number with country code.
</div>

<div class="steps">

<b>📱 How to link</b><br>

1. Enter your WhatsApp number above.<br>
2. Tap <b>GET PAIRING CODE</b>.<br>
3. Copy the displayed code.<br>
4. WhatsApp → Linked Devices.<br>
5. Link a device → Link with phone number instead.<br>
6. Enter the code.

</div>

<div class="footer">
⚡ POWERED BY BK BABU
</div>

</div>

<script>

async function getPairingCode(){

  const numberInput =
    document.getElementById("number");

  const button =
    document.getElementById("pairBtn");

  const message =
    document.getElementById("message");

  const codeBox =
    document.getElementById("codeBox");

  const codeElement =
    document.getElementById("code");

  const number =
    numberInput.value.replace(/\\D/g,"");

  if(!number){

    message.innerText =
      "❌ Please enter your WhatsApp number.";

    return;
  }

  if(number.length < 10){

    message.innerText =
      "❌ Please enter a valid WhatsApp number.";

    return;
  }

  button.disabled = true;
  button.innerText = "⏳ GENERATING CODE...";
  codeBox.style.display = "none";

  message.innerText =
    "🔄 Connecting to WhatsApp... Please wait.";

  try{

    const response =
      await fetch("/api/pair",{

        method:"POST",

        headers:{
          "Content-Type":"application/json"
        },

        body:JSON.stringify({
          number:number
        })

      });

    const data =
      await response.json();

    if(!response.ok){

      throw new Error(
        data.error || "Pairing failed"
      );

    }

    codeElement.innerText =
      data.code;

    codeBox.style.display =
      "block";

    message.innerText =
      "✅ Pairing code generated. Copy it and enter it in WhatsApp.";

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
    document.getElementById("code").innerText;

  try{

    await navigator.clipboard.writeText(code);

    document.getElementById("message").innerText =
      "✅ Pairing code copied!";

  }catch(error){

    document.getElementById("message").innerText =
      "❌ Copy failed. Long-press the code and copy it.";

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
      pairingSocket ? "running" : "starting",

    pairingReady:
      pairingReady,

    whatsapp:
      pairingSocket ? "socket-active" : "socket-starting"

  });

});


/* =========================================================
   PAIRING API
   ========================================================= */

app.post("/api/pair", async (req, res) => {

  try {

    const requestedNumber =
      String(req.body.number || "")
        .replace(/\D/g, "");

    if (!requestedNumber) {

      return res.status(400).json({

        error: "WhatsApp number is required."

      });

    }


    // Only the configured owner number can use this pairing page.
    if (
      !OWNER_NUMBER ||
      requestedNumber !== OWNER_NUMBER
    ) {

      return res.status(403).json({

        error:
          "This pairing page is configured for the bot owner number only."

      });

    }


    if (pairingInProgress) {

      return res.status(429).json({

        error:
          "A pairing code is already being generated. Please wait."

      });

    }


    if (
      pairingSocket &&
      pairingSocket.user
    ) {

      return res.status(400).json({

        error:
          "BK BABU BOT is already connected to WhatsApp."

      });

    }


    pairingInProgress = true;


    // Wait until Baileys socket is ready for pairing.
    await Promise.race([

      pairingReadyPromise,

      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "WhatsApp connection is taking too long. Please try again."
              )
            ),
          60000
        )
      )

    ]);


    if (
      !pairingSocket ||
      !pairingReady
    ) {

      throw new Error(
        "WhatsApp pairing service is not ready."
      );

    }


    const code =
      await pairingSocket.requestPairingCode(
        requestedNumber
      );


    const formattedCode =
      String(code)
        .replace(/\\s/g, "")
        .match(/.{1,4}/g)
        ?.join("-") ||
      String(code);


    console.log("");
    console.log("====================================");
    console.log("🔐 BK BABU WEBSITE PAIRING REQUEST");
    console.log("📱 Pairing code generated");
    console.log("====================================");
    console.log("");


    return res.json({

      success: true,

      code: formattedCode,

      message:
        "Enter this code in WhatsApp Linked Devices."

    });


  } catch (error) {

    console.error(
      "❌ Pairing API Error:",
      error.message
    );


    return res.status(500).json({

      error:
        error.message ||
        "Unable to generate pairing code."

    });

  } finally {

    pairingInProgress = false;

  }

});


/* =========================================================
   START WEB SERVER
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log("====================================");
    console.log("🌐 BK BABU PAIRING WEBSITE");
    console.log(`🚀 Server running on port ${PORT}`);
    console.log("====================================");
    console.log("");

  }
);


/* =========================================================
   START WHATSAPP BOT
   ========================================================= */

async function startBot() {

  try {

    pairingReady = false;

    pairingReadyPromise =
      new Promise((resolve) => {

        pairingReadyResolve =
          resolve;

      });


    const {
      state,
      saveCreds
    } =
      await useMultiFileAuthState(
        AUTH_DIR
      );


    // Get current WhatsApp Web version.
    const {
      version,
      isLatest
    } =
      await fetchLatestBaileysVersion();


    console.log(
      `🌐 WhatsApp Web version: ${version.join(".")}`
    );

    console.log(
      `📌 Latest version: ${isLatest}`
    );


    pairingSocket =
      makeWASocket({

        version,

        auth: state,

        logger:
          P({
            level: "silent"
          }),

        browser:
          Browsers.ubuntu("Chrome"),

        markOnlineOnConnect:
          false,

        connectTimeoutMs:
          60000

      });


    pairingSocket.ev.on(
      "creds.update",
      saveCreds
    );


    pairingSocket.ev.on(
      "connection.update",
      async (update) => {

        const {
          connection,
          lastDisconnect,
          qr
        } = update;


        /*
         * When qr appears, the WhatsApp
         * socket is ready for pairing code.
         */

        if (
          qr &&
          !state.creds.registered
        ) {

          pairingReady = true;

          if (
            pairingReadyResolve
          ) {

            pairingReadyResolve(
              true
            );

            pairingReadyResolve = null;

          }

          console.log(
            "🔐 BK BABU pairing service is ready."
          );

        }


        if (
          connection === "connecting"
        ) {

          console.log(
            "🔄 BK BABU connecting to WhatsApp..."
          );

        }


        if (
          connection === "open"
        ) {

          pairingReady = false;

          console.log("");
          console.log(
            "╔════════════════════════════════════╗"
          );
          console.log(
            "║       🤖 BK BABU BOT ONLINE       ║"
          );
          console.log(
            "╚════════════════════════════════════╝"
          );
          console.log("");

        }


        if (
          connection === "close"
        ) {

          const statusCode =
            lastDisconnect
              ?.error
              ?.output
              ?.statusCode;


          console.log(
            "❌ WhatsApp connection closed."
          );

          console.log(
            "Status Code:",
            statusCode
          );


          pairingSocket = null;
          pairingReady = false;


          if (
            statusCode ===
            DisconnectReason.loggedOut
          ) {

            console.log(
              "⚠️ WhatsApp session logged out."
            );

            try {

              fs.rmSync(
                AUTH_DIR,
                {
                  recursive: true,
                  force: true
                }
              );

            } catch (e) {

              console.log(
                "Session cleanup error:",
                e.message
              );

            }

            return;

          }


          console.log(
            "🔄 Restarting WhatsApp connection..."
          );


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

    pairingSocket.ev.on(
      "messages.upsert",
      async ({
        messages
      }) => {

        try {

          const msg =
            messages[0];


          if (
            !msg ||
            !msg.message ||
            msg.key.fromMe
          ) {

            return;

          }


          const jid =
            msg.key.remoteJid;


          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage
              ?.text ||
            "";


          const command =
            text
              .trim()
              .toLowerCase();


          /* .ping */

          if (
            command === ".ping"
          ) {

            await pairingSocket.sendMessage(
              jid,
              {
                text:
                  "🏓 Pong!\n\n" +
                  "🤖 BK BABU BOT is online."
              }
            );

          }


          /* .menu */

          if (
            command === ".menu"
          ) {

            await pairingSocket.sendMessage(
              jid,
              {

                text:
                  "🤖 *BK BABU BOT*\n\n" +

                  "━━━━━━━━━━━━━━\n" +

                  "🏓 .ping\n" +

                  "📋 .menu\n" +

                  "ℹ️ .about\n" +

                  "━━━━━━━━━━━━━━\n\n" +

                  "⚡ POWERED BY BK BABU"

              }
            );

          }


          /* .about */

          if (
            command === ".about"
          ) {

            await pairingSocket.sendMessage(
              jid,
              {

                text:
                  "🤖 *BK BABU BOT*\n\n" +

                  "⚡ WhatsApp Bot powered by Baileys\n" +

                  "👑 Owner: BK BABU"

              }
            );

          }


        } catch (error) {

          console.error(
            "❌ Message Error:",
            error.message
          );

        }

      }
    );


  } catch (error) {

    console.error(
      "❌ BK BABU START ERROR:",
      error
    );


    pairingSocket = null;
    pairingReady = false;


    setTimeout(
      () => {

        startBot();

      },
      10000
    );

  }

}


/* =========================================================
   START
   ========================================================= */

startBot();
