const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 10000;
const OWNER_UID = "61550558518720";
let running = false;
let intervalId = null;

// 🔧 Multer setup for both text file and image
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
  { name: "imageFile", maxCount: 1 }
]), async (req, res) => {
  const { password, senderUID, control, token, uidList, haterName, time } = req.body;

  if (password !== "16×8=JAAT") {
    return res.status(401).send("❌ Incorrect Password");
  }

  if (senderUID !== OWNER_UID) {
    return res.status(403).send("❌ Only Owner UID can control the convo");
  }

  if (control === "stop") {
    running = false;
    clearInterval(intervalId);
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
    const imagePath = req.files.imageFile ? req.files.imageFile[0].path : null;

    fca(
      { appState: token.startsWith("[") ? JSON.parse(token) : null, access_token: token },
      (err, api) => {
        if (err) return res.send("Facebook Login Failed ❌: " + (err.error || err));

        let count = 0;
        running = true;

        intervalId = setInterval(() => {
          if (!running) {
            clearInterval(intervalId);
            return;
          }

          if (count >= msgLines.length) {
            count = 0;
          }

          const originalMsg = msgLines[count];
          const randomName = names[Math.floor(Math.random() * names.length)];

          const msg =
            Math.random() < 0.5
              ? `${randomName}: ${originalMsg}`
              : `${originalMsg} - ${randomName}`;

          const messagePayload = imagePath
            ? { body: msg, attachment: fs.createReadStream(imagePath) }
            : msg;

          for (let uid of uids) {
            api.sendMessage(messagePayload, uid, (err) => {
              if (err) {
                console.log(`❌ Failed to send to ${uid}:`, err);
              } else {
                console.log(`✅ Sent to ${uid}: ${msg}${imagePath ? " + Image" : ""}`);
              }
            });
          }

          count++;
        }, Number(time) * 1000);

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
