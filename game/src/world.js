// world.js — the archipelago: terrain height, airstrips, rings, clouds,
// and the camera projection that turns world metres into screen pixels.

import { ISLANDS, RINGS, STRIPS, CONFIG, SKY_PRESETS } from './config.js';
import { makeValueNoise, clamp, degToRad, lerp } from './random.js';

const terrainNoise = makeValueNoise(20261126);
const colourNoise = makeValueNoise(777);

function islandProfile(distance, radius) {
  // 1 at the centre, 0 at the shore, with a rounded shoulder.
  const t = clamp(1 - distance / radius, 0, 1);
  return t * t * (3 - 2 * t);
}

// Height of the ground in metres at world (x, y). The sea is 0.
export function groundHeightAt(x, y) {
  let h = 0;
  for (const island of ISLANDS) {
    const dx = x - island.x;
    const dy = y - island.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= island.radius) continue;
    const profile = islandProfile(d, island.radius);
    const bump = 0.85 + 0.3 * terrainNoise(x * 0.0022 + 40, y * 0.0022 + 40);
    h += island.peak * profile * bump;
  }
  // Flatten the ground under each runway so the whole strip is landable,
  // blending back to the island over 140 m beyond its edges.
  for (const strip of Object.values(STRIPS)) {
    const along = (x - strip.x) * Math.sin(degToRad(strip.headingDeg))
      + (y - strip.y) * Math.cos(degToRad(strip.headingDeg));
    const across = (x - strip.x) * Math.cos(degToRad(strip.headingDeg))
      - (y - strip.y) * Math.sin(degToRad(strip.headingDeg));
    const beyondAlong = Math.max(0, Math.abs(along) - strip.length / 2);
    const beyondAcross = Math.max(0, Math.abs(across) - strip.width / 2);
    const beyond = Math.hypot(beyondAlong, beyondAcross);
    if (beyond < 140) {
      const flat = clamp(1 - beyond / 140, 0, 1);
      h = h * (1 - flat) + strip.elevation * flat;
    }
  }
  // A flat coastal plain around each runway, so the airfield sits on level
  // ground with the island's hills rising further away. The flat zone
  // follows the runway's centreline, so the final approach corridor is
  // level ground too, not a hillside in front of the threshold.
  for (const strip of Object.values(STRIPS)) {
    const heading = degToRad(strip.headingDeg);
    const along = (x - strip.x) * Math.sin(heading) + (y - strip.y) * Math.cos(heading);
    const across = (x - strip.x) * Math.cos(heading) - (y - strip.y) * Math.sin(heading);
    const clampedAlong = clamp(along, -strip.length / 2, strip.length / 2);
    const d = Math.hypot(along - clampedAlong, across);
    if (d < 650) {
      const flat = clamp(1 - (d - 300) / 350, 0, 1);
      h = h * (1 - flat) + strip.elevation * flat;
    }
  }
  return h;
}

// Is (x, y) on a runway strip? Returns the strip or null.
export function stripAt(x, y) {
  for (const [key, strip] of Object.entries(STRIPS)) {
    const along = (x - strip.x) * Math.sin(degToRad(strip.headingDeg))
      + (y - strip.y) * Math.cos(degToRad(strip.headingDeg));
    const across = (x - strip.x) * Math.cos(degToRad(strip.headingDeg))
      - (y - strip.y) * Math.sin(degToRad(strip.headingDeg));
    if (Math.abs(along) <= strip.length / 2 && Math.abs(across) <= strip.width / 2) {
      return { key, ...strip, along, across };
    }
  }
  return null;
}

export function ringByIndex(index) {
  return RINGS[index] ?? null;
}

export function ringCount() {
  return RINGS.length;
}

// ---------------------------------------------------------------------------
// Camera and projection
// ---------------------------------------------------------------------------

// Camera basis from the aircraft state: chase view behind and above the
// plane, looking slightly ahead of it.
export function cameraBasis(plane) {
  const heading = plane.heading;
  const forward = {
    x: Math.sin(heading) * Math.cos(plane.pitch),
    y: Math.cos(heading) * Math.cos(plane.pitch),
    z: Math.sin(plane.pitch),
  };
  const right = { x: Math.cos(heading), y: -Math.sin(heading), z: 0 };
  const up = {
    x: -Math.sin(heading) * Math.sin(plane.pitch),
    y: -Math.cos(heading) * Math.sin(plane.pitch),
    z: Math.cos(plane.pitch),
  };
  const cam = {
    x: plane.x - forward.x * CONFIG.cameraDistance,
    y: plane.y - forward.y * CONFIG.cameraDistance,
    z: plane.z + CONFIG.cameraHeight - forward.z * CONFIG.cameraDistance,
  };
  const look = {
    x: plane.x + forward.x * 90,
    y: plane.y + forward.y * 90,
    z: plane.z + forward.z * 90 - 30, // the camera looks down at the ground ahead
  };
  // Re-aim the basis at the look point so the horizon sits where it should.
  const aim = normalize3({
    x: look.x - cam.x,
    y: look.y - cam.y,
    z: look.z - cam.z,
  });
  const worldUp = { x: 0, y: 0, z: 1 };
  const aimRight = normalize3(cross3(aim, worldUp));
  const aimUp = cross3(aimRight, aim);
  return { cam, forward: aim, right: aimRight, up: aimUp, rawForward: forward };
}

function normalize3(v) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross3(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

// Project a world point into screen space. Returns null behind the camera.
export function projectPoint(point, basis, view) {
  const rel = { x: point.x - basis.cam.x, y: point.y - basis.cam.y, z: point.z - basis.cam.z };
  const depth = rel.x * basis.forward.x + rel.y * basis.forward.y + rel.z * basis.forward.z;
  if (depth < 1.5) return null; // only points essentially at the lens are culled
  const right = rel.x * basis.right.x + rel.y * basis.right.y + rel.z * basis.right.z;
  const up = rel.x * basis.up.x + rel.y * basis.up.y + rel.z * basis.up.z;
  return {
    x: view.cx + (right / depth) * view.focal,
    y: view.cy - (up / depth) * view.focal,
    depth,
  };
}

export function makeView(width, height) {
  const fov = degToRad(CONFIG.fieldOfViewDeg);
  return {
    width,
    height,
    cx: width / 2,
    // Horizon sits a little above centre: the plane occupies the lower half.
    cy: height * 0.46,
    focal: (height / 2) / Math.tan(fov / 2),
  };
}

// ---------------------------------------------------------------------------
// Terrain colours and clouds
// ---------------------------------------------------------------------------

export function terrainColour(height, x, y, distance) {
  const n = colourNoise(x * 0.004, y * 0.004);
  const shade = 0.96 + n * 0.08;
  let r;
  let g;
  let b;
  if (height <= 0.5) {
    // Shallow sea near the shore, deeper further out.
    const deep = clamp(0.35 + distance / 9000, 0, 1);
    r = Math.round(26 + 18 * (1 - deep));
    g = Math.round(112 - 52 * deep);
    b = Math.round(168 - 62 * deep);
  } else if (height < 7) {
    r = 226; g = 205; b = 150; // sand
  } else if (height < 90) {
    r = 96; g = 158; b = 74; // lowland green
  } else if (height < 190) {
    r = 62; g = 128; b = 66; // forest
  } else if (height < 330) {
    r = 104; g = 96; b = 88; // rock
  } else {
    r = 238; g = 238; b = 240; // snow on the volcano top
  }
  // Atmospheric haze softens far terrain toward the horizon colour.
  const haze = clamp(distance / 6500, 0, 1) * 0.35;
  r = Math.round(lerp(r * shade, 207, haze));
  g = Math.round(lerp(g * shade, 230, haze));
  b = Math.round(lerp(b * shade, 247, haze));
  return `rgb(${r},${g},${b})`;
}

// Fixed cloud puffs, seeded so screenshots are repeatable.
export const CLOUDS = (() => {
  const clouds = [];
  const rand = (() => {
    let s = 424242;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  for (let i = 0; i < 42; i++) {
    const angle = rand() * Math.PI * 2;
    const radius = 1500 + rand() * 7500;
    clouds.push({
      x: Math.sin(angle) * radius,
      y: Math.cos(angle) * radius - 1000,
      z: 520 + rand() * 420,
      size: 120 + rand() * 260,
      puffs: 3 + Math.floor(rand() * 3),
    });
  }
  return clouds;
})();

export function skyPreset(name) {
  return SKY_PRESETS[name] ?? SKY_PRESETS.morning;
}
