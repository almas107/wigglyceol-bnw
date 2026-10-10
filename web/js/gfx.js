// Pixel renderer with boiling ink: every hand-drawn line is re-jittered on a
// 3-frame cycle so the page never sits still.

const INK = '#000000', PAPER = '#ffffff', PINK = '#ff0097', CYAN = '#0097ff', YELLOW = '#ffff00';

const G = {
  c: null, x: null, W: 0, H: 0, S: 1,
  frame: 0, // boil frame 0..2
  t: 0,
  pats: {},
  fonts: {},
  init(canvas) {
    this.screen = canvas; this.sx = canvas.getContext('2d');
    this.c = document.createElement('canvas'); this.x = this.c.getContext('2d');
    this.buildPatterns(); this.buildFonts();
  },
  resize(cssW, cssH, dpr) {
    const pw = Math.floor(cssW * dpr), ph = Math.floor(cssH * dpr);
    const portrait = cssH > cssW * 1.15;
    const base = portrait ? [300, 440] : [470, 320];
    this.S = Math.max(1, Math.floor(Math.min(pw / base[0], ph / base[1])));
    this.W = Math.floor(pw / this.S); this.H = Math.floor(ph / this.S);
    this.portrait = portrait;
    this.screen.width = this.W * this.S; this.screen.height = this.H * this.S;
    this.screen.style.width = (this.W * this.S) / dpr + 'px'; this.screen.style.height = (this.H * this.S) / dpr + 'px';
    this.c.width = this.W; this.c.height = this.H;
    this.x.imageSmoothingEnabled = false;
  },
  present() {
    this.sx.imageSmoothingEnabled = false;
    this.sx.drawImage(this.c, 0, 0, this.W * this.S, this.H * this.S);
  },
  // ---------- patterns (Decker-like fills) ----------
  buildPatterns() {
    const mk = (rows, fg = INK, bg = PAPER) => {
      const h = rows.length, w = rows[0].length, cv = document.createElement('canvas');
      cv.width = w; cv.height = h; const x = cv.getContext('2d');
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) { x.fillStyle = rows[y][i] === '#' ? fg : bg; if (bg || rows[y][i] === '#') x.fillRect(i, y, 1, 1); }
      return this.x.createPattern(cv, 'repeat');
    };
    this.pats.checker = mk(['#.', '.#']);
    this.pats.dots = mk(['#...', '....', '..#.', '....']);
    this.pats.dense = mk(['##', '#.']);
    this.pats.stripes = mk(['#...', '.#..', '..#.', '...#']);
    this.pats.hstripes = mk(['####', '....', '....']);
    this.pats.grid = mk(['#.#.', '....']);
    this.pats.pinkdots = mk(['#.', '..'], PINK, PAPER);
    this.pats.cyandots = mk(['#.', '..'], CYAN, PAPER);
    this.pats.yellowcheck = mk(['#.', '.#'], YELLOW, PAPER);
    this.pats.pinkstripes = mk(['##..', '.##.', '..##', '#..#'], PINK, PAPER);
    this.pats.cyanstripes = mk(['##..', '.##.', '..##', '#..#'], CYAN, PAPER);
    this.pats.paper = mk(['......', '......', '......', '......', '......', '#.....'], INK, PAPER);
    this.pats.light = mk(['#...', '....', '....', '....'], INK, PAPER);
  },
  // ---------- fonts ----------
  buildFonts() {
    for (const [name, f] of Object.entries(FONT_DATA)) {
      const chars = Object.keys(f.g);
      const cw = f.bpr * 8, cv = document.createElement('canvas');
      cv.width = cw * chars.length; cv.height = f.h;
      const x = cv.getContext('2d'); x.fillStyle = '#fff';
      const map = {};
      chars.forEach((ch, i) => {
        const [w, hex] = f.g[ch];
        map[ch] = { w, sx: i * cw };
        for (let y = 0; y < f.h; y++) {
          let row = 0;
          for (let b = 0; b < f.bpr; b++) row = row * 256 + parseInt(hex.substr((y * f.bpr + b) * 2, 2), 16);
          for (let px = 0; px < w; px++) if ((row >> (f.bpr * 8 - 1 - px)) & 1) x.fillRect(i * cw + px, y, 1, 1);
        }
      });
      this.fonts[name] = { h: f.h, sp: f.sp, map, src: cv, tinted: {} };
    }
  },
  tint(font, color) {
    const f = this.fonts[font];
    if (!f.tinted[color]) {
      const cv = document.createElement('canvas'); cv.width = f.src.width; cv.height = f.src.height;
      const x = cv.getContext('2d'); x.drawImage(f.src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, cv.width, cv.height);
      f.tinted[color] = cv;
    }
    return f.tinted[color];
  },
  textW(s, font = 'body', scale = 1) {
    const f = this.fonts[font]; let w = 0;
    for (const ch of String(s)) { const g = f.map[ch] || f.map['?']; w += g.w + f.sp; }
    return Math.max(0, w - f.sp) * scale;
  },
  fontH(font = 'body') { return this.fonts[font].h; },
  // wig: 0 = crisp; >0 = per-glyph boil amplitude
  text(s, x, y, font = 'body', color = INK, scale = 1, wig = 0) {
    const f = this.fonts[font], img = this.tint(font, color);
    let cx = Math.round(x); y = Math.round(y);
    let i = 0;
    for (const ch of String(s)) {
      const g = f.map[ch] || f.map['?'];
      let ox = 0, oy = 0;
      if (wig) { ox = this.jit(i * 7 + cx, y, wig * 0.6); oy = this.jit(i * 13 + y, cx, wig); }
      if (ch !== ' ') this.x.drawImage(img, g.sx, 0, g.w, f.h, cx + ox, y + oy, g.w * scale, f.h * scale);
      cx += (g.w + f.sp) * scale; i++;
    }
    return cx - x;
  },
  textC(s, cx, y, font, color, scale = 1, wig = 0) { return this.text(s, cx - this.textW(s, font, scale) / 2, y, font, color, scale, wig); },
  // Clip a string with "…" to fit a pixel width.
  fit(s, w, font = 'body') {
    s = String(s);
    if (this.textW(s, font) <= w) return s;
    while (s.length > 1 && this.textW(s + '.', font) > w) s = s.slice(0, -1);
    return s + '.';
  },
  // ---------- handwriting ----------
  // A real handwriting font rasterised to 1-bit pixels, one cached bitmap per
  // glyph; each glyph wobbles on its own when wig > 0.
  // Patrick Hand stays legible at small pixel sizes; Gochi Hand for headlines.
  handFont: (size) => (size >= 16 ? '"Gochi Hand", ' : '"Patrick Hand", ') + '"Comic Sans MS", "Chalkboard SE", cursive',
  handCache: {},
  glyph(ch, size, color) {
    const key = ch + '|' + size + '|' + color;
    let g = this.handCache[key];
    if (g) return g;
    const m = this.x;
    const cv = document.createElement('canvas'), pad = 2;
    const fx = cv.getContext('2d');
    fx.font = size + 'px ' + this.handFont(size);
    const adv = Math.max(1, Math.round(fx.measureText(ch).width));
    cv.width = adv + pad * 2 + 2; cv.height = Math.ceil(size * 1.3) + pad;
    fx.font = size + 'px ' + this.handFont(size); fx.textBaseline = 'alphabetic'; fx.fillStyle = color;
    fx.fillText(ch, pad, Math.round(size * 0.95));
    const id = fx.getImageData(0, 0, cv.width, cv.height), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 100 ? 255 : 0;
    fx.putImageData(id, 0, 0);
    g = this.handCache[key] = { cv, adv, pad };
    return g;
  },
  handW(s, size = 14) { let w = 0; for (const ch of String(s)) w += this.glyph(ch, size, INK).adv; return w; },
  hand(s, x, y, size = 14, color = INK, wig = 0.6) {
    let cx = Math.round(x); y = Math.round(y);
    let i = 0;
    for (const ch of String(s)) {
      const g = this.glyph(ch, size, color);
      const w2 = size < 16 ? Math.min(wig, 0.55) : wig;
      const oy = w2 ? this.jit(i * 13 + cx, y + i, w2) : 0, ox = w2 && size >= 16 ? this.jit(i * 7 + y, cx, w2 * 0.5) : 0;
      if (ch !== ' ') this.x.drawImage(g.cv, cx - g.pad + ox, y - 2 + oy);
      cx += g.adv; i++;
    }
    return cx - x;
  },
  handC(s, cx, y, size = 14, color = INK, wig = 0.6) { return this.hand(s, cx - this.handW(s, size) / 2, y, size, color, wig); },
  handFit(s, w, size = 14) { s = String(s); if (this.handW(s, size) <= w) return s; while (s.length > 1 && this.handW(s + '.', size) > w) s = s.slice(0, -1); return s + '.'; },
  // ---------- noise ----------
  hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h & 0xffff) / 0xffff;
  },
  jit(a, b, amp) { return Math.round((this.hash(a | 0, b | 0, this.frame + 1) * 2 - 1) * amp); },
  // ---------- primitives ----------
  rect(x, y, w, h, fill) { this.x.fillStyle = fill; this.x.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  frame1(x, y, w, h, color = INK) { this.rect(x, y, w, 1, color); this.rect(x, y + h - 1, w, 1, color); this.rect(x, y, 1, h, color); this.rect(x + w - 1, y, 1, h, color); },
  roundRect(x, y, w, h, r, fill, stroke = INK, lw = 1) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (fill) { this.rect(x + r, y, w - r * 2, h, fill); this.rect(x, y + r, w, h - r * 2, fill); for (let i = 0; i < r; i++) { const k = r - Math.round(Math.sqrt(r * r - (r - i - 0.5) ** 2)); this.rect(x + k, y + i, w - k * 2, 1, fill); this.rect(x + k, y + h - 1 - i, w - k * 2, 1, fill); } }
    if (stroke) {
      for (let t = 0; t < lw; t++) {
        const X = x + t, Y = y + t, Wd = w - t * 2, Hd = h - t * 2, R = Math.max(0, r - t);
        this.rect(X + R, Y, Wd - R * 2, 1, stroke); this.rect(X + R, Y + Hd - 1, Wd - R * 2, 1, stroke);
        this.rect(X, Y + R, 1, Hd - R * 2, stroke); this.rect(X + Wd - 1, Y + R, 1, Hd - R * 2, stroke);
        for (let i = 0; i < R; i++) { const k = R - Math.round(Math.sqrt(R * R - (R - i - 0.5) ** 2)); const k2 = i + 1 < R ? R - Math.round(Math.sqrt(R * R - (R - i - 1.5) ** 2)) : 0; const len = Math.max(1, k - k2); this.rect(X + k - len + 1 > X ? X + k2 + 0 : X, Y + i, Math.max(1, k - k2), 1, stroke); this.rect(X + Wd - k, Y + i, Math.max(1, k - k2), 1, stroke); this.rect(X + k2, Y + Hd - 1 - i, Math.max(1, k - k2), 1, stroke); this.rect(X + Wd - k, Y + Hd - 1 - i, Math.max(1, k - k2), 1, stroke); }
      }
    }
  },
  // Decker-style panel: white box, black border, 1px hard shadow.
  panel(x, y, w, h, fill = PAPER) { this.rect(x + 2, y + 2, w, h, INK); this.rect(x, y, w, h, fill); this.frame1(x, y, w, h); },
  disc(x, y, r, color) {
    x = Math.round(x); y = Math.round(y);
    if (r <= 0.5) { this.rect(x, y, 1, 1, color); return; }
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) { const w = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy))); if (w > 0 || dy === 0) this.rect(x - w, y + dy, w * 2 + 1, 1, color); }
  },
  // A brush line made of stamped discs, Bresenham-walked.
  line(x0, y0, x1, y1, r, color) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, n = 0;
    for (;;) {
      if (r <= 0.6) this.rect(x0, y0, 1, 1, color); else if (n++ % Math.max(1, Math.floor(r)) === 0) this.disc(x0, y0, r, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    if (r > 0.6) this.disc(x1, y1, r, color);
  },
  // Hand-drawn wobbly line: subdivided, every joint jittered per boil frame.
  wline(x0, y0, x1, y1, r = 0.5, color = INK, amp = 1, seg = 6) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / seg));
    let px = x0 + this.jit(x0 * 3, y0 * 5, amp * 0.5), py = y0 + this.jit(y0 * 7, x0 * 11, amp * 0.5);
    for (let i = 1; i <= n; i++) {
      const t = i / n, bx = x0 + (x1 - x0) * t, by = y0 + (y1 - y0) * t;
      const end = i === n;
      const k = end ? 0.5 : 1;
      const qx = bx + this.jit(Math.round(bx) * 3, Math.round(by) * 5, amp * k), qy = by + this.jit(Math.round(by) * 7, Math.round(bx) * 11, amp * k);
      this.line(px, py, qx, qy, r, color); px = qx; py = qy;
    }
  },
  wpoly(pts, r, color, amp = 1, closed = true) {
    for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.wline(a[0], a[1], b[0], b[1], r, color, amp); }
  },
  wrect(x, y, w, h, r = 0.5, color = INK, amp = 1) { this.wpoly([[x, y], [x + w - 1, y], [x + w - 1, y + h - 1], [x, y + h - 1]], r, color, amp); },
  // Wobbly filled capsule (used for notes, cells and labels).
  wcapsule(x, y, w, h, fill, stroke = INK, amp = 1, lw = 0.5) {
    const ox = this.jit(x * 5 + 1, y * 3, amp * 0.5), oy = this.jit(y * 9 + 2, x, amp * 0.5);
    const rr = Math.min(Math.floor(h / 2), 3);
    if (fill) this.roundRect(x + ox, y + oy, w, h, rr, fill, null);
    if (stroke) this.roundRect(x + ox, y + oy, w, h, rr, null, stroke, 1);
    if (stroke && lw > 0.6) this.wpoly([[x + ox + 1, y + oy], [x + ox + w - 2, y + oy], [x + ox + w - 1, y + oy + h - 1], [x + ox, y + oy + h - 1]], 0.5, stroke, amp * 0.6);
  },
  wellipse(cx, cy, rx, ry, r = 0.5, color = INK, amp = 1, fill = null) {
    const n = Math.max(8, Math.round((rx + ry) / 2)), pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    if (fill) for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)))); this.rect(cx - w, cy + dy, w * 2 + 1, 1, fill); }
    this.wpoly(pts, r, color, amp);
  },
  // Sparkle dust inside a rect.
  spray(x, y, w, h, density, color = INK, seed = 0) {
    const n = Math.round(w * h * density);
    for (let i = 0; i < n; i++) { const a = this.hash(i, seed, this.frame + 7), b = this.hash(seed, i, this.frame + 11); this.rect(x + Math.floor(a * w), y + Math.floor(b * h), 1, 1, color); }
  },
  clip(x, y, w, h) { this.x.save(); this.x.beginPath(); this.x.rect(x, y, w, h); this.x.clip(); },
  unclip() { this.x.restore(); },
};

window.G = G;
window.INK = INK; window.PAPER = PAPER; window.PINK = PINK; window.CYAN = CYAN; window.YELLOW = YELLOW;
