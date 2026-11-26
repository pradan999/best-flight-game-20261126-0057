// shots.js — deterministic screenshot scenes for the entry's screenshots.
// `?shot=start|ring|approach|island` puts the game in a fixed, flattering
// state (no animation drift, no input) so a screenshot is a true render of
// the game's own code, repeatable on every run.

import { MISSIONS } from './config.js';
import { degToRad } from './random.js';
import { makePlane } from './flight.js';
import { makeMission } from './missions.js';

const SHOTS = {
  // On the home runway, engine idling, the strip stretching ahead.
  start(game) {
    const def = MISSIONS[1]; // courier: starts on the runway
    game.selectedMission = 1;
    game.mission = makeMission(def.id);
    game.plane = makePlane(def.start, def.fuel);
    game.plane.gearDown = true;
    game.plane.propAngle = 1.2;
    game.skyPreset = 'morning';
    game.state = 'flying';
  },
  // Threading the first ring of the Ring Run, banked over the home island.
  ring(game) {
    const def = MISSIONS[0];
    game.selectedMission = 0;
    game.mission = makeMission(def.id);
    game.plane = makePlane(
      { x: -60, y: 180, z: 305, headingDeg: 4, pitchDeg: 1, speed: 62, throttle: 0.78 },
      def.fuel,
    );
    game.plane.roll = degToRad(-14);
    game.plane.gearDown = false;
    game.plane.propAngle = 1.2;
    game.mission.objectiveIndex = 0;
    game.skyPreset = 'morning';
    game.state = 'flying';
  },
  // Final approach at sunset: gear and flaps down, runway centred ahead.
  approach(game) {
    const def = MISSIONS[2]; // sunset landing
    game.selectedMission = 2;
    game.mission = makeMission(def.id);
    game.plane = makePlane(
      { x: 0, y: -450, z: 38, headingDeg: 0, pitchDeg: -3, speed: 44, throttle: 0.4 },
      def.fuel,
    );
    game.plane.gearDown = true;
    game.plane.flapsDown = true;
    game.plane.propAngle = 1.2;
    game.plane.verticalSpeed = -2.4;
    game.skyPreset = 'sunset';
    game.state = 'flying';
  },
  // Low pass past the volcano island, late light, ring ahead.
  island(game) {
    const def = MISSIONS[0];
    game.selectedMission = 0;
    game.mission = makeMission(def.id);
    game.plane = makePlane(
      { x: -2350, y: 3950, z: 430, headingDeg: -38, pitchDeg: 0, speed: 60, throttle: 0.7 },
      def.fuel,
    );
    game.plane.roll = degToRad(18);
    game.plane.propAngle = 1.2;
    game.mission.objectiveIndex = 2;
    game.skyPreset = 'sunset';
    game.state = 'flying';
  },
};

export function applyShot(game, name) {
  const setup = SHOTS[name];
  if (!setup) throw new Error(`unknown shot: ${name}`);
  setup(game);
  // Fixed clock: the ring pulse, warning blink and propeller all sit still.
  game.now = 2.5;
  game.mission.message = '';
  game.mission.messageUntil = 0;
  game.mission.elapsed = name === 'ring' ? 41 : name === 'approach' ? 96 : name === 'island' ? 88 : 0;
  if (name === 'ring') game.mission.score = 500;
  if (name === 'island') game.mission.score = 1000;
}

export function shotNames() {
  return Object.keys(SHOTS);
}
