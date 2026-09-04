// 从 master PNG 生成多尺寸 icon.png / icon.ico（圆形裁切 + 透明四角，Windows 任务栏显示为圆）。
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const master = path.join(root, 'assets', 'mda-app-icon-master.png');
const guiDir = path.join(root, 'src', 'gui');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** @param {number} size */
function circleMaskSvg(size) {
  const r = size / 2;
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${r}" cy="${r}" r="${r}" fill="white"/>` +
      `</svg>`,
  );
}

/**
 * 缩放到 size×size 并裁成正圆，圆外 alpha=0。
 * @param {string|Buffer} input
 * @param {number} size
 * @returns {Promise<Buffer>}
 */
async function toCircularPngBuffer(input, size) {
  return sharp(input)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .composite([{ input: circleMaskSvg(size), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** @param {string} filePath @param {Buffer} buf */
async function writePng(filePath, buf) {
  await fs.promises.writeFile(filePath, buf);
}

async function main() {
  const pngToIco = (await import('png-to-ico')).default;
  if (!fs.existsSync(master)) {
    console.error('缺少 assets/mda-app-icon-master.png');
    process.exit(1);
  }
  fs.mkdirSync(guiDir, { recursive: true });

  const masterCircular = await toCircularPngBuffer(master, 1024);
  await writePng(master, masterCircular);
  console.log('  updated: assets/mda-app-icon-master.png (circular alpha)');

  await writePng(path.join(guiDir, 'icon.png'), await toCircularPngBuffer(masterCircular, 512));
  console.log('  wrote: src/gui/icon.png (512, circular)');

  const tmpDir = path.join(guiDir, '.icon-tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const icoInputs = [];
  try {
    for (const size of ICO_SIZES) {
      const file = path.join(tmpDir, `${size}.png`);
      await writePng(file, await toCircularPngBuffer(masterCircular, size));
      icoInputs.push(file);
    }
    const icoBuf = await pngToIco(icoInputs);
    fs.writeFileSync(path.join(guiDir, 'icon.ico'), icoBuf);
    console.log('  wrote: src/gui/icon.ico (' + ICO_SIZES.join(', ') + ', circular)');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
