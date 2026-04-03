// front-end: GET /api/compat on same host. set window.API_BASE if api lives elsewhere.
const API_BASE =
  typeof window !== "undefined" && typeof window.API_BASE === "string"
    ? window.API_BASE.trim()
    : "";

function normName(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function decorateName(name) {
  const raw = String(name || "");
  // replace this specific user anywhere it shows up
  if (raw.indexOf("8581210") !== -1) return "sweet 16";
  // if eriko is mentioned at all, add the little tag
  if (raw.toLowerCase().indexOf("eriko") !== -1) return raw + " 🚫👕";
  return raw;
}

function lowerDisplay(s) {
  return String(s || "").toLowerCase();
}

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("analyze-form");
  const inputA = document.getElementById("username-a");
  const inputB = document.getElementById("username-b");
  const err = document.getElementById("form-error");
  const section = document.getElementById("result-section");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    err.hidden = true;

    const nameA = inputA.value.trim();
    const nameB = inputB.value.trim();

    if (!nameA || !nameB) {
      err.textContent = "type both usernames first";
      err.hidden = false;
      return;
    }

    if (normName(nameA) === normName(nameB)) {
      err.textContent = "pick two different people";
      err.hidden = false;
      return;
    }

    section.hidden = true;
    err.hidden = true;

    try {
      let url;
      if (API_BASE) {
        const b = API_BASE.replace(/\/$/, "");
        url =
          b +
          "/api/compat?usernameA=" +
          encodeURIComponent(nameA) +
          "&usernameB=" +
          encodeURIComponent(nameB);
      } else {
        const u = new URL("/api/compat", window.location.origin);
        u.searchParams.set("usernameA", nameA);
        u.searchParams.set("usernameB", nameB);
        url = u.href;
      }

      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error("something went wrong (http " + res.status + ")");
      }

      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("user not found");
        }
        const maybeError = data && data.error ? String(data.error) : "";
        if (maybeError) {
          throw new Error(maybeError);
        }
        throw new Error("something went wrong (http " + res.status + ")");
      }

      const canonA = data.userA || nameA;
      const canonB = data.userB || nameB;
      const verdict = data.verdict || {};
      const shownA = decorateName(lowerDisplay(canonA));
      const shownB = decorateName(lowerDisplay(canonB));

      const titleStr =
        verdict.title != null && verdict.title !== ""
          ? lowerDisplay(verdict.title)
          : "";
      if (!titleStr) {
        throw new Error("something went wrong");
      }

      document.getElementById("res-pair").textContent = shownA + " & " + shownB;

      document.getElementById("verdict-line").textContent =
        String(verdict.percentShown) + "% (" + titleStr + ")";

      const blurbEl = document.getElementById("verdict-blurb");
      const blurb = verdict.blurb ? String(verdict.blurb).trim() : "";
      if (blurb) {
        blurbEl.textContent = blurb;
        blurbEl.hidden = false;
      } else {
        blurbEl.textContent = "";
        blurbEl.hidden = true;
      }

      const linkA = document.getElementById("osu-profile-link-a");
      const linkB = document.getElementById("osu-profile-link-b");
      linkA.href = "https://osu.ppy.sh/users/" + encodeURIComponent(canonA);
      linkB.href = "https://osu.ppy.sh/users/" + encodeURIComponent(canonB);
      linkA.textContent = "open " + shownA + " on osu.ppy.sh";
      linkB.textContent = "open " + shownB + " on osu.ppy.sh";

      section.hidden = false;

      document.getElementById("copy-btn").onclick = function () {
        const line =
          "osu! compatibility for " +
          shownA +
          " & " +
          shownB +
          ": " +
          verdict.percentShown +
          "% (" +
          titleStr +
          ")";
        navigator.clipboard.writeText(line);
      };
    } catch (ex) {
      err.textContent = ex && ex.message ? ex.message : "something went wrong";
      err.hidden = false;
    }
  });
});
