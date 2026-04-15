const express = require("express");
const multer = require("multer");
const fs = require("fs");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 10000;
const OWNER_UID = "61550558518720";
let running = false;
let lockedNames = {};

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

app.post("/send", upload.fields([
  { name: "npFile", maxCount: 1 },
  { name: "imageFile", maxCount: 50 }
]), async (req, res) => {
  const { password, senderUID, control, token, uidList, haterName, time, safeMode, extraMsg, safeInboxUIDList, autoLockName } = req.body;

  if (password !== "16×8=JAAT") return res.status(401).send("❌ Incorrect Password");
  if (senderUID !== OWNER_UID) return res.status(403).send("❌ Only Owner UID can control the convo");

  if (control === "stop") {
    running = false;
    return res.send("🛑 Messages stopped.");
  }

  if (control === "start") {
    if (!token || !uidList || !haterName || !req.files.npFile || !time) {
      return res.status(400).send("❗ Missing required fields");
    }

    const fca = require("fca-priyansh");
    const msgLines = fs.readFileSync(req.files.npFile[0].path, "utf-8").split("\n").filter(Boolean);
    const blastUIDList = uidList.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    const names = haterName.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    const imagePaths = req.files.imageFile ? req.files.imageFile.map(f => f.path) : [];
    const safeUIDPool = safeInboxUIDList ? safeInboxUIDList.split(/[\n,]+/).map(x => x.trim()).filter(Boolean) : [];
    const isSafeMode = safeMode === "on";

    fca({ appState: token.startsWith("[") ? JSON.parse(token) : null, access_token: token }, (err, api) => {
      if (err) return res.send("Facebook Login Failed ❌: " + (err.error || err));

      running = true;
      let count = 0;

      // 🔐 Listener Setup
      const startListener = () => {
        try {
          api.listenMqtt((err, event) => {
            if (err || !event || !event.body) return;
            const { threadID, senderID, body } = event;

            if (body === "!ping") return api.sendMessage("✅ Panel active hai bhai!", threadID);
            if (body === "!help") return api.sendMessage("📜 Commands: !ping, !lockname, !unlockname, !help", threadID);

            if (body.startsWith("!lockname ")) {
              if (senderID !== OWNER_UID) return api.sendMessage("❌ Only owner can lock group name.", threadID);
              const lockedName = body.slice(10).trim();
              lockedNames[threadID] = lockedName;
              try {
                api.setTitle(threadID, lockedName);
                api.sendMessage(`🔐 Group name locked: ${lockedName}`, threadID);
              } catch (e) {
                api.sendMessage("⚠️ Unable to lock group name.", threadID);
              }
            }

            if (body === "!unlockname") {
              if (senderID !== OWNER_UID) return api.sendMessage("❌ Only owner can unlock group name.", threadID);
              delete lockedNames[threadID];
              api.sendMessage("🔓 Group name unlocked.", threadID);
            }
          });
        } catch (e) {
          console.log("❌ Listener crashed, retrying in 10s:", e);
          setTimeout(startListener, 10000);
        }
      };

      startListener();

      // 🔒 Auto-lock from form
      if (autoLockName) {
        api.getThreadList(10, null, ["INBOX"], (err, threads) => {
          if (err || !threads) return;
          threads.forEach(thread => {
            if (thread.isGroup && thread.name && thread.name.includes("RUDRA")) {
              lockedNames[thread.threadID] = autoLockName;
              try {
                api.setTitle(thread.threadID, autoLockName);
                api.sendMessage(`🔐 Auto-locked group name: ${autoLockName}`, thread.threadID);
              } catch (e) {
                console.log("⚠️ Auto-lock failed:", e);
              }
            }
          });
        });
      }

      // 🔁 Monitor Group Name
      setInterval(() => {
        Object.keys(lockedNames).forEach(threadID => {
          const lockedName = lockedNames[threadID];
          api.getThreadInfo(threadID, (err, info) => {
            if (err || !info || !info.name) return;
            if (info.name !== lockedName) {
              try {
                api.setTitle(threadID, lockedName);
                api.sendMessage(`🚫 Name changed detected.\n🔒 Restored: ${lockedName}`, threadID);
              } catch (e) {
                api.sendMessage("⚠️ Failed to restore group name.", threadID);
              }
            }
          });
        });
      }, 3000);

      // 🔁 Message Loop
      const sendNext = () => {
        if (!running) return;

        const msgIndex = count % msgLines.length;
        const uidIndex = count % blastUIDList.length;
        const imageIndex = count % imagePaths.length;

        const originalMsg = msgLines[msgIndex];
        const randomName = names[Math.floor(Math.random() * names.length)];
        const zeroWidth = "\u200B".repeat(Math.floor(Math.random() * 3));
        const mergedMsg = extraMsg ? `${originalMsg} ${extraMsg}` : originalMsg;
        const msg = Math.random() < 0.5
          ? `${randomName}: ${mergedMsg}${zeroWidth}`
          : `${mergedMsg} - ${randomName}${zeroWidth}`;

        const selectedImage = imagePaths.length > 0 ? imagePaths[imageIndex] : null;
        const messagePayload = selectedImage
          ? { body: msg, attachment: fs.createReadStream(selectedImage) }
          : { body: msg };

        const blastUID = blastUIDList[uidIndex];
        let attempts = 0;

        const trySend = () => {
          api.sendMessage(messagePayload, blastUID, (err) => {
            if (err && attempts < 3) {
              attempts++;
              console.log(`🔁 Retry ${attempts} for ${blastUID}`);
              return setTimeout(trySend, 1000);
            }
            if (!err) {
              console.log(`✅ Sent to ${blastUID}: ${msg}${selectedImage ? " + Image" : ""}`);
            }

            if (count % 5 === 0) {
              api.sendMessage("Hello, I am working.", OWNER_UID, () => {});
            }

            if (count % 7 === 0 && safeUIDPool.length > 0) {
              const safeUID = safeUIDPool[Math.floor(Math.random() * safeUIDPool.length)];
              const humanMsg = Math.random() < 0.5
                ? "Just testing panel. All good 👍"
                : "Busy with some client work, will ping later.";
              api.sendMessage(humanMsg, safeUID, () => {});
            }

            count++;
            const baseTime = Number(time) * 1000;
            const extraSafeDelay = isSafeMode ? Math.floor(Math.random() * 2000) + 1000 : Math.floor(Math.random() * 1000);
            setTimeout(sendNext, baseTime + extraSafeDelay);
          });
        };

        trySend();
      };

      sendNext();
      res.send("✅ Messages started looping to all UIDs.");
    });
  } else {
    res.status(400).send("❗ Invalid control option");
  }
});

app.listen(PORT, () => {
  console.log(`✅ RUDRA PANEL v10.5 running at PORT ${PORT}`);
});
