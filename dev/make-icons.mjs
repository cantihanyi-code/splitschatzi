// Erzeugt die App-Icons (PNG + SVG) ohne externe Abhängigkeiten: `node dev/make-icons.mjs`
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
fs.mkdirSync(out, { recursive: true });

const STOPS = [[0, [0x8b, 0x5c, 0xf6]], [0.55, [0x6d, 0x28, 0xd9]], [1, [0x4f, 0x46, 0xe5]]];
function grad(t) {
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
    if (t <= t1) { const f = (t - t0) / (t1 - t0); return c0.map((v, k) => v + (c1[k] - v) * f); }
  }
  return STOPS[STOPS.length - 1][1];
}
const inHeart = (u, v) => { const a = u * u + v * v - 1; return a * a * a - u * u * v * v * v <= 0; };

function render(size, { fullBleed, heartWidth }) {
  const px = Buffer.alloc(size * size * 4), SS = 4, radius = fullBleed ? 0 : size * 0.22;
  const s = (heartWidth * size) / 2.28, cx = size / 2, cy = size / 2 + 0.12 * s;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let bg = 0, heart = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const X = x + (sx + 0.5) / SS, Y = y + (sy + 0.5) / SS;
      const dx = Math.max(radius - X, 0, X - (size - radius)), dy = Math.max(radius - Y, 0, Y - (size - radius));
      if (!radius || dx * dx + dy * dy <= radius * radius) bg++;
      if (inHeart((X - cx) / s, (cy - Y) / s)) heart++;
    }
    const a = bg / (SS * SS), h = heart / (SS * SS);
    const c = grad((x + y) / (2 * size)).map(v => v + (255 - v) * h);
    const i = (y * size + x) * 4;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = Math.round(255 * Math.max(a, h));
  }
  return png(size, size, px);
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = {
  'icon-192.png': render(192, { fullBleed: false, heartWidth: 0.56 }),
  'icon-512.png': render(512, { fullBleed: false, heartWidth: 0.56 }),
  'icon-maskable-512.png': render(512, { fullBleed: true, heartWidth: 0.44 }),
  'apple-touch-icon.png': render(180, { fullBleed: true, heartWidth: 0.52 }),
};
for (const [name, buf] of Object.entries(files)) fs.writeFileSync(path.join(out, name), buf);

fs.writeFileSync(path.join(out, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".55" stop-color="#6d28d9"/><stop offset="1" stop-color="#4f46e5"/></linearGradient></defs>
<rect width="512" height="512" rx="112" fill="url(#g)"/>
<path transform="translate(256 262) scale(12.2) translate(-12 -12.6)" fill="#fff" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
</svg>
`);
console.log('Icons geschrieben nach', out);
