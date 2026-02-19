// gen-icons.js - PWA用PNGアイコン生成スクリプト
const fs = require('fs');

function crc32(buf) {
  let crc = 0xffffffff;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let a = 1, b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData));
  return Buffer.concat([len, typeData, crc]);
}

function createPNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 3;
      const di = y * (1 + width * 3) + 1 + x * 3;
      rawData[di] = pixels[si];
      rawData[di + 1] = pixels[si + 1];
      rawData[di + 2] = pixels[si + 2];
    }
  }

  const blocks = [];
  let pos = 0;
  while (pos < rawData.length) {
    const end = Math.min(pos + 65535, rawData.length);
    const isLast = end === rawData.length;
    const blockLen = end - pos;
    const header = Buffer.alloc(5);
    header[0] = isLast ? 1 : 0;
    header.writeUInt16LE(blockLen, 1);
    header.writeUInt16LE(blockLen ^ 0xffff, 3);
    blocks.push(header);
    blocks.push(rawData.slice(pos, end));
    pos = end;
  }
  const zlibHeader = Buffer.from([0x78, 0x01]);
  const adlerBuf = Buffer.alloc(4);
  adlerBuf.writeUInt32BE(adler32(rawData));
  const compressed = Buffer.concat([zlibHeader, ...blocks, adlerBuf]);

  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

function generateIcon(size, maskable) {
  const pixels = Buffer.alloc(size * size * 3);
  const cx = size / 2, cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const t = (x + y) / (size * 2);
      const bgR = Math.round(26 + t * 5);
      const bgG = Math.round(26 + t * 7);
      const bgB = Math.round(46 + t * 16);

      let inside = true;
      if (!maskable) {
        const cr = size * 0.15;
        if (x < cr && y < cr) inside = Math.hypot(x - cr, y - cr) <= cr;
        else if (x > size - cr - 1 && y < cr) inside = Math.hypot(x - (size - cr - 1), y - cr) <= cr;
        else if (x < cr && y > size - cr - 1) inside = Math.hypot(x - cr, y - (size - cr - 1)) <= cr;
        else if (x > size - cr - 1 && y > size - cr - 1) inside = Math.hypot(x - (size - cr - 1), y - (size - cr - 1)) <= cr;
      }

      if (!inside) {
        pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0;
        continue;
      }

      pixels[i] = bgR; pixels[i + 1] = bgG; pixels[i + 2] = bgB;

      // Yellow taxi circle
      const circCy = cy - size * 0.06;
      const dist = Math.hypot(x - cx, y - circCy);
      if (dist < size * 0.28) {
        pixels[i] = 249; pixels[i + 1] = 168; pixels[i + 2] = 37;
      }

      // Car body (dark on yellow circle)
      const carCy = circCy;
      const carW = size * 0.15, carH = size * 0.07;
      if (x >= cx - carW && x <= cx + carW && y >= carCy - carH && y <= carCy + carH) {
        pixels[i] = bgR; pixels[i + 1] = bgG; pixels[i + 2] = bgB;
      }
      // Car roof
      const roofW = size * 0.09, roofH = size * 0.055;
      if (x >= cx - roofW && x <= cx + roofW && y >= carCy - carH - roofH && y <= carCy - carH) {
        pixels[i] = bgR; pixels[i + 1] = bgG; pixels[i + 2] = bgB;
      }
      // Car windows (yellow on dark)
      const winH = roofH * 0.6;
      const winY = carCy - carH - roofH + (roofH - winH) / 2;
      if (y >= winY && y <= winY + winH) {
        // Left window
        if (x >= cx - roofW * 0.85 && x <= cx - roofW * 0.1) {
          pixels[i] = 200; pixels[i + 1] = 220; pixels[i + 2] = 255;
        }
        // Right window
        if (x >= cx + roofW * 0.1 && x <= cx + roofW * 0.85) {
          pixels[i] = 200; pixels[i + 1] = 220; pixels[i + 2] = 255;
        }
      }
      // Wheels
      const wheelR = size * 0.025;
      if (Math.hypot(x - (cx - carW * 0.65), y - (carCy + carH)) < wheelR ||
          Math.hypot(x - (cx + carW * 0.65), y - (carCy + carH)) < wheelR) {
        pixels[i] = 40; pixels[i + 1] = 40; pixels[i + 2] = 50;
      }

      // TAXI text
      const textY = cy + size * 0.23;
      const textH = size * 0.065;
      const lw = size * 0.045;
      const gap = size * 0.012;
      const totalW = lw * 4 + gap * 3;
      const sx = cx - totalW / 2;

      if (y >= textY && y < textY + textH) {
        const ly = (y - textY) / textH;
        const thick = 0.3;
        // T
        const tx = (x - sx) / lw;
        if (tx >= 0 && tx < 1) {
          if (ly < thick || (tx > 0.5 - thick / 2 && tx < 0.5 + thick / 2)) {
            pixels[i] = 249; pixels[i + 1] = 168; pixels[i + 2] = 37;
          }
        }
        // A
        const ax = (x - (sx + lw + gap)) / lw;
        if (ax >= 0 && ax < 1) {
          if (ly < thick || (ax < thick || ax > 1 - thick) || (ly > 0.45 && ly < 0.45 + thick)) {
            pixels[i] = 249; pixels[i + 1] = 168; pixels[i + 2] = 37;
          }
        }
        // X
        const xx = (x - (sx + (lw + gap) * 2)) / lw;
        if (xx >= 0 && xx < 1) {
          if (Math.abs(xx - ly) < thick * 0.7 || Math.abs(xx - (1 - ly)) < thick * 0.7) {
            pixels[i] = 249; pixels[i + 1] = 168; pixels[i + 2] = 37;
          }
        }
        // I
        const ix = (x - (sx + (lw + gap) * 3)) / lw;
        if (ix >= 0 && ix < 1) {
          if (ly < thick || ly > 1 - thick || (ix > 0.5 - thick / 2 && ix < 0.5 + thick / 2)) {
            pixels[i] = 249; pixels[i + 1] = 168; pixels[i + 2] = 37;
          }
        }
      }
    }
  }
  return createPNG(size, size, pixels);
}

const dir = __dirname + '/../icons';
fs.writeFileSync(dir + '/icon-192.png', generateIcon(192, false));
fs.writeFileSync(dir + '/icon-512.png', generateIcon(512, false));
fs.writeFileSync(dir + '/icon-maskable-192.png', generateIcon(192, true));
fs.writeFileSync(dir + '/icon-maskable-512.png', generateIcon(512, true));
console.log('Icons generated: icon-192.png, icon-512.png, icon-maskable-192.png, icon-maskable-512.png');
