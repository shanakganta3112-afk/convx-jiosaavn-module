# JioSaavn module for Convx

**Install URL — paste this into Convx → Settings → Modules → `+`:**

```
https://raw.githubusercontent.com/shanakganta3112-afk/convx-jiosaavn-module/main/index.json
```

**Open in a Codespace:** https://codespaces.new/shanakganta3112-afk/convx-jiosaavn-module
(then run `node test-live.js`)

**Last live test:** [run 43249774791](https://github.com/shanakganta3112-afk/convx-jiosaavn-module/actions/runs/43249774791) — passed on GitHub's runners against the real JioSaavn API:

```
PASS search returned 10 track(s)          query: "tum hi ho arijit singh"
PASS decrypted CDN URL   https://aac.saavncdn.com/430/5c5ea5cc...f376fe_320.mp4
PASS reported quality    320 kbps, mime audio/mp4
PASS CDN serves the file HTTP 200, audio/mp4, 10.04 MB
```

## What is in this repo

A self-hosted extension for Convx's **Settings → Modules** screen. It makes JioSaavn a
real music source in the module layer, instead of only the built-in audio intercept.

Two files do the work, and one of them is the only thing you must host:

| File | Purpose |
| --- | --- |
| `index.json` | Module index the app reads when you add a source. Key must be `category:modules`. |
| `saavn.js` | The module itself: `searchTracks`, `getTrackStreamUrl`, `settings`. |
| `test-live.js` | Live smoke test: real search, real decryption, real CDN HEAD. |
| `.github/workflows/live-test.yml` | Runs that test on every push and on demand. |

## Why a module at all?

The app already streams from JioSaavn without any extension (Settings → Playback & audio →
Advanced → JioSaavn Settings). The difference is **where it sits in the chain**:

```
Spine modules  →  TIDAL (if on)  →  built-in JioSaavn  →  YouTube
```

Modules are asked first. So with this module enabled and placed at priority 1, JioSaavn
resolution runs before TIDAL, before the built-in Saavn path and before YouTube — and it
appears in the Modules list where you can switch it off in one tap, which the built-in
path cannot.

## How it works

1. `searchTracks(query, limit, context)` → `https://www.jiosaavn.com/api.php?__call=search.getResults`
   with `_format=json`, `api_version=4`, `ctx=android`, and `n=<limit>`.
2. `getTrackStreamUrl(trackId, quality, context)` → `__call=song.getDetails&pids=<id>`, reads
   `more_info.encrypted_media_url`.
3. That URL is DES/ECB/PKCS5 encrypted with the 8-byte key `38346591`; the module decrypts it
   in pure JavaScript (no crypto library, no WebCrypto — the runtime does not expose one) and
   rewrites the CDN rung, e.g. `..._96.mp4` → `..._320.mp4`, but only when the API reports
   `more_info.320kbps == "true"` for that track.
4. Returns `{ streamUrl, mimeType: "audio/mp4", track: { bitrate } }`.

`noStreamCache = true` is exported, so the app re-resolves the CDN URL every time instead of
reusing a stale one.

The quality setting is exposed in the app on the module's detail page (320 / 160 / 96 kbps).

## Hosting it (HTTPS is required)

The app only accepts `https://` module URLs (plain `http://` is allowed solely for
`localhost` / `127.0.0.1` / `10.0.2.2` during development). Pick any one of these:

**A. GitHub raw (fastest, no Pages setup)**

1. Put `index.json` and `saavn.js` in a public repo, e.g. `convx-modules/jiosaavn/`.
2. Your source URL is:
   `https://raw.githubusercontent.com/<your-user>/<your-repo>/main/jiosaavn/index.json`
3. `"download": "saavn.js"` in the index resolves relative to that URL, so nothing else to edit.

**B. GitHub Pages**

1. Commit the two files to a repo, enable Pages for the branch.
2. Source URL: `https://<your-user>.github.io/<your-repo>/jiosaavn/index.json`

**C. Any static host** (Cloudflare Pages, Netlify, S3, your own server)

Upload both files to the same directory and use the `index.json` URL.

**D. Local testing** — serve the folder with `python3 -m http.server 8080` and add
`http://10.0.2.2:8080/index.json` (emulator) or `http://127.0.0.1:8080/index.json`
(device on the same machine via adb reverse).

## Installing in the app

1. Settings → **Modules** (subtitle: "Music sources and add-ons").
2. Tap **Add source** (`+`), paste your `index.json` URL, confirm. The dialog fetches the
   index immediately and **auto-enables** every module it finds — that's how the app behaves,
   not a bug in this module.
3. Back on the Modules screen, the **ENABLED — DRAG TO SET PRIORITY** list now has
   **JioSaavn**. Drag its `≡` handle to position 1 if you want it tried first.
4. Tap the row to open the detail page: **Enable module** switch, the module id
   (`jiosaavn`), version, and the **Quality** setting. Pick 320 kbps if you want the best rung.
5. Play a track. Logs (debug builds, `adb logcat -s YTPlayerUtils`) show
   `═══ SPINE INTERCEPT START ═══` followed by a module match when it is being used.

## Disabling it again

- ✕ on its row in the ENABLED list, or the **Enable module** switch on its detail page.
- ✕ on the source URL removes the source, its modules and their settings entirely.

## Limits you should know

- **Unofficial API.** This uses jiosaavn.com's private `api.php`, the same one the app's
  built-in path uses. It is not a public or documented API, it can change or start rate
  limiting without notice, and JioSaavn's terms of service are unlikely to bless it. Use at
  your own discretion; no account or credentials are involved.
- **Geo.** The catalogue is India-weighted; the module sends `X-Forwarded-For: 49.36.0.1` and
  `Cookie: explicit_content=1` the way the app does. Outside India some tracks will not
  resolve.
- **Match quality.** The app passes the playing track's title and artist as the query, then
  picks the best candidate. Covers, live versions and same-title songs can still mismatch —
  the app's built-in Saavn path has the same caveat.
- **No 320 guarantee.** The CDN only has what it has; the module never claims 320 for a track
  the API marks as 160.
- **Audio only.** Modules resolve streams, not catalogue browsing: search, home and library
  still come from YouTube Music.
- **`atob` and `fetch` only.** The QuickJS sandbox gives you those plus `setTimeout`; no
  `crypto`, no `Buffer`, no `TextDecoder`. That is why DES is implemented in-file.

## Verifying the code yourself

The DES implementation was checked against the canonical test vector
(`key 133457799BBCDFF1`, `plaintext 0123456789ABCDEF` → `ciphertext 85E813540F0AB405`) and
against 9 ciphertexts produced by Python's PyCryptodome with the real JioSaavn key. The
`searchTracks` / `getTrackStreamUrl` paths were tested against canned API responses: HTML
entity decoding, artist extraction from `artistMap`, `_96` → `_320` rewriting, the
`320kbps: "false"` guard, and both error paths.
