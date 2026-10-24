import { generatePuzzle, getHint, solveLogically } from "./generator";

// Brute-force count of solutions, independent of the logical solver.
const countSolutions = (regions, cap = 2) => {
  const n = regions.length;
  const cols = [];
  const usedCols = new Set();
  const usedRegions = new Set();
  let count = 0;
  const search = (r) => {
    if (count >= cap) return;
    if (r === n) {
      count++;
      return;
    }
    for (let c = 0; c < n; c++) {
      const g = regions[r][c];
      if (usedCols.has(c) || usedRegions.has(g)) continue;
      if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue;
      usedCols.add(c);
      usedRegions.add(g);
      cols[r] = c;
      search(r + 1);
      usedCols.delete(c);
      usedRegions.delete(g);
    }
  };
  search(0);
  return count;
};

const isConnected = (regions, g) => {
  const n = regions.length;
  const cells = [];
  regions.forEach((row, r) => row.forEach((v, c) => v === g && cells.push([r, c])));
  const seen = new Set([cells[0].join()]);
  const stack = [cells[0]];
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const key = `${r + dr},${c + dc}`;
      if (r + dr >= 0 && r + dr < n && regions[r + dr][c + dc] === g && !seen.has(key)) {
        seen.add(key);
        stack.push([r + dr, c + dc]);
      }
    }
  }
  return seen.size === cells.length;
};

describe.each([6, 8, 10])("generatePuzzle(%i)", (n) => {
  const puzzles = [1, 2, 3].map((seed) => generatePuzzle(n, { seed }));

  test("has n connected regions", () => {
    for (const { regions } of puzzles) {
      expect(new Set(regions.flat()).size).toBe(n);
      for (let g = 0; g < n; g++) expect(isConnected(regions, g)).toBe(true);
    }
  });

  test("has exactly one solution, and it is the one returned", () => {
    for (const { regions, solution } of puzzles) {
      expect(countSolutions(regions)).toBe(1);
      const queens = solution.flatMap((row, r) => row.flatMap((v, c) => (v === 2 ? [[r, c]] : [])));
      expect(queens).toHaveLength(n);
      expect(new Set(queens.map(([r, c]) => regions[r][c])).size).toBe(n);
    }
  });

  test("is solvable by logic and needs more than the easiest technique", () => {
    for (const { regions } of puzzles) {
      const result = solveLogically(regions);
      expect(result.solved).toBe(true);
      expect(result.hardest).toBeGreaterThanOrEqual(3);
    }
  });

  test("is reproducible from a seed", () => {
    expect(generatePuzzle(n, { seed: 1 }).regions).toEqual(puzzles[0].regions);
  });
});

test("solver refuses to guess on an ambiguous board", () => {
  // Plain stripes: every row is its own region, so many queen layouts work.
  const stripes = Array.from({ length: 6 }, (_, r) => new Array(6).fill(r));
  expect(solveLogically(stripes).solved).toBe(false);
});

describe("getHint", () => {
  const applyHint = (board, hint) => {
    const next = board.map((row) => [...row]);
    const at = (key) => key.split("-").map(Number);
    for (const key of hint.remove) next[at(key)[0]][at(key)[1]] = 0;
    for (const key of hint.eliminate) next[at(key)[0]][at(key)[1]] = 1;
    if (hint.place) next[at(hint.place)[0]][at(hint.place)[1]] = 2;
    return next;
  };

  test.each([6, 8, 10])("following hints alone solves a size-%i puzzle", (n) => {
    const { regions, solution } = generatePuzzle(n, { seed: 42 });
    let board = regions.map((row) => row.map(() => 0));
    for (let steps = 0; steps < n * n * 2; steps++) {
      const hint = getHint(regions, board, solution);
      if (!hint) break;
      expect(hint.kind).toBe("step");
      expect(hint.message).toMatch(/\w/);
      // Never suggests crossing out a queen's cell, or placing a queen where none goes
      for (const key of hint.eliminate) {
        const [r, c] = key.split("-").map(Number);
        expect(solution[r][c]).not.toBe(2);
      }
      if (hint.place) {
        const [r, c] = hint.place.split("-").map(Number);
        expect(solution[r][c]).toBe(2);
      }
      board = applyHint(board, hint);
    }
    expect(board.map((row) => row.map((v) => (v === 2 ? 2 : 0)))).toEqual(solution);
  });

  test("points out a misplaced queen before anything else", () => {
    const { regions, solution } = generatePuzzle(8, { seed: 7 });
    const board = regions.map((row) => row.map(() => 0));
    const r = 0;
    const c = solution[0].indexOf(2) === 0 ? 1 : 0;
    board[r][c] = 2;
    const hint = getHint(regions, board, solution);
    expect(hint.kind).toBe("mistake");
    expect(hint.remove).toEqual([`${r}-${c}`]);
  });

  test("points out an X on a queen's cell", () => {
    const { regions, solution } = generatePuzzle(8, { seed: 7 });
    const board = regions.map((row) => row.map(() => 0));
    const c = solution[3].indexOf(2);
    board[3][c] = 1;
    const hint = getHint(regions, board, solution);
    expect(hint.kind).toBe("mistake");
    expect(hint.remove).toEqual([`3-${c}`]);
  });
});
