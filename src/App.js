import React, { useState, useEffect } from "react";
import "./App.css";

/**
 * Dark color map for region IDs 1..9.
 * We only need 1..8, but 9 is included in case BFS seeds or expansions.
 * Each is chosen so white text (X or ♛) remains visible.
 */
const colorMap = {
  1: "#2C3E50", // dark grayish-blue
  2: "#34495E", // dark gray-blue
  3: "#7F8C8D", // gray
  4: "#C0392B", // dark red
  5: "#8E44AD", // purple
  6: "#16A085", // teal
  7: "#27AE60", // green
  8: "#2980B9", // darker blue
  9: "#2C3E50", // repeated or any other dark color
};

/* ===========================================================
   1) PLACE 8 NON‑ADJACENT QUEENS
   - row by row
   - no same column
   - no adjacency
=========================================================== */

/** Tries to place exactly 1 queen per row with no adjacency or column overlap.
 *  Returns an 8×8 board with "Q"/"" if successful, else null.
 *  We randomize columns for each row to get a random solution if multiple exist.
 */
function place8NonAdjacentQueens() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));

  // For each row, we have a random permutation of columns
  const columnsForRow = Array.from({ length: 8 }, () =>
    shuffle([0, 1, 2, 3, 4, 5, 6, 7])
  );

  function backtrack(row = 0) {
    if (row === 8) return true; // placed all 8
    for (let col of columnsForRow[row]) {
      if (isSafeRowColAdj(board, row, col)) {
        board[row][col] = "Q";
        if (backtrack(row + 1)) return true;
        board[row][col] = "";
      }
    }
    return false;
  }

  if (backtrack(0)) {
    return board;
  }
  return null;
}

/** Check row, col, adjacency for an existing board. */
function isSafeRowColAdj(board, row, col) {
  // row check
  for (let c = 0; c < 8; c++) {
    if (board[row][c] === "Q") return false;
  }
  // col check
  for (let r = 0; r < 8; r++) {
    if (board[r][col] === "Q") return false;
  }
  // adjacency
  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];
  for (let [dr, dc] of directions) {
    const rr = row + dr,
      cc = col + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      if (board[rr][cc] === "Q") return false;
    }
  }
  return true;
}

/** Shuffle array in-place (Fisher-Yates). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ===========================================================
   2) CARVE 8 CONTIGUOUS REGIONS AROUND EACH QUEEN
   - multi-source BFS from queen squares
=========================================================== */

/** Build regionColors from an 8×8 solutionBoard with "Q" in exactly 8 cells.
 *  Each queen is a BFS seed with region ID (1..8).
 *  We expand out until all 64 cells are assigned.
 */
function buildRegionsFromQueens(solutionBoard) {
  const regionColors = Array.from({ length: 8 }, () => Array(8).fill(0));
  let regionID = 1;
  const seeds = [];

  // Mark each queen cell with a distinct region ID
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (solutionBoard[r][c] === "Q") {
        regionColors[r][c] = regionID;
        seeds.push([r, c, regionID]);
        regionID++;
      }
    }
  }

  // BFS expansion multi-source
  const queue = [...seeds];
  while (queue.length > 0) {
    // pick a random cell from queue
    const idx = Math.floor(Math.random() * queue.length);
    const [r, c, id] = queue.splice(idx, 1)[0];
    const neighbors = getOrthNeighbors(r, c);
    shuffle(neighbors);

    for (let [nr, nc] of neighbors) {
      if (regionColors[nr][nc] === 0) {
        regionColors[nr][nc] = id;
        queue.push([nr, nc, id]);
      }
    }
  }

  return regionColors;
}

/** Orthogonally adjacent neighbors in 8×8. */
function getOrthNeighbors(r, c) {
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const res = [];
  for (let [dr, dc] of dirs) {
    const rr = r + dr,
      cc = c + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      res.push([rr, cc]);
    }
  }
  return res;
}

/* ===========================================================
   3) CHECK UNIQUENESS
   - remove queens => empty
   - row-based solver respecting region uniqueness & adjacency
   - must have exactly 1 solution
=========================================================== */

/** Count solutions for an empty board with the given regionColors.
 *  If solutions >=2, we stop (not unique).
 */
function countAllSolutions(board, regionColors, row = 0, found = { count: 0 }) {
  if (row === 8) {
    found.count++;
    return;
  }
  if (found.count >= 2) return;

  for (let col = 0; col < 8; col++) {
    if (board[row][col] === "") {
      if (isSafePuzzle(board, row, col, regionColors)) {
        board[row][col] = "Q";
        countAllSolutions(board, regionColors, row + 1, found);
        board[row][col] = "";
        if (found.count >= 2) return;
      }
    }
  }
}

/** Check row, col, adjacency, region uniqueness. */
function isSafePuzzle(board, row, col, regionColors) {
  // row
  for (let c = 0; c < 8; c++) {
    if (board[row][c] === "Q") return false;
  }
  // col
  for (let r = 0; r < 8; r++) {
    if (board[r][col] === "Q") return false;
  }
  // adjacency
  const directions = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];
  for (let [dr, dc] of directions) {
    const rr = row + dr,
      cc = col + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      if (board[rr][cc] === "Q") return false;
    }
  }
  // region
  const regID = regionColors[row][col];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === "Q" && regionColors[r][c] === regID) {
        return false;
      }
    }
  }
  return true;
}

function hasUniqueSolution(regionColors) {
  const emptyBoard = Array.from({ length: 8 }, () => Array(8).fill(""));
  const found = { count: 0 };
  countAllSolutions(emptyBoard, regionColors, 0, found);
  return found.count === 1;
}

/* ===========================================================
   4) OVERALL GENERATION
   - up to maxAttempts
   - place 8 non-adj queens
   - carve regions
   - check uniqueness
=========================================================== */

function generateCarvedPuzzle(maxAttempts = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    // 1) place 8 non-adj queens
    const solution = place8NonAdjacentQueens();
    if (!solution) continue;

    // 2) carve
    const regionColors = buildRegionsFromQueens(solution);

    // 3) check uniqueness
    if (hasUniqueSolution(regionColors)) {
      return regionColors;
    }
  }
  return null;
}

/* ===========================================================
   5) UI: Conflicts, Board, etc.
=========================================================== */

/** findConflictCells:
 *   For each pair of queens, if they conflict (row/col/region/adjacency),
 *   mark them in a set of "r,c" strings.
 */
function findConflictCells(board, regionColors) {
  const conflictSet = new Set();
  const queens = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === "Q") {
        queens.push([r, c]);
      }
    }
  }
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const [r1, c1] = queens[i];
      const [r2, c2] = queens[j];
      // row
      if (r1 === r2) {
        conflictSet.add(`${r1},${c1}`);
        conflictSet.add(`${r2},${c2}`);
      }
      // col
      if (c1 === c2) {
        conflictSet.add(`${r1},${c1}`);
        conflictSet.add(`${r2},${c2}`);
      }
      // region
      if (regionColors[r1][c1] === regionColors[r2][c2]) {
        conflictSet.add(`${r1},${c1}`);
        conflictSet.add(`${r2},${c2}`);
      }
      // adjacency
      if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) {
        conflictSet.add(`${r1},${c1}`);
        conflictSet.add(`${r2},${c2}`);
      }
    }
  }
  return conflictSet;
}

/** isPuzzleSolved: 8 queens, no conflicts. */
function isPuzzleSolved(board, regionColors) {
  let queenCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === "Q") queenCount++;
    }
  }
  if (queenCount !== 8) return false;
  const conflicts = findConflictCells(board, regionColors);
  return conflicts.size === 0;
}

/* ===========================================================
   6) MAIN REACT COMPONENT
=========================================================== */
function App() {
  const [regionColors, setRegionColors] = useState(null);
  const [userBoard, setUserBoard] = useState(
    Array.from({ length: 8 }, () => Array(8).fill(""))
  );
  const [conflictCells, setConflictCells] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);

  // On mount, generate puzzle once
  useEffect(() => {
    handleNewPuzzle();
    // eslint-disable-next-line
  }, []);

  // Recalc conflicts each time userBoard changes
  useEffect(() => {
    if (!loading && regionColors) {
      const conflicts = findConflictCells(userBoard, regionColors);
      setConflictCells(conflicts);

      // check solve
      if (isPuzzleSolved(userBoard, regionColors)) {
        alert("Congratulations! You solved the puzzle!");
      }
    }
  }, [userBoard, regionColors, loading]);

  /** Attempt to generate a puzzle, up to 200 tries. If fail, show error. */
  function handleNewPuzzle() {
    setLoading(true);
    setGenerationFailed(false);
    setRegionColors(null);
    setUserBoard(Array.from({ length: 8 }, () => Array(8).fill("")));
    setConflictCells(new Set());

    // Use a small setTimeout so the UI can show "Generating..." text
    setTimeout(() => {
      const puzzle = generateCarvedPuzzle(200);
      if (!puzzle) {
        setGenerationFailed(true);
        alert(
          "Could not generate a puzzle after many tries. Press 'New Puzzle' again to retry."
        );
      } else {
        setRegionColors(puzzle);
      }
      setLoading(false);
    }, 50);
  }

  /** Reset current puzzle to empty (same regionColors). */
  function handleResetPuzzle() {
    if (!loading && regionColors) {
      setUserBoard(Array.from({ length: 8 }, () => Array(8).fill("")));
      setConflictCells(new Set());
    }
  }

  /** Cell click => cycle "" -> "X" -> "Q" -> "" */
  function handleCellClick(r, c) {
    if (loading || !regionColors) return;
    setUserBoard((prev) => {
      const copy = prev.map((row) => [...row]);
      const cur = copy[r][c];
      let next = "";
      if (cur === "") next = "X";
      else if (cur === "X") next = "Q";
      else if (cur === "Q") next = "";
      copy[r][c] = next;
      return copy;
    });
  }

  // If puzzle isn't ready, show a "Generating..." UI
  if (loading || !regionColors) {
    return (
      <div className="game-container">
        <h1>Queens Game (Generating...)</h1>
        {loading && <p>Please wait, trying up to 200 attempts.</p>}
        {generationFailed && (
          <button onClick={handleNewPuzzle}>Try Again</button>
        )}
      </div>
    );
  }

  // regionColors loaded => render board
  return (
    <div className="game-container">
      <h1>Queens Game - Carve Approach (Dark Colors)</h1>

      <div className="button-bar">
        <button onClick={handleNewPuzzle}>New Puzzle</button>
        <button onClick={handleResetPuzzle}>Reset Puzzle</button>
      </div>

      <div className="board-container">
        {userBoard.map((rowData, rIdx) => (
          <div className="board-row" key={rIdx}>
            {rowData.map((val, cIdx) => {
              const regID = regionColors[rIdx][cIdx];
              const bgColor = colorMap[regID] || "#2C3E50"; // default dark

              const cellKey = `${rIdx},${cIdx}`;
              const inConflict = conflictCells.has(cellKey);

              let displayVal = val;
              if (displayVal === "Q") displayVal = "♛";

              const cellStyle = {
                backgroundColor: bgColor,
                border: inConflict ? "2px solid red" : "1px solid #222",
              };

              return (
                <div
                  key={cIdx}
                  className="cell"
                  style={cellStyle}
                  onClick={() => handleCellClick(rIdx, cIdx)}
                >
                  {displayVal}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
