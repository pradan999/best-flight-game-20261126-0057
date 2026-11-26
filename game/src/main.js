// main.js — the game loop and state machine: menu, flying, paused,
// landed, crashed and mission complete. Wires input, flight, missions,
// audio and rendering together, and nothing else.

import { CONFIG, MISSIONS } from './config.js';
import { makePlane, stepFlight, feet } from './flight.js';
import { makeMission, updateMission, landingReport } from './missions.js';
import { makeAudio } from './audio.js';
import { makeInput } from './input.js';
import { renderFrame } from './render.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / CONFIG.canvasWidth, window.innerHeight / CONFIG.canvasHeight);
  canvas.style.width = `${Math.floor(CONFIG.canvasWidth * scale)}px`;
  canvas.style.height = `${Math.floor(CONFIG.canvasHeight * scale)}px`;
}

const game = {
  width: CONFIG.canvasWidth,
  height: CONFIG.canvasHeight,
  state: 'menu', // menu | flying | paused | landed | crashed | complete
  selectedMission: 0,
  missionDefs: MISSIONS,
  plane: null,
  mission: null,
  skyPreset: 'morning',
  now: 0,
  endLines: [],
  menuRects: [],
  shotMode: false,
};

const input = makeInput();
input.attach(canvas);
const audio = makeAudio();

function startMission(index) {
  const def = MISSIONS[index];
  game.selectedMission = index;
  game.mission = makeMission(def.id);
  game.plane = makePlane(def.start, def.fuel);
  game.skyPreset = def.id === 'landing' ? 'sunset' : 'morning';
  game.state = 'flying';
  game.endLines = [];
  audio.unlock();
  audio.click();
}

function backToMenu() {
  game.state = 'menu';
  game.plane = makePlane(MISSIONS[game.selectedMission].start, MISSIONS[game.selectedMission].fuel);
  game.mission = makeMission(MISSIONS[game.selectedMission].id);
  game.skyPreset = 'morning';
}

function describeCrash(event) {
  if (event.water) return 'Pesawat jatuh ke laut. Airnya dingin, misinya selesai.';
  if (event.onStrip && !event.gearDown) return 'Mendarat tanpa roda di landasan — pesawat tergelincir dan rusak.';
  if (event.onStrip) return `Menabrak landasan dengan kecepatan turun ${(-event.sink).toFixed(1)} m/s. Terlalu keras.`;
  return 'Menabrak daratan. Lain kali, jaga ketinggian dan kecepatanmu.';
}

function handleFlightEvents(events) {
  for (const event of events) {
    if (event.type === 'crashed') {
      game.state = 'crashed';
      game.endLines = [
        describeCrash(event),
        `Skor akhir: ${game.mission.score.toLocaleString('id-ID')}  •  ${game.mission.ringsPassed} cincin  •  ${game.mission.landings} pendaratan`,
      ];
      audio.crash();
    } else if (event.type === 'landed' || event.type === 'belly-landing' || event.type === 'hard-landing') {
      const hard = event.type === 'hard-landing';
      if (game.mission.finished) {
        game.state = 'complete';
        game.endLines = [
          game.mission.finishReason,
          ...landingReport(game.mission),
          `Bahan bakar tersisa ${Math.round(game.plane.fuel)}%  •  Kerusakan ${game.plane.damage}%`,
        ];
        audio.fanfare();
      } else if (event.type === 'landed' && game.mission.def.id === 'landing') {
        // The sunset-landing mission ends on its single landing.
        game.state = 'landed';
        game.endLines = [
          game.mission.finishReason || `Mendarat di ${event.strip === 'HOME' ? 'Landasan Utama' : 'landasan'}.`,
          `Kecepatan turun ${event.sink.toFixed(1)} m/s  •  kecepatan ${Math.round(event.speed * 1.94)} kt`,
          `Skor: ${game.mission.score.toLocaleString('id-ID')}`,
        ];
        audio.touchdown();
      } else {
        audio.touchdown();
      }
      if (hard) {
        game.mission.message = 'Mendarat terlalu keras — roda rusak, tapi pesawat masih bisa jalan.';
        game.mission.messageUntil = game.now + 5;
      }
    } else if (event.type === 'takeoff') {
      audio.click();
    } else if (event.type === 'stall') {
      // The HUD warning covers this; no extra sound needed.
    } else if (event.type === 'engine-out') {
      game.mission.message = 'BAHAN BAKAR HABIS — MESIN MATI!';
      game.mission.messageUntil = game.now + 5;
    }
  }
}

function handleMissionEvents(events) {
  for (const event of events) {
    if (event.type === 'ring-passed') audio.ringChime();
    if (event.type === 'mission-complete') {
      if (game.mission.def.id === 'rings') {
        game.state = 'complete';
        game.endLines = [
          game.mission.finishReason,
          `6 cincin dilewati dalam ${game.mission.elapsed.toFixed(0)} detik`,
          `Bahan bakar tersisa ${Math.round(game.plane.fuel)}%  •  Kerusakan ${game.plane.damage}%`,
        ];
        audio.fanfare();
      } else {
        audio.fanfare();
      }
    }
  }
}

function update(dt) {
  game.now += dt;
  const click = input.consumeClick();
  if (game.state === 'menu') {
    if (input.wasPressed('Digit1')) game.selectedMission = 0;
    if (input.wasPressed('Digit2')) game.selectedMission = 1;
    if (input.wasPressed('Digit3')) game.selectedMission = 2;
    if (input.wasPressed('ArrowLeft')) game.selectedMission = (game.selectedMission + 2) % 3;
    if (input.wasPressed('ArrowRight')) game.selectedMission = (game.selectedMission + 1) % 3;
    if (click) {
      for (const rect of game.menuRects) {
        const scaleX = canvas.width / Number.parseFloat(canvas.style.width || canvas.width);
        const scaleY = canvas.height / Number.parseFloat(canvas.style.height || canvas.height);
        const cx = click.x * scaleX;
        const cy = click.y * scaleY;
        if (cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height) {
          if (rect.index === game.selectedMission) startMission(rect.index);
          else game.selectedMission = rect.index;
        }
      }
      audio.unlock();
    }
    if (input.wasPressed('Enter') || input.wasPressed('Space')) startMission(game.selectedMission);
    return;
  }

  if (input.wasPressed('KeyM')) {
    const muted = audio.toggleMute();
    game.mission.message = muted ? 'Suara dimatikan (M untuk menyalakan)' : 'Suara dinyalakan';
    game.mission.messageUntil = game.now + 2;
  }
  if (input.wasPressed('KeyP') && (game.state === 'flying' || game.state === 'paused')) {
    game.state = game.state === 'flying' ? 'paused' : 'flying';
  }
  if (input.wasPressed('KeyR') && game.state !== 'menu') {
    startMission(game.selectedMission);
    return;
  }
  if (input.wasPressed('Escape')) {
    backToMenu();
    return;
  }
  if (game.state !== 'flying') return;

  const flight = input.flightState();
  const { events: flightEvents } = stepFlight(game.plane, flight, dt);
  const missionEvents = updateMission(game.mission, game.plane, flightEvents, game.now, dt);
  handleFlightEvents(flightEvents);
  handleMissionEvents(missionEvents);
  audio.updateEngine(game.plane, true);
}

let lastTimestamp = 0;
let frameErrors = 0;
function frame(timestamp) {
  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000 || 0.016);
  lastTimestamp = timestamp;
  try {
    update(dt);
    renderFrame(ctx, game);
  } catch (error) {
    // One bad frame must never kill the game: log it and keep flying.
    frameErrors += 1;
    if (frameErrors <= 3) console.error('frame error (game continues):', error);
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  canvas.width = CONFIG.canvasWidth;
  canvas.height = CONFIG.canvasHeight;
  game.plane = makePlane(MISSIONS[0].start, MISSIONS[0].fuel);
  game.mission = makeMission(MISSIONS[0].id);
  // Debug handle for automated play-testing; read-only from the console.
  window.__game = game;
  const shot = new URLSearchParams(window.location.search).get('shot');
  if (shot) {
    game.shotMode = true;
    applyShot(game, shot);
    // Screenshots take the whole viewport: no hint line, no page padding,
    // the canvas at exactly its 1280x800 design size.
    document.body.style.margin = '0';
    document.querySelector('main').style.padding = '0';
    document.querySelector('.hint').style.display = 'none';
    canvas.style.width = '1280px';
    canvas.style.height = '800px';
    // Render a few fixed frames, then signal the screenshot tool.
    let frames = 0;
    const renderShot = () => {
      renderFrame(ctx, game);
      frames += 1;
      if (frames < 3) requestAnimationFrame(renderShot);
      else window.__shotReady = true;
    };
    requestAnimationFrame(renderShot);
    return;
  }
  requestAnimationFrame(frame);
}

boot();
