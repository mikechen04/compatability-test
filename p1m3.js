/**
 * Compatibility score from two osu user payloads (top plays, ranks, mods, etc.).
 * Optional MANUAL_OVERRIDES for specific pairs — keys must match verdict.pairKey from the API.
 */
// keep in sync with how osu shows names: @ strip, spaces, unicode
function normName(name) {
  let s = String(name || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  try {
    s = s.normalize("NFC");
  } catch (e) {}
  return s.replace(/\s+/g, " ");
}

function pairKey(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return "";
  if (x < y) return x + "|" + y;
  return y + "|" + x;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// deterministic 0–100 from pair key (small jitter in final score)
function formulaPercentFromKey(key) {
  if (!key) return 0;
  const n = hashString(key);
  return n % 101;
}

function titleCaseLabel(s) {
  return String(s || "").replace(/\b\w/g, function (c) {
    return c.toUpperCase();
  });
}

// manual overrides — key format: "userA|userB" (order does not matter; must match osu names)
const MANUAL_OVERRIDES_RAW = {
  // "player1|player2": { label: "perfect duo", percent: 100 }
  "japanese foid|chinese foid": { label: "perfect duo", percent: 100 },
  "ethan jeon|sigge": { label: "perfect duo", percent: 100 },
  "acer|eriko": { label: "perfect duo", percent: 67 },
};

const MANUAL_OVERRIDES = Object.create(null);
for (const rawKey of Object.keys(MANUAL_OVERRIDES_RAW)) {
  const idx = rawKey.indexOf("|");
  if (idx === -1) continue;
  const canon = pairKey(rawKey.slice(0, idx), rawKey.slice(idx + 1));
  if (canon) MANUAL_OVERRIDES[canon] = MANUAL_OVERRIDES_RAW[rawKey];
}

function normalizeOverrideEntry(entry, formulaScore) {
  if (entry == null) return null;

  const fallback = Math.max(0, Math.round(Number(formulaScore) || 0));

  if (typeof entry === "string") {
    return { label: entry, percent: fallback };
  }

  if (typeof entry === "object") {
    const label = entry.label || entry.verdict || "";
    let p = entry.percent;

    if (p === "" || p == null || isNaN(Number(p))) {
      p = fallback;
    } else {
      p = Math.round(Number(p));
      if (p < 0) p = 0;
    }

    return { label: label, percent: p };
  }

  return null;
}

function pickRawOverride(key) {
  if (!key) return null;
  return MANUAL_OVERRIDES[key] || null;
}

function verdictTitleFromPercent(pct) {
  const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));

  let title = "its complicated";
  if (p <= 15) title = "catastrophic";
  else if (p <= 30) title = "probably doomed";
  else if (p <= 45) title = "rocky";
  else if (p <= 55) title = "its complicated";
  else if (p <= 70) title = "could work";
  else if (p <= 85) title = "pretty solid";
  else title = "soulmate tier";

  return title;
}

function clampNumber(x, min, max) {
  const n = Number(x);
  if (isNaN(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function countIntersection(setA, setB) {
  let n = 0;
  setA.forEach(function (v) {
    if (setB.has(v)) n++;
  });
  return n;
}

function buildModTokenSets(topPlays) {
  const tokens = new Set();
  const list = topPlays || [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const arr = p.modsTokens || [];
    for (let j = 0; j < arr.length; j++) {
      const t = String(arr[j] || "").trim().toUpperCase();
      if (t) tokens.add(t);
    }
  }
  return tokens;
}

function buildBeatmapIdSet(topPlays) {
  const s = new Set();
  const list = topPlays || [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const id = p.beatmap_id != null ? String(p.beatmap_id) : "";
    if (id) s.add(id);
  }
  return s;
}

function computeRankCloseness(rankA, rankB) {
  if (rankA == null || rankB == null) return 50;
  const a = Number(rankA);
  const b = Number(rankB);
  if (isNaN(a) || isNaN(b)) return 50;
  const diff = Math.abs(a - b);
  const scale = 5000;
  const score = 100 / (1 + diff / scale);
  return clampNumber(Math.round(score), 0, 100);
}

function computeBadgeCloseness(badgesA, badgesB) {
  if (badgesA == null || badgesB == null) return 50;
  const a = Number(badgesA);
  const b = Number(badgesB);
  if (isNaN(a) || isNaN(b)) return 50;
  const diff = Math.abs(a - b);
  const scale = 15;
  const score = 100 / (1 + diff / scale);
  return clampNumber(Math.round(score), 0, 100);
}

function buildCompatibilityVerdict(payloadA, payloadB) {
  const userA = payloadA.user || {};
  const userB = payloadB.user || {};

  const key = pairKey(userA.username, userB.username);
  const randomPct = formulaPercentFromKey(key);

  const topA = payloadA.topPlays || [];
  const topB = payloadB.topPlays || [];

  const beatA = buildBeatmapIdSet(topA);
  const beatB = buildBeatmapIdSet(topB);
  const beatOverlapCount = countIntersection(beatA, beatB);
  const beatOverlapScore = clampNumber(Math.round((beatOverlapCount / 10) * 100), 0, 100);

  const modsA = buildModTokenSets(topA);
  const modsB = buildModTokenSets(topB);

  const modIntersection = countIntersection(modsA, modsB);
  const modUnionSize = modsA.size + modsB.size - modIntersection;
  const modOverlapJ = modUnionSize > 0 ? modIntersection / modUnionSize : 0;
  const modOverlapScore = clampNumber(Math.round(modOverlapJ * 100), 0, 100);

  const rankA = userA.global_rank != null ? Number(userA.global_rank) : null;
  const rankB = userB.global_rank != null ? Number(userB.global_rank) : null;
  const rankCloseness = computeRankCloseness(rankA, rankB);

  const badgesA = userA.badgesCount != null ? Number(userA.badgesCount) : null;
  const badgesB = userB.badgesCount != null ? Number(userB.badgesCount) : null;
  const badgeCloseness = computeBadgeCloseness(badgesA, badgesB);

  const baseScore =
    beatOverlapScore * 0.4 +
    modOverlapScore * 0.3 +
    rankCloseness * 0.2 +
    badgeCloseness * 0.1;
  const jitter = (randomPct - 50) * 0.15;

  const score = clampNumber(Math.round(baseScore + jitter), 0, 100);

  const rawOv = pickRawOverride(key);
  if (rawOv != null) {
    const fixed = normalizeOverrideEntry(rawOv, score);
    const title = fixed.label
      ? titleCaseLabel(fixed.label)
      : verdictTitleFromPercent(fixed.percent);
    return {
      title,
      percentShown: fixed.percent,
      blurb: "",
      pairKey: key,
    };
  }

  const title = verdictTitleFromPercent(score);
  return {
    title,
    percentShown: Math.max(0, Math.min(100, Math.round(score))),
    blurb: "",
    pairKey: key,
  };
}

module.exports = { buildCompatibilityVerdict };
