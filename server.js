const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 10000;
const OWNER_UID = "61550558518720";

let running = false;
let lockedNames = {};
let activeIntervals = [];
let listenerStarted = false;

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static(__dirname));

function clearAllIntervals() {
  activeIntervals.forEach(clearInterval);
  activeIntervals = [];
}

app.get("/", (req, res) => {
  res.send("✅ RUDRA PANEL RUNNING");
});

app.post("/send", upload.fields([
  { name: "npFile", maxCount: 1 },
  { name: "imageFile", maxCount: 50 }
]), async (req, res) => {
  try {
    const {
      password,
      senderUID,
      control,
      token,
      uidList,
      haterName,
      time,
      safeMode,
      extraMsg,
      safeInboxUIDList,
      autoLockName,
      loginType,
      email,
      passwordInput
    } = req.body;

    if (password !== "16×8=JAAT") {
      return res.status(401).send("❌ Incorrect Password");
    }

    if (senderUID !== OWNER_UID) {
      return res.status(403).send("❌ Only Owner UID can control the convo");
    }

    if (control === "stop") {
      running = false;
      clearAllIntervals();
      return res.send("🛑 Messages stopped.");
    }

    if (control !== "start") {
      return res.status(400).send("❗ Invalid control option");
    }

    if (!uidList || !haterName || !req.files?.npFile || !time) {
      return res.status(400).send("❗ Missing required fields");
    }

    const fca = require("Fca-rudra-1.2");

    let loginData = {};

    try {
      // 🔐 EMAIL / PHONE + PASSWORD LOGIN
      if (loginType === "email") {
        if (!email || !passwordInput) {
          return res.status(400).send("❌ Email/Phone aur Password required hai");
        }

        loginData.email = email.trim();
        loginData.password = passwordInput.trim();

      } 
      // 🔑 APPSTATE / ACCESS TOKEN LOGIN
      else {
        if (!token) {
          return res.status(400).send("❌ AppState ya Token required hai");
        }

        if (token.trim().startsWith("[")) {
          loginData.appState = JSON.parse(token);
        } else {
          loginData.access_token = token.trim();
        }
      }

    } catch {
      return res.status(400).send("❌ Invalid login format");
    }

    const msgLines = fs
      .readFileSync(req.files.npFile[0].path, "utf-8")
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean);

    const blastUIDList = uidList
      .split(/[\n,]+/)
      .map(x => x.trim())
      .filter(Boolean);

    const names = haterName
      .split(/[\n,]+/)
      .map(x => x.trim())
      .filter(Boolean);

    const imagePaths = req.files.imageFile
      ? req.files.imageFile.map(f => f.path)
      : [];

    const safeUIDPool = safeInboxUIDList
      ? safeInboxUIDList.split(/[\n,]+/).map(x => x.trim()).filter(Boolean)
      : [];

    const isSafeMode = safeMode === "on";

    fca(loginData, (err, api) => {
      if (err) {
        console.log("Login Error:", err);
        return res.status(500).send("Facebook Login Failed ❌");
      }

      api.setOptions({
        forceLogin: true,
        selfListen: false,
        listenEvents: true,
        updatePresence: false
      });

      running = true;
      let count = 0;

      if (!listenerStarted) {
        listenerStarted = true;

        const startListener = () => {
          api.listenMqtt((err, event) => {
            if (err || !event || !event.body) return;

            const { threadID, senderID, body } = event;

            if (body === "!ping") {
              return api.sendMessage("✅ Panel active hai bhai!", threadID);
            }

            if (body === "!help") {
              return api.sendMessage("📜 Commands: !ping, !lockname NAME, !unlockname", threadID);
            }

            if (body.startsWith("!lockname ")) {
              if (senderID !== OWNER_UID) {
                return api.sendMessage("❌ Only owner can lock group name.", threadID);
              }

              const lockedName = body.slice(10).trim();
              lockedNames[threadID] = lockedName;

              api.setTitle(lockedName, threadID, () => {
                api.sendMessage(`🔐 Group name locked: ${lockedName}`, threadID);
              });
            }

            if (body === "!unlockname") {
              if (senderID !== OWNER_UID) {
                return api.sendMessage("❌ Only owner can unlock group name.", threadID);
              }

              delete lockedNames[threadID];
              api.sendMessage("🔓 Group name unlocked.", threadID);
            }
          });
        };

        startListener();
      }

      if (autoLockName) {
        api.getThreadList(20, null, ["INBOX"], (err, threads) => {
          if (err || !threads) return;

          threads.forEach(thread => {
            if (thread.isGroup) {
              lockedNames[thread.threadID] = autoLockName;

              api.setTitle(autoLockName, thread.threadID, () => {
                api.sendMessage(`🔐 Auto-locked group name: ${autoLockName}`, thread.threadID);
              });
            }
          });
        });
      }

      const monitorInterval = setInterval(() => {
        Object.keys(lockedNames).forEach(threadID => {
          api.getThreadInfo(threadID, (err, info) => {
            if (err || !info?.name) return;

            if (info.name !== lockedNames[threadID]) {
              api.setTitle(lockedNames[threadID], threadID, () => {
                api.sendMessage(`🚫 Name changed detected.\n🔒 Restored: ${lockedNames[threadID]}`, threadID);
              });
            }
          });
        });
      }, 5000);

      activeIntervals.push(monitorInterval);

      const sendNext = () => {
        if (!running) return;

        const msgIndex = count % msgLines.length;
        const uidIndex = count % blastUIDList.length;
        const imageIndex = imagePaths.length ? count % imagePaths.length : 0;

        const originalMsg = msgLines[msgIndex];
        const randomName = names[Math.floor(Math.random() * names.length)];

        const zeroWidth = "\u200B".repeat(Math.floor(Math.random() * 3));
        const mergedMsg = extraMsg ? `${originalMsg} ${extraMsg}` : originalMsg;

        const msg =
          Math.random() < 0.5
            ? `${randomName}: ${mergedMsg}${zeroWidth}`
            : `${mergedMsg} - ${randomName}${zeroWidth}`;

        const blastUID = blastUIDList[uidIndex];

        let messagePayload = { body: msg };

        if (imagePaths.length > 0) {
          try {
            messagePayload.attachment = fs.createReadStream(imagePaths[imageIndex]);
          } catch {}
        }

        let attempts = 0;

        const trySend = () => {
          api.sendMessage(messagePayload, blastUID, (err) => {
            if (err && attempts < 3) {
              attempts++;
              console.log(`🔁 Retry ${attempts} for ${blastUID}`);
              return setTimeout(trySend, 1500);
            }

            if (!err) {
              console.log(`✅ Sent to ${blastUID}`);
            }

            if (count % 5 === 0) {
              api.sendMessage("Hello, I am working.", OWNER_UID, () => {});
            }

            if (count % 7 === 0 && safeUIDPool.length > 0) {
              const safeUID =
                safeUIDPool[Math.floor(Math.random() * safeUIDPool.length)];

              const humanMsg =
                Math.random() < 0.5
                  ? "Just testing panel. All good 👍"
                  : "Busy with some client work, will ping later.";

              api.sendMessage(humanMsg, safeUID, () => {});
            }

            count++;

            const baseTime = Number(time) * 1000;

            const extraSafeDelay = isSafeMode
              ? Math.floor(Math.random() * 2000) + 1000
              : Math.floor(Math.random() * 1000);

            setTimeout(sendNext, baseTime + extraSafeDelay);
          });
        };

        trySend();
      };

      sendNext();

      res.send("✅ Messages started looping to all UIDs.");
    });

  } catch (error) {
    console.log("Server Error:", error);
    res.status(500).send("❌ Internal Server Error");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ RUDRA PANEL v10.5 running at PORT ${PORT}`);
});
