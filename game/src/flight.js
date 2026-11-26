// flight.js — the arcade flight model: throttle, lift, stall, turns,
// fuel burn, flaps, gear and what happens when the ground arrives.

import { CONFIG } from './config.js';
import { clamp, degToRad, radToDeg } from './random.js';
import { groundHeightAt, stripAt } from './world.js';

export function makePlane(start, fuel) {
  return {
    x: start.x,
    y: start.y,
    z: start.z,
    heading: degToRad(start.headingDeg),
    pitch: degToRad(start.pitchDeg),
    roll: 0,
    speed: start.speed,
    throttle: start.throttle,
    fuel,
    damage: 0,
    gearDown: false,
    flapsDown: false,
    brakes: false,
    verticalSpeed: 0,
    onGround: start.speed < 1,
    airborne: start.speed > 1,
    engineOut: false,
    propAngle: 0,
  };
}

function stallSpeedFor(plane) {
  return plane.flapsDown ? CONFIG.stallSpeed : CONFIG.stallSpeed;
}

// One simulation step. `input` holds the held keys; returns events the game
// loop turns into messages and sounds.
export function stepFlight(plane, input, dt) {
  const events = [];
  const prevZ = plane.z;
  const prevSpeed = plane.speed;

  // --- Throttle ------------------------------------------------------------
  if (input.throttleUp) plane.throttle = clamp(plane.throttle + dt * 0.55, 0, 1);
  if (input.throttleDown) plane.throttle = clamp(plane.throttle - dt * 0.7, 0, 1);
  if (plane.fuel <= 0) {
    if (!plane.engineOut) {
      plane.engineOut = true;
      events.push({ type: 'engine-out' });
    }
    plane.throttle = 0;
  }

  // --- Flaps and gear ------------------------------------------------------
  if (input.toggleFlaps) {
    plane.flapsDown = !plane.flapsDown;
    events.push({ type: plane.flapsDown ? 'flaps-down' : 'flaps-up' });
  }
  if (input.toggleGear) {
    plane.gearDown = !plane.gearDown;
    events.push({ type: plane.gearDown ? 'gear-down' : 'gear-up' });
  }
  plane.brakes = !!input.brakes;

  // --- Pitch and roll ------------------------------------------------------
  const pitchTarget = input.pitchUp ? degToRad(CONFIG.maxPitchDeg)
    : input.pitchDown ? -degToRad(CONFIG.maxPitchDeg) : 0;
  const rollTarget = input.rollLeft ? -degToRad(CONFIG.maxBankDeg)
    : input.rollRight ? degToRad(CONFIG.maxBankDeg) : 0;
  const responsiveness = plane.onGround ? 0.4 : 1;
  plane.pitch += (pitchTarget - plane.pitch) * clamp(dt * 2.4 * responsiveness, 0, 1);
  plane.roll += (rollTarget - plane.roll) * clamp(dt * 2.8 * responsiveness, 0, 1);
  // Gentle auto-level when the pilot lets go of the stick.
  if (!input.rollLeft && !input.rollRight && !plane.onGround) {
    plane.roll *= Math.pow(0.55, dt);
  }

  // --- Speed: thrust, drag, flaps, brakes ---------------------------------
  const thrust = plane.throttle * CONFIG.maxThrottleAccel;
  const drag = CONFIG.dragCoefficient * plane.speed * plane.speed;
  const flapDrag = plane.flapsDown ? 2.2 : 0;
  const brakeDrag = plane.brakes && plane.onGround ? 14 : 0;
  const slope = -Math.sin(plane.pitch) * 9.8 * 0.55; // climbing costs speed
  plane.speed = Math.max(0, plane.speed + (thrust - drag - flapDrag - brakeDrag + slope) * dt);
  if (plane.speed > CONFIG.maxSpeed) plane.speed = CONFIG.maxSpeed;

  // --- Turning: bank turns the nose ---------------------------------------
  const stalled = plane.speed < stallSpeedFor(plane) && !plane.onGround;
  if (!plane.onGround && plane.speed > 8) {
    const turnRate = -Math.tan(plane.roll) * 9.8 / Math.max(plane.speed, 12) * CONFIG.turnAuthority;
    plane.heading += turnRate * dt;
  }

  // --- Vertical movement ---------------------------------------------------
  const ground = groundHeightAt(plane.x, plane.y);
  let verticalSpeed;
  if (plane.onGround) {
    // Rolling on the ground: stay planted until fast enough to fly.
    const liftSpeed = plane.flapsDown ? CONFIG.flapStallSpeed : CONFIG.stallSpeed;
    if (plane.speed > liftSpeed && plane.pitch > degToRad(4)) {
      plane.onGround = false;
      plane.airborne = true;
      events.push({ type: 'takeoff' });
      verticalSpeed = Math.sin(plane.pitch) * plane.speed * CONFIG.climbEfficiency;
    } else {
      verticalSpeed = 0;
      plane.z = ground;
    }
  } else if (stalled) {
    verticalSpeed = -CONFIG.sinkRate - (stallSpeedFor(plane) - plane.speed) * 0.35;
    if (!plane.stallWarned) {
      plane.stallWarned = true;
      events.push({ type: 'stall' });
    }
  } else {
    plane.stallWarned = false;
    verticalSpeed = Math.sin(plane.pitch) * plane.speed * CONFIG.climbEfficiency;
    // Level flight at cruise bleeds a little altitude; the pilot trims with pitch.
    if (Math.abs(plane.pitch) < degToRad(1.5) && plane.speed > 40) verticalSpeed -= 0.4;
  }
  plane.verticalSpeed = verticalSpeed;
  plane.z += verticalSpeed * dt;

  // --- Horizontal movement -------------------------------------------------
  const horizontal = Math.cos(plane.pitch) * plane.speed;
  plane.x += Math.sin(plane.heading) * horizontal * dt;
  plane.y += Math.cos(plane.heading) * horizontal * dt;

  // --- Fuel ----------------------------------------------------------------
  if (!plane.onGround || plane.throttle > 0.05) {
    plane.fuel = Math.max(0, plane.fuel
      - (CONFIG.fuelBurnIdle + plane.throttle * CONFIG.fuelBurnFull) * dt);
    if (plane.fuel <= 0 && !plane.engineOut) {
      plane.engineOut = true;
      events.push({ type: 'engine-out' });
    }
  }

  // --- Propeller spin ------------------------------------------------------
  plane.propAngle += (4 + plane.throttle * 26 + plane.speed * 0.25) * dt;

  // --- Ground contact ------------------------------------------------------
  const newGround = groundHeightAt(plane.x, plane.y);
  const strip = stripAt(plane.x, plane.y);
  const overRunway = strip !== null && Math.abs(plane.z - strip.elevation) < 3;
  if (plane.z <= newGround + 0.01 && !plane.onGround) {
    const sink = -verticalSpeed;
    const onStrip = strip !== null;
    const aligned = onStrip
      ? Math.abs(((radToDeg(plane.heading) - strip.headingDeg + 540) % 360) - 180) < 28
        || Math.abs(((radToDeg(plane.heading) - strip.headingDeg - 180 + 540) % 360) - 180) < 28
      : false;
    if (onStrip && plane.gearDown && sink < CONFIG.crashVsi && Math.abs(plane.roll) < degToRad(18)) {
      // A landing. Gentle ones are clean; hard ones hurt.
      plane.onGround = true;
      plane.airborne = false;
      plane.z = strip.elevation;
      plane.pitch = 0;
      plane.roll *= 0.3;
      const hardness = clamp((sink - 1.5) / (CONFIG.hardLandingVsi - 1.5), 0, 1);
      if (sink > CONFIG.hardLandingVsi) {
        plane.damage = clamp(plane.damage + Math.round(18 + hardness * 22), 0, 100);
        events.push({ type: 'hard-landing', sink, strip: strip.key, damage: plane.damage });
      } else {
        events.push({
          type: 'landed', sink, strip: strip.key, aligned,
          centre: Math.abs(strip.across), speed: plane.speed,
        });
      }
    } else if (onStrip && !plane.gearDown && sink < CONFIG.crashVsi) {
      // Belly landing on the runway: survivable, but the aircraft is hurt.
      plane.onGround = true;
      plane.airborne = false;
      plane.z = strip.elevation;
      plane.damage = clamp(plane.damage + 30, 0, 100);
      events.push({ type: 'belly-landing', sink, strip: strip.key, damage: plane.damage });
    } else {
      // Terrain, water, or a runway hit too hard: the sortie ends here.
      plane.z = newGround;
      events.push({
        type: 'crashed',
        sink,
        onStrip,
        gearDown: plane.gearDown,
        water: newGround <= 0.5,
        speed: plane.speed,
      });
    }
  }

  // Stay inside the charted archipelago; the sea beyond is not modelled.
  const range = Math.hypot(plane.x, plane.y);
  if (range > 9800) {
    const scale = 9800 / range;
    plane.x *= scale;
    plane.y *= scale;
    events.push({ type: 'edge' });
  }

  return { events, speedDelta: plane.speed - prevSpeed, altitudeDelta: plane.z - prevZ };
}

export function knots(speedMs) {
  return Math.round(speedMs * 1.94384);
}

export function feet(altitudeM) {
  return Math.round(altitudeM * 3.28084);
}

export function headingDegrees(headingRad) {
  return Math.round(((radToDeg(headingRad) % 360) + 360) % 360);
}
