/**
 * Express app: static site + GET /api/compat
 * Loads .env, serves index.html at /.
 */
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const { fetchUser } = require("./u4k7");
const { buildCompatibilityVerdict } = require("./p1m3");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "HEAD", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

function normName(name) {
  return String(name || "").trim().replace(/^@/, "").toLowerCase();
}

app.get("/api/compat", async (req, res) => {
  const usernameA = String(req.query.usernameA || "").trim();
  const usernameB = String(req.query.usernameB || "").trim();

  if (!usernameA || !usernameB) {
    return res.status(400).json({ error: "type two usernames" });
  }

  if (normName(usernameA) === normName(usernameB)) {
    return res.status(400).json({ error: "pick two different usernames" });
  }

  try {
    const payloadA = await fetchUser(usernameA);
    const payloadB = await fetchUser(usernameB);

    const verdict = buildCompatibilityVerdict(payloadA, payloadB);

    return res.json({
      userA: payloadA.user.username,
      userB: payloadB.user.username,
      verdict,
    });
  } catch (e) {
    const msg = e && e.message ? String(e.message) : "";
    const lower = msg.toLowerCase();
    if (lower.indexOf("not found") !== -1) {
      return res.status(404).json({ error: "user not found" });
    }
    if (lower.indexOf("missing osu credentials") !== -1 || lower.indexOf("server missing") !== -1) {
      return res.status(500).json({
        error:
          "missing or invalid osu api keys — put OSU_CLIENT_ID + OSU_CLIENT_SECRET in .env (or OSU_API_KEY), restart npm start",
      });
    }
    if (lower.indexOf("legacy") !== -1 || lower.indexOf("osu v2") !== -1) {
      return res.status(500).json({ error: "osu api error — check keys and spelling of usernames" });
    }
    console.error("/api/compat error:", e);
    const raw = e && e.message ? String(e.message) : String(e);
    const safe = raw.length > 280 ? raw.slice(0, 280) + "…" : raw;
    return res.status(500).json({ error: safe || "something went wrong" });
  }
});

app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log("osu compat — http://localhost:" + PORT + " (restart after .env changes)");
});

server.on("error", function (err) {
  if (err && err.code === "EADDRINUSE") {
    console.error(
      "port " + PORT + " is already in use — stop the other node process or set PORT in .env"
    );
  } else {
    console.error("server listen error:", err);
  }
});
