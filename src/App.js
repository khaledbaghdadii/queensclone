import { Analytics } from "@vercel/analytics/react";
import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import { generatePuzzle as buildPuzzle, getHint } from "./generator";

// Region colors and the names hints use for them
const REGION_PALETTE = {
  "#bba3e2": "purple",
  "#ffc992": "orange",
  "#96beff": "blue",
  "#b3dfa0": "green",
  "#dfdfdf": "grey",
  "#ff7b60": "red",
  "#e6f388": "yellow",
  "#b9b29e": "tan",
  "#dfa0bf": "pink",
  "#a3d2d8": "teal",
  "#62efea": "cyan",
};

function App() {
  const [size, setSize] = useState(8);
  const [board, setBoard] = useState([]);
  const [regions, setRegions] = useState([]);
  const [solution, setSolution] = useState(null);
  const [colors, setColors] = useState([]);
  const [timer, setTimer] = useState(0);
  const [timerInterval, setTimerInterval] = useState(null);
  const [message, setMessage] = useState("");
  const [errorCells, setErrorCells] = useState([]);
  const [loading, setLoading] = useState(true);
  const [conflictPairs, setConflictPairs] = useState([]);
  const [autoMarkEnabled, setAutoMarkEnabled] = useState(true);
  const [history, setHistory] = useState([]);
  const [autoMarkedCells, setAutoMarkedCells] = useState({});
  const [showWinModal, setShowWinModal] = useState(false);
  const [winTime, setWinTime] = useState(0);
  const [gameIsWon, setGameIsWon] = useState(false);
  const [hint, setHint] = useState(null);

  // Add a ref to track the current generation ID
  const generationIdRef = useRef(0);
  // The drag-to-mark gesture in progress, if any
  const dragRef = useRef(null);

  // Initialize the game
  useEffect(() => {
    initializeGame(size);

    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [size]);

  const initializeGame = async (boardSize) => {
    // Increment generation ID to invalidate any in-progress generation
    generationIdRef.current++;
    const thisGenerationId = generationIdRef.current;

    setLoading(true);
    setErrorCells([]);
    setConflictPairs([]);
    setMessage("");
    setHistory([]);
    setAutoMarkedCells({});
    setShowWinModal(false);
    setGameIsWon(false);

    // Clear existing timer
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    setTimer(0);

    // Generate colors
    const newColors = generateColors(boardSize);
    setColors(newColors);

    // Initialize empty arrays
    const emptyBoard = Array(boardSize)
      .fill()
      .map(() => Array(boardSize).fill(0));
    setBoard(emptyBoard);

    // Generate regions and puzzle in a non-blocking way
    setTimeout(() => {
      // Check if this generation is still valid
      if (thisGenerationId !== generationIdRef.current) {
        return; // This generation has been superseded
      }

      try {
        const { newRegions, newSolution } = generatePuzzle(boardSize);

        // Check again if this generation is still valid
        if (thisGenerationId !== generationIdRef.current) {
          return; // This generation has been superseded
        }

        // Set state
        setRegions(newRegions);
        setSolution(newSolution);
        const initialBoard = Array(boardSize)
          .fill()
          .map(() => Array(boardSize).fill(0));
        setBoard(initialBoard);

        // Save initial state to history
        setHistory([
          {
            board: initialBoard,
            autoMarkedCells: {},
          },
        ]);

        // Start the timer
        startTimer();
        setLoading(false);
      } catch (error) {
        console.error("Error generating puzzle:", error);
        // Only retry if this generation is still current
        if (thisGenerationId === generationIdRef.current) {
          initializeGame(boardSize);
        }
      }
    }, 100);
  };

  // Soft, clearly distinct region colors (evenly spaced hues blur together on big boards)
  const generateColors = (size) => {
    const shuffled = Object.keys(REGION_PALETTE).sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  };

  const generatePuzzle = (boardSize) => {
    const { regions, solution } = buildPuzzle(boardSize);
    return { newRegions: regions, newSolution: solution };
  };

  // Start the timer
  const startTimer = () => {
    // Clear any existing timer first
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    setTimer(0);
    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    setTimerInterval(interval);
  };

  // Auto-mark cells based on queen placement
  const autoMarkCells = (row, col, currentBoard, currentAutoMarkedCells) => {
    if (!autoMarkEnabled)
      return { board: currentBoard, autoMarkedCells: currentAutoMarkedCells };

    const newBoard = JSON.parse(JSON.stringify(currentBoard));
    const newAutoMarkedCells = { ...currentAutoMarkedCells };
    const queenKey = `${row}-${col}`;
    const boardSize = newBoard.length;
    const currentRegion = regions[row][col];

    // If this queen doesn't have a list in autoMarkedCells, create one
    if (!newAutoMarkedCells[queenKey]) {
      newAutoMarkedCells[queenKey] = [];
    }

    // Mark cells in the same row
    for (let c = 0; c < boardSize; c++) {
      if (c !== col && newBoard[row][c] === 0) {
        newBoard[row][c] = 1; // Mark as 'X'
        newAutoMarkedCells[queenKey].push(`${row}-${c}`);
      }
    }

    // Mark cells in the same column
    for (let r = 0; r < boardSize; r++) {
      if (r !== row && newBoard[r][col] === 0) {
        newBoard[r][col] = 1; // Mark as 'X'
        newAutoMarkedCells[queenKey].push(`${r}-${col}`);
      }
    }

    // Mark adjacent cells (including diagonally)
    for (
      let r = Math.max(0, row - 1);
      r <= Math.min(boardSize - 1, row + 1);
      r++
    ) {
      for (
        let c = Math.max(0, col - 1);
        c <= Math.min(boardSize - 1, col + 1);
        c++
      ) {
        if ((r !== row || c !== col) && newBoard[r][c] === 0) {
          newBoard[r][c] = 1; // Mark as 'X'
          newAutoMarkedCells[queenKey].push(`${r}-${c}`);
        }
      }
    }

    // Mark cells in the same region
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (
          (r !== row || c !== col) &&
          regions[r][c] === currentRegion &&
          newBoard[r][c] === 0
        ) {
          newBoard[r][c] = 1; // Mark as 'X'
          newAutoMarkedCells[queenKey].push(`${r}-${c}`);
        }
      }
    }

    return { board: newBoard, autoMarkedCells: newAutoMarkedCells };
  };

  // Remove auto-marked cells when queen is removed
  const removeAutoMarkedCells = (
    row,
    col,
    currentBoard,
    currentAutoMarkedCells
  ) => {
    const newBoard = JSON.parse(JSON.stringify(currentBoard));
    const newAutoMarkedCells = { ...currentAutoMarkedCells };
    const queenKey = `${row}-${col}`;

    // If this queen has auto-marked cells, remove them
    if (newAutoMarkedCells[queenKey]) {
      for (const cellKey of newAutoMarkedCells[queenKey]) {
        const [r, c] = cellKey.split("-").map(Number);

        // Only clear the X if no other queen is claiming it
        let keepMark = false;
        for (const otherQueenKey in newAutoMarkedCells) {
          if (
            otherQueenKey !== queenKey &&
            newAutoMarkedCells[otherQueenKey].includes(cellKey)
          ) {
            keepMark = true;
            break;
          }
        }

        if (!keepMark) {
          newBoard[r][c] = 0; // Clear the mark
        }
      }

      // Remove this queen's entry
      delete newAutoMarkedCells[queenKey];
    }

    return { board: newBoard, autoMarkedCells: newAutoMarkedCells };
  };

  // Handle cell click
  const cellClick = (row, col) => {
    if (loading || gameIsWon) return;

    // Save current state for undo
    saveState();

    // Get current cell state
    const currentState = board[row][col];
    const newBoard = JSON.parse(JSON.stringify(board));
    let newAutoMarkedCells = { ...autoMarkedCells };

    // Handle based on current state
    if (currentState === 0) {
      // Empty to X
      newBoard[row][col] = 1;
    } else if (currentState === 1) {
      // X to Queen
      newBoard[row][col] = 2;
      // Auto-mark cells for this queen
      const result = autoMarkCells(row, col, newBoard, newAutoMarkedCells);
      newBoard[row][col] = 2; // Ensure queen is still there
      newAutoMarkedCells = result.autoMarkedCells;

      // Copy the auto-marked cells to the new board
      for (const queenKey in result.autoMarkedCells) {
        for (const cellKey of result.autoMarkedCells[queenKey]) {
          const [r, c] = cellKey.split("-").map(Number);
          if (newBoard[r][c] === 0) {
            // Only mark if cell is empty
            newBoard[r][c] = 1;
          }
        }
      }
    } else if (currentState === 2) {
      // Queen to Empty
      // First remove auto-marked cells for this queen
      const result = removeAutoMarkedCells(
        row,
        col,
        newBoard,
        newAutoMarkedCells
      );
      newBoard[row][col] = 0; // Set to empty
      newAutoMarkedCells = result.autoMarkedCells;

      // Copy the remaining auto-marked cells
      for (let r = 0; r < newBoard.length; r++) {
        for (let c = 0; c < newBoard[r].length; c++) {
          if (r === row && c === col) continue;
          newBoard[r][c] = result.board[r][c];
        }
      }
    }

    // Update state
    setBoard(newBoard);
    setAutoMarkedCells(newAutoMarkedCells);

    // Validate board and check for errors
    validateBoard(newBoard);
  };

  // Press and drag across cells to mark them with X. A drag that starts on an X
  // erases X's instead. Queens are never touched. A press without moving is a click.
  const cellAtPoint = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-cell]");
    if (!el) return null;
    const [row, col] = el.dataset.cell.split("-").map(Number);
    return { row, col };
  };

  const paintCell = (row, col) => {
    const drag = dragRef.current;
    const key = `${row}-${col}`;
    if (drag.visited.has(key)) return;
    drag.visited.add(key);

    const from = drag.paint === 1 ? 0 : 1;
    setBoard((prev) => {
      if (prev[row][col] !== from) return prev;
      const next = prev.map((r) => [...r]);
      next[row][col] = drag.paint;
      return next;
    });
  };

  const handlePointerDown = (e, row, col) => {
    if (loading || gameIsWon || e.button !== 0) return;
    dragRef.current = {
      row,
      col,
      paint: board[row][col] === 1 ? 0 : 1,
      moved: false,
      visited: new Set(),
    };
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const cell = cellAtPoint(e.clientX, e.clientY);
    if (!cell) return;
    if (!drag.moved) {
      if (cell.row === drag.row && cell.col === drag.col) return;
      drag.moved = true;
      saveState(); // the whole drag is one undo step
      paintCell(drag.row, drag.col);
      drag.last = { row: drag.row, col: drag.col };
    }

    // Fast swipes can skip cells between move events, so fill in the path.
    const dr = cell.row - drag.last.row;
    const dc = cell.col - drag.last.col;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    for (let s = 1; s <= steps; s++) {
      paintCell(
        drag.last.row + Math.round((dr * s) / steps),
        drag.last.col + Math.round((dc * s) / steps)
      );
    }
    drag.last = cell;
  };

  const handlePointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) cellClick(drag.row, drag.col);
  };

  // Save current state to history
  const saveState = () => {
    const currentState = {
      board: JSON.parse(JSON.stringify(board)),
      autoMarkedCells: JSON.parse(JSON.stringify(autoMarkedCells)),
    };
    setHistory((prev) => [...prev, currentState]);
  };

  // Undo last move
  const undo = () => {
    if (history.length <= 1 || gameIsWon) return; // Nothing to undo or game is won

    // Entries after the first are snapshots taken just before each move
    const newHistory = [...history];
    const previousState = newHistory.pop();

    setBoard(previousState.board);
    setAutoMarkedCells(previousState.autoMarkedCells);
    setHistory(newHistory);

    validateBoard(previousState.board);
  };

  // Find conflict reason between two queens
  const findConflictReason = (q1, q2) => {
    if (q1.row === q2.row) return "same row";
    if (q1.col === q2.col) return "same column";
    if (q1.region === q2.region) return "same region";

    const rowDiff = Math.abs(q1.row - q2.row);
    const colDiff = Math.abs(q1.col - q2.col);

    // Check if queens are adjacent (horizontally, vertically, or diagonally)
    if (rowDiff <= 1 && colDiff <= 1) {
      if (rowDiff === 1 && colDiff === 1) return "touching diagonally";
      return "touching horizontally/vertically";
    }

    return null;
  };

  // Check for rule violations
  const validateBoard = (currentBoard = board) => {
    if (
      !currentBoard ||
      !regions ||
      currentBoard.length === 0 ||
      gameIsWon ||
      loading
    ) {
      return;
    }

    const boardSize = currentBoard.length;
    const errors = [];
    const pairs = [];

    // Find all queens
    const queens = [];
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (currentBoard[r][c] === 2) {
          queens.push({ row: r, col: c, region: regions[r][c] });
        }
      }
    }

    // Check for conflicts
    for (let i = 0; i < queens.length; i++) {
      const q1 = queens[i];

      // Check against other queens
      for (let j = i + 1; j < queens.length; j++) {
        const q2 = queens[j];

        const conflictReason = findConflictReason(q1, q2);

        if (conflictReason) {
          // Add both queens to errors list
          if (!errors.includes(`${q1.row}-${q1.col}`)) {
            errors.push(`${q1.row}-${q1.col}`);
          }
          if (!errors.includes(`${q2.row}-${q2.col}`)) {
            errors.push(`${q2.row}-${q2.col}`);
          }

          // Save the conflict pair for highlighting
          pairs.push({
            cell1: `${q1.row}-${q1.col}`,
            cell2: `${q2.row}-${q2.col}`,
            reason: conflictReason,
          });
        }
      }
    }

    setErrorCells(errors);
    setConflictPairs(pairs);

    // Check win condition
    if (queens.length === boardSize && errors.length === 0) {
      // Count queens in each row, column, and region
      const rowCounts = Array(boardSize).fill(0);
      const colCounts = Array(boardSize).fill(0);
      const regionCounts = Array(boardSize).fill(0);

      for (const q of queens) {
        rowCounts[q.row]++;
        colCounts[q.col]++;
        regionCounts[q.region]++;
      }

      // Check if every row, column, and region has exactly one queen
      if (
        rowCounts.every((c) => c === 1) &&
        colCounts.every((c) => c === 1) &&
        regionCounts.every((c) => c === 1)
      ) {
        // Only trigger win if not already won
        if (!gameIsWon) {
          gameWon();
        }
      }
    }
  };

  // Check if a cell is involved in a conflict
  const getConflictInfo = (row, col) => {
    const cellId = `${row}-${col}`;

    // Find all conflicts involving this cell
    const conflicts = conflictPairs.filter(
      (pair) => pair.cell1 === cellId || pair.cell2 === cellId
    );

    if (conflicts.length === 0) return null;

    return conflicts[0]; // Return the first conflict
  };

  // Handle game win
  const gameWon = () => {
    // Stop the timer
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }

    // Set win time before marking game as won
    setWinTime(timer);

    // Mark game as won to prevent multiple win triggers
    setGameIsWon(true);

    // Show the win modal
    setShowWinModal(true);
  };

  // Format time for display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  // Start a new game
  const newGame = () => {
    setMessage("");
    initializeGame(size);
  };

  // Reset the current game
  const reset = () => {
    if (history.length > 0) {
      // Reset to initial state
      const initialState = history[0];
      setBoard(initialState.board);
      setAutoMarkedCells(initialState.autoMarkedCells);
      setHistory([initialState]);
      setErrorCells([]);
      setConflictPairs([]);
      setMessage("");

      // Reset game won state
      setGameIsWon(false);
    }
  };

  // Any change to the board makes the current hint stale
  useEffect(() => setHint(null), [board]);

  // Like LinkedIn: point out mistakes, or explain the next logical step
  const giveHint = () => {
    if (loading || !solution || gameIsWon) return;
    const next = getHint(
      regions,
      board,
      solution,
      (g) => `the ${REGION_PALETTE[colors[g]] || `region ${g + 1}`} region`
    );
    setHint(next && { ...next, focus: new Set(next.focus) });
  };

  // Carry out what the hint suggests
  const applyHint = () => {
    if (!hint) return;
    saveState();

    let newBoard = board.map((row) => [...row]);
    let newAutoMarkedCells = { ...autoMarkedCells };
    const cellsOf = (keys) => keys.map((key) => key.split("-").map(Number));

    for (const [r, c] of cellsOf(hint.remove)) {
      if (newBoard[r][c] === 2) {
        const result = removeAutoMarkedCells(r, c, newBoard, newAutoMarkedCells);
        newBoard = result.board;
        newAutoMarkedCells = result.autoMarkedCells;
      }
      newBoard[r][c] = 0;
    }
    for (const [r, c] of cellsOf(hint.eliminate)) {
      if (newBoard[r][c] === 0) newBoard[r][c] = 1;
    }
    if (hint.place) {
      const [r, c] = hint.place.split("-").map(Number);
      newBoard[r][c] = 2;
      const result = autoMarkCells(r, c, newBoard, newAutoMarkedCells);
      newBoard = result.board;
      newAutoMarkedCells = result.autoMarkedCells;
    }

    setBoard(newBoard);
    setAutoMarkedCells(newAutoMarkedCells);
    validateBoard(newBoard);
  };

  // Calculate cell size based on board size and screen width
  const getCellSize = () => {
    // Default sizes
    if (size === 6) return "var(--cell-size-small)";
    if (size === 8) return "var(--cell-size-medium)";
    if (size === 10) return "var(--cell-size-large)";
    return "var(--cell-size-medium)";
  };

  // Queen SVG component
  const QueenIcon = ({ color = "black" }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 220 220"
      style={{
        width: "65%",
        height: "65%",
        filter: "drop-shadow(1px 1px 1px rgba(0,0,0,0.3))",
      }}
    >
      <path
        d="M220,98.865c0-12.728-10.355-23.083-23.083-23.083s-23.083,10.355-23.083,23.083c0,5.79,2.148,11.084,5.681,15.14
        l-23.862,21.89L125.22,73.002l17.787-20.892l-32.882-38.623L77.244,52.111l16.995,19.962l-30.216,63.464l-23.527-21.544
        c3.528-4.055,5.671-9.344,5.671-15.128c0-12.728-10.355-23.083-23.083-23.083C10.355,75.782,0,86.137,0,98.865
        c0,11.794,8.895,21.545,20.328,22.913l7.073,84.735H192.6l7.073-84.735C211.105,120.41,220,110.659,220,98.865z"
        fill={color}
        stroke={color === "white" ? "#333" : "none"}
        strokeWidth="1"
      />
    </svg>
  );

  // Win modal component
  const WinModal = () => (
    <div className={`win-modal ${showWinModal ? "show" : ""}`}>
      <div className="win-modal-content">
        <div className="win-modal-header">
          <h2>🎉 Congratulations! 🎉</h2>
          <button
            className="close-button"
            onClick={() => setShowWinModal(false)}
          >
            ×
          </button>
        </div>
        <div className="win-modal-body">
          <p>You've solved the puzzle!</p>
          <p>Your time: {formatTime(winTime)}</p>
          <div className="win-buttons">
            <button
              onClick={() => {
                setShowWinModal(false);
                newGame();
              }}
            >
              New Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="App">
      <h1>Queens Game</h1>

      <div id="message">{message}</div>

      <div id="timer">Time: {formatTime(timer)}</div>

      <div className="controls">
        <div id="difficulty">
          <label htmlFor="size-select">Board Size:</label>
          <select
            id="size-select"
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            // Allow changing size even during loading
          >
            <option value="6">6x6</option>
            <option value="8">8x8</option>
            <option value="10">10x10</option>
          </select>
        </div>
        <button onClick={newGame} disabled={loading}>
          New Game
        </button>
        <button onClick={reset} disabled={loading}>
          Clear
        </button>
        <button onClick={undo} disabled={loading || history.length <= 1}>
          Undo
        </button>
        <button onClick={giveHint} disabled={loading}>
          Hint
        </button>
      </div>

      <div className="toggle-container">
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={autoMarkEnabled}
            onChange={() => setAutoMarkEnabled(!autoMarkEnabled)}
            disabled={loading}
          />
          <span className="toggle-slider"></span>
        </label>
        <span className="toggle-label">Assisted Mode</span>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Generating puzzle...</p>
        </div>
      ) : (
        <div id="game-container">
          {hint && (
            <div className={`hint-banner hint-${hint.kind}`}>
              <p>{hint.message}</p>
              <div className="hint-actions">
                <button onClick={applyHint}>
                  {hint.kind === "mistake" ? "Fix it" : "Apply"}
                </button>
                <button className="hint-dismiss" onClick={() => setHint(null)}>
                  Got it
                </button>
              </div>
            </div>
          )}
          <div className="color-legend">
            {colors.map((color, i) => (
              <div className="legend-item" key={i}>
                <div
                  className="legend-color"
                  style={{ backgroundColor: color }}
                ></div>
                <span>Region {i + 1}</span>
              </div>
            ))}
          </div>

          <div
            id="game-board"
            className={`board-size-${size}`}
            style={{
              gridTemplateColumns: `repeat(${size}, ${getCellSize()})`,
              gridTemplateRows: `repeat(${size}, ${getCellSize()})`,
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => (dragRef.current = null)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {board.map((row, i) =>
              row.map((cell, j) => {
                const isError = errorCells.includes(`${i}-${j}`);
                const conflictInfo = isError ? getConflictInfo(i, j) : null;
                const regionColor =
                  regions[i] && regions[i][j] !== undefined
                    ? colors[regions[i][j]]
                    : "#fff";
                const differs = (r, c) =>
                  regions[r] &&
                  regions[r][c] !== undefined &&
                  regions[r][c] !== regions[i][j];
                const regionEdges = [
                  differs(i - 1, j) ? "edge-top" : "",
                  differs(i, j + 1) ? "edge-right" : "",
                  differs(i + 1, j) ? "edge-bottom" : "",
                  differs(i, j - 1) ? "edge-left" : "",
                ].join(" ");

                // Hint spotlight: dim everything except the cells it's about
                const cellKey = `${i}-${j}`;
                const hintX = hint && hint.eliminate.includes(cellKey);
                const hintQueen = hint && hint.place === cellKey;
                const hintWrong = hint && hint.remove.includes(cellKey);
                const hintClasses = !hint
                  ? ""
                  : [
                      hint.focus.has(cellKey) || hintX || hintQueen
                        ? "hint-focus"
                        : "hint-dim",
                      hintX ? "hint-x" : "",
                      hintQueen ? "hint-queen" : "",
                      hintWrong ? "hint-wrong" : "",
                    ].join(" ");

                return (
                  <div
                    key={`${i}-${j}`}
                    className={`cell ${regionEdges} ${hintClasses} ${
                      isError ? "error" : ""
                    } ${conflictInfo ? "has-tooltip" : ""}`}
                    style={{ backgroundColor: regionColor }}
                    data-cell={`${i}-${j}`}
                    onPointerDown={(e) => handlePointerDown(e, i, j)}
                    title={
                      conflictInfo ? `Conflict: ${conflictInfo.reason}` : ""
                    }
                  >
                    {cell === 1 ? (
                      <span className="mark">X</span>
                    ) : cell === 2 ? (
                      <QueenIcon color="#111" />
                    ) : hintQueen ? (
                      <QueenIcon color="rgba(0, 0, 0, 0.35)" />
                    ) : hintX ? (
                      <span className="mark hint-mark">X</span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <div id="rules">
        <h3>Rules:</h3>
        <p>Place exactly one queen in each row, column, and colored region.</p>
        <p>No two queens may touch horizontally, vertically, or diagonally.</p>
        <p>Click a cell to cycle: Empty → Marked (X) → Queen → Empty</p>
      </div>

      <WinModal />
      <Analytics />
    </div>
  );
}

export default App;
