/*
 * CogniTara QR: compact, dependency-free QR Code encoder (byte mode, ECC level M,
 * versions 1-4, up to 62 bytes). Enough for LAN addresses like http://192.168.100.200:5000.
 * Produces a real, scannable QR matrix. Exposes window.CogniQR.toSvg(text, opts).
 */
(function (global) {
  "use strict";

  // version: [dataCodewordsPerBlock, blocks, eccPerBlock, alignmentCenter]
  var VERSIONS = {
    1: [16, 1, 10, 0],
    2: [28, 1, 16, 18],
    3: [44, 1, 26, 22],
    4: [32, 2, 18, 26]
  };

  // ---- GF(256) arithmetic, primitive polynomial 0x11D ----
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function gmul(a, b) { return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenerator(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gmul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }
  function rsRemainder(data, degree) {
    var gen = rsGenerator(degree);
    var res = new Array(degree).fill(0);
    data.forEach(function (b) {
      var factor = b ^ res.shift();
      res.push(0);
      for (var i = 0; i < degree; i++) res[i] ^= gmul(gen[i + 1], factor);
    });
    return res;
  }

  function utf8Bytes(str) {
    return Array.from(new TextEncoder().encode(str));
  }

  function encodeCodewords(bytes, ver) {
    var v = VERSIONS[ver];
    var dataCap = v[0] * v[1];
    var bits = [];
    function put(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    put(0x4, 4); put(bytes.length, 8);
    bytes.forEach(function (b) { put(b, 8); });
    var capBits = dataCap * 8;
    put(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    var cw = [];
    for (var i = 0; i < bits.length; i += 8) {
      var byte = 0; for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[i + k];
      cw.push(byte);
    }
    for (var pad = 0; cw.length < dataCap; pad++) cw.push(pad % 2 ? 0x11 : 0xec);

    var blocks = [], eccs = [];
    for (var b = 0; b < v[1]; b++) {
      var blk = cw.slice(b * v[0], (b + 1) * v[0]);
      blocks.push(blk); eccs.push(rsRemainder(blk, v[2]));
    }
    var out = [];
    for (var c = 0; c < v[0]; c++) blocks.forEach(function (blk) { out.push(blk[c]); });
    for (var e = 0; e < v[2]; e++) eccs.forEach(function (ec) { out.push(ec[e]); });
    return out;
  }

  function buildMatrix(ver, codewords, mask) {
    var size = 17 + ver * 4;
    var m = [], fn = [];
    for (var r = 0; r < size; r++) { m.push(new Array(size).fill(0)); fn.push(new Array(size).fill(false)); }
    function set(r, c, val) { m[r][c] = val ? 1 : 0; fn[r][c] = true; }

    function finder(r0, c0) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        var on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(r, c, on);
      }
    }
    finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
    for (var i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    var a = VERSIONS[ver][3];
    if (a) {
      for (var ar = -2; ar <= 2; ar++) for (var ac = -2; ac <= 2; ac++)
        set(a + ar, a + ac, Math.max(Math.abs(ar), Math.abs(ac)) !== 1);
    }
    // reserve format areas + dark module
    for (var f = 0; f < 9; f++) { fn[8][f] = true; fn[f][8] = true; }
    for (var g = 0; g < 8; g++) { fn[8][size - 1 - g] = true; fn[size - 1 - g][8] = true; }
    set(size - 8, 8, 1);

    // data placement (zigzag)
    var bitIdx = 0, total = codewords.length * 8;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var col = right - j;
          var upward = ((right + 1) & 2) === 0;
          var row = upward ? size - 1 - vert : vert;
          if (fn[row][col]) continue;
          var bit = 0;
          if (bitIdx < total) bit = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
          m[row][col] = bit;
        }
      }
    }
    // mask
    var maskFn = [
      function (r, c) { return (r + c) % 2 === 0; },
      function (r) { return r % 2 === 0; },
      function (r, c) { return c % 3 === 0; },
      function (r, c) { return (r + c) % 3 === 0; },
      function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
      function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
      function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; },
      function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }
    ][mask];
    for (var rr = 0; rr < size; rr++) for (var cc = 0; cc < size; cc++)
      if (!fn[rr][cc] && maskFn(rr, cc)) m[rr][cc] ^= 1;

    // format info: ECC level M = 0b00
    var data = (0 << 3) | mask, rem = data;
    for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var fmt = ((data << 10) | rem) ^ 0x5412;
    function fbit(n) { return (fmt >>> n) & 1; }
    // m[row][col]; mirrors the reference placement (x = col, y = row)
    for (var q = 0; q <= 5; q++) m[q][8] = fbit(q);
    m[7][8] = fbit(6); m[8][8] = fbit(7); m[8][7] = fbit(8);
    for (var q2 = 9; q2 < 15; q2++) m[8][14 - q2] = fbit(q2);
    for (var q3 = 0; q3 < 8; q3++) m[8][size - 1 - q3] = fbit(q3);
    for (var q4 = 8; q4 < 15; q4++) m[size - 15 + q4][8] = fbit(q4);
    m[size - 8][8] = 1;
    return m;
  }

  function penalty(m) {
    var size = m.length, score = 0, r, c;
    for (r = 0; r < size; r++) {
      var runR = 1, runC = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) { runR++; if (runR === 5) score += 3; else if (runR > 5) score++; } else runR = 1;
        if (m[c][r] === m[c - 1][r]) { runC++; if (runC === 5) score += 3; else if (runC > 5) score++; } else runC = 1;
      }
    }
    for (r = 0; r < size - 1; r++) for (c = 0; c < size - 1; c++) {
      var s = m[r][c] + m[r + 1][c] + m[r][c + 1] + m[r + 1][c + 1];
      if (s === 0 || s === 4) score += 3;
    }
    var dark = 0;
    m.forEach(function (row) { row.forEach(function (v) { dark += v; }); });
    score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  }

  function encode(text) {
    var bytes = utf8Bytes(text);
    var ver = 0;
    for (var v = 1; v <= 4; v++) { if (bytes.length <= VERSIONS[v][0] * VERSIONS[v][1] - 2) { ver = v; break; } }
    if (!ver) throw new Error("CogniQR: text too long for versions 1-4");
    var cw = encodeCodewords(bytes, ver);
    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var mtx = buildMatrix(ver, cw, mask), sc = penalty(mtx);
      if (sc < bestScore) { best = mtx; bestScore = sc; }
    }
    return best;
  }

  function toSvg(text, opts) {
    opts = opts || {};
    var m = encode(text), quiet = opts.quiet == null ? 2 : opts.quiet, size = m.length + quiet * 2;
    var d = "";
    for (var r = 0; r < m.length; r++) for (var c = 0; c < m.length; c++)
      if (m[r][c]) d += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + " " + size +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code for ' + text.replace(/"/g, "") + '">' +
      '<path d="' + d + '" fill="currentColor"/></svg>';
  }

  global.CogniQR = { encode: encode, toSvg: toSvg };
})(window);
