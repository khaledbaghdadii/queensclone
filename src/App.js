import React, { useState, useEffect, useRef } from "react";
import "./App.css";

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

  // Add a ref to track the current generation ID
  const generationIdRef = useRef(0);

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

  // Generate pastel colors for regions
  const generateColors = (size) => {
    const colors = [];
    const hueStep = 360 / size;

    for (let i = 0; i < size; i++) {
      const hue = (i * hueStep) % 360;
      const s = 60 + Math.floor(Math.random() * 20);
      const l = 75 + Math.floor(Math.random() * 15);
      colors.push(`hsl(${hue}, ${s}%, ${l}%)`);
    }

    return colors;
  };

  // Fisher-Yates shuffle algorithm
  const shuffleArray = (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  // Generate regions for the board
  const generateRegions = (boardSize) => {
    // Initialize all cells to -1 (unassigned)
    let regionBoard = Array(boardSize)
      .fill()
      .map(() => Array(boardSize).fill(-1));

    // Create region seeds (one per region)
    for (let i = 0; i < boardSize; i++) {
      let row, col;
      do {
        row = Math.floor(Math.random() * boardSize);
        col = Math.floor(Math.random() * boardSize);
      } while (regionBoard[row][col] !== -1);

      regionBoard[row][col] = i;
    }

    // Grow regions until all cells are assigned
    while (regionBoard.some((row) => row.some((cell) => cell === -1))) {
      // For each region, try to grow it
      for (let regionId = 0; regionId < boardSize; regionId++) {
        // Find all cells of this region
        const regionCells = [];
        for (let r = 0; r < boardSize; r++) {
          for (let c = 0; c < boardSize; c++) {
            if (regionBoard[r][c] === regionId) {
              regionCells.push({ row: r, col: c });
            }
          }
        }

        // For each cell in this region, try to grow to adjacent unassigned cells
        for (const { row, col } of regionCells) {
          // Try in all four directions
          const directions = [
            { dr: -1, dc: 0 },
            { dr: 1, dc: 0 },
            { dr: 0, dc: -1 },
            { dr: 0, dc: 1 },
          ];

          for (const { dr, dc } of directions) {
            const newRow = row + dr;
            const newCol = col + dc;

            // Check if valid and unassigned
            if (
              newRow >= 0 &&
              newRow < boardSize &&
              newCol >= 0 &&
              newCol < boardSize &&
              regionBoard[newRow][newCol] === -1
            ) {
              regionBoard[newRow][newCol] = regionId;
              // Only grow one cell at a time (prevents one region from growing too fast)
              break;
            }
          }
        }
      }
    }

    return regionBoard;
  };

  // Check if queen placement is valid
  const isValidPlacement = (testBoard, row, col, testRegions) => {
    const boardSize = testBoard.length;

    // Check row
    for (let j = 0; j < boardSize; j++) {
      if (testBoard[row][j] === 2) return false;
    }

    // Check column
    for (let i = 0; i < boardSize; i++) {
      if (testBoard[i][col] === 2) return false;
    }

    // Check adjacency (including diagonal adjacency)
    for (
      let i = Math.max(0, row - 1);
      i <= Math.min(boardSize - 1, row + 1);
      i++
    ) {
      for (
        let j = Math.max(0, col - 1);
        j <= Math.min(boardSize - 1, col + 1);
        j++
      ) {
        // Skip the cell itself
        if (i === row && j === col) continue;

        if (testBoard[i][j] === 2) {
          return false;
        }
      }
    }

    // Check region constraint
    const currentRegion = testRegions[row][col];
    for (let i = 0; i < boardSize; i++) {
      for (let j = 0; j < boardSize; j++) {
        if (testBoard[i][j] === 2 && testRegions[i][j] === currentRegion) {
          return false;
        }
      }
    }

    return true;
  };

  // Generate a complete solution
  const generateSolution = (testRegions) => {
    const boardSize = testRegions.length;
    const solutionBoard = Array(boardSize)
      .fill()
      .map(() => Array(boardSize).fill(0));

    // Solve using backtracking
    const solve = (row) => {
      if (row >= boardSize) return true;

      // Try each column in the current row
      const cols = shuffleArray([...Array(boardSize).keys()]);

      for (const col of cols) {
        if (isValidPlacement(solutionBoard, row, col, testRegions)) {
          solutionBoard[row][col] = 2; // Place queen

          if (solve(row + 1)) return true;

          solutionBoard[row][col] = 0; // Backtrack
        }
      }

      return false;
    };

    // Start solving from the first row
    if (solve(0)) {
      return solutionBoard;
    }

    return null; // No solution exists
  };

  // Check if the puzzle has a unique solution
  const hasUniqueSolution = (testRegions) => {
    const boardSize = testRegions.length;
    let solutionCount = 0;
    let firstSolution = null;

    const tempBoard = Array(boardSize)
      .fill()
      .map(() => Array(boardSize).fill(0));

    const countSolutions = (row) => {
      if (solutionCount > 1) return; // Early exit if multiple solutions found

      if (row >= boardSize) {
        solutionCount++;
        if (solutionCount === 1) {
          // Save the first solution
          firstSolution = JSON.parse(JSON.stringify(tempBoard));
        }
        return;
      }

      for (let col = 0; col < boardSize; col++) {
        if (isValidPlacement(tempBoard, row, col, testRegions)) {
          tempBoard[row][col] = 2; // Place queen
          countSolutions(row + 1);
          tempBoard[row][col] = 0; // Remove queen
        }
      }
    };

    countSolutions(0);

    return {
      isUnique: solutionCount === 1,
      solution: firstSolution,
    };
  };

  // Generate a puzzle with a unique solution
  const generatePuzzle = (boardSize) => {
    // Generate regions
    let newRegions;
    let uniqueInfo;

    // Keep generating regions until we find one with a unique solution
    let attempts = 0;
    do {
      if (attempts > 10) {
        throw new Error(
          "Could not generate a puzzle with a unique solution after 10 attempts"
        );
      }

      newRegions = generateRegions(boardSize);
      uniqueInfo = hasUniqueSolution(newRegions);
      attempts++;
    } while (!uniqueInfo.isUnique);

    return {
      newRegions,
      newSolution: uniqueInfo.solution,
    };
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

    const newHistory = [...history];
    newHistory.pop(); // Remove current state
    const previousState = newHistory[newHistory.length - 1];

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

      // Restart timer
      startTimer();
    }
  };

  // Give a hint (place a queen correctly from the solution)
  const giveHint = () => {
    if (loading || !solution || gameIsWon) return;

    // Save current state for undo
    saveState();

    const newBoard = JSON.parse(JSON.stringify(board));
    const boardSize = newBoard.length;
    let newAutoMarkedCells = { ...autoMarkedCells };

    // Find rows without queens
    const rowsWithoutQueens = [];
    for (let r = 0; r < boardSize; r++) {
      let hasQueen = false;
      for (let c = 0; c < boardSize; c++) {
        if (newBoard[r][c] === 2) {
          hasQueen = true;
          break;
        }
      }
      if (!hasQueen) {
        rowsWithoutQueens.push(r);
      }
    }

    // If no empty rows, provide a message
    if (rowsWithoutQueens.length === 0) {
      setMessage("All rows have queens. Check for conflicts.");
      return;
    }

    // Randomly select a row without a queen
    const randomRow =
      rowsWithoutQueens[Math.floor(Math.random() * rowsWithoutQueens.length)];

    // Place a queen from the solution
    for (let c = 0; c < boardSize; c++) {
      if (solution[randomRow][c] === 2) {
        newBoard[randomRow][c] = 2;

        // Auto-mark cells for this queen
        if (autoMarkEnabled) {
          const result = autoMarkCells(
            randomRow,
            c,
            newBoard,
            newAutoMarkedCells
          );
          newAutoMarkedCells = result.autoMarkedCells;

          // Copy the auto-marked cells
          for (const queenKey in result.autoMarkedCells) {
            for (const cellKey of result.autoMarkedCells[queenKey]) {
              const [r, c] = cellKey.split("-").map(Number);
              if (newBoard[r][c] === 0) {
                // Only mark if cell is empty
                newBoard[r][c] = 1;
              }
            }
          }
        }

        setBoard(newBoard);
        setAutoMarkedCells(newAutoMarkedCells);
        validateBoard(newBoard);
        return;
      }
    }
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
          Reset
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
          >
            {board.map((row, i) =>
              row.map((cell, j) => {
                const isError = errorCells.includes(`${i}-${j}`);
                const conflictInfo = isError ? getConflictInfo(i, j) : null;
                const regionColor =
                  regions[i] && regions[i][j] !== undefined
                    ? colors[regions[i][j]]
                    : "#fff";

                return (
                  <div
                    key={`${i}-${j}`}
                    className={`cell ${isError ? "error" : ""} ${
                      conflictInfo ? "has-tooltip" : ""
                    }`}
                    style={{ backgroundColor: regionColor }}
                    onClick={() => cellClick(i, j)}
                    title={
                      conflictInfo ? `Conflict: ${conflictInfo.reason}` : ""
                    }
                  >
                    {cell === 1 ? (
                      <span className="mark">X</span>
                    ) : cell === 2 ? (
                      <QueenIcon color="#111" />
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
    </div>
  );
}

export default App;
