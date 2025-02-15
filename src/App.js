import React, { useState, useEffect, useRef } from "react";
import "./App.css";

/**
 * A color map of 8 distinct dark/strong colors for use on a white page.
 */
const regionColorMap = {
  1: "#2c3e50",
  2: "#e74c3c",
  3: "#8e44ad",
  4: "#f39c12",
  5: "#16a085",
  6: "#27ae60",
  7: "#2980b9",
  8: "#d35400",
  9: "#34495e", // fallback if needed
};

/* ==============================
   Crown SVG Component
   ============================== */
function CrownSVG({ color = "#FFF", size = "1em" }) {
  // This is a lightweight SVG crown. You can tweak paths or use a more detailed version.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M98.67 162.64L65 348.49h382l-33.67-185.85L320.7 252l-55.61-120.57L209.49 252l-110.82-89.36zm0 0" />
      <path d="M65 382.49v44c0 8.28 6.72 15 15 15h352c8.28 0 15-6.72 15-15v-44H65z" />
    </svg>
  );
}

/* ==============================
   1) Place 8 Non-Adjacent Queens
   ============================== */
function place8NonAdjacentQueens() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));
  // Shuffle columns for each row, so we place queens randomly
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
  // row
  for (let c = 0; c < 8; c++) {
    if (board[row][c] === "Q") return false;
  }
  // col
  for (let r = 0; r < 8; r++) {
    if (board[r][col] === "Q") return false;
  }
  // adjacency (8 directions)
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
    let rr = row + dr,
      cc = col + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      if (board[rr][cc] === "Q") return false;
    }
  }
  return true;
}

/** Fisher-Yates shuffle in-place. */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ==============================
   2) Carve 8 Contiguous Regions (Naive BFS)
   ============================== */
function buildRegionsFromQueens(solutionBoard) {
  const regionColors = Array.from({ length: 8 }, () => Array(8).fill(0));
  const seeds = [];
  let regionID = 1;

  // Mark each queen cell as the seed for that region
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (solutionBoard[r][c] === "Q") {
        regionColors[r][c] = regionID;
        seeds.push([r, c, regionID]);
        regionID++;
      }
    }
  }

  // Multi-source BFS expansions
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

/** Orth neighbors. */
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

/* ==============================
   3) Check if Puzzle is Unique
   ============================== */
function hasUniqueSolution(regionColors) {
  // Start empty
  const emptyBoard = Array.from({ length: 8 }, () => Array(8).fill(""));
  const found = { count: 0 };
  countAllSolutions(emptyBoard, regionColors, 0, found);
  return found.count === 1;
}

function countAllSolutions(board, regionColors, row = 0, found = { count: 0 }) {
  if (row === 8) {
    found.count++;
    return;
  }
  if (found.count >= 2) return; // stop if >1 solutions

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
    let rr = row + dr,
      cc = col + dc;
    if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
      if (board[rr][cc] === "Q") return false;
    }
  }
  // region
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

/* ==============================
   4) Generate Puzzle (up to 500 tries)
   ============================== */
function generateCarvedPuzzle() {
  const maxAttempts = 500;
  for (let i = 0; i < maxAttempts; i++) {
    const solution = place8NonAdjacentQueens();
    if (!solution) continue;

    const regionColors = buildRegionsFromQueens(solution);
    if (!regionColors) continue; // just in case

    if (hasUniqueSolution(regionColors)) {
      return regionColors;
    }
  }
  return null; // fail
}

/* ==============================
   5) Conflict Checking & Win
   ============================== */
function findConflictCells(board, regionColors) {
  const conflictSet = new Set();
  const queens = [];
  // gather all queens
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === "Q") {
        queens.push([r, c]);
      }
    }
  }

  // compare each pair for row/col/region/adj adjacency
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
      if (board[r][c] === "Q") queenCount++;
    }
  }
  if (queenCount !== 8) return false;

  const conflicts = findConflictCells(board, regionColors);
  return conflicts.size === 0;
}

/* ==============================
   6) Format Time => "mm mins ss sec"
   ============================== */
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs} sec`;
  const minLabel = mins === 1 ? "1 min" : `${mins} mins`;
  const secLabel = secs === 1 ? "1 sec" : `${secs} sec`;
  return `${minLabel} ${secLabel}`;
}

/* ==============================
   7) MAIN APP
   ============================== */
function App() {
  const [regionColors, setRegionColors] = useState(null);
  const [userBoard, setUserBoard] = useState(
    Array.from({ length: 8 }, () => Array(8).fill(""))
  );
  const [conflictCells, setConflictCells] = useState(new Set());

  const [loading, setLoading] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);

  // Keep track if the puzzle is finished so we don't re-open modal
  const [gameFinished, setGameFinished] = useState(false);

  // Timer
  const [timeElapsed, setTimeElapsed] = useState(0);
  const intervalRef = useRef(null);

  // Modal for solved puzzle
  const [solvedModalOpen, setSolvedModalOpen] = useState(false);

  // On mount => generate puzzle
  useEffect(() => {
    handleNewPuzzle();
    // eslint-disable-next-line
  }, []);

  // Recalc conflicts
  useEffect(() => {
    if (!loading && regionColors) {
      const conflicts = findConflictCells(userBoard, regionColors);
      setConflictCells(conflicts);
    }
  }, [userBoard, regionColors, loading]);

  // Check solved
  useEffect(() => {
    if (!loading && regionColors && !gameFinished) {
      // Only check if we haven't finished before
      if (isPuzzleSolved(userBoard, regionColors)) {
        setSolvedModalOpen(true);
        setGameFinished(true); // Mark puzzle as finished => won't re-show
      }
    }
  }, [userBoard, regionColors, loading, gameFinished]);

  // Timer start/stop
  useEffect(() => {
    if (regionColors && !loading && !solvedModalOpen && !gameFinished) {
      // Start or continue timer
      if (!intervalRef.current) {
        intervalRef.current = setInterval(() => {
          setTimeElapsed((t) => t + 1);
        }, 1000);
      }
    } else {
      // Stop
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
  }, [regionColors, loading, solvedModalOpen, gameFinished]);

  function handleNewPuzzle() {
    setLoading(true);
    setGenerationFailed(false);
    setRegionColors(null);
    setUserBoard(Array.from({ length: 8 }, () => Array(8).fill("")));
    setConflictCells(new Set());
    setSolvedModalOpen(false);
    setGameFinished(false);
    setTimeElapsed(0);

    setTimeout(() => {
      const puzzle = generateCarvedPuzzle(); // up to 500 tries
      if (!puzzle) {
        setGenerationFailed(true);
      } else {
        setRegionColors(puzzle);
      }
      setLoading(false);
    }, 50);
  }

  function handleResetPuzzle() {
    if (!loading && regionColors) {
      setUserBoard(Array.from({ length: 8 }, () => Array(8).fill("")));
      setConflictCells(new Set());
      setSolvedModalOpen(false);
      setGameFinished(false);
      setTimeElapsed(0);
    }
  }

  /** Cell click => cycle "" -> "X" -> "Q" -> "" */
  function handleCellClick(r, c) {
    if (loading || !regionColors) return;
    setUserBoard((prev) => {
      const copy = prev.map((row) => [...row]);
      const cur = copy[r][c];
      let next = "";
      if (cur === "") {
        next = "X";
      } else if (cur === "X") {
        next = "Q";
      } else if (cur === "Q") {
        next = "";
      }
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
        <h1>Queens Game</h1>
        {loading && <p>Generating puzzle (up to 500 tries). Please wait...</p>}
        {generationFailed && (
          <>
            <p>Could not generate puzzle after many tries.</p>
            <button onClick={handleNewPuzzle}>Try Again</button>
          </>
        )}
      </div>
    );
  }

  // puzzle is ready
  return (
    <div className="game-container">
      <h1>Queens Game</h1>
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

              let content = null;
              if (val === "Q") {
                // Render the fancy Crown
                content = <CrownSVG color="#FFF" size="1.5em" />;
              } else if (val === "X") {
                // Show "X" in gold
                content = <span style={{ color: "#FFD700" }}>X</span>;
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
                  {content}
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
