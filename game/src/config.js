// config.js — every tunable number of Langit Nusantara in one place.
// Units: metres, metres per second, degrees, kilograms are never simulated,
// only the feel of them. Nothing here is read from the network.

export const CONFIG = {
  canvasWidth: 1280,
  canvasHeight: 800,
  // Flight model.
  maxSpeed: 95, // m/s, full throttle in level flight
  cruiseSpeed: 62,
  stallSpeed: 30, // below this the wing stops flying
  flapStallSpeed: 24, // flaps down lowers the stall
  maxThrottleAccel: 14, // m/s^2 at full throttle, no drag
  dragCoefficient: 0.0016, // quadratic drag, tuned so cruise sits near 62 m/s
  climbEfficiency: 0.92, // how much of the speed becomes vertical speed
  sinkRate: 9, // m/s fallen when stalled or engine out, before flare
  turnAuthority: 0.9, // heading change per radian of bank, scaled by speed
  maxBankDeg: 55,
  maxPitchDeg: 28,
  // Fuel and damage.
  fuelCapacity: 100, // percent
  fuelBurnIdle: 0.012, // percent per second
  fuelBurnFull: 0.16, // percent per second at full throttle
  hardLandingVsi: 6.5, // m/s of sink that starts hurting on touchdown
  crashVsi: 11, // m/s of sink that always ends the sortie
  // World.
  seaLevel: 0,
  // Camera.
  cameraDistance: 26, // metres behind the aircraft
  cameraHeight: 7, // metres above the aircraft
  cameraLookAhead: 60, // metres in front of the aircraft
  fieldOfViewDeg: 68,
  // Terrain mesh drawn ahead of the camera.
  terrainRows: 34,
  terrainCols: 42,
  terrainNear: 2, // metres ahead of the camera: near ground fills the screen bottom
  terrainFar: 6500, // metres ahead of the camera
  terrainHalfWidth: 6800, // metres either side at the far row: covers the full screen width
};

export const MISSIONS = [
  {
    id: 'rings',
    name: 'CINCIN LANGIT',
    short: 'Ring Run',
    blurb: 'Terbang melewati 6 cincin langit di atas laut dan pulau. Cepat, rapi, hemat bahan bakar.',
    start: { x: 0, y: -2600, z: 340, headingDeg: 0, pitchDeg: 0, speed: 58, throttle: 0.72 },
    fuel: 100,
    objectives: [
      { kind: 'ring', ring: 0, text: 'Lewati Cincin 1' },
      { kind: 'ring', ring: 1, text: 'Lewati Cincin 2' },
      { kind: 'ring', ring: 2, text: 'Lewati Cincin 3' },
      { kind: 'ring', ring: 3, text: 'Lewati Cincin 4' },
      { kind: 'ring', ring: 4, text: 'Lewati Cincin 5' },
      { kind: 'ring', ring: 5, text: 'Lewati Cincin 6 — terakhir!' },
    ],
  },
  {
    id: 'courier',
    name: 'KURIR KEPULAUAN',
    short: 'Island Courier',
    blurb: 'Angkut kargo ke dua pulau. Lepas landas, mendarat lembut, hemat bensin.',
    start: { x: 0, y: 100, z: 8, headingDeg: 0, pitchDeg: 0, speed: 0, throttle: 0 },
    fuel: 100,
    objectives: [
      { kind: 'takeoff', text: 'Lepas landas dari Landasan Utama' },
      { kind: 'land', strip: 'A', text: 'Mendarat di Landasan Merapi (Pulau A)' },
      { kind: 'takeoff', text: 'Lepas landas lagi dari Pulau A' },
      { kind: 'land', strip: 'B', text: 'Mendarat di Landasan Karang (Pulau B) — antar kargo!' },
    ],
  },
  {
    id: 'landing',
    name: 'SENJA DI LANDASAN',
    short: 'Sunset Landing',
    blurb: 'Satu pendekatan terakhir saat senja. Turunkan roda, buka flap, sentuh landasan sehalus mungkin.',
    start: { x: 0, y: -3400, z: 210, headingDeg: 0, pitchDeg: -4, speed: 50, throttle: 0.45 },
    fuel: 60,
    objectives: [
      { kind: 'land', strip: 'HOME', text: 'Mendarat di Landasan Utama' },
    ],
  },
];

// Ring course for the Ring Run, in world metres. Each ring floats above the
// sea or an island pass; the pilot threads them in order.
export const RINGS = [
  { x: 0, y: 600, z: 300, radius: 46 },
  { x: -900, y: 2400, z: 340, radius: 46 },
  { x: -2600, y: 4200, z: 420, radius: 46 },
  { x: -1200, y: 5800, z: 380, radius: 44 },
  { x: 1400, y: 5200, z: 330, radius: 44 },
  { x: 3400, y: 3800, z: 300, radius: 46 },
];

// Airstrips. `headingDeg` is the runway direction; the strip is flat ground.
export const STRIPS = {
  HOME: { name: 'Landasan Utama', x: 0, y: 300, headingDeg: 0, length: 720, width: 36, elevation: 8 },
  A: { name: 'Landasan Merapi', x: -3400, y: 4900, headingDeg: 70, length: 620, width: 30, elevation: 26 },
  B: { name: 'Landasan Karang', x: 4000, y: 4600, headingDeg: 300, length: 560, width: 30, elevation: 14 },
};

// Islands that make the archipelago. `peak` is metres above the sea.
export const ISLANDS = [
  { x: 0, y: 1500, radius: 2700, peak: 200, kind: 'home' },
  { x: -3800, y: 5400, radius: 1900, peak: 430, kind: 'volcano' },
  { x: 4300, y: 5000, radius: 1600, peak: 130, kind: 'coral' },
  { x: -5400, y: -1600, radius: 950, peak: 95, kind: 'green' },
  { x: 5400, y: -2400, radius: 1250, peak: 190, kind: 'green' },
  { x: 1800, y: -4200, radius: 700, peak: 60, kind: 'islet' },
  { x: -2400, y: -4800, radius: 850, peak: 110, kind: 'islet' },
  { x: 2600, y: 2600, radius: 520, peak: 45, kind: 'islet' },
  { x: -1800, y: 2600, radius: 460, peak: 38, kind: 'islet' },
  { x: 6500, y: 1200, radius: 600, peak: 70, kind: 'islet' },
  { x: -6800, y: 3200, radius: 700, peak: 80, kind: 'islet' },
];

export const SKY_PRESETS = {
  morning: {
    zenith: '#2f6fd0', mid: '#7fb2e8', horizon: '#cfe6f7',
    sunX: 0.62, sunY: 0.2, sunColor: '#fff3c4', haze: 'rgba(207,230,247,0.55)',
  },
  sunset: {
    zenith: '#3a3f7d', mid: '#e07a4e', horizon: '#ffc98a',
    sunX: 0.24, sunY: 0.34, sunColor: '#ffdf9e', haze: 'rgba(255,201,138,0.55)',
  },
};

export const SCORE = {
  ring: 500,
  ringTimeBonusPerSecond: 12, // under the par time
  ringParSeconds: 150,
  landingBase: 400,
  landingSoftBonus: 600, // scaled by how gentle the touchdown is
  landingCentreBonus: 200,
  fuelBonusPerPercent: 6,
  crashPenalty: 0,
};
