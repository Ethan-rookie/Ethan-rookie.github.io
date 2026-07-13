export const AU_KM = 149597870.7;
export const MU_SUN = 1.32712440018e11;
const DAY_SECONDS = 86400;

export function createAstrodynamicsEngine(baseUrl = "./assets/ephemeris/jpl") {
  const cache = new Map();
  const pending = new Map();

  async function loadBody(id) {
    if (cache.has(id)) return cache.get(id);
    if (pending.has(id)) return pending.get(id);
    const request = fetch(`${baseUrl}/${id}.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`JPL ephemeris unavailable for ${id}`);
        return response.json();
      })
      .then((data) => {
        cache.set(id, data);
        pending.delete(id);
        return data;
      })
      .catch((error) => {
        pending.delete(id);
        throw error;
      });
    pending.set(id, request);
    return request;
  }

  async function loadBodies(ids) {
    return Promise.all(ids.map((id) => loadBody(id)));
  }

  function getState(id, day) {
    if (id === "sun") return { positionKm: [0, 0, 0], velocityKmS: [0, 0, 0], source: "JPL DE441" };
    const data = cache.get(id);
    if (!data) return null;
    const index = day / data.stepDays;
    const lower = Math.floor(index);
    const upper = Math.min(data.states.length - 1, lower + 1);
    if (lower < 0 || lower >= data.states.length) return null;
    const amount = index - lower;
    const from = data.states[lower];
    const to = data.states[upper];
    const values = from.map((value, component) => value + (to[component] - value) * amount);
    return {
      positionKm: values.slice(0, 3).map((value) => value * AU_KM),
      velocityKmS: values.slice(3, 6),
      source: data.source,
      epoch: data.start,
      stepDays: data.stepDays,
    };
  }

  function solveRoute(originId, destinationId, departureDay, flightDays) {
    const departure = getState(originId, departureDay);
    const arrival = getState(destinationId, departureDay + flightDays);
    if (!departure || !arrival) return null;
    const transfer = solveLambert(departure.positionKm, arrival.positionKm, flightDays * DAY_SECONDS, MU_SUN);
    if (!transfer) return null;
    const departureDeltaV = magnitude(subtract(transfer.departureVelocityKmS, departure.velocityKmS));
    const arrivalDeltaV = magnitude(subtract(arrival.velocityKmS, transfer.arrivalVelocityKmS));
    return {
      ...transfer,
      departurePositionKm: departure.positionKm,
      arrivalPositionKm: arrival.positionKm,
      departureDeltaV,
      arrivalDeltaV,
      totalDeltaV: departureDeltaV + arrivalDeltaV,
      c3: departureDeltaV * departureDeltaV,
      flightDays,
      departureDay,
      arrivalDay: departureDay + flightDays,
      source: departure.source,
      sampleStepDays: Math.max(departure.stepDays || 1, arrival.stepDays || 1),
      spanAu: magnitude(subtract(arrival.positionKm, departure.positionKm)) / AU_KM,
    };
  }

  return {
    loadBody,
    loadBodies,
    getState,
    solveRoute,
    sampleTransfer,
    hasBody: (id) => cache.has(id),
  };
}

export function sampleTransfer(solution, sampleCount = 54, mu = MU_SUN) {
  if (!solution?.departurePositionKm || !solution?.departureVelocityKmS) return [];
  const count = Math.max(2, sampleCount);
  const stepSeconds = (solution.flightDays * DAY_SECONDS) / count;
  let position = [...solution.departurePositionKm];
  let velocity = [...solution.departureVelocityKmS];
  const points = [position];
  for (let index = 0; index < count; index += 1) {
    [position, velocity] = rk4Step(position, velocity, stepSeconds, mu);
    points.push(position);
  }
  return points;
}

export function solveLambert(r1, r2, timeSeconds, mu = MU_SUN) {
  const radius1 = magnitude(r1);
  const radius2 = magnitude(r2);
  if (!radius1 || !radius2 || timeSeconds <= 0) return null;
  const cosine = clamp(dot(r1, r2) / (radius1 * radius2), -1, 1);
  let transferAngle = Math.acos(cosine);
  if (cross(r1, r2)[2] < 0) transferAngle = Math.PI * 2 - transferAngle;
  const sine = Math.sin(transferAngle);
  const denominator = 1 - cosine;
  if (Math.abs(denominator) < 1e-10) return null;
  const a = sine * Math.sqrt((radius1 * radius2) / denominator);
  if (Math.abs(a) < 1e-8) return null;

  const evaluate = (z) => {
    const c = stumpffC(z);
    const s = stumpffS(z);
    if (!Number.isFinite(c) || c <= 0) return null;
    const y = radius1 + radius2 + (a * (z * s - 1)) / Math.sqrt(c);
    if (y < 0) return null;
    const x = Math.sqrt(y / c);
    const value = x * x * x * s + a * Math.sqrt(y) - Math.sqrt(mu) * timeSeconds;
    return { value, y };
  };

  let lower = null;
  let upper = null;
  let previous = null;
  const minZ = -4 * Math.PI * Math.PI + 1e-5;
  const maxZ = 64 * Math.PI * Math.PI;
  for (let index = 0; index <= 2600; index += 1) {
    const z = minZ + ((maxZ - minZ) * index) / 2600;
    const result = evaluate(z);
    if (!result) continue;
    if (previous && Math.sign(previous.result.value) !== Math.sign(result.value)) {
      lower = previous.z;
      upper = z;
      break;
    }
    previous = { z, result };
  }
  if (lower === null || upper === null) return null;

  let solution = null;
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const middle = (lower + upper) / 2;
    const result = evaluate(middle);
    if (!result) {
      lower = middle;
      continue;
    }
    solution = result;
    if (Math.abs(result.value) < 1e-5) break;
    const lowerResult = evaluate(lower);
    if (lowerResult && Math.sign(lowerResult.value) === Math.sign(result.value)) lower = middle;
    else upper = middle;
  }
  if (!solution) return null;

  const f = 1 - solution.y / radius1;
  const g = a * Math.sqrt(solution.y / mu);
  const gDot = 1 - solution.y / radius2;
  if (Math.abs(g) < 1e-9) return null;
  return {
    departureVelocityKmS: scale(subtract(r2, scale(r1, f)), 1 / g),
    arrivalVelocityKmS: scale(subtract(scale(r2, gDot), r1), 1 / g),
  };
}

function stumpffC(z) {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5;
}

function stumpffS(z) {
  if (z > 1e-8) {
    const root = Math.sqrt(z);
    return (root - Math.sin(root)) / (root * root * root);
  }
  if (z < -1e-8) {
    const root = Math.sqrt(-z);
    return (Math.sinh(root) - root) / (root * root * root);
  }
  return 1 / 6;
}

function rk4Step(position, velocity, stepSeconds, mu) {
  const acceleration = (point) => {
    const radius = magnitude(point);
    return scale(point, -mu / (radius * radius * radius));
  };
  const k1r = velocity;
  const k1v = acceleration(position);
  const k2r = addVectors(velocity, scale(k1v, stepSeconds / 2));
  const k2v = acceleration(addVectors(position, scale(k1r, stepSeconds / 2)));
  const k3r = addVectors(velocity, scale(k2v, stepSeconds / 2));
  const k3v = acceleration(addVectors(position, scale(k2r, stepSeconds / 2)));
  const k4r = addVectors(velocity, scale(k3v, stepSeconds));
  const k4v = acceleration(addVectors(position, scale(k3r, stepSeconds)));
  const weighted = (a, b, c, d) =>
    a.map((value, index) => value + 2 * b[index] + 2 * c[index] + d[index]);
  return [
    addVectors(position, scale(weighted(k1r, k2r, k3r, k4r), stepSeconds / 6)),
    addVectors(velocity, scale(weighted(k1v, k2v, k3v, k4v), stepSeconds / 6)),
  ];
}

function subtract(a, b) {
  return a.map((value, index) => value - b[index]);
}

function addVectors(a, b) {
  return a.map((value, index) => value + b[index]);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function magnitude(vector) {
  return Math.hypot(...vector);
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
