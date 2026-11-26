// render.js — everything the player sees: sky and sun, the projected
// terrain mesh, runways, rings, clouds, the aircraft itself, and the HUD
// with its tapes, compass, attitude ball, fuel and mission text.

import { CONFIG, STRIPS, RINGS, SKY_PRESETS } from './config.js';
import { clamp, degToRad, lerp, radToDeg } from './random.js';
import {
  cameraBasis, projectPoint, makeView, groundHeightAt, terrainColour,
  CLOUDS, stripAt,
} from './world.js';
import { feet, knots, headingDegrees } from './flight.js';
import { formatClock, missionProgressText } from './missions.js';

const TAU = Math.PI * 2;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Sky, sun and clouds
// ---------------------------------------------------------------------------

function drawSky(ctx, view, preset, horizonY) {
  // The horizon can leave the frame when the pilot dives or climbs steeply;
  // clamp its gradient stops into [0, 1] so the sky never throws.
  const h = clamp(horizonY / view.height, 0.02, 0.9);
  const sky = ctx.createLinearGradient(0, 0, 0, view.height);
  sky.addColorStop(0, preset.zenith);
  sky.addColorStop(Math.max(0.05, h * 0.7), preset.mid);
  sky.addColorStop(h, preset.horizon);
  sky.addColorStop(Math.min(0.98, h + 160 / view.height), '#b8ccd9');
  sky.addColorStop(1, '#8ba3b5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, view.width, view.height);
}

// The sun sits low on the horizon; drawn after the terrain so it rests on
// the far ground instead of hiding behind it.
function drawSun(ctx, view, plane, preset, horizonY) {
  const sunBearing = degToRad(30) - plane.heading;
  const sunScreenX = view.cx + Math.tan(sunBearing) * view.focal * 0.85;
  const sunScreenY = horizonY - view.height * 0.045;
  if (sunScreenX < -160 || sunScreenX > view.width + 160) return;
  const glow = ctx.createRadialGradient(
    sunScreenX, sunScreenY, 4, sunScreenX, sunScreenY, 150,
  );
  glow.addColorStop(0, preset.sunColor);
  glow.addColorStop(0.25, 'rgba(255,240,190,0.55)');
  glow.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunScreenX - 150, sunScreenY - 150, 300, 300);
  ctx.fillStyle = preset.sunColor;
  ctx.beginPath();
  ctx.arc(sunScreenX, sunScreenY, 26, 0, TAU);
  ctx.fill();
}

function drawClouds(ctx, basis, view, plane) {
  for (const cloud of CLOUDS) {
    const centre = projectPoint(cloud, basis, view);
    if (!centre) continue;
    const scale = view.focal / centre.depth;
    const radius = cloud.size * scale;
    if (radius < 3 || centre.x < -radius || centre.x > view.width + radius) continue;
    const alpha = clamp(1.15 - centre.depth / 7000, 0.12, 0.85);
    ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    for (let i = 0; i < cloud.puffs; i++) {
      const offsetX = (i - cloud.puffs / 2) * radius * 0.55;
      const offsetY = Math.sin(i * 2.4) * radius * 0.18;
      ctx.beginPath();
      ctx.ellipse(centre.x + offsetX, centre.y + offsetY, radius * 0.62, radius * 0.34, 0, 0, TAU);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// Terrain mesh
// ---------------------------------------------------------------------------

// A soft haze band over the horizon line, so the far edge of the terrain
// mesh melts into the sky instead of ending in a hard line.
function drawHorizonHaze(ctx, view, preset, horizonY) {
  const band = ctx.createLinearGradient(0, horizonY - 110, 0, horizonY + 16);
  band.addColorStop(0, 'rgba(207,230,247,0)');
  band.addColorStop(0.75, preset.haze);
  band.addColorStop(1, 'rgba(207,230,247,0)');
  ctx.fillStyle = band;
  ctx.fillRect(0, horizonY - 110, view.width, 126);
}

function drawTerrain(ctx, basis, view, plane) {
  const rows = CONFIG.terrainRows;
  const cols = CONFIG.terrainCols;
  // The grid is built from the camera, along the camera's horizontal
  // forward, so the ground right in front of the lens fills the bottom.
  const fwdX = basis.forward.x;
  const fwdY = basis.forward.y;
  const fwdLen = Math.hypot(fwdX, fwdY) || 1;
  const fx = fwdX / fwdLen;
  const fy = fwdY / fwdLen;
  const rx = basis.right.x;
  const ry = basis.right.y;
  const camX = basis.cam.x;
  const camY = basis.cam.y;
  // Depth rows, log-spaced so near ground has detail and far ground reaches.
  const depths = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    depths.push(CONFIG.terrainNear + (CONFIG.terrainFar - CONFIG.terrainNear) * t * t);
  }
  // Project the grid once, far row first so near rows paint over far ones.
  const grid = [];
  for (let i = 0; i <= rows; i++) {
    const depth = depths[i];
    // Wide enough at the far row to cover the screen, and wide enough
    // near the lens to fill the bottom corners of the frame.
    const halfWidth = Math.max((CONFIG.terrainHalfWidth * depth) / CONFIG.terrainFar, depth * 1.5);
    const row = [];
    for (let j = 0; j <= cols; j++) {
      const lateral = -halfWidth + (2 * halfWidth * j) / cols;
      const wx = camX + fx * depth + rx * lateral;
      const wy = camY + fy * depth + ry * lateral;
      const h = groundHeightAt(wx, wy);
      const projected = projectPoint({ x: wx, y: wy, z: h }, basis, view);
      row.push({ projected, height: h, x: wx, y: wy, depth });
    }
    grid.push(row);
  }
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = 0; j < cols; j++) {
      const a = grid[i][j];
      const b = grid[i][j + 1];
      const c = grid[i + 1][j + 1];
      const d = grid[i + 1][j];
      if (!a.projected || !b.projected || !c.projected || !d.projected) continue;
      const midH = (a.height + b.height + c.height + d.height) / 4;
      const midX = (a.x + b.x + c.x + d.x) / 4;
      const midY = (a.y + b.y + c.y + d.y) / 4;
      ctx.fillStyle = terrainColour(midH, midX, midY, depths[i]);
      ctx.beginPath();
      ctx.moveTo(a.projected.x, a.projected.y);
      ctx.lineTo(b.projected.x, b.projected.y);
      ctx.lineTo(c.projected.x, c.projected.y);
      ctx.lineTo(d.projected.x, d.projected.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRunway(ctx, basis, view, strip) {
  const halfL = strip.length / 2;
  const halfW = strip.width / 2;
  const heading = degToRad(strip.headingDeg);
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const corner = (along, across) => ({
    x: strip.x + sinH * along + cosH * across,
    y: strip.y + cosH * along - sinH * across,
    z: strip.elevation + 0.6,
  });
  // The near end may sit behind the camera (the aircraft is on the strip):
  // clamp it to just in front of the lens instead of dropping the runway.
  const camAlong = (basis.cam.x - strip.x) * sinH + (basis.cam.y - strip.y) * cosH;
  const nearAlong = Math.max(-halfL, camAlong + 8);
  const corners = [
    corner(nearAlong, -halfW), corner(halfL, -halfW),
    corner(halfL, halfW), corner(nearAlong, halfW),
  ].map((p) => projectPoint(p, basis, view));
  if (corners.some((p) => p === null)) return;
  ctx.fillStyle = '#3d4148';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();
  // Centreline dashes.
  ctx.strokeStyle = '#f2f2e8';
  ctx.lineWidth = 2;
  const dashes = Math.floor(strip.length / 60);
  for (let i = 0; i < dashes; i++) {
    const a = -halfL + 30 + (i * (strip.length - 60)) / Math.max(1, dashes - 1);
    if (a < nearAlong) continue;
    const p1 = projectPoint(corner(a - 12, 0), basis, view);
    const p2 = projectPoint(corner(a + 12, 0), basis, view);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  // Threshold bars at both ends.
  ctx.strokeStyle = '#f2f2e8';
  ctx.lineWidth = 3;
  for (const end of [-1, 1]) {
    const p1 = projectPoint(corner(end * (halfL - 14), -halfW + 4), basis, view);
    const p2 = projectPoint(corner(end * (halfL - 14), halfW - 4), basis, view);
    if (!p1 || !p2) continue;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}

function drawRing(ctx, basis, view, ring, isNext, time) {
  const points = [];
  const segments = 28;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * TAU;
    // The ring stands upright, facing the course direction (north here).
    const p = projectPoint({
      x: ring.x + Math.cos(angle) * ring.radius,
      y: ring.y,
      z: ring.z + Math.sin(angle) * ring.radius,
    }, basis, view);
    if (p) points.push(p);
  }
  if (points.length < 8) return;
  const pulse = isNext ? 0.75 + 0.25 * Math.sin(time * 5) : 0.5;
  const colour = isNext ? '255,176,32' : '120,200,255';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `rgba(${colour},${(0.35 * pulse).toFixed(3)})`;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${colour},${pulse.toFixed(3)})`;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// The aircraft, drawn in screen space, banking with its roll.
// ---------------------------------------------------------------------------

function drawPlaneShadow(ctx, basis, view, plane) {
  const ground = groundHeightAt(plane.x, plane.y);
  const altitude = Math.max(0.5, plane.z - ground);
  // The shadow is the aircraft's own silhouette on the ground: fuselage
  // and wings as projected lines, shrinking and fading as it climbs.
  const sinH = Math.sin(plane.heading);
  const cosH = Math.cos(plane.heading);
  const at = (forward, lateral) => projectPoint({
    x: plane.x + sinH * forward + cosH * lateral,
    y: plane.y + cosH * forward - sinH * lateral,
    z: ground + 1,
  }, basis, view);
  const nose = at(7, 0);
  const tail = at(-7, 0);
  const leftTip = at(-1, -6);
  const rightTip = at(-1, 6);
  if (!nose || !tail || !leftTip || !rightTip) return;
  const alpha = clamp(0.3 - altitude / 1800, 0.05, 0.3);
  const width = clamp(11 * view.focal / nose.depth, 2, 14);
  ctx.strokeStyle = `rgba(10,20,30,${alpha.toFixed(3)})`;
  ctx.lineCap = 'round';
  ctx.lineWidth = width * 0.45;
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(nose.x, nose.y);
  ctx.stroke();
  ctx.lineWidth = width * 0.28;
  ctx.beginPath();
  ctx.moveTo(leftTip.x, leftTip.y);
  ctx.lineTo(rightTip.x, rightTip.y);
  ctx.stroke();
}

function drawPlane(ctx, view, plane, time) {
  const px = view.cx;
  const py = view.height * 0.66 - plane.pitch * 260;
  const scale = 1.05;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(plane.roll * 0.9);
  ctx.scale(scale, scale);
  const propBlur = 0.35 + plane.throttle * 0.45;

  // Tailplane and fin.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-14, -58);
  ctx.lineTo(14, -58);
  ctx.lineTo(9, -84);
  ctx.lineTo(-9, -84);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#b8352c';
  ctx.beginPath();
  ctx.moveTo(-46, -44);
  ctx.lineTo(46, -44);
  ctx.lineTo(38, -58);
  ctx.lineTo(-38, -58);
  ctx.closePath();
  ctx.fill();

  // Fuselage: a rounded body tapering to the tail.
  const body = ctx.createLinearGradient(0, -96, 0, 26);
  body.addColorStop(0, '#f4f6f8');
  body.addColorStop(0.55, '#e8eef2');
  body.addColorStop(1, '#c8d2da');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -96);
  ctx.bezierCurveTo(20, -88, 26, -52, 24, -8);
  ctx.bezierCurveTo(23, 12, 12, 24, 0, 26);
  ctx.bezierCurveTo(-12, 24, -23, 12, -24, -8);
  ctx.bezierCurveTo(-26, -52, -20, -88, 0, -96);
  ctx.closePath();
  ctx.fill();

  // Red cheatline along the fuselage.
  ctx.strokeStyle = '#d8433a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-24, -30);
  ctx.bezierCurveTo(-12, -22, 12, -22, 24, -30);
  ctx.stroke();

  // Cockpit glass.
  ctx.fillStyle = '#1d3a52';
  ctx.beginPath();
  ctx.ellipse(0, -58, 11, 17, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,245,0.75)';
  ctx.beginPath();
  ctx.ellipse(-3, -64, 4, 7, -0.3, 0, TAU);
  ctx.fill();

  // Main wings, swept slightly back.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.moveTo(-22, -18);
  ctx.lineTo(-148, 26);
  ctx.lineTo(-142, 40);
  ctx.lineTo(-20, 6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(22, -18);
  ctx.lineTo(148, 26);
  ctx.lineTo(142, 40);
  ctx.lineTo(20, 6);
  ctx.closePath();
  ctx.fill();
  // Wing tips, white.
  ctx.fillStyle = '#f4f6f8';
  ctx.beginPath();
  ctx.moveTo(-148, 26);
  ctx.lineTo(-142, 40);
  ctx.lineTo(-128, 36);
  ctx.lineTo(-132, 24);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(148, 26);
  ctx.lineTo(142, 40);
  ctx.lineTo(128, 36);
  ctx.lineTo(132, 24);
  ctx.closePath();
  ctx.fill();

  // Registration on the fuselage.
  ctx.fillStyle = '#22303c';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('PK-LNG', 0, -6);

  // Navigation lights.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-146, 32, 3.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#34d17b';
  ctx.beginPath();
  ctx.arc(146, 32, 3.5, 0, TAU);
  ctx.fill();

  // Landing gear, only when it is down.
  if (plane.gearDown) {
    ctx.strokeStyle = '#2c3844';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, 14);
    ctx.lineTo(-22, 34);
    ctx.moveTo(16, 14);
    ctx.lineTo(22, 34);
    ctx.stroke();
    ctx.fillStyle = '#1c242c';
    ctx.beginPath();
    ctx.arc(-22, 36, 6, 0, TAU);
    ctx.arc(22, 36, 6, 0, TAU);
    ctx.fill();
  }

  // Propeller: a spinning translucent disc with two blades.
  ctx.save();
  ctx.translate(0, -96);
  ctx.rotate(plane.propAngle);
  ctx.fillStyle = `rgba(40,50,60,${propBlur.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 52, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = `rgba(220,230,240,${(propBlur * 0.5).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(0, 0, 46, 46, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Spinner.
  ctx.fillStyle = '#d8433a';
  ctx.beginPath();
  ctx.arc(0, -96, 7, 0, TAU);
  ctx.fill();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function drawTape(ctx, x, y, width, height, value, step, unit, formatValue, minValue = null) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.fillStyle = 'rgba(8,18,28,0.55)';
  ctx.fillRect(x, y, width, height);
  const centre = y + height / 2;
  const pixelsPerStep = height / 8;
  const base = Math.floor(value / step) * step;
  ctx.font = '13px ui-monospace, monospace';
  ctx.textAlign = 'left';
  for (let i = -5; i <= 5; i++) {
    const v = base + i * step;
    if (minValue !== null && v < minValue) continue;
    const offset = ((value - v) / step) * pixelsPerStep;
    const lineY = centre + offset;
    if (lineY < y || lineY > y + height) continue;
    ctx.strokeStyle = 'rgba(220,235,245,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + width - 14, lineY);
    ctx.lineTo(x + width, lineY);
    ctx.stroke();
    ctx.fillStyle = '#dcebf5';
    ctx.fillText(formatValue(v), x + 6, lineY + 4);
  }
  ctx.restore();
  // Centre readout box.
  ctx.fillStyle = '#0b1c2c';
  ctx.fillRect(x - 4, centre - 15, width + 8, 30);
  ctx.strokeStyle = '#7fb2e8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x - 4, centre - 15, width + 8, 30);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(formatValue(value), x + width / 2, centre + 6);
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText(unit, x + width / 2, y + height + 16);
}

function drawCompass(ctx, view, plane) {
  const width = 460;
  const x0 = view.cx - width / 2;
  const y = 18;
  ctx.fillStyle = 'rgba(8,18,28,0.55)';
  roundRect(ctx, x0, y, width, 34, 8);
  ctx.fill();
  const heading = headingDegrees(plane.heading);
  const pixelsPerDegree = width / 100;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y, width, 34);
  ctx.clip();
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  for (let offset = -50; offset <= 50; offset += 5) {
    const deg = ((heading + offset) % 360 + 360) % 360;
    const sx = view.cx + offset * pixelsPerDegree;
    const isCardinal = deg % 90 === 0;
    const isMajor = deg % 30 === 0;
    ctx.strokeStyle = isCardinal ? '#ffd166' : 'rgba(220,235,245,0.8)';
    ctx.lineWidth = isCardinal ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, y + 8);
    ctx.lineTo(sx, y + (isCardinal ? 26 : isMajor ? 22 : 16));
    ctx.stroke();
    if (isMajor) {
      const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg);
      ctx.fillStyle = isCardinal ? '#ffd166' : '#dcebf5';
      ctx.font = isCardinal ? 'bold 12px ui-monospace, monospace' : '11px ui-monospace, monospace';
      ctx.fillText(label, sx, y + 29);
    }
  }
  ctx.restore();
  // Centre caret and digital heading.
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.moveTo(view.cx - 7, y + 34);
  ctx.lineTo(view.cx + 7, y + 34);
  ctx.lineTo(view.cx, y + 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b1c2c';
  roundRect(ctx, view.cx - 30, y + 44, 60, 22, 5);
  ctx.fill();
  ctx.strokeStyle = '#7fb2e8';
  ctx.strokeRect(view.cx - 30, y + 44, 60, 22);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px ui-monospace, monospace';
  ctx.fillText(`${String(heading).padStart(3, '0')}°`, view.cx, y + 60);
}

function drawAttitudeBall(ctx, view, plane) {
  const cx = view.cx;
  const cy = view.height - 92;
  const r = 52;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll);
  const pitchPixels = clamp(plane.pitch * 260, -r, r);
  ctx.translate(0, pitchPixels);
  ctx.fillStyle = '#3f7fc4';
  ctx.fillRect(-r - 2, -r * 2 - 2, r * 2 + 4, r * 2 + 2);
  ctx.fillStyle = '#8a6a45';
  ctx.fillRect(-r - 2, 0, r * 2 + 4, r * 2 + 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.stroke();
  for (const deg of [-20, -10, 10, 20]) {
    const ly = -deg * 1.4;
    ctx.beginPath();
    ctx.moveTo(-18, ly);
    ctx.lineTo(18, ly);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed wings marker and bezel.
  ctx.strokeStyle = '#ffd166';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 34, cy);
  ctx.lineTo(cx - 12, cy);
  ctx.moveTo(cx + 12, cy);
  ctx.lineTo(cx + 34, cy);
  ctx.stroke();
  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#dfe9f2';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.stroke();
}

function drawGaugeBar(ctx, x, y, width, height, fraction, colour, label, text) {
  ctx.fillStyle = 'rgba(8,18,28,0.55)';
  roundRect(ctx, x - 6, y - 18, width + 12, height + 26, 6);
  ctx.fill();
  ctx.fillStyle = '#233240';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, Math.max(0, width * clamp(fraction, 0, 1)), height);
  ctx.strokeStyle = '#7fb2e8';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#dcebf5';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, x, y - 5);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'right';
  ctx.fillText(text, x + width, y - 5);
}

function drawHud(ctx, view, plane, mission, game) {
  // Speed tape (left) and altitude tape (right). Neither goes below zero.
  drawTape(ctx, 18, 132, 92, 240, knots(plane.speed), 10, 'KT', (v) => String(Math.round(v)), 0);
  drawTape(ctx, view.width - 110, 132, 92, 240, feet(plane.z), 100, 'FT', (v) => String(Math.round(v)), 0);
  drawCompass(ctx, view, plane);
  drawAttitudeBall(ctx, view, plane);

  // Throttle bar, left edge.
  const throttleX = 18;
  const throttleY = 420;
  ctx.fillStyle = 'rgba(8,18,28,0.55)';
  roundRect(ctx, throttleX - 6, throttleY - 20, 34, 170, 6);
  ctx.fill();
  ctx.fillStyle = '#233240';
  ctx.fillRect(throttleX, throttleY, 22, 140);
  ctx.fillStyle = '#58b368';
  ctx.fillRect(throttleX, throttleY + 140 * (1 - plane.throttle), 22, 140 * plane.throttle);
  ctx.strokeStyle = '#7fb2e8';
  ctx.strokeRect(throttleX, throttleY, 22, 140);
  ctx.fillStyle = '#dcebf5';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('THR', throttleX - 2, throttleY - 6);
  ctx.fillStyle = '#fff';
  ctx.fillText(`${Math.round(plane.throttle * 100)}%`, throttleX - 2, throttleY + 158);

  // Vertical speed, under the altitude tape.
  const vsi = plane.verticalSpeed * 196.85; // ft/min
  ctx.fillStyle = 'rgba(8,18,28,0.55)';
  roundRect(ctx, view.width - 116, 396, 104, 44, 6);
  ctx.fill();
  ctx.fillStyle = vsi < -400 ? '#ff6b5e' : '#dcebf5';
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${vsi >= 0 ? '+' : ''}${Math.round(vsi)}`, view.width - 64, 416);
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('FT/MIN', view.width - 64, 432);

  // Fuel and damage, bottom left.
  drawGaugeBar(ctx, 18, view.height - 66, 190, 12,
    plane.fuel / 100, plane.fuel < 20 ? '#ff6b5e' : '#f2b134', 'FUEL',
    `${Math.round(plane.fuel)}%`);
  drawGaugeBar(ctx, 18, view.height - 32, 190, 12,
    1 - plane.damage / 100, plane.damage > 60 ? '#ff6b5e' : '#58b368', 'AIRFRAME',
    plane.damage === 0 ? 'OK' : `${plane.damage}% RUSAK`);

  // Gear and flaps lights, bottom left above the gauges.
  const light = (x, label, on, colour) => {
    ctx.fillStyle = on ? colour : '#233240';
    ctx.beginPath();
    ctx.arc(x, view.height - 96, 7, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#7fb2e8';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#dcebf5';
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 11, view.height - 92);
  };
  light(24, 'GEAR', plane.gearDown, '#58b368');
  light(96, 'FLAP', plane.flapsDown, '#58b368');

  // Mission panel, top right.
  ctx.fillStyle = 'rgba(8,18,28,0.6)';
  roundRect(ctx, view.width - 320, 58, 302, 66, 8);
  ctx.fill();
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(mission.def.short.toUpperCase(), view.width - 308, 78);
  ctx.fillStyle = '#fff';
  ctx.font = '12px ui-monospace, monospace';
  let progress = missionProgressText(mission);
  while (progress.length > 2 && ctx.measureText(progress).width > 282) {
    progress = progress.slice(0, -1);
  }
  if (progress.length < missionProgressText(mission).length) progress = `${progress.trim()}…`;
  ctx.fillText(progress, view.width - 308, 98);
  ctx.fillStyle = '#9fc3e2';
  ctx.fillText(`SKOR ${mission.score.toLocaleString('id-ID')}   WAKTU ${formatClock(mission.elapsed)}`,
    view.width - 308, 116);

  // Centre message.
  if (mission.message && game.now < mission.messageUntil) {
    ctx.font = 'bold 20px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const text = mission.message;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(8,18,28,0.65)';
    roundRect(ctx, view.cx - tw / 2 - 16, 84, tw + 32, 36, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.fillText(text, view.cx, 108);
  }

  // Warnings.
  const warnings = [];
  if (!plane.onGround && plane.speed < CONFIG.stallSpeed + 6) warnings.push('STALL!');
  if (plane.fuel < 20 && plane.fuel > 0) warnings.push('BAHAN BAKAR RENDAH');
  if (plane.fuel <= 0) warnings.push('MESIN MATI — MELUNCUR!');
  if (!plane.gearDown && plane.z < 90 && plane.speed > 20 && !plane.onGround) warnings.push('RODA BELUM TURUN');
  if (plane.damage > 60) warnings.push('PESAWAT RUSAK PARAH');
  if (warnings.length) {
    ctx.font = 'bold 18px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const blink = Math.floor(game.now * 3) % 2 === 0;
    ctx.fillStyle = blink ? '#ff5a4e' : '#ffb3ad';
    warnings.forEach((warning, i) => {
      ctx.fillText(warning, view.cx, 150 + i * 24);
    });
  }
}

// ---------------------------------------------------------------------------
// Menu and end screens
// ---------------------------------------------------------------------------

export function drawMenu(ctx, view, game, selectedMission) {
  ctx.fillStyle = 'rgba(6,14,24,0.58)';
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px ui-monospace, monospace';
  ctx.fillText('LANGIT NUSANTARA', view.cx, 120);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 22px ui-monospace, monospace';
  ctx.fillText('SKY COURIER  •  game penerbangan di atas kepulauan', view.cx, 156);
  ctx.fillStyle = '#dcebf5';
  ctx.font = '15px ui-monospace, monospace';
  ctx.fillText('Terbang melewati cincin, antar kargo antar pulau, dan mendarat sehalus mentega.',
    view.cx, 186);

  // Mission cards.
  const cardW = 340;
  const cardH = 150;
  const gap = 24;
  const totalW = cardW * 3 + gap * 2;
  let x = view.cx - totalW / 2;
  const y = 230;
  game.menuRects = [];
  game.missionDefs.forEach((def, index) => {
    const selected = index === selectedMission;
    ctx.fillStyle = selected ? 'rgba(255,209,102,0.92)' : 'rgba(10,24,38,0.88)';
    roundRect(ctx, x, y, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = selected ? '#ffd166' : '#4a6a88';
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeRect(x, y, cardW, cardH);
    ctx.fillStyle = selected ? '#1a2a3a' : '#ffd166';
    ctx.font = 'bold 17px ui-monospace, monospace';
    ctx.fillText(def.name, view.cx - totalW / 2 + cardW / 2 + index * (cardW + gap), y + 34);
    ctx.fillStyle = selected ? '#1a2a3a' : '#dcebf5';
    ctx.font = '13px ui-monospace, monospace';
    const words = def.blurb.split(' ');
    let line = '';
    let lineY = y + 62;
    for (const word of words) {
      if ((line + ' ' + word).trim().length > 34) {
        ctx.fillText(line.trim(), x + cardW / 2, lineY);
        line = word;
        lineY += 20;
      } else {
        line += ' ' + word;
      }
    }
    if (line.trim()) ctx.fillText(line.trim(), x + cardW / 2, lineY);
    ctx.fillStyle = selected ? '#1a2a3a' : '#9fc3e2';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(index === selectedMission ? '▶ TEKAN ENTER UNTUK TERBANG' : `TEKAN ${index + 1}`, x + cardW / 2, y + cardH - 16);
    game.menuRects.push({ x, y, width: cardW, height: cardH, index });
    x += cardW + gap;
  });

  // Controls.
  ctx.fillStyle = '#dcebf5';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText('↑ ↓  pitch    ← →  belok    SHIFT / CTRL  throttle    F  flap    G  roda    B  rem    P  jeda    M  suara',
    view.cx, 440);
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '13px ui-monospace, monospace';
  ctx.fillText('Mendaratlah dengan roda turun, pelan, dan sejajar landasan. Bahan bakar habis = meluncur sampai jatuh.',
    view.cx, 468);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 16px ui-monospace, monospace';
  ctx.fillText('Pilih misi dengan 1 / 2 / 3 atau klik, lalu tekan ENTER', view.cx, 510);
}

export function drawEndScreen(ctx, view, title, lines, hint) {
  ctx.fillStyle = 'rgba(6,14,24,0.55)';
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 44px ui-monospace, monospace';
  ctx.fillText(title, view.cx, 240);
  ctx.fillStyle = '#fff';
  ctx.font = '17px ui-monospace, monospace';
  lines.forEach((line, i) => ctx.fillText(line, view.cx, 300 + i * 30));
  ctx.fillStyle = '#9fc3e2';
  ctx.font = '15px ui-monospace, monospace';
  ctx.fillText(hint, view.cx, 300 + lines.length * 30 + 30);
}

// ---------------------------------------------------------------------------
// One frame
// ---------------------------------------------------------------------------

export function renderFrame(ctx, game) {
  const view = makeView(game.width, game.height);
  const preset = SKY_PRESETS[game.skyPreset] ?? SKY_PRESETS.morning;
  const plane = game.plane;
  const basis = cameraBasis(plane);
  // The horizon's screen height drives the sky gradient and the haze band.
  const horizonPoint = projectPoint({
    x: basis.cam.x + basis.forward.x * 9000,
    y: basis.cam.y + basis.forward.y * 9000,
    z: basis.cam.z,
  }, basis, view);
  const horizonY = horizonPoint ? horizonPoint.y : view.cy;
  drawSky(ctx, view, preset, horizonY);
  drawClouds(ctx, basis, view, plane);
  drawTerrain(ctx, basis, view, plane);
  drawHorizonHaze(ctx, view, preset, horizonY);
  drawSun(ctx, view, plane, preset, horizonY);
  // Runways, then the next ring, then the plane's shadow, then the plane.
  for (const strip of Object.values(STRIPS)) drawRunway(ctx, basis, view, strip);
  const objective = game.mission ? game.mission.def.objectives[game.mission.objectiveIndex] : null;
  if (objective && objective.kind === 'ring') {
    drawRing(ctx, basis, view, RINGS[objective.ring], true, game.now);
  }
  for (let i = 0; i < RINGS.length; i++) {
    if (objective && objective.kind === 'ring' && objective.ring === i) continue;
    drawRing(ctx, basis, view, RINGS[i], false, game.now);
  }
  drawPlaneShadow(ctx, basis, view, plane);
  drawPlane(ctx, view, plane, game.now);
  if (game.mission) drawHud(ctx, view, plane, game.mission, game);
  if (game.state === 'menu') drawMenu(ctx, view, game, game.selectedMission);
  if (game.state === 'paused') {
    drawEndScreen(ctx, view, 'JEDA', ['Permainan dijeda.'], 'Tekan P untuk lanjut, R untuk mulai ulang.');
  }
  if (game.state === 'crashed') {
    drawEndScreen(ctx, view, 'PESAWAT JATUH', game.endLines, 'Tekan R untuk terbang lagi, atau ESC untuk menu.');
  }
  if (game.state === 'landed' || game.state === 'complete') {
    drawEndScreen(ctx, view, game.state === 'complete' ? 'MISI SELESAI!' : 'MENDARAT',
      game.endLines, 'Tekan R untuk terbang lagi, atau ESC untuk menu.');
  }
  return view;
}
