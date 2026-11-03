// Gera os ícones PNG do PWA (sem dependências): fundo terracota + disco de tapioca.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
function png(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const c = size / 2, r = size * 0.3, ring = size * 0.2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      let col = [0x9a, 0x34, 0x12];
      if (d < r) col = [0xfd, 0xf8, 0xf1];
      if (d < r && d > ring && y > c) col = [0xf5, 0x9e, 0x0b];
      raw.set(col, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = new URL('../web/public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192));
writeFileSync(new URL('icon-512.png', out), png(512));
writeFileSync(new URL('apple-touch-icon.png', out), png(180));
console.log('Ícones gerados em web/public');
