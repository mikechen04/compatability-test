/**
 * osu! API: OAuth v2 (preferred) or legacy API key fallback.
 * Exports fetchUser(username) -> { user, topPlays, source }.
 */
require("dotenv").config();

let tokenCache = { access_token: null, expires_at: 0 };

function cleanUsername(name) {
  return String(name || "").trim().replace(/^@/, "");
}

async function getV2Token() {
  const id = process.env.OSU_CLIENT_ID;
  const secret = process.env.OSU_CLIENT_SECRET;

  if (!id || !secret) return null;

  const now = Date.now();
  if (tokenCache.access_token && now < tokenCache.expires_at - 60_000) {
    return tokenCache.access_token;
  }

  const res = await fetch("https://osu.ppy.sh/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Number(id) || id,
      client_secret: secret,
      grant_type: "client_credentials",
      scope: "public",
    }),
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  tokenCache.access_token = data.access_token;
  tokenCache.expires_at = now + (data.expires_in || 3600) * 1000;
  return tokenCache.access_token;
}

function stripHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function legacyModsToTokens(bits) {
  let n = Number(bits) || 0;
  if (n === 0) return [];
  const parts = [];
  if (n & 256) parts.push("HT");
  if (n & 64) parts.push("DT");
  if (n & 512) parts.push("NC");
  if (n & 2) parts.push("EZ");
  if (n & 8) parts.push("HD");
  if (n & 16) parts.push("HR");
  if (n & 32) parts.push("SD");
  if (n & 1024) parts.push("FL");
  if (n & 1) parts.push("NF");
  if (n & 128) parts.push("RX");
  if (n & 4096) parts.push("SO");
  return parts;
}

function legacyModsToString(bits) {
  return legacyModsToTokens(bits).join("");
}

function stringifyV2ModsTokens(modsArr) {
  if (!Array.isArray(modsArr)) return [];
  const parts = [];
  for (let i = 0; i < modsArr.length; i++) {
    const m = modsArr[i];
    if (typeof m === "string") parts.push(m);
    else if (m && typeof m.acronym === "string") parts.push(m.acronym);
  }
  return parts;
}

async function fetchV2UserSimple(username) {
  const token = await getV2Token();
  if (!token) return null;

  const safe = encodeURIComponent(cleanUsername(username));
  const userUrl = `https://osu.ppy.sh/api/v2/users/@${safe}/osu?include=page,statistics,badges`;

  const userRes = await fetch(userUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!userRes.ok) {
    if (userRes.status === 404) throw new Error("user not found");
    const t = await userRes.text();
    throw new Error("osu v2 user failed: " + t);
  }

  let u = await userRes.json();
  if (u.data && u.data.attributes) {
    u = { id: u.data.id, ...u.data.attributes };
  }

  const stats = u.statistics || {};
  const pageRaw =
    (u.page && (u.page.raw || u.page.html)) || "";

  let badgesCount = null;
  if (Array.isArray(u.badges)) badgesCount = u.badges.length;
  else if (u.badgesCount != null) badgesCount = Number(u.badgesCount);
  else if (u.badge_count != null) badgesCount = Number(u.badge_count);
  else if (u.badges && Array.isArray(u.badges.data)) badgesCount = u.badges.data.length;

  const id = u.id;
  const scoresUrl = `https://osu.ppy.sh/api/v2/users/${id}/scores/best?mode=osu&limit=10`;

  const scoresRes = await fetch(scoresUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let topPlays = [];
  if (scoresRes.ok) {
    const scores = await scoresRes.json();
    if (Array.isArray(scores)) {
      topPlays = scores.map((item) => {
        const s = item || {};
        const b = s.beatmap || {};
        const meta = s.beatmapset || b.beatmapset || {};
        const modsTokens = stringifyV2ModsTokens(s.mods || []);
        return {
          beatmap_id: b.id,
          title: meta.title || "",
          artist: meta.artist || "",
          difficulty: b.version || "",
          pp: s.pp != null ? Number(s.pp) : null,
          mods: modsTokens.join(""),
          modsTokens: modsTokens,
          rank: s.rank != null ? Number(s.rank) : null,
          accuracy: s.accuracy != null ? Number(s.accuracy) : null,
        };
      });
    }
  }

  return {
    source: "v2",
    user: {
      id: u.id,
      username: u.username,
      pp: stats.pp != null ? Number(stats.pp) : null,
      global_rank: stats.global_rank != null ? Number(stats.global_rank) : null,
      playcount: stats.play_count != null ? Number(stats.play_count) : null,
      accuracy: stats.hit_accuracy != null ? Number(stats.hit_accuracy) : null,
      level: u.level && u.level.current != null ? Number(u.level.current) : null,
      country: u.country_code || (u.country && u.country.code) || "",
      badgesCount: badgesCount != null && !isNaN(Number(badgesCount)) ? Number(badgesCount) : null,
      profile_html: pageRaw,
      profile_text: stripHtml(pageRaw),
    },
    topPlays,
  };
}

async function fetchLegacyUserSimple(username, apiKey) {
  const safe = encodeURIComponent(cleanUsername(username));
  const base = "https://osu.ppy.sh/api";
  const userUrl = `${base}/get_user?k=${apiKey}&u=${safe}&type=string`;

  const bestUrl = `${base}/get_user_best?k=${apiKey}&u=${safe}&type=string&limit=10&m=0`;

  const [userRes, bestRes] = await Promise.all([fetch(userUrl), fetch(bestUrl)]);
  if (!userRes.ok) throw new Error("osu legacy get_user failed");

  const users = await userRes.json();
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error("user not found");
  }

  const urow = users[0];

  let topPlays = [];
  if (bestRes && bestRes.ok) {
    const scores = await bestRes.json();
    if (Array.isArray(scores)) {
      topPlays = scores.map((s) => {
        return {
          beatmap_id: s.beatmap_id,
          pp: s.pp != null ? Number(s.pp) : null,
          mods: legacyModsToString(s.enabled_mods),
          modsTokens: legacyModsToTokens(s.enabled_mods),
          rank: s.rank != null ? Number(s.rank) : null,
          accuracy: s.accuracy != null ? Number(s.accuracy) : null,
        };
      });
    }
  }

  return {
    source: "legacy",
    user: {
      id: Number(urow.user_id),
      username: urow.username,
      pp: urow.pp_raw != null ? Number(urow.pp_raw) : null,
      global_rank: urow.pp_rank != null ? Number(urow.pp_rank) : null,
      playcount: urow.playcount != null ? Number(urow.playcount) : null,
      accuracy: urow.accuracy != null ? Number(urow.accuracy) : null,
      level: urow.level != null ? Number(urow.level) : null,
      country: urow.country || "",
      profile_html: "",
      profile_text: "",
      badgesCount: null,
    },
    topPlays,
  };
}

async function fetchUser(username) {
  const name = cleanUsername(username);
  if (!name) throw new Error("missing username");

  let payload = null;

  if (process.env.OSU_CLIENT_ID && process.env.OSU_CLIENT_SECRET) {
    try {
      payload = await fetchV2UserSimple(name);
    } catch (e) {
      payload = null;
    }
  }

  if (!payload && process.env.OSU_API_KEY) {
    payload = await fetchLegacyUserSimple(name, process.env.OSU_API_KEY);
  }

  if (!payload) {
    throw new Error(
      "server missing osu credentials. set OSU_CLIENT_ID + OSU_CLIENT_SECRET (recommended) or OSU_API_KEY"
    );
  }

  return payload;
}

module.exports = { fetchUser };
