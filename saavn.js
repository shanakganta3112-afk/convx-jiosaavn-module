/**
 * JioSaavn module for Convx (Spine module format).
 *
 * Exports the two functions the runtime requires:
 *   searchTracks(query, limit, contextJson)  -> { tracks: [...], total }
 *   getTrackStreamUrl(trackId, quality, ctx) -> { streamUrl, mimeType, track }
 *
 * Talks to jiosaavn.com's own api.php, the same endpoints the app's built-in
 * JioSaavn path uses: search.getResults for the search, song.getDetails for a
 * DES-encrypted CDN URL which is decrypted here and rewritten to the requested
 * bitrate rung.
 *
 * No third-party proxy, no credentials, no account.
 */

var API = "https://www.jiosaavn.com/api.php";

var BASE_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-IN,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Cookie": "explicit_content=1",
    "X-Forwarded-For": "49.36.0.1",
    "X-Real-IP": "49.36.0.1"
};

var DES_KEY = "38346591";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function unescapeHtml(value) {
    if (!value) return "";
    return String(value)
        .replace(/&quot;/g, "\"")
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ");
}

function apiUrl(params) {
    var parts = [];
    for (var key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) {
            parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
        }
    }
    return API + "?" + parts.join("&");
}

async function getJson(url) {
    var response = await fetch(url, { method: "GET", headers: BASE_HEADERS });
    if (!response.ok) throw new Error("JioSaavn request failed: HTTP " + response.status);
    var text = await response.text();
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error("JioSaavn returned a non-JSON response");
    }
}

function toSeconds(value) {
    var n = parseInt(value, 10);
    return isNaN(n) ? 0 : n;
}

/* ------------------------------------------------------------------ */
/* DES / ECB / PKCS5 decryption (the CDN URLs are DES-encrypted)       */
/* ------------------------------------------------------------------ */

var DES_IP = [58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
    62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
    57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
    61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7];

var DES_FP = [40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
    38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
    36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
    34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25];

var DES_E = [32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13,
    12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
    24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1];

var DES_P = [16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
    2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25];

var DES_PC1 = [57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
    10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
    63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
    14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4];

var DES_PC2 = [14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
    23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
    41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
    44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32];

var DES_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

var DES_SBOX = [
    [14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
        0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
        4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
        15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13],
    [15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
        3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
        0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
        13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9],
    [10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
        13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
        13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
        1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12],
    [7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
        13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
        10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
        3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14],
    [2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
        14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
        4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
        11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3],
    [12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
        10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
        9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
        4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13],
    [4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
        13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
        1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
        6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12],
    [13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
        1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
        7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
        2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11]
];

function bytesToBits(bytes) {
    var bits = new Array(bytes.length * 8);
    for (var i = 0; i < bytes.length; i++) {
        for (var b = 0; b < 8; b++) {
            bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
        }
    }
    return bits;
}

function bitsToBytes(bits) {
    var bytes = new Array(bits.length / 8);
    for (var i = 0; i < bytes.length; i++) {
        var value = 0;
        for (var b = 0; b < 8; b++) {
            value = (value << 1) | bits[i * 8 + b];
        }
        bytes[i] = value;
    }
    return bytes;
}

function permute(bits, table) {
    var out = new Array(table.length);
    for (var i = 0; i < table.length; i++) {
        out[i] = bits[table[i] - 1];
    }
    return out;
}

function desSubkeys(keyBytes) {
    var keyBits = permute(bytesToBits(keyBytes), DES_PC1);
    var c = keyBits.slice(0, 28);
    var d = keyBits.slice(28, 56);
    var subkeys = [];
    for (var round = 0; round < 16; round++) {
        for (var s = 0; s < DES_SHIFTS[round]; s++) {
            c.push(c.shift());
            d.push(d.shift());
        }
        subkeys.push(permute(c.concat(d), DES_PC2));
    }
    return subkeys;
}

function desFeistel(right, subkey) {
    var expanded = permute(right, DES_E);
    var mixed = new Array(48);
    for (var i = 0; i < 48; i++) {
        mixed[i] = expanded[i] ^ subkey[i];
    }
    var output = new Array(32);
    for (var box = 0; box < 8; box++) {
        var offset = box * 6;
        var row = (mixed[offset] << 1) | mixed[offset + 5];
        var column = (mixed[offset + 1] << 3) | (mixed[offset + 2] << 2) |
            (mixed[offset + 3] << 1) | mixed[offset + 4];
        var value = DES_SBOX[box][row * 16 + column];
        output[box * 4] = (value >> 3) & 1;
        output[box * 4 + 1] = (value >> 2) & 1;
        output[box * 4 + 2] = (value >> 1) & 1;
        output[box * 4 + 3] = value & 1;
    }
    return permute(output, DES_P);
}

function desCryptBlock(blockBytes, subkeys, decrypting) {
    var bits = permute(bytesToBits(blockBytes), DES_IP);
    var left = bits.slice(0, 32);
    var right = bits.slice(32, 64);
    for (var round = 0; round < 16; round++) {
        var subkey = decrypting ? subkeys[15 - round] : subkeys[round];
        var f = desFeistel(right, subkey);
        var next = new Array(32);
        for (var i = 0; i < 32; i++) {
            next[i] = left[i] ^ f[i];
        }
        left = right;
        right = next;
    }
    return bitsToBytes(permute(right.concat(left), DES_FP));
}

function base64ToBytes(encoded) {
    var raw = atob(String(encoded).replace(/\s+/g, ""));
    var bytes = new Array(raw.length);
    for (var i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i) & 0xff;
    }
    return bytes;
}

/** DES/ECB/PKCS5 decryption of a base64 ciphertext, returning a UTF-8 string. */
function desDecryptBase64(encrypted, keyText) {
    var keyBytes = [];
    for (var k = 0; k < 8; k++) {
        keyBytes.push(keyText.charCodeAt(k) & 0xff);
    }
    var subkeys = desSubkeys(keyBytes);
    var cipher = base64ToBytes(encrypted);
    var plain = [];
    for (var offset = 0; offset < cipher.length; offset += 8) {
        var block = cipher.slice(offset, offset + 8);
        if (block.length < 8) break;
        plain = plain.concat(desCryptBlock(block, subkeys, true));
    }
    // Strip PKCS5 padding (defensively: only when it looks valid).
    var pad = plain.length ? plain[plain.length - 1] : 0;
    if (pad >= 1 && pad <= 8 && pad <= plain.length) {
        var valid = true;
        for (var p = plain.length - pad; p < plain.length; p++) {
            if (plain[p] !== pad) { valid = false; break; }
        }
        if (valid) plain = plain.slice(0, plain.length - pad);
    }
    var text = "";
    for (var i = 0; i < plain.length; i++) {
        text += String.fromCharCode(plain[i]);
    }
    return text.trim();
}

/* ------------------------------------------------------------------ */
/* stream URL handling                                                 */
/* ------------------------------------------------------------------ */

var QUALITY_SUFFIX = /_(48|96|160|320)\.(mp4|aac|mp3)$/;

function decryptMediaUrl(encrypted) {
    if (!encrypted) return "";
    try {
        return desDecryptBase64(encrypted, DES_KEY);
    } catch (error) {
        return "";
    }
}

/** Rewrites the CDN URL to the requested rung, and reports the bitrate it will deliver. */
function bestStream(plainUrl, requestedQuality, supports320) {
    if (!plainUrl) return null;
    var match = QUALITY_SUFFIX.exec(plainUrl);
    var kbps = requestedQuality;
    if (match) {
        var offered = parseInt(match[1], 10);
        var extension = match[2];
        var target = requestedQuality;
        if (target >= 320 && !supports320) target = offered >= 160 ? 160 : offered;
        if (target > offered && !supports320) target = offered;
        if (target !== offered) {
            plainUrl = plainUrl.replace(QUALITY_SUFFIX, "_" + target + "." + extension);
        }
        kbps = target;
    }
    return { url: plainUrl, kbps: kbps };
}

function qualityToKbps(value) {
    var n = parseInt(value, 10);
    if (isNaN(n)) return 320;
    if (n >= 320) return 320;
    if (n >= 160) return 160;
    if (n >= 96) return 96;
    return 48;
}

function requestedQualityFrom(contextJson, fallbackQuality) {
    var quality = fallbackQuality;
    try {
        var context = JSON.parse(contextJson || "{}");
        var setting = context && context.settings && context.settings.quality;
        if (setting && setting.value) quality = setting.value;
    } catch (error) { /* keep the argument value */ }
    return qualityToKbps(quality);
}

function songFromPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.songs && payload.songs.length) return payload.songs[0];
    for (var key in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            var value = payload[key];
            if (value && typeof value === "object" && !Array.isArray(value) && value.more_info) {
                return value;
            }
        }
    }
    return null;
}

function artistNames(song) {
    var names = [];
    var map = song && song.more_info && song.more_info.artistMap;
    var primary = map && map.primary_artists;
    if (primary && primary.length) {
        for (var i = 0; i < primary.length; i++) {
            if (primary[i] && primary[i].name) names.push(unescapeHtml(primary[i].name));
        }
    }
    if (!names.length) {
        var subtitle = song.subtitle || song["primary_artists"] || "";
        if (subtitle) {
            var split = unescapeHtml(subtitle).split(",");
            for (var s = 0; s < split.length; s++) {
                var name = split[s].trim();
                if (name) names.push(name);
            }
        }
    }
    return names;
}

/* ------------------------------------------------------------------ */
/* module exports                                                      */
/* ------------------------------------------------------------------ */

async function searchTracks(query, limit, contextJson) {
    var pageSize = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
    var payload = await getJson(apiUrl({
        "__call": "search.getResults",
        "_format": "json",
        "_marker": "0",
        "api_version": "4",
        "ctx": "android",
        "q": query,
        "p": "1",
        "n": String(pageSize)
    }));

    var results = (payload && payload.results) || [];
    var tracks = [];
    for (var i = 0; i < results.length; i++) {
        var song = results[i];
        if (!song || !song.id) continue;
        var more = song.more_info || {};
        var duration = toSeconds(more.duration) || toSeconds(song.duration);
        tracks.push({
            id: String(song.id),
            title: unescapeHtml(song.title || song.song || ""),
            artist: artistNames(song).join(", "),
            album: unescapeHtml(more.album || song.album || ""),
            albumId: more.album_id ? String(more.album_id) : null,
            albumCover: (song.image || "").replace("150x150", "500x500"),
            duration: duration,
            audioQuality: (more["320kbps"] === "true" || more["320kbps"] === true) ? "320" : "160",
            format: "mp4a",
            availableQualities: ["96", "160", "320"]
        });
    }
    return { tracks: tracks, total: tracks.length };
}

async function getTrackStreamUrl(trackId, quality, contextJson) {
    var payload = await getJson(apiUrl({
        "__call": "song.getDetails",
        "_format": "json",
        "_marker": "0",
        "api_version": "4",
        "ctx": "android",
        "pids": String(trackId)
    }));

    var song = songFromPayload(payload);
    if (!song) throw new Error("JioSaavn returned no song for id " + trackId);

    var more = song.more_info || {};
    var supports320 = more["320kbps"] === "true" || more["320kbps"] === true;
    var plain = more.media_url || more.mediaUrl || "";
    if (!plain) plain = decryptMediaUrl(more.encrypted_media_url || more.encryptedMediaUrl || "");
    if (!plain) throw new Error("Could not decrypt a JioSaavn stream URL for id " + trackId);

    var wanted = requestedQualityFrom(contextJson, quality);
    var stream = bestStream(plain, wanted, supports320);
    if (!stream || !stream.url) throw new Error("No usable JioSaavn stream for id " + trackId);

    return {
        streamUrl: stream.url,
        mimeType: "audio/mp4",
        streamType: "progressive",
        track: {
            id: String(song.id || trackId),
            audioQuality: String(stream.kbps),
            mimeType: "audio/mp4",
            format: "mp4a",
            bitrate: stream.kbps * 1000
        }
    };
}

var settings = {
    quality: {
        type: "select",
        label: "Quality",
        description: "Bitrate requested from JioSaavn. 320 kbps is only available when the track has it.",
        options: [
            { label: "320 kbps", value: "320" },
            { label: "160 kbps", value: "160" },
            { label: "96 kbps", value: "96" }
        ],
        defaultValue: "320"
    }
};

var noStreamCache = true;

module.exports = {
    searchTracks: searchTracks,
    getTrackStreamUrl: getTrackStreamUrl,
    settings: settings,
    noStreamCache: noStreamCache
};
