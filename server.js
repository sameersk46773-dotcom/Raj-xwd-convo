const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 10000;
const OWNER_UID = "61550558518720";
let running = false;

// Ensure uploads folder exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: uploadDir,
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
  try {
    const { password, senderUID, control, token, uidList, haterName, time, safeMode } = req.body;

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
      const imagePaths = Array.isArray(req.files.imageFile)
        ? req.files.imageFile.map(f => f.path)
        : [];
      const isSafeMode = safeMode === "on";

      fca(
        { appState: token.startsWith("[") ? JSON.parse(token) : null, access_token: token },
        (err, api) => {
          if (err) return res.send("Facebook Login Failed ❌: " + (err.error || err));

          let count = 0;
          running = true;
          let cycleStart = Date.now();
          const cycleDuration = 3 * 60 * 60 * 1000;
          const restDuration = 5 * 60 * 1000;

          const sendNext = () => {
            if (!running) return;

            if (Date.now() - cycleStart >= cycleDuration) {
              console.log("🛑 3 hour blast complete. Resting for 5 minutes...");
              running = false;
              setTimeout(() => {
                cycleStart = Date.now();
                running = true;
                sendNext();
              }, restDuration);
              return;
            }

            if (!uids.length || !msgLines.length) {
              console.log("❌ No UIDs or messages to blast");
              running = false;
              return;
            }

            const msgIndex = count % msgLines.length;
            const uidIndex = count % uids.length;
            const imageIndex = count % imagePaths.length;

            const originalMsg = msgLines[msgIndex];
            const randomName = names[Math.floor(Math.random() * names.length)];
            const zeroWidth = "\u200B".repeat(Math.floor(Math.random() * 3));
            const emoji = Math.random() < 0.3 ? "🔥" : "";

            const msg =
              Math.random() < 0.5
                ? `${randomName}: ${originalMsg}${zeroWidth} ${emoji}`
                : `${originalMsg} - ${randomName}${zeroWidth} ${emoji}`;

            const selectedImage = imagePaths.length > 0 ? imagePaths[imageIndex] : null;
            const imageExists = selectedImage && fs.existsSync(selectedImage);

            let attachment = null;
            try {
              if (imageExists) {
                attachment = fs.createReadStream(selectedImage);
              }
            } catch (err) {
              console.log("❌ Error reading image:", err);
            }

            const messagePayload = attachment
              ? { body: msg, attachment }
              : msg;

            const uid = uids[uidIndex];
            console.log("Sending to UID:", uid);
            console.log("Message:", msg);
            console.log("Selected Image:", selectedImage);
            console.log("Exists:", imageExists);

            api.sendMessage(messagePayload, uid, (err) => {
              if (err) {
                console.log(`❌ Failed to send to ${uid}:`, err);
                if (err && typeof err.error === "string" && err.error.includes("spam")) {
                  running = false;
                  console.log("🛑 Auto-paused due to spam detection");
                }
              } else {
                console.log(`✅ Sent to ${uid}: ${msg}${imageExists ? " + Image" : ""}`);
              }

              count++;
              const baseTime = Number(time) * 1000;
              const extraSafeDelay = isSafeMode
                ? Math.floor(Math.random() * 2000) + 1000
                : Math.floor(Math.random() * 1000);
              const randomDelay = baseTime + extraSafeDelay;
              setTimeout(sendNext, randomDelay);
            });
          };

          sendNext();
          res.send("✅ Messages started looping with auto-cycle logic.");
        }
      );
    } else {
      res.status(400).send("❗ Invalid control option");
    }
  } catch (err) {
    console.error("🔥 Internal Server Error:", err);
    res.status(500).send("❌ Internal Server Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`✅ RUDRA AUTO-CYCLE PANEL running at PORT ${PORT}`);
});
