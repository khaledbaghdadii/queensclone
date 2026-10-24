// generator.js
//
// Puzzle generation for Queens, modelled on how LinkedIn's puzzles play:
// every puzzle can be finished by pure deduction (no guessing), and the good
// ones force you past "this region only has one cell left".
//
//   1. Plant a random valid queen layout (the answer).
//   2. Grow one region around each queen. Each region gets its own target size
//      and growth style (compact blob, straight bar, winding snake), so a board
//      mixes tiny pockets, long bars and big sprawling areas.
//   3. Nudge region borders one cell at a time, keeping changes that make the
//      puzzle solvable by logic and more demanding of real techniques.
//
// The logical solver below is the referee. If it can place every queen using
// only sound deductions, the answer is unique, and the techniques it needed
// tell us how interesting the puzzle is.

export const TECHNIQUES = [
  null,
  "Only one cell left in a row, column or region",
  "Region confined to one row/column (or a row/column confined to one region)",
  "A cell whose queen would wipe out a whole region, row or column",
  "N regions squeezed into N rows/columns (or the reverse)",
  "Trying a queen leads to a quick contradiction",
];

// Points each use of a technique adds to a puzzle's "interest" score.
const INTEREST = [0, 0, 1, 2, 4, 6];

// What each board size asks for. minLevel: the hardest technique the solve must
// need at least once. maxLevel: the hardest technique allowed at all. Trial and
// error (level 5) feels like guessing to players, so generated puzzles never need it.
const PROFILES = {
  small: { minLevel: 3, maxLevel: 4, minInterest: 6 },
  medium: { minLevel: 4, maxLevel: 4, minInterest: 12 },
  large: { minLevel: 4, maxLevel: 4, minInterest: 16 },
};

// Players can spot 2 or 3 regions squeezed into the same rows; bigger groups
// are technically valid but effectively invisible, so the solver ignores them.
const MAX_GROUP = 3;

const profileFor = (n) => (n <= 6 ? PROFILES.small : n <= 8 ? PROFILES.medium : PROFILES.large);

// ---------------------------------------------------------------------------
// Randomness

export function createRng(seed = Math.floor(Math.random() * 2 ** 32)) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const shuffle = (array, rng) => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const gaussian = (rng) => Math.sqrt(-2 * Math.log(rng() || 1e-9)) * Math.cos(2 * Math.PI * rng());

const popcount = (x) => {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
};

const neighbors4 = (n, x) => {
  const r = (x / n) | 0;
  const c = x % n;
  const out = [];
  if (r > 0) out.push(x - n);
  if (r < n - 1) out.push(x + n);
  if (c > 0) out.push(x - 1);
  if (c < n - 1) out.push(x + 1);
  return out;
};

// ---------------------------------------------------------------------------
// Logical solver
//
// Works on a flat region array (cell index = row * n + col). Units 0..n-1 are
// rows, n..2n-1 columns, 2n..3n-1 regions.

function buildContext(n, regions) {
  const N = n * n;
  const units = [];
  for (let r = 0; r < n; r++) units.push(Array.from({ length: n }, (_, c) => r * n + c));
  for (let c = 0; c < n; c++) units.push(Array.from({ length: n }, (_, r) => r * n + c));
  for (let g = 0; g < n; g++) units.push([]);
  for (let x = 0; x < N; x++) units[2 * n + regions[x]].push(x);

  const cellUnits = [];
  const attack = new Uint8Array(N * N);
  const attackList = [];
  for (let x = 0; x < N; x++) {
    const r = (x / n) | 0;
    const c = x % n;
    cellUnits.push([r, n + c, 2 * n + regions[x]]);
    const list = [];
    for (let y = 0; y < N; y++) {
      if (y === x) continue;
      const yr = (y / n) | 0;
      const yc = y % n;
      if (
        yr === r ||
        yc === c ||
        regions[y] === regions[x] ||
        (Math.abs(yr - r) <= 1 && Math.abs(yc - c) <= 1)
      ) {
        attack[x * N + y] = 1;
        list.push(y);
      }
    }
    attackList.push(list);
  }
  return { n, N, regions, units, cellUnits, attack, attackList };
}

const newState = (ctx) => ({
  cand: new Uint8Array(ctx.N).fill(1),
  unitQueen: new Int16Array(3 * ctx.n).fill(-1),
  placed: 0,
});

const cloneState = (s) => ({
  cand: s.cand.slice(),
  unitQueen: s.unitQueen.slice(),
  placed: s.placed,
});

function place(ctx, s, x) {
  s.cand[x] = 0;
  for (const y of ctx.attackList[x]) s.cand[y] = 0;
  for (const u of ctx.cellUnits[x]) s.unitQueen[u] = x;
  s.placed++;
}

// Each technique returns how many times it applied, or -1 on a contradiction.
// When s.explain is set (hints), it stops after its first deduction and leaves
// a description of it in s.note.

// Level 1: a row, column or region with exactly one candidate left.
function singles(ctx, s) {
  let count = 0;
  for (let u = 0; u < ctx.units.length; u++) {
    if (s.unitQueen[u] >= 0) continue;
    let only = -1;
    let k = 0;
    for (const x of ctx.units[u]) {
      if (s.cand[x]) {
        only = x;
        if (++k > 1) break;
      }
    }
    if (k === 0) return -1;
    if (k === 1) {
      place(ctx, s, only);
      count++;
      if (s.explain) {
        s.note = { level: 1, unit: u, cell: only };
        return count;
      }
    }
  }
  return count;
}

// Level 2: a region whose candidates sit in one row/column claims that line,
// and a row/column whose candidates sit in one region claims that region.
function lineConfinement(ctx, s) {
  const { n, regions, units } = ctx;
  let count = 0;
  // Returns true when a hint should stop here.
  const clear = (cells, keep, note) => {
    let hit = false;
    for (const x of cells) {
      if (s.cand[x] && !keep(x)) {
        s.cand[x] = 0;
        hit = true;
      }
    }
    if (hit) count++;
    if (hit && s.explain) s.note = { level: 2, ...note };
    return hit && s.explain;
  };

  for (let g = 0; g < n; g++) {
    if (s.unitQueen[2 * n + g] >= 0) continue;
    let rows = 0;
    let cols = 0;
    for (const x of units[2 * n + g]) {
      if (s.cand[x]) {
        rows |= 1 << ((x / n) | 0);
        cols |= 1 << x % n;
      }
    }
    if (!rows) return -1;
    const inRegion = (x) => regions[x] === g;
    for (const line of [
      popcount(rows) === 1 ? 31 - Math.clz32(rows) : -1,
      popcount(cols) === 1 ? n + 31 - Math.clz32(cols) : -1,
    ]) {
      if (line >= 0 && clear(units[line], inRegion, { kind: "regionInLine", region: g, line })) {
        return count;
      }
    }
  }

  for (let line = 0; line < 2 * n; line++) {
    if (s.unitQueen[line] >= 0) continue;
    let g = -1;
    let mixed = false;
    for (const x of units[line]) {
      if (!s.cand[x]) continue;
      if (g === -1) g = regions[x];
      else if (regions[x] !== g) {
        mixed = true;
        break;
      }
    }
    if (g === -1) return -1;
    if (!mixed) {
      const inLine = line < n ? (x) => ((x / n) | 0) === line : (x) => x % n === line - n;
      if (clear(units[2 * n + g], inLine, { kind: "lineInRegion", region: g, line })) return count;
    }
  }
  return count;
}

// Level 3: a queen on this cell would leave some other unit with no options.
function attackAll(ctx, s) {
  const { N, units, attack } = ctx;
  let count = 0;
  for (let x = 0; x < N; x++) {
    if (!s.cand[x]) continue;
    const base = x * N;
    for (let u = 0; u < units.length; u++) {
      if (s.unitQueen[u] >= 0) continue;
      let any = false;
      let covered = true;
      for (const y of units[u]) {
        if (!s.cand[y]) continue;
        any = true;
        if (y === x || !attack[base + y]) {
          covered = false;
          break;
        }
      }
      if (any && covered) {
        s.cand[x] = 0;
        count++;
        if (s.explain) {
          s.note = { level: 3, cell: x, unit: u };
          return count;
        }
        break;
      }
    }
  }
  return count;
}

// Level 4: k regions whose candidates fit in exactly k rows (or columns) own
// those lines; k rows (or columns) that fit in exactly k regions own those regions.
const GROUP_MODES = [
  ["region", "row"],
  ["region", "col"],
  ["row", "region"],
  ["col", "region"],
];

function groupConfinement(ctx, s) {
  const { n, N, regions } = ctx;
  const kinds = {
    row: (x) => (x / n) | 0,
    col: (x) => x % n,
    region: (x) => regions[x],
  };
  for (const [groupKind, targetKind] of GROUP_MODES) {
    const groupOf = kinds[groupKind];
    const targetOf = kinds[targetKind];
    const masks = new Int32Array(n);
    for (let x = 0; x < N; x++) if (s.cand[x]) masks[groupOf(x)] |= 1 << targetOf(x);
    const live = [];
    for (let g = 0; g < n; g++) if (masks[g]) live.push(g);
    const m = live.length;
    if (m < 3) continue;

    const union = new Int32Array(1 << m);
    for (let mask = 1; mask < 1 << m; mask++) {
      const low = mask & -mask;
      union[mask] = union[mask ^ low] | masks[live[31 - Math.clz32(low)]];
      const k = popcount(mask);
      if (k < 2 || k > MAX_GROUP || k >= m || popcount(union[mask]) !== k) continue;

      let groupSet = 0;
      for (let i = 0; i < m; i++) if (mask & (1 << i)) groupSet |= 1 << live[i];
      let hit = false;
      for (let x = 0; x < N; x++) {
        if (s.cand[x] && union[mask] & (1 << targetOf(x)) && !(groupSet & (1 << groupOf(x)))) {
          s.cand[x] = 0;
          hit = true;
        }
      }
      if (hit) {
        if (s.explain) {
          const targets = [];
          for (let t = 0; t < n; t++) if (union[mask] & (1 << t)) targets.push(t);
          s.note = {
            level: 4,
            groupKind,
            targetKind,
            groups: live.filter((_, i) => mask & (1 << i)),
            targets,
          };
        }
        return 1;
      }
    }
  }
  return 0;
}

// Level 5: placing a queen here and following the easy deductions breaks something.
function trial(ctx, s) {
  for (let x = 0; x < ctx.N; x++) {
    if (!s.cand[x]) continue;
    const t = cloneState(s);
    place(ctx, t, x);
    if (run(ctx, t, 2).status === "contradiction") {
      s.cand[x] = 0;
      if (s.explain) {
        let unit = 0;
        while (unit < ctx.units.length && (t.unitQueen[unit] >= 0 || ctx.units[unit].some((y) => t.cand[y]))) {
          unit++;
        }
        s.note = { level: 5, cell: x, unit };
      }
      return 1;
    }
  }
  return 0;
}

const TECHNIQUE_FNS = [null, singles, lineConfinement, attackAll, groupConfinement, trial];

function run(ctx, s, maxLevel, counts = null) {
  let hardest = 0;
  outer: while (s.placed < ctx.n) {
    for (let level = 1; level <= maxLevel; level++) {
      const applied = TECHNIQUE_FNS[level](ctx, s);
      if (applied < 0) return { status: "contradiction", hardest };
      if (applied > 0) {
        if (counts) counts[level] += applied;
        hardest = Math.max(hardest, level);
        continue outer;
      }
    }
    return { status: "stuck", hardest };
  }
  return { status: "solved", hardest };
}

// Solve a puzzle the way a person would, using techniques up to maxLevel.
// regions: flat array or 2D array of region ids (0..n-1).
export function solveLogically(regionsInput, maxLevel = 4) {
  const regions = Array.isArray(regionsInput[0]) ? regionsInput.flat() : regionsInput;
  const n = Math.round(Math.sqrt(regions.length));
  const ctx = buildContext(n, regions);
  const s = newState(ctx);
  const counts = new Array(TECHNIQUES.length).fill(0);
  const { status, hardest } = run(ctx, s, maxLevel, counts);

  let remaining = 0;
  for (let x = 0; x < ctx.N; x++) remaining += s.cand[x];
  const queens = [];
  for (let r = 0; r < n; r++) if (s.unitQueen[r] >= 0) queens.push(s.unitQueen[r]);
  const interest = counts.reduce((sum, k, level) => sum + k * INTEREST[level], 0);
  return { solved: status === "solved", status, hardest, counts, interest, remaining, placed: s.placed, queens };
}

// ---------------------------------------------------------------------------
// Hints
//
// Like LinkedIn's hint: first point out mistakes, otherwise find the easiest
// deduction available from the player's current board and explain it. Nothing
// is placed for the player; the hint says what to do and why.
//
// board: 2D array, 0 empty, 1 X, 2 queen. regionName(g) names a region in text,
// e.g. "the purple region". Cells in the result are "row-col" keys.
// Returns null when the board is already complete, otherwise
// { kind: "mistake" | "step" | "reveal", message, focus, place, eliminate, remove }.

const listNames = (names) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function getHint(regions2D, board, solution, regionName = (g) => `region ${g + 1}`) {
  const n = regions2D.length;
  const regions = regions2D.flat();
  const cells = board.flat();
  const answer = solution.flat();
  const key = (x) => `${(x / n) | 0}-${x % n}`;
  const hint = (fields) => ({ focus: [], place: null, eliminate: [], remove: [], ...fields });

  const wrongQueens = [];
  const wrongMarks = [];
  cells.forEach((v, x) => {
    if (v === 2 && answer[x] !== 2) wrongQueens.push(key(x));
    if (v === 1 && answer[x] === 2) wrongMarks.push(key(x));
  });
  if (wrongQueens.length) {
    return hint({
      kind: "mistake",
      message:
        wrongQueens.length === 1
          ? "This queen is in the wrong spot. Remove it and look again."
          : "These queens are in the wrong spots. Remove them and look again.",
      focus: wrongQueens,
      remove: wrongQueens,
    });
  }
  if (wrongMarks.length) {
    return hint({
      kind: "mistake",
      message:
        wrongMarks.length === 1
          ? "This X is on a cell that needs a queen."
          : "These X's are on cells that need queens.",
      focus: wrongMarks,
      remove: wrongMarks,
    });
  }
  if (cells.filter((v) => v === 2).length === n) return null;

  const ctx = buildContext(n, regions);
  const s = newState(ctx);
  cells.forEach((v, x) => v === 2 && place(ctx, s, x));
  cells.forEach((v, x) => v === 1 && (s.cand[x] = 0));
  s.explain = true;

  const unitName = (u) =>
    u < n ? `row ${u + 1}` : u < 2 * n ? `column ${u - n + 1}` : regionName(u - 2 * n);
  const kindName = (kind, i) =>
    kind === "row" ? `row ${i + 1}` : kind === "col" ? `column ${i + 1}` : regionName(i);
  const plural = { row: "rows", col: "columns", region: "regions" };

  for (let level = 1; level < TECHNIQUE_FNS.length; level++) {
    const before = s.cand.slice();
    if (TECHNIQUE_FNS[level](ctx, s) <= 0 || !s.note) continue;
    const note = s.note;
    const open = (u) => ctx.units[u].filter((x) => before[x]).map(key);
    const eliminate = [];
    for (let x = 0; x < ctx.N; x++) if (before[x] && !s.cand[x] && level > 1) eliminate.push(key(x));

    if (level === 1) {
      return hint({
        kind: "step",
        message: `${capitalize(unitName(note.unit))} has only one cell left where a queen can go.`,
        focus: ctx.units[note.unit].map(key),
        place: key(note.cell),
      });
    }
    if (level === 2) {
      const region = regionName(note.region);
      const line = unitName(note.line);
      const message =
        note.kind === "regionInLine"
          ? `Every open cell of ${region} is in ${line}, so ${line}'s queen has to be ${region}'s. Cross out the rest of ${line}.`
          : `Every open cell in ${line} belongs to ${region}, so ${region}'s queen has to be in ${line}. Cross out the rest of ${region}.`;
      return hint({ kind: "step", message, focus: open(2 * n + note.region), eliminate });
    }
    if (level === 3) {
      // Cross out every cell that empties the same unit, not just the first one found
      const targets = ctx.units[note.unit].filter((y) => before[y]);
      const blockers = [];
      for (let x = 0; x < ctx.N; x++) {
        if (before[x] && !targets.includes(x) && targets.every((y) => ctx.attack[x * ctx.N + y])) {
          blockers.push(key(x));
        }
      }
      const many = blockers.length > 1;
      return hint({
        kind: "step",
        message: `A queen on ${many ? "any of the marked cells" : "the marked cell"} would rule out every open cell of ${unitName(note.unit)}, leaving it no queen. So ${many ? "those cells" : "that cell"} can be crossed out.`,
        focus: open(note.unit),
        eliminate: blockers,
      });
    }
    if (level === 4) {
      const { groupKind, targetKind, groups, targets } = note;
      const k = groups.length;
      const groupNames = listNames(groups.map((g) => kindName(groupKind, g)));
      const targetNames = listNames(targets.map((t) => kindName(targetKind, t)));
      const groupUnit = (g) => (groupKind === "row" ? g : groupKind === "col" ? n + g : 2 * n + g);
      const message =
        groupKind === "region"
          ? `${capitalize(groupNames)} only have open cells in ${targetNames}. ${k} regions squeezed into ${k} ${plural[targetKind]} use up all of their queens, so cross out everything else in those ${plural[targetKind]}.`
          : `The open cells of ${groupNames} all sit inside ${targetNames}. Those ${k} ${plural[groupKind]} need ${k} queens, and they have to be these regions' queens, so cross out the rest of those regions.`;
      return hint({ kind: "step", message, focus: groups.flatMap((g) => open(groupUnit(g))), eliminate });
    }
    return hint({
      kind: "step",
      message: `Try a queen on the marked cell: following the easy consequences leaves ${unitName(note.unit)} with nowhere for its queen. So that cell can be crossed out.`,
      focus: open(note.unit),
      eliminate,
    });
  }

  // Shouldn't happen for generated puzzles, but never leave the player stuck.
  const row = [...Array(n).keys()].find((r) => !board[r].includes(2));
  const col = solution[row].indexOf(2);
  return hint({
    kind: "reveal",
    message: "There's no simple deduction from here, so here's a queen to get you moving.",
    focus: [`${row}-${col}`],
    place: `${row}-${col}`,
  });
}

// ---------------------------------------------------------------------------
// Region growth

function randomQueenLayout(n, rng) {
  const cols = new Array(n);
  const used = new Array(n).fill(false);
  const fill = (row) => {
    if (row === n) return true;
    for (const c of shuffle([...Array(n).keys()], rng)) {
      if (used[c] || (row > 0 && Math.abs(cols[row - 1] - c) <= 1)) continue;
      used[c] = true;
      cols[row] = c;
      if (fill(row + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  fill(0);
  return cols.map((c, r) => r * n + c);
}

const STYLES = ["blob", "bar", "snake", "wander"];

function growRegions(n, seeds, rng) {
  const N = n * n;
  const owner = new Int8Array(N).fill(-1);

  // Lopsided sizes: a couple of tiny pockets, some mid-size pieces, a big area or two.
  const weights = seeds.map(() => Math.exp(gaussian(rng) * 0.85));
  const total = weights.reduce((a, b) => a + b, 0);
  const targets = weights.map((w) => Math.max(1, Math.round((w / total) * N)));
  const styles = seeds.map(() => STYLES[Math.floor(rng() * STYLES.length)]);
  const horizontal = seeds.map(() => rng() < 0.5);
  const sizes = seeds.map(() => 1);
  const lastAdded = [...seeds];
  seeds.forEach((x, g) => (owner[x] = g));

  const sameNeighbors = (x, g) => neighbors4(n, x).filter((y) => owner[y] === g).length;
  const scoreCell = (x, g) => {
    const noise = rng();
    switch (styles[g]) {
      case "blob":
        return sameNeighbors(x, g) * 2 + noise;
      case "bar": {
        const r = (x / n) | 0;
        const c = x % n;
        const along = horizontal[g]
          ? (c > 0 && owner[x - 1] === g) || (c < n - 1 && owner[x + 1] === g)
          : (r > 0 && owner[x - n] === g) || (r < n - 1 && owner[x + n] === g);
        return (along ? 3 : 0) + noise;
      }
      case "snake": {
        const tip = lastAdded[g];
        const dist = Math.abs(((x / n) | 0) - ((tip / n) | 0)) + Math.abs((x % n) - (tip % n));
        return (sameNeighbors(x, g) === 1 ? 2 : 0) - dist + noise;
      }
      default:
        return noise * 3;
    }
  };

  let unassigned = N - n;
  while (unassigned > 0) {
    const frontiers = seeds.map(() => new Set());
    for (let x = 0; x < N; x++) {
      if (owner[x] !== -1) continue;
      for (const y of neighbors4(n, x)) if (owner[y] !== -1) frontiers[owner[y]].add(x);
    }

    // Grow regions still under target first; once all are full, let the big ones absorb leftovers.
    let pool = seeds.map((_, g) => g).filter((g) => frontiers[g].size && sizes[g] < targets[g]);
    let weightOf = (g) => targets[g] - sizes[g];
    if (!pool.length) {
      pool = seeds.map((_, g) => g).filter((g) => frontiers[g].size);
      weightOf = (g) => targets[g];
    }
    const sum = pool.reduce((a, g) => a + weightOf(g), 0);
    let pick = rng() * sum;
    let g = pool[pool.length - 1];
    for (const candidate of pool) {
      pick -= weightOf(candidate);
      if (pick <= 0) {
        g = candidate;
        break;
      }
    }

    let best = -1;
    let bestScore = -Infinity;
    for (const x of frontiers[g]) {
      const score = scoreCell(x, g);
      if (score > bestScore) {
        bestScore = score;
        best = x;
      }
    }
    owner[best] = g;
    sizes[g]++;
    lastAdded[g] = best;
    unassigned--;
  }
  return Array.from(owner);
}

// ---------------------------------------------------------------------------
// Border tweaking

function perimeter(n, regions) {
  let edges = 0;
  for (let x = 0; x < n * n; x++) {
    if (x % n < n - 1 && regions[x] !== regions[x + 1]) edges++;
    if (x + n < n * n && regions[x] !== regions[x + n]) edges++;
  }
  return edges;
}

function staysConnected(n, regions, region, removed, seed) {
  let size = 0;
  for (const g of regions) if (g === region) size++;
  const seen = new Set([seed]);
  const queue = [seed];
  while (queue.length) {
    const x = queue.pop();
    for (const y of neighbors4(n, x)) {
      if (y !== removed && regions[y] === region && !seen.has(y)) {
        seen.add(y);
        queue.push(y);
      }
    }
  }
  return seen.size === size - 1;
}

function evaluate(n, regions, profile) {
  const result = solveLogically(regions, profile.maxLevel);
  const unresolved = result.solved ? 0 : result.remaining + (n - result.placed) * 3;
  const interest = result.solved ? Math.min(result.interest, profile.minInterest * 2) : 0;
  // Smooth borders read better; a little pressure keeps shapes from turning ragged.
  const value = unresolved * 4 - interest + perimeter(n, regions) * 0.35;
  return { value, result };
}

const meetsProfile = (result, profile) =>
  result.solved && result.hardest >= profile.minLevel && result.interest >= profile.minInterest;

// ---------------------------------------------------------------------------
// Public API

// Returns { regions: number[][], solution: number[][] (2 = queen), stats }.
export function generatePuzzle(n, { seed, maxRounds = 4 } = {}) {
  const rng = createRng(seed);
  const profile = profileFor(n);
  const maxRegion = Math.ceil(n * n * 0.4);
  let fallback = null;

  for (let round = 1; ; round++) {
    const seeds = randomQueenLayout(n, rng);
    const regions = growRegions(n, seeds, rng);
    const seedOf = new Array(n);
    seeds.forEach((x) => (seedOf[regions[x]] = x));
    const seedCells = new Set(seeds);

    let current = evaluate(n, regions, profile);
    const iterations = n * n * 25;
    for (let i = 0; i < iterations; i++) {
      if (meetsProfile(current.result, profile)) break;
      if (current.result.solved && (!fallback || current.result.interest > fallback.result.interest)) {
        fallback = { regions: [...regions], result: current.result };
      }

      const x = Math.floor(rng() * n * n);
      if (seedCells.has(x)) continue;
      const others = neighbors4(n, x).filter((y) => regions[y] !== regions[x]);
      if (!others.length) continue;
      const from = regions[x];
      const to = regions[others[Math.floor(rng() * others.length)]];
      if (regions.filter((g) => g === to).length >= maxRegion) continue;
      if (!staysConnected(n, regions, from, x, seedOf[from])) continue;

      regions[x] = to;
      const next = evaluate(n, regions, profile);
      const temperature = 2.5 * (1 - i / iterations) + 0.2;
      const delta = next.value - current.value;
      if (delta <= 0 || rng() < Math.exp(-delta / temperature)) current = next;
      else regions[x] = from;
    }

    let chosen = null;
    if (meetsProfile(current.result, profile)) chosen = { regions, result: current.result };
    // Rarely the target is out of reach; settle for the most interesting solvable board seen.
    else if (round >= maxRounds && fallback) chosen = fallback;
    if (!chosen) continue;

    const solution = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const q of chosen.result.queens) solution[(q / n) | 0][q % n] = 2;
    return {
      regions: Array.from({ length: n }, (_, r) => chosen.regions.slice(r * n, r * n + n)),
      solution,
      stats: {
        hardest: chosen.result.hardest,
        counts: chosen.result.counts,
        interest: chosen.result.interest,
      },
    };
  }
}
