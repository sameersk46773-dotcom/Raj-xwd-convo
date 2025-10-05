const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 10000;
const OWNER_UID = "61550558518720";
let running = false;

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
  const { password, senderUID, control, token, uidList, haterName, time, safeMode, loaderMsg } = req.body;

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
    const uids = uidList.split(/[\n,]+/).map(x => x.trim()).filter(x => x.length > 5);
    const names = haterName.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    const imagePaths = req.files.imageFile ? req.files.imageFile.map(f => f.path) : [];
    const isSafeMode = safeMode === "on";

    let loginData = {};
    try {
      if (token.trim().startsWith("[")) {
        loginData.appState = JSON.parse(token);
      } else if (token.trim().startsWith("EAAB")) {
        loginData.access_token = token.trim();
      } else {
        return res.status(400).send("❌ Invalid token format. Paste AppState JSON or EAAB token.");
      }
    } catch (e) {
      return res.status(400).send("❌ Token parsing failed.");
    }

    fca(loginData, (err, api) => {
      if (err) return res.send("Facebook Login Failed ❌: " + (err.error || err));

      let count = 0;
      running = true;

      const sendNext = () => {
        if (!running) return;

        const msgIndex = count % msgLines.length;
        const uidIndex = count % uids.length;
        const imageIndex = count % imagePaths.length;

        const originalMsg = msgLines[msgIndex];
        const randomName = names[Math.floor(Math.random() * names.length)];
        const zeroWidth = "\u200B".repeat(Math.floor(Math.random() * 3));

        const baseMsg =
          Math.random() < 0.5
            ? `${randomName}: ${originalMsg}${zeroWidth}`
            : `${originalMsg} - ${randomName}${zeroWidth}`;

        const finalMsg = loaderMsg
          ? `${loaderMsg}\n\n${baseMsg}`
          : baseMsg;

        const selectedImage = imagePaths.length > 0 ? imagePaths[imageIndex] : null;
        const messagePayload = selectedImage
          ? { body: finalMsg, attachment: fs.createReadStream(selectedImage) }
          : { body: finalMsg };

        const uid = uids[uidIndex];
        try {
          api.sendMessage(messagePayload, uid, (err) => {
            if (err) {
              console.log(`❌ Failed to send to ${uid}:`, err);
              if (err.error && err.error.includes("spam")) {
                running = false;
                console.log("🛑 Auto-paused due to spam detection");
              }
            } else {
              console.log(`✅ Sent to ${uid}: ${finalMsg}${selectedImage ? " + Image" : ""}`);
            }

            count++;
            const baseTime = Number(time) * 1000;
            const extraSafeDelay = isSafeMode ? Math.floor(Math.random() * 2000) + 1000 : Math.floor(Math.random() * 1000);
            const randomDelay = baseTime + extraSafeDelay;
            setTimeout(sendNext, randomDelay);
          });
        } catch (e) {
          console.log("🔥 Internal crash caught:", e);
          count++;
          setTimeout(sendNext, 1000);
        }
      };

      sendNext();
      res.send("✅ Messages started looping to all UIDs.");
    });
  } else {
    res.status(400).send("❗ Invalid control option");
  }
});

app.listen(PORT, () => {
  console.log(`✅ RUDRA MULTI CONVO Server running at PORT ${PORT}`);
});

// 🔁 Prevent Render Sleep
setInterval(() => {
  require("https").get("https://rudra-multi-convo-ui-version-3.onrender.com");
}, 5 * 60 * 1000);
