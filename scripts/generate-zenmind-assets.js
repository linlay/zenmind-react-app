const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'assets');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const int = parseInt(clean, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function createPng(width, height, transparent = false) {
  const png = new PNG({ width, height });
  const fill = transparent ? 0 : 255;
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = fill;
  }
  return png;
}

function idx(png, x, y) {
  return (png.width * y + x) << 2;
}

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = idx(png, x, y);
  const srcA = clamp((color.a ?? 255) / 255, 0, 1);
  const dstA = png.data[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);

  if (outA <= 0) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
    return;
  }

  const srcR = color.r;
  const srcG = color.g;
  const srcB = color.b;
  const dstR = png.data[i];
  const dstG = png.data[i + 1];
  const dstB = png.data[i + 2];

  png.data[i] = Math.round((srcR * srcA + dstR * dstA * (1 - srcA)) / outA);
  png.data[i + 1] = Math.round((srcG * srcA + dstG * dstA * (1 - srcA)) / outA);
  png.data[i + 2] = Math.round((srcB * srcA + dstB * dstA * (1 - srcA)) / outA);
  png.data[i + 3] = Math.round(outA * 255);
}

function fillRect(png, x, y, w, h, color) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.ceil(x + w);
  const y1 = Math.ceil(y + h);
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      setPixel(png, xx, yy, color);
    }
  }
}

function drawCircle(png, cx, cy, radius, color) {
  const r = radius;
  const x0 = Math.floor(cx - r);
  const x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.ceil(cy + r);
  const rr = r * r;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rr) {
        setPixel(png, x, y, color);
      }
    }
  }
}

function drawRing(png, cx, cy, radius, thickness, color) {
  const rOuter = radius + thickness / 2;
  const rInner = Math.max(0, radius - thickness / 2);
  const x0 = Math.floor(cx - rOuter);
  const x1 = Math.ceil(cx + rOuter);
  const y0 = Math.floor(cy - rOuter);
  const y1 = Math.ceil(cy + rOuter);
  const oo = rOuter * rOuter;
  const ii = rInner * rInner;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= oo && d2 >= ii) {
        setPixel(png, x, y, color);
      }
    }
  }
}

function drawLine(png, x1, y1, x2, y2, thickness, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  const r = thickness / 2;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    drawCircle(png, x, y, r, color);
  }
}

function drawGlow(png, cx, cy, radius, color, strength = 1) {
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      const t = d / radius;
      const a = Math.round((color.a ?? 255) * Math.pow(1 - t, 2) * strength);
      if (a > 0) {
        setPixel(png, x, y, { r: color.r, g: color.g, b: color.b, a });
      }
    }
  }
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function fillTechBackground(png) {
  const top = hexToRgb('#031722');
  const bottom = hexToRgb('#072c3a');
  const glow = hexToRgb('#10d9ff');
  const cx = png.width * 0.5;
  const cy = png.height * 0.45;
  const maxR = Math.min(png.width, png.height) * 0.7;

  for (let y = 0; y < png.height; y += 1) {
    const ty = y / (png.height - 1);
    for (let x = 0; x < png.width; x += 1) {
      const bg = mix(top, bottom, ty);
      const d = Math.hypot(x - cx, y - cy);
      const glowT = clamp(1 - d / maxR, 0, 1);
      const wave = 0.5 + 0.5 * Math.sin((x + y) * 0.018);
      const sci = glowT * 0.42;
      const c = {
        r: Math.round(bg.r + glow.r * sci * 0.5 * wave),
        g: Math.round(bg.g + glow.g * sci * 0.7),
        b: Math.round(bg.b + glow.b * sci),
        a: 255,
      };
      const i = idx(png, x, y);
      png.data[i] = c.r;
      png.data[i + 1] = c.g;
      png.data[i + 2] = c.b;
      png.data[i + 3] = 255;
    }
  }

  for (let x = 0; x < png.width; x += Math.max(18, Math.floor(png.width / 32))) {
    drawLine(png, x, 0, x, png.height - 1, 1, { r: 24, g: 149, b: 172, a: 22 });
  }
  for (let y = 0; y < png.height; y += Math.max(18, Math.floor(png.height / 32))) {
    drawLine(png, 0, y, png.width - 1, y, 1, { r: 24, g: 149, b: 172, a: 22 });
  }

  const rand = lcg(404);
  const stars = Math.floor((png.width * png.height) / 3800);
  for (let i = 0; i < stars; i += 1) {
    const x = Math.floor(rand() * png.width);
    const y = Math.floor(rand() * png.height);
    const a = 90 + Math.floor(rand() * 120);
    setPixel(png, x, y, { r: 170, g: 246, b: 255, a });
  }
}

function drawRoundedFrame(png, cx, cy, w, h, r, color) {
  fillRect(png, cx - w / 2 + r, cy - h / 2, w - 2 * r, h, color);
  fillRect(png, cx - w / 2, cy - h / 2 + r, r, h - 2 * r, color);
  fillRect(png, cx + w / 2 - r, cy - h / 2 + r, r, h - 2 * r, color);
  drawCircle(png, cx - w / 2 + r, cy - h / 2 + r, r, color);
  drawCircle(png, cx + w / 2 - r, cy - h / 2 + r, r, color);
  drawCircle(png, cx - w / 2 + r, cy + h / 2 - r, r, color);
  drawCircle(png, cx + w / 2 - r, cy + h / 2 - r, r, color);
}

function drawZenHomeMark(png, cx, cy, scale, withDisc) {
  const cyan = hexToRgb('#18e2ff');
  const blue = hexToRgb('#69f0ff');

  if (withDisc) {
    drawGlow(png, cx, cy, scale * 0.9, { ...cyan, a: 120 }, 1);
    drawCircle(png, cx, cy, scale * 0.68, { r: 2, g: 22, b: 34, a: 220 });
  } else {
    drawGlow(png, cx, cy, scale * 0.95, { ...cyan, a: 130 }, 1.2);
  }

  drawRing(png, cx, cy, scale * 0.72, scale * 0.07, { ...cyan, a: 220 });
  drawRing(png, cx, cy, scale * 0.56, scale * 0.03, { ...blue, a: 160 });

  const roofY = cy - scale * 0.1;
  drawLine(
    png,
    cx - scale * 0.29,
    roofY,
    cx,
    cy - scale * 0.35,
    scale * 0.05,
    { ...cyan, a: 245 }
  );
  drawLine(
    png,
    cx,
    cy - scale * 0.35,
    cx + scale * 0.29,
    roofY,
    scale * 0.05,
    { ...cyan, a: 245 }
  );

  drawRoundedFrame(
    png,
    cx,
    cy + scale * 0.13,
    scale * 0.44,
    scale * 0.34,
    scale * 0.04,
    { ...blue, a: 230 }
  );

  fillRect(
    png,
    cx - scale * 0.055,
    cy + scale * 0.10,
    scale * 0.11,
    scale * 0.19,
    { r: 6, g: 32, b: 44, a: 230 }
  );
  drawLine(
    png,
    cx - scale * 0.12,
    cy + scale * 0.03,
    cx + scale * 0.12,
    cy + scale * 0.03,
    scale * 0.03,
    { ...cyan, a: 190 }
  );

  const traceY = cy + scale * 0.11;
  drawLine(
    png,
    cx + scale * 0.24,
    traceY,
    cx + scale * 0.39,
    traceY,
    scale * 0.028,
    { ...blue, a: 230 }
  );
  drawCircle(png, cx + scale * 0.43, traceY, scale * 0.038, { ...cyan, a: 240 });
  drawCircle(png, cx + scale * 0.24, traceY, scale * 0.025, { ...cyan, a: 190 });

  drawLine(
    png,
    cx - scale * 0.24,
    traceY,
    cx - scale * 0.39,
    traceY,
    scale * 0.028,
    { ...blue, a: 230 }
  );
  drawCircle(png, cx - scale * 0.43, traceY, scale * 0.038, { ...cyan, a: 240 });
  drawCircle(png, cx - scale * 0.24, traceY, scale * 0.025, { ...cyan, a: 190 });
}

const FONT_5x7 = {
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
};

function drawBitmapText(png, text, x, y, pixelSize, color, glowColor) {
  let cursor = x;
  for (const ch of text) {
    if (ch === ' ') {
      cursor += pixelSize * 4;
      continue;
    }
    const glyph = FONT_5x7[ch];
    if (!glyph) {
      cursor += pixelSize * 6;
      continue;
    }

    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== '1') continue;
        const px = cursor + col * pixelSize;
        const py = y + row * pixelSize;
        if (glowColor) {
          fillRect(png, px - pixelSize * 0.2, py - pixelSize * 0.2, pixelSize * 1.4, pixelSize * 1.4, glowColor);
        }
        fillRect(png, px, py, pixelSize, pixelSize, color);
      }
    }

    cursor += pixelSize * 6;
  }
  return cursor;
}

const HAN_ZHAI = [
  '0000011111110000',
  '0000010000010000',
  '0000100000001000',
  '0000111111111000',
  '0000000010000000',
  '0000011111110000',
  '0000010000010000',
  '0000010000010000',
  '0000011111110000',
  '0000010010010000',
  '0000010010010000',
  '0000010010010000',
  '0000111111111000',
  '0000000100000000',
  '0000001110000000',
  '0000000000000000',
];

const HAN_NAO = [
  '0011110001111100',
  '0010010001000100',
  '0011110001111100',
  '0010010001000100',
  '0011110001111100',
  '0010000000010000',
  '0011110001111100',
  '0010010001010100',
  '0010010001010100',
  '0011110001111100',
  '0010000000010000',
  '0011110001111100',
  '0010010001000100',
  '0011110001111100',
  '0000010000010000',
  '0000000000000000',
];

function drawHanChar(png, bitmap, x, y, unit, color, glowColor) {
  for (let row = 0; row < bitmap.length; row += 1) {
    const line = bitmap[row];
    for (let col = 0; col < line.length; col += 1) {
      if (line[col] !== '1') continue;
      const px = x + col * unit;
      const py = y + row * unit;
      if (glowColor) {
        fillRect(png, px - unit * 0.15, py - unit * 0.15, unit * 1.3, unit * 1.3, glowColor);
      }
      fillRect(png, px, py, unit, unit, color);
    }
  }
}

function writePng(png, name) {
  const out = path.join(ASSETS_DIR, name);
  fs.writeFileSync(out, PNG.sync.write(png));
}

function makeIcon() {
  const png = createPng(1024, 1024, false);
  fillTechBackground(png);
  drawZenHomeMark(png, 512, 500, 360, true);
  drawGlow(png, 512, 865, 220, { r: 16, g: 226, b: 255, a: 80 }, 0.8);
  writePng(png, 'icon.png');
}

function makeAdaptiveIcon() {
  const png = createPng(1024, 1024, true);
  drawZenHomeMark(png, 512, 512, 350, false);
  writePng(png, 'adaptive-icon.png');
}

function makeSplashIcon() {
  const png = createPng(1242, 2436, true);
  const cx = Math.floor(png.width / 2);
  drawZenHomeMark(png, cx, 920, 310, false);
  drawGlow(png, cx, 1160, 260, { r: 20, g: 228, b: 255, a: 70 }, 0.6);

  const title = 'ZENMIND';
  const px = 14;
  const titleWidth = title.length * px * 6 - px;
  const titleX = Math.floor((png.width - titleWidth) / 2);
  drawBitmapText(
    png,
    title,
    titleX,
    1350,
    px,
    { r: 162, g: 248, b: 255, a: 255 },
    { r: 31, g: 226, b: 255, a: 65 }
  );

  const hanUnit = 10;
  const charWidth = 16 * hanUnit;
  const gap = 40;
  const hanStart = Math.floor((png.width - charWidth * 2 - gap) / 2);
  drawHanChar(
    png,
    HAN_ZHAI,
    hanStart,
    1545,
    hanUnit,
    { r: 150, g: 238, b: 252, a: 255 },
    { r: 24, g: 220, b: 255, a: 55 }
  );
  drawHanChar(
    png,
    HAN_NAO,
    hanStart + charWidth + gap,
    1545,
    hanUnit,
    { r: 150, g: 238, b: 252, a: 255 },
    { r: 24, g: 220, b: 255, a: 55 }
  );

  drawLine(png, 300, 1760, 942, 1760, 2, { r: 67, g: 212, b: 237, a: 90 });
  writePng(png, 'splash-icon.png');
}

function makeFavicon() {
  const png = createPng(48, 48, false);
  const top = hexToRgb('#031722');
  const bottom = hexToRgb('#0a3647');
  for (let y = 0; y < png.height; y += 1) {
    const t = y / (png.height - 1);
    const c = mix(top, bottom, t);
    for (let x = 0; x < png.width; x += 1) {
      const i = idx(png, x, y);
      png.data[i] = c.r;
      png.data[i + 1] = c.g;
      png.data[i + 2] = c.b;
      png.data[i + 3] = 255;
    }
  }
  drawZenHomeMark(png, 24, 24, 16, true);
  writePng(png, 'favicon.png');
}

makeIcon();
makeAdaptiveIcon();
makeSplashIcon();
makeFavicon();

console.log('Generated ZenMind brand assets in assets/.');
