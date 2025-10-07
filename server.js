const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 10000;
const OWNER_UID = "61550558518720";
let running = false;
let lockedNames = {}; // threadID: lockedName

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(__dirname));

app.post("/send", upload.fields([
  { name: "npFile", maxCount: 1 },
  { name: "imageFile", maxCount: 50 }
]), async (req, res) => {
  const { password, senderUID, control, token, uidList, haterName, time, safeMode, extraMsg } = req.body;

  if (password !== "16×8=JAAT") return res.status(401).send("❌ Incorrect Password");
  if (senderUID !== OWNER_UID) return res.status(403).send("❌ Only Owner UID can control the convo");

  if (control === "stop") {
    running = false;
    return res.send("🛑 Messages stopped successfully.");
  }

  if (control === "start") {
    if (!token || !uidList || !haterName || !req.files.npFile || !time) {
      return res.status(400).send("❗ Missing required fields");
    }

    const fca = require("fca-smart-shankar");
    const msgLines = fs.readFileSync(req.files.npFile[0].path, "utf-8").split("\n").filter(Boolean);
    const uids = uidList.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    const names = haterName.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    const imagePaths = req.files.imageFile ? req.files.imageFile.map(f => f.path) : [];
    const isSafeMode = safeMode === "on";

    fca(
      { appState: token.startsWith("[") ? JSON.parse(token) : null, access_token: token },
      (err, api) => {
        if (err) return res.send("Facebook Login Failed ❌: " + (err.error || err));

        let count = 0;
        running = true;

        // 🔐 Group Name Lock Listener
        api.listenMqtt((err, event) => {
          if (err || !event || !event.body) return;
          const { threadID, senderID, body } = event;

          console.log("📩 Received message:", { threadID, senderID, body });

          if (body === "!ping") {
            return api.sendMessage("✅ Panel active hai bhai!", threadID);
          }

          if (body.startsWith("!lockname ")) {
            if (senderID !== OWNER_UID) {
              return api.sendMessage("❌ Only owner can lock group name.", threadID);
            }
            const lockedName = body.slice(10).trim();
            lockedNames[threadID] = lockedName;
            api.setTitle(threadID, lockedName);
            api.sendMessage(`🔐 Group name locked by admin.\n✅ Locked name: ${lockedName}`, threadID);
          }

          if (body === "!unlockname") {
            if (senderID !== OWNER_UID) {
              return api.sendMessage("❌ Only owner can unlock group name.", threadID);
            }
            delete lockedNames[threadID];
            api.sendMessage("🔓 Group name unlocked. You may now change it.", threadID);
          }
        });

        // 🔁 Monitor Group Name Every 3 Seconds
        setInterval(() => {
          Object.keys(lockedNames).forEach(threadID => {
            api.getThreadInfo(threadID, (err, info) => {
              if (err || !info || !info.name) return;
              const currentName = info.name;
              const lockedName = lockedNames[threadID];
              if (currentName !== lockedName) {
                api.setTitle(threadID, lockedName);
                api.sendMessage(`🚫 Group name change detected.\n🔒 Restored locked name: ${lockedName}`, threadID);
              }
            });
          });
        }, 3000);

        // 🔁 Message Loop
        const sendNext = () => {
          if (!running) return;

          const msgIndex = count % msgLines.length;
          const uidIndex = count % uids.length;
          const imageIndex = count % imagePaths.length;

          const originalMsg = msgLines[msgIndex];
          const randomName = names[Math.floor(Math.random() * names.length)];
          const zeroWidth = "\u200B".repeat(Math.floor(Math.random() * 3));
          const mergedMsg = extraMsg ? `${originalMsg} ${extraMsg}` : originalMsg;

          const msg =
            Math.random() < 0.5
              ? `${randomName}: ${mergedMsg}${zeroWidth}`
              : `${mergedMsg} - ${randomName}${zeroWidth}`;

          const selectedImage = imagePaths.length > 0 ? imagePaths[imageIndex] : null;
          const messagePayload = selectedImage
            ? { body: msg, attachment: fs.createReadStream(selectedImage) }
            : { body: msg };

          const uid = uids[uidIndex];
          api.sendMessage(messagePayload, uid, (err) => {
            if (err) {
              console.log(`❌ Failed to send to ${uid}:`, err);
              if (err.error && err.error.includes("spam")) {
                running = false;
                console.log("🛑 Auto-paused due to spam detection");
              }
            } else {
              console.log(`✅ Sent to ${uid}: ${msg}${selectedImage ? " + Image" : ""}`);
            }

            count++;
            const baseTime = Number(time) * 1000;
            const extraSafeDelay = isSafeMode ? Math.floor(Math.random() * 2000) + 1000 : Math.floor(Math.random() * 1000);
            const randomDelay = baseTime + extraSafeDelay;
            setTimeout(sendNext, randomDelay);
          });
        };

        sendNext();
        res.send("✅ Messages started looping to all UIDs.");
      }
    );
  } else {
    res.status(400).send("❗ Invalid control option");
  }
});

app.listen(PORT, () => {
  console.log(`✅ RUDRA MULTI CONVO Server running at PORT ${PORT}`);
});
