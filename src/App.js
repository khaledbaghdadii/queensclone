import React, { useState, useEffect, useRef } from "react";
import "./App.css";

/**
 * A carefully curated set of 8 distinct colors from a darker/brighter palette
 * so that each is clearly different. The background is white,
 * so these colors pop. We avoid multiple purples or very close hues.
 */
const regionColorMap = {
  1: "#2c3e50", // dark bluish gray
  2: "#e74c3c", // red
  3: "#8e44ad", // purple
  4: "#f39c12", // orange
  5: "#16a085", // teal
  6: "#27ae60", // green
  7: "#2980b9", // blue
  8: "#d35400", // dark orange
  9: "#34495e", // fallback if needed
};

/* ==========================================
   1) PLACE 8 NON-ADJACENT QUEENS
========================================== */
function place8NonAdjacentQueens() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));
  // randomize columns for each row
  const columnsForRow = Array.from({ length: 8 }, () =>
    shuffle([0, 1, 2, 3, 4, 5, 6, 7])
  );

  function backtrack(row = 0) {
    if (row === 8) return true;
    for (let col of columnsForRow[row]) {
      if (isSafeRowColAdj(board, row, col)) {
        board[row][col] = "Q";
        if (backtrack(row + 1)) return true;
        board[row][col] = "";
      }
    }
    return false;
  }

  if (backtrack(0)) return board;
  return null;
}

function isSafeRowColAdj(board, row, col) {
  // row check
  for (let c = 0; c < 8; c++) {
    if (board[row][c] === "Q") return false;
  }
  // column check
  for (let r = 0; r < 8; r++) {
    if (board[r][col] === "Q") return false;
  }
  // adjacency (including diagonals)
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

/** Shuffle array in-place. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ==========================================
   2) CARVE REGIONS AROUND EACH QUEEN
========================================== */
function buildRegionsFromQueens(solutionBoard) {
  const regionColors = Array.from({ length: 8 }, () => Array(8).fill(0));
  let regionID = 1;
  const seeds = [];

  // each queen => BFS seed
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (solutionBoard[r][c] === "Q") {
        regionColors[r][c] = regionID;
        seeds.push([r, c, regionID]);
        regionID++;
      }
    }
  }

  const queue = [...seeds];
  while (queue.length > 0) {
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

/* ==========================================
   3) CHECK UNIQUENESS
========================================== */
function hasUniqueSolution(regionColors) {
  const emptyBoard = Array.from({ length: 8 }, () => Array(8).fill(""));
  const found = { count: 0 };
  countAllSolutions(emptyBoard, regionColors, 0, found);
  return found.count === 1;
}

/** row-based solver with region/adjacency checks. */
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
  // region uniqueness
  const regID = regionColors[row][col];
  for (let rr = 0; rr < 8; rr++) {
    for (let cc = 0; cc < 8; cc++) {
      if (board[rr][cc] === "Q" && regionColors[rr][cc] === regID) {
        return false;
      }
    }
  }
  return true;
}

/* ==========================================
   4) GENERATE PUZZLE ( up to X attempts )
========================================== */
function generateCarvedPuzzle(maxAttempts = 200) {
  for (let i = 0; i < maxAttempts; i++) {
    const solution = place8NonAdjacentQueens();
    if (!solution) continue;
    const regionColors = buildRegionsFromQueens(solution);
    if (hasUniqueSolution(regionColors)) {
      return regionColors;
    }
  }
  return null;
}

/* ==========================================
   5) FIND CONFLICTS & CHECK SOLVED
========================================== */
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

function isPuzzleSolved(board, regionColors) {
  let queenCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === "Q") {
        queenCount++;
      }
    }
  }
  if (queenCount !== 8) return false;

  const conflicts = findConflictCells(board, regionColors);
  return conflicts.size === 0;
}

/* ==========================================
   6) HELPER: FORMAT TIME mm:ss
========================================== */
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) {
    return `${secs} sec`;
  }
  // e.g. "1 min 4 sec" or "2 mins 10 sec"
  const minLabel = mins === 1 ? "1 min" : `${mins} mins`;
  const secLabel = secs === 1 ? "1 sec" : `${secs} sec`;
  return `${minLabel} ${secLabel}`;
}

/* ==========================================
   7) MAIN REACT APP
========================================== */
function App() {
  const [regionColors, setRegionColors] = useState(null);
  const [userBoard, setUserBoard] = useState(
    Array.from({ length: 8 }, () => Array(8).fill(""))
  );
  const [conflictCells, setConflictCells] = useState(new Set());

  const [loading, setLoading] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);

  // Timer
  const [timeElapsed, setTimeElapsed] = useState(0);
  const intervalRef = useRef(null);

  // Modal if solved
  const [solvedModalOpen, setSolvedModalOpen] = useState(false);

  // On mount, generate puzzle
  useEffect(() => {
    handleNewPuzzle();
    // eslint-disable-next-line
  }, []);

  // Start/stop timer
  useEffect(() => {
    // If puzzle is loaded & not solved => run timer
    if (regionColors && !loading && !solvedModalOpen) {
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setTimeElapsed((t) => t + 1);
        }, 1000);
      }
    } else {
      // pause the timer
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [regionColors, loading, solvedModalOpen]);

  // recalc conflicts
  useEffect(() => {
    if (!loading && regionColors) {
      const conflicts = findConflictCells(userBoard, regionColors);
      setConflictCells(conflicts);

      if (isPuzzleSolved(userBoard, regionColors)) {
        setSolvedModalOpen(true);
      }
    }
  }, [userBoard, regionColors, loading]);

  // generate puzzle
  function handleNewPuzzle() {
    setLoading(true);
    setGenerationFailed(false);
    setRegionColors(null);
    setUserBoard(Array.from({ length: 8 }, () => Array(8).fill("")));
    setConflictCells(new Set());
    setSolvedModalOpen(false);
    setTimeElapsed(0);

    setTimeout(() => {
      const puzzle = generateCarvedPuzzle(200);
      if (!puzzle) {
        setGenerationFailed(true);
      } else {
        setRegionColors(puzzle);
      }
      setLoading(false);
    }, 100);
  }

  // reset puzzle => same regionColors
  function handleResetPuzzle() {
    if (!loading && regionColors) {
      setUserBoard(Array.from({ length: 8 }, () => Array(8).fill("")));
      setConflictCells(new Set());
      setSolvedModalOpen(false);
      setTimeElapsed(0);
    }
  }

  // cell click => cycle
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

  function handleCloseModal() {
    setSolvedModalOpen(false);
  }

  if (loading || !regionColors) {
    return (
      <div className="game-container">
        <h1>Queens Game (Generating...)</h1>
        {loading && <p>Trying up to 200 attempts. Please wait...</p>}
        {generationFailed && (
          <>
            <p>Could not generate a puzzle after many tries.</p>
            <button onClick={handleNewPuzzle}>Try Again</button>
          </>
        )}
      </div>
    );
  }

  // puzzle ready
  return (
    <div className="game-container">
      <h1>Queens Game - Carve Approach</h1>
      <p>Time: {formatTime(timeElapsed)}</p>

      <div className="button-bar">
        <button onClick={handleNewPuzzle}>New Puzzle</button>
        <button onClick={handleResetPuzzle}>Reset Puzzle</button>
      </div>

      <div className="board-container">
        {userBoard.map((rowData, rIdx) => (
          <div className="board-row" key={rIdx}>
            {rowData.map((val, cIdx) => {
              const regID = regionColors[rIdx][cIdx];
              const bgColor = regionColorMap[regID] || "#555";

              const cellKey = `${rIdx},${cIdx}`;
              const inConflict = conflictCells.has(cellKey);

              // Set different styles for "X" vs "Q"
              let displayVal = val;
              let textStyle = { color: "#FFF" };
              if (val === "Q") {
                displayVal = "♛";
                textStyle = { color: "#FFF" };
              } else if (val === "X") {
                textStyle = { color: "#FFD700" }; // gold for "X"
              }

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
                  <span style={textStyle}>{displayVal}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {solvedModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Congratulations!</h2>
            <p>You solved the puzzle!</p>
            <p>Your time: {formatTime(timeElapsed)}</p>
            <button onClick={handleCloseModal}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
