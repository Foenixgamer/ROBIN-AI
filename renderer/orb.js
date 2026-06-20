const REF_W = 1920, REF_H = 1080;

const canvas = document.getElementById('orb');
const ctx = canvas.getContext('2d');
let W, H, cx, cy, scale;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  W = canvas.width = w * dpr;
  H = canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = w / 2;
  cy = h / 2;
  scale = Math.min(w / REF_W, h / REF_H) * 0.95;
}
window.addEventListener('resize', resize);
resize();

let orbMode = 'IDLE';       // IDLE | LISTENING | SPEAKING | ALERT
let orbAmplitude = 0;
let targetAmplitude = 0;
let isSpeaking = false;
let alertFlash = 0;
let satisfiedTimer = 0;
let wakePulse = 0;

// ── Ring angles ──
let angle1 = 0, angle2 = 0, angle3 = 0;

// ── Particle positions ──
const NUM_PARTICLES = 8;
const particles = Array.from({ length: NUM_PARTICLES }, (_, i) => ({
  angle: (i / NUM_PARTICLES) * Math.PI * 2,
  radius: 0,
  speed: 0,
  size: 0,
  opacity: 0,
}));

// ── Orb colors per mode ──
const COLORS = {
  IDLE:       { main: '00D4FF', alpha: 0.4, glow: '00D4FF' },
  LISTENING:  { main: '00D4FF', alpha: 1.0, glow: '00D4FF' },
  SPEAKING:   { main: '00D4FF', alpha: 1.0, glow: '00D4FF' },
  ALERT:      { main: 'FF6B35', alpha: 1.0, glow: 'FF4444' },
};

function getColor(mode) {
  return COLORS[mode] || COLORS.IDLE;
}

// ── Public setters (called from voice.js) ──
window.__setOrbMode = function(mode) {
  if (mode === 'SATISFECHO') {
    satisfiedTimer = 60;
    return;
  }
  if (mode === 'WAKE') {
    wakePulse = 45;
    orbMode = 'LISTENING';
    return;
  }
  orbMode = mode;
};

window.__setOrbAmplitude = function(amp) {
  targetAmplitude = Math.max(0, Math.min(1, amp));
};

// ── Ring radii ──
function getRadii() {
  const base = 180 * scale;
  let expansion = 0;
  const wakeBoost = wakePulse > 0 ? Math.sin((45 - wakePulse) / 45 * Math.PI) * 15 * scale : 0;

  if (orbMode === 'LISTENING' || orbMode === 'IDLE') {
    expansion = Math.sin(Date.now() / 300) * 8 * scale + wakeBoost;
  } else if (orbMode === 'SPEAKING') {
    expansion = orbAmplitude * 20 * scale + wakeBoost;
  } else {
    expansion = wakeBoost;
  }

  return {
    outer: base + expansion,
    mid: base * 0.78 + expansion * 0.7,
    inner: base * 0.55 + expansion * 0.4,
    core: base * 0.33,
  };
}

// ── Drawing ──
function draw() {
  ctx.clearRect(0, 0, W, H);

  const color = getColor(orbMode);
  const radii = getRadii();
  const now = Date.now();

  // Smooth amplitude
  orbAmplitude += (targetAmplitude - orbAmplitude) * 0.15;

  // Rotations
  const speedMul = orbMode === 'LISTENING' || orbMode === 'SPEAKING' ? 2.5 : 1;
  const alertShake = orbMode === 'ALERT' ? Math.sin(now / 50) * 4 * scale : 0;

  angle1 += 0.008 * speedMul;
  angle2 -= 0.012 * speedMul;
  angle3 += 0.018 * speedMul;

  // Satisfied flash
  if (satisfiedTimer > 0) {
    satisfiedTimer--;
    const flash = satisfiedTimer / 60;
    drawGlow(cx, cy, radii.core * 2.5, `rgba(0,255,179,${flash * 0.4})`);
  }

  // Wake pulse
  if (wakePulse > 0) {
    wakePulse--;
    const pulse = Math.sin((45 - wakePulse) / 45 * Math.PI);
    drawGlow(cx, cy, radii.outer * 1.3, `rgba(0,212,255,${pulse * 0.25})`);
  }

  // ── Outer ring ──
  drawRing(cx + alertShake, cy, radii.outer, color, angle1, 0.6, 2.5);

  // ── Middle ring ──
  drawRing(cx + alertShake * 0.7, cy, radii.mid, color, angle2, 0.5, 2);

  // ── Inner ring ──
  drawRing(cx + alertShake * 0.4, cy, radii.inner, color, angle3, 0.7, 1.5);

  // ── Glow ──
  drawGlow(cx + alertShake * 0.3, cy, radii.core * 1.8, color);

  // ── Core ──
  drawCore(cx + alertShake * 0.2, cy, radii.core, color);

  // ── Particles ──
  drawParticles(cx + alertShake, cy, radii, color, now);

  // ── Sound waves (LISTENING / SPEAKING) ──
  if (orbMode === 'LISTENING' || orbMode === 'SPEAKING') {
    drawSoundWaves(cx, cy, radii.outer, now);
  }

  requestAnimationFrame(draw);
}

function drawRing(x, y, radius, color, angle, opacity, width) {
  if (!color || !color.main) return;
  const alpha = color.alpha * opacity;
  ctx.save();
  ctx.strokeStyle = `rgba(${hexToRgb(color.main)},${alpha})`;
  ctx.lineWidth = width * scale;
  ctx.shadowBlur = 15 * scale;
  ctx.shadowColor = `rgba(${hexToRgb(color.main)},${alpha * 0.3})`;
  ctx.beginPath();
  ctx.arc(x, y, radius, angle, angle + Math.PI * 1.2);
  ctx.stroke();
  ctx.restore();

  // Dash effect (opposite side)
  ctx.save();
  ctx.strokeStyle = `rgba(${hexToRgb(color.main)},${alpha * 0.15})`;
  ctx.lineWidth = width * scale * 0.5;
  ctx.setLineDash([4 * scale, 8 * scale]);
  ctx.beginPath();
  ctx.arc(x, y, radius, angle + Math.PI * 0.8, angle + Math.PI * 1.8);
  ctx.stroke();
  ctx.restore();
}

function drawGlow(x, y, radius, color) {
  if (!color || !color.main) return;
  const alpha = orbMode === 'ALERT' ? 0.3 : 0.12;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${hexToRgb(color.main)},${alpha})`);
  gradient.addColorStop(0.5, `rgba(${hexToRgb(color.main)},${alpha * 0.3})`);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawCore(x, y, radius, color) {
  if (!color || !color.main) return;
  const pulse = orbMode === 'IDLE'
    ? 0.85 + Math.sin(Date.now() / 2000) * 0.15
    : orbMode === 'LISTENING' || orbMode === 'SPEAKING'
    ? 0.7 + orbAmplitude * 0.3
    : 1;

  const r = radius * pulse;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  const mainRGB = hexToRgb(color.main);
  gradient.addColorStop(0, `rgba(${mainRGB},${color.alpha})`);
  gradient.addColorStop(0.4, `rgba(${mainRGB},${color.alpha * 0.6})`);
  gradient.addColorStop(0.7, `rgba(${mainRGB},${color.alpha * 0.2})`);
  gradient.addColorStop(1, `rgba(${mainRGB},0)`);

  ctx.save();
  ctx.shadowBlur = 40 * scale;
  ctx.shadowColor = `rgba(${hexToRgb(color.main)},${color.alpha * 0.5})`;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(x, y, radii, color, now) {
  if (!color || !color.main) return;
  particles.forEach((p, i) => {
    if (orbMode === 'SPEAKING') {
      p.radius = radii.outer * 1.05 + orbAmplitude * 25 * scale;
      p.speed = 0.01 + orbAmplitude * 0.02;
      p.size = 2 * scale + orbAmplitude * 2 * scale;
      p.opacity = 0.4 + orbAmplitude * 0.4;
    } else {
      p.radius = radii.outer * 1.08;
      p.speed = 0.008;
      p.size = 1.5 * scale;
      p.opacity = 0.2;
    }

    p.angle += p.speed;

    const px = x + Math.cos(p.angle) * p.radius;
    const py = y + Math.sin(p.angle) * p.radius;

    ctx.save();
    ctx.fillStyle = `rgba(${hexToRgb(color.main)},${p.opacity})`;
    ctx.shadowBlur = 8 * scale;
    ctx.shadowColor = `rgba(${hexToRgb(color.main)},${p.opacity * 0.5})`;
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawSoundWaves(x, y, outerRadius, now) {
  const count = orbMode === 'SPEAKING' ? 4 : 2;
  for (let i = 0; i < count; i++) {
    const phase = now / 500 + i * 1.2;
    const radius = outerRadius + Math.sin(phase) * 15 * scale + 20 * scale;
    const alpha = 0.15 - i * 0.03;
    if (alpha <= 0) continue;

    ctx.save();
    ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
    ctx.lineWidth = 1.5 * scale;
    ctx.setLineDash([3 * scale, 6 * scale]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ── Helpers ──
function hexToRgb(hex) {
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// ── Start ──
draw();
