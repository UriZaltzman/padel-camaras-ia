/** Glicko-2 (Glickman, 2013), pure functions on the Glicko scale (1500 / 350). */
export interface Glicko {
  rating: number;
  deviation: number;
  volatility: number;
}

export interface Opponent {
  rating: number;
  deviation: number;
  /** Score for the player in [0, 1]: 1 win, 0 loss, in between when weighted by games. */
  score: number;
}

/** Scale factor between the Glicko and Glicko-2 scales. */
const SCALE = 173.7178;
const BASE = 1500;
const CONVERGENCE = 1e-6;

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/** One rating period with the given results; no results only grows the deviation. */
export function updateRating(player: Glicko, results: readonly Opponent[], tau: number): Glicko {
  const mu = (player.rating - BASE) / SCALE;
  const phi = player.deviation / SCALE;
  const sigma = player.volatility;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, deviation: phiStar * SCALE, volatility: sigma };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const r of results) {
    const muJ = (r.rating - BASE) / SCALE;
    const phiJ = r.deviation / SCALE;
    const e = expected(mu, muJ, phiJ);
    vInv += g(phiJ) ** 2 * e * (1 - e);
    deltaSum += g(phiJ) * (r.score - e);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const d2 = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d2 * d2) - (x - a) / (tau * tau);
  };

  // Illinois algorithm for the new volatility.
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > CONVERGENCE) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * deltaSum;
  return {
    rating: newMu * SCALE + BASE,
    deviation: newPhi * SCALE,
    volatility: newSigma,
  };
}
