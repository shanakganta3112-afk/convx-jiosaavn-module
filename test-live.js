#!/usr/bin/env node
/**
 * Live smoke test for the JioSaavn Convx module.
 *
 * Run in a Codespace / any machine with Node 18+ and internet:
 *   node test-live.js
 *   node test-live.js "kesariya arijit singh"
 *
 * It loads saavn.js exactly the way Convx's QuickJS runtime does (same wrapper:
 * module/exports/self, fetch + atob in scope), then:
 *   1. searches JioSaavn for the query,
 *   2. resolves a stream URL for the first hit (DES decryption path),
 *   3. HEADs that URL to prove the CDN really serves audio.
 *
 * Exits 0 on success, 1 on failure. Read-only: no writes, no credentials.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const query = process.argv[2] || "tum hi ho arijit singh";
const modulePath = path.join(__dirname, "saavn.js");

if (typeof fetch !== "function") {
  console.error("Node 18+ is required (global fetch missing).");
  process.exit(1);
}

const src = fs.readFileSync(modulePath, "utf8");

const prelude = `
var module = {exports: {}};
var exports = module.exports;
var self = {};
var atob = function(value) { return __nodeAtob(value); };
var fetch = async function(url, options) {
    options = options || {};
    var r = await __realFetch(String(url), options);
    var body = await r.text();
    return {ok: r.ok, status: r.status, statusText: r.statusText,
        text: function() {return body;}, json: function() {return JSON.parse(body);},
        headers: {get: function(k) {return r.headers.get(k);}}};
};
`;

const ctx = {
  __nodeAtob: (v) => Buffer.from(v, "base64").toString("binary"),
  __realFetch: (url, options) => fetch(url, options),
  console, JSON, Math, Object, Array, String, Number, parseInt, isNaN, encodeURIComponent, RegExp,
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(prelude + "\n" + src + "\nglobalThis.__mod = module.exports;", ctx);

const fail = (msg) => { console.error("FAIL " + msg); process.exitCode = 1; };
const ok = (msg, extra) => console.log("PASS " + msg + (extra ? "  (" + extra + ")" : ""));

(async () => {
  const mod = ctx.__mod;
  if (typeof mod.searchTracks !== "function" || typeof mod.getTrackStreamUrl !== "function") {
    return fail("module does not export searchTracks + getTrackStreamUrl");
  }
  ok("exports present", "quality setting: " + (mod.settings && mod.settings.quality && mod.settings.quality.defaultValue));

  console.log("\nsearching: " + JSON.stringify(query));
  let search;
  try {
    search = await mod.searchTracks(query, 5, "{}");
  } catch (error) {
    return fail("searchTracks threw: " + error.message);
  }
  if (!search.tracks || !search.tracks.length) return fail("search returned no tracks");
  ok("search returned " + search.tracks.length + " track(s)");
  search.tracks.slice(0, 3).forEach((t, i) =>
    console.log("   " + (i + 1) + ". " + t.title + " — " + t.artist + " [" + t.duration + "s] id=" + t.id));

  const track = search.tracks[0];
  console.log("\nresolving stream for: " + track.title);
  let stream;
  try {
    stream = await mod.getTrackStreamUrl(track.id, "320", '{"settings":{"quality":{"value":"320"}}}');
  } catch (error) {
    return fail("getTrackStreamUrl threw: " + error.message);
  }
  if (!stream.streamUrl) return fail("no streamUrl returned");
  if (!/^https:\/\/[a-z0-9.-]*saavncdn\.com\//i.test(stream.streamUrl)) {
    return fail("stream URL is not a saavncdn URL: " + stream.streamUrl);
  }
  ok("decrypted CDN URL", stream.streamUrl);
  ok("reported quality", String(stream.track && stream.track.audioQuality) + " kbps, mime " + stream.mimeType);

  console.log("\nHEAD " + stream.streamUrl);
  let head;
  try {
    head = await fetch(stream.streamUrl, { method: "HEAD" });
  } catch (error) {
    return fail("CDN request failed: " + error.message);
  }
  if (!(head.status === 200 || head.status === 206)) return fail("CDN returned HTTP " + head.status);
  const type = head.headers.get("content-type") || "";
  const length = head.headers.get("content-length");
  ok("CDN serves the file", "HTTP " + head.status + ", " + type + ", " + (length ? (Number(length) / 1048576).toFixed(2) + " MB" : "length unknown"));
  if (!/audio|video|mp4|octet-stream/i.test(type)) console.log("   note: unexpected content-type " + type);

  console.log("\n" + (process.exitCode ? "SOME CHECKS FAILED" : "ALL LIVE CHECKS PASSED"));
  console.log("Module URL to paste into Convx: " +
    "https://raw.githubusercontent.com/" + (process.env.GITHUB_REPOSITORY || "<owner>/<repo>") + "/main/index.json");
})();
