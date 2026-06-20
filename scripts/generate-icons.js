const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZE = 256;

// Generar icono como SVG renderizado vía sharp
const svgOrb = (size) => `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00D4FF" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#00D4FF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00D4FF" stop-opacity="1"/>
      <stop offset="50%" stop-color="#0096C8" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#006496" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="none"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.49}" fill="url(#glow)"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size*0.175}" fill="url(#core)"/>
  <path d="M ${size*0.15} ${size/2} A ${size*0.35} ${size*0.35} 0 0 1 ${size*0.78} ${size*0.25}"
        fill="none" stroke="#00D4FF" stroke-width="${Math.max(1, size*0.04)}" stroke-opacity="0.8"/>
  <path d="M ${size*0.22} ${size*0.6} A ${size*0.28} ${size*0.28} 0 0 0 ${size*0.72} ${size*0.65}"
        fill="none" stroke="#00D4FF" stroke-width="${Math.max(1, size*0.03)}" stroke-opacity="0.4"
        stroke-dasharray="${Math.max(1, size*0.025)} ${Math.max(1, size*0.05)}"/>
</svg>`;

async function generateOrbIcon(size, outputPath) {
  const svg = svgOrb(size);
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(outputPath);
  console.log(`Icono generado: ${outputPath} (${size}x${size})`);
}

async function main() {
  const assetsDir = path.join(__dirname, '..', 'assets');
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  await generateOrbIcon(256, path.join(assetsDir, 'icon.png'));
  await generateOrbIcon(32, path.join(assetsDir, 'tray-icon.png'));
  await generateOrbIcon(16, path.join(assetsDir, 'tray-icon-small.png'));

  console.log('Iconos generados correctamente.');
}

main().catch(err => {
  console.error('Error generando iconos:', err);
  process.exit(1);
});
