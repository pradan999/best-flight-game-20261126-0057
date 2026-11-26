// missions.js — the sortie objectives: rings to thread, strips to land on,
// and the score that makes a good flight worth more than a fast one.

import { MISSIONS, RINGS, SCORE, STRIPS } from './config.js';
import { clamp } from './random.js';
import { feet, knots } from './flight.js';

export function makeMission(missionId) {
  const def = MISSIONS.find((m) => m.id === missionId) ?? MISSIONS[0];
  return {
    def,
    objectiveIndex: 0,
    score: 0,
    ringsPassed: 0,
    landings: 0,
    elapsed: 0,
    finished: false,
    finishReason: '',
    message: '',
    messageUntil: 0,
    lastRingAt: 0,
    landingScores: [],
  };
}

export function currentObjective(mission) {
  return mission.def.objectives[mission.objectiveIndex] ?? null;
}

export function missionProgressText(mission) {
  const objective = currentObjective(mission);
  if (mission.finished) return mission.finishReason;
  if (!objective) return '';
  return `${mission.objectiveIndex + 1}/${mission.def.objectives.length} — ${objective.text}`;
}

function setMessage(mission, text, now, seconds = 4) {
  mission.message = text;
  mission.messageUntil = now + seconds;
}

// Called every frame while flying. Returns events for the game loop.
export function updateMission(mission, plane, flightEvents, now, dt) {
  const events = [];
  mission.elapsed += dt;
  const objective = currentObjective(mission);
  if (mission.finished || !objective) return events;

  for (const event of flightEvents) {
    if (event.type === 'takeoff' && objective.kind === 'takeoff') {
      mission.objectiveIndex += 1;
      mission.score += 150;
      setMessage(mission, 'Lepas landas! +150', now);
      events.push({ type: 'objective-done', score: mission.score });
    }
    if ((event.type === 'landed' || event.type === 'belly-landing' || event.type === 'hard-landing')
      && objective.kind === 'land') {
      const strip = STRIPS[objective.strip];
      const wanted = objective.strip;
      if (event.strip === wanted) {
        mission.landings += 1;
        const soft = event.type === 'landed'
          ? clamp(1 - Math.max(0, event.sink - 1) / 5.5, 0, 1) : 0;
        const centre = event.type === 'landed'
          ? clamp(1 - event.centre / (strip.width / 2), 0, 1) : 0;
        const gained = SCORE.landingBase
          + Math.round(SCORE.landingSoftBonus * soft)
          + Math.round(SCORE.landingCentreBonus * centre);
        mission.score += gained;
        mission.landingScores.push({ strip: wanted, sink: event.sink, gained });
        const verdict = soft > 0.75 ? 'Pendaratan mentega!' : soft > 0.4 ? 'Mendarat dengan baik.' : 'Mendarat — agak keras.';
        setMessage(mission, `${verdict} +${gained}`, now, 5);
        events.push({ type: 'objective-done', score: mission.score });
        mission.objectiveIndex += 1;
      } else {
        setMessage(mission, `Itu ${STRIPS[event.strip]?.name ?? 'landasan lain'} — tujuanmu ${strip.name}.`, now, 5);
      }
    }
    if (event.type === 'hard-landing' && objective.kind === 'land') {
      setMessage(mission, 'Mendarat terlalu keras — roda rusak, tapi pesawat masih bisa jalan.', now, 5);
    }
  }

  if (objective.kind === 'ring') {
    const ring = RINGS[objective.ring];
    const dx = plane.x - ring.x;
    const dy = plane.y - ring.y;
    const dz = plane.z - ring.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < ring.radius) {
      mission.ringsPassed += 1;
      mission.score += SCORE.ring;
      mission.lastRingAt = mission.elapsed;
      setMessage(mission, `Cincin ${objective.ring + 1} dilewati! +${SCORE.ring}`, now);
      events.push({ type: 'ring-passed', ring: objective.ring, score: mission.score });
      mission.objectiveIndex += 1;
    }
  }

  if (mission.objectiveIndex >= mission.def.objectives.length && !mission.finished) {
    mission.finished = true;
    const timeBonus = mission.def.id === 'rings'
      ? Math.max(0, Math.round((SCORE.ringParSeconds - mission.elapsed) * SCORE.ringTimeBonusPerSecond))
      : 0;
    const fuelBonus = Math.round(plane.fuel * SCORE.fuelBonusPerPercent);
    mission.score += timeBonus + fuelBonus;
    mission.finishReason = `Misi selesai! Skor ${mission.score.toLocaleString('id-ID')}`
      + (timeBonus ? ` (bonus waktu +${timeBonus})` : '')
      + (fuelBonus ? ` (sisa bahan bakar +${fuelBonus})` : '');
    setMessage(mission, mission.finishReason, now, 8);
    events.push({ type: 'mission-complete', score: mission.score });
  }

  return events;
}

export function formatClock(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function landingReport(mission) {
  return mission.landingScores.map((entry) => {
    const strip = STRIPS[entry.strip];
    return `${strip.name}: turun ${entry.sink.toFixed(1)} m/s, +${entry.gained}`;
  });
}

export { feet, knots };
