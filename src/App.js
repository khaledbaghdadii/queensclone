import React, { useState, useEffect } from "react";
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

  // Initialize the game
  useEffect(() => {
    initializeGame(size);

    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [size]);

  const initializeGame = async (boardSize) => {
    setLoading(true);
    setErrorCells([]);
    setConflictPairs([]);
    setMessage("");

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
      try {
        const { newRegions, newSolution } = generatePuzzle(boardSize);

        // Set state
        setRegions(newRegions);
        setSolution(newSolution);
        setBoard(
          Array(boardSize)
            .fill()
            .map(() => Array(boardSize).fill(0))
        );

        startTimer();
        setLoading(false);
      } catch (error) {
        console.error("Error generating puzzle:", error);
        // Retry with a clean slate
        initializeGame(boardSize);
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

  // Check if queens are adjacent (horizontally, vertically, or diagonally)
  const areQueensAdjacent = (row1, col1, row2, col2) => {
    const rowDiff = Math.abs(row1 - row2);
    const colDiff = Math.abs(col1 - col2);

    // Adjacent if they're 1 cell away in any direction (including diagonally)
    return rowDiff <= 1 && colDiff <= 1;
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
    if (timerInterval) clearInterval(timerInterval);

    setTimer(0);
    const interval = setInterval(() => {
      setTimer((prev) => prev + 1);
    }, 1000);

    setTimerInterval(interval);
  };

  // Handle cell click
  const cellClick = (row, col) => {
    if (loading) return;

    // Cycle cell state: empty -> marked -> queen -> empty
    const newBoard = [...board];
    newBoard[row] = [...newBoard[row]];
    newBoard[row][col] = (newBoard[row][col] + 1) % 3;
    setBoard(newBoard);

    // Validate board and check for errors
    validateBoard(newBoard);
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
    if (!currentBoard || !regions || currentBoard.length === 0) return;

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
      let hasError = false;

      // Check against other queens
      for (let j = i + 1; j < queens.length; j++) {
        const q2 = queens[j];

        const conflictReason = findConflictReason(q1, q2);

        if (conflictReason) {
          hasError = true;

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
        gameWon();
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
    if (timerInterval) clearInterval(timerInterval);
    setMessage("Congratulations! You solved the puzzle!");
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
    // Clear all user placements
    const resetBoard = Array(size)
      .fill()
      .map(() => Array(size).fill(0));
    setBoard(resetBoard);
    setErrorCells([]);
    setConflictPairs([]);
    setMessage("");
    startTimer();
  };

  // Give a hint (place a queen correctly from the solution)
  const giveHint = () => {
    if (loading || !solution) return;

    const newBoard = JSON.parse(JSON.stringify(board));
    const boardSize = newBoard.length;

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
        setBoard(newBoard);
        validateBoard(newBoard);
        return;
      }
    }
  };

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
            disabled={loading}
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
        <button onClick={giveHint} disabled={loading}>
          Hint
        </button>
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
                <span>{`Region ${i + 1}`}</span>
              </div>
            ))}
          </div>

          <div
            id="game-board"
            style={{
              gridTemplateColumns: `repeat(${size}, 60px)`,
              gridTemplateRows: `repeat(${size}, 60px)`,
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
                      <span className="queen">♛</span>
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
    </div>
  );
}

export default App;
