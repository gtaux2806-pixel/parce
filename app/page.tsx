"use client";

import { useState, useEffect, KeyboardEvent, useRef, useMemo } from "react";
import confetti from "canvas-confetti";
import { teamsDatabase } from "../lib/teams";
import { teamsLogos } from "../lib/teamslogos";
import { playerImages } from "../lib/playerimages";

type Player = "X" | "O";

interface CellData {
  owner: Player | null;
  playerName: string | null;
}

type WinData = {
  player: Player | "Draw";
  line?: number[][];
};

interface PendingSelection {
  playerName: string;
  displayPlayer: string;
  validCells: { r: number; c: number }[];
}

const normalizeString = (str: string) => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export default function Home() {
  const [colTeams, setColTeams] = useState<string[]>([]);
  const [rowTeams, setRowTeams] = useState<string[]>([]);
  const [board, setBoard] = useState<CellData[][]>(
    Array(3).fill(null).map(() => Array(3).fill({ owner: null, playerName: null }))
  );
  const [currentPlayer, setCurrentPlayer] = useState<Player>("X");
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [winnerData, setWinnerData] = useState<WinData | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(90);
  const [timerActive, setTimerActive] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);
  const [showTurnIndicator, setShowTurnIndicator] = useState(false);
  const [showClearScoresModal, setShowClearScoresModal] = useState(false);

  const [scores, setScores] = useState({ X: 0, O: 0 });

  const winner = winnerData?.player || null;

  const inputRef = useRef<HTMLInputElement>(null);

  // Load scores on mount
  useEffect(() => {
    const saved = localStorage.getItem("grid-legends-scores");
    if (saved) {
      try {
        setScores(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  const allPlayers = useMemo(() => {
    const playersSet = new Set<string>();
    Object.values(teamsDatabase).forEach(teamPlayers => {
      teamPlayers.forEach(p => playersSet.add(p));
    });
    return Array.from(playersSet).sort();
  }, []);

  const hasGameStarted = useMemo(() => {
    return board.some(row => row.some(cell => cell.owner !== null)) && !winner;
  }, [board, winner]);

  useEffect(() => {
    startNewGame(true);
  }, []);

  useEffect(() => {
    if (!winner && hasGameStarted) {
      setShowTurnIndicator(true);
      const t = setTimeout(() => setShowTurnIndicator(false), 1500);
      return () => clearTimeout(t);
    }
  }, [currentPlayer, winner, hasGameStarted]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasGameStarted) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasGameStarted]);

  useEffect(() => {
    if (searchQuery.trim().length > 1) {
      const normalizedQuery = normalizeString(searchQuery);
      const filtered = allPlayers
        .filter(p => normalizeString(p).includes(normalizedQuery))
        .slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [searchQuery, allPlayers]);

  useEffect(() => {
    setTimeLeft(90);
    if (!winner) {
      setTimerActive(true);
    } else {
      setTimerActive(false);
    }
  }, [currentPlayer, winner]);

  useEffect(() => {
    if (!timerActive || winner) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setErrorMsg(`¡Tiempo agotado! Pierdes tu turno.`);
          setCurrentPlayer((curr) => (curr === "X" ? "O" : "X"));
          setSearchQuery("");
          setSuggestions([]);
          setPendingSelection(null);
          return 90;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timerActive, winner]);

  const isValidBoard = (rows: string[], cols: string[]) => {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const rowPlayers = teamsDatabase[rows[r]]?.map(normalizeString) || [];
        const colPlayers = teamsDatabase[cols[c]]?.map(normalizeString) || [];
        const hasCommon = rowPlayers.some(p => colPlayers.includes(p));
        if (!hasCommon) return false;
      }
    }
    return true;
  };

  const generateSolvableBoard = () => {
    const allTeams = Object.keys(teamsDatabase);
    let attempts = 0;
    
    const sharesPlayer = (t1: string, t2: string) => {
      const p1 = teamsDatabase[t1]?.map(normalizeString) || [];
      const p2 = teamsDatabase[t2]?.map(normalizeString) || [];
      return p1.some(p => p2.includes(p));
    };

    while (attempts < 1000) {
      const shuffled = [...allTeams].sort(() => 0.5 - Math.random());
      const rows = shuffled.slice(0, 3);
      const candidates = allTeams.filter(
        t => !rows.includes(t) && 
        sharesPlayer(t, rows[0]) && 
        sharesPlayer(t, rows[1]) && 
        sharesPlayer(t, rows[2])
      );
      
      if (candidates.length >= 3) {
        const shuffledCandidates = [...candidates].sort(() => 0.5 - Math.random());
        const cols = shuffledCandidates.slice(0, 3);
        return { rows, cols };
      }
      attempts++;
    }
    
    // Ultimate fallback if no perfect board found quickly
    const shuffled = [...allTeams].sort(() => 0.5 - Math.random());
    return { rows: shuffled.slice(0, 3), cols: shuffled.slice(3, 6) };
  };

  useEffect(() => {
    if (winner === "X" || winner === "O") {
      const duration = 15 * 1000;
      const animationEnd = Date.now() + duration;
      const colors = winner === "X" ? ['#f97316', '#fb923c'] : ['#3b82f6', '#60a5fa'];

      const frame = () => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return;

        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: colors
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: colors
        });

        if (winner) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
    return () => {
      confetti.reset();
    };
  }, [winner]);

  const startNewGame = (force = false) => {
    if (!force && hasGameStarted) {
      setShowRestartModal(true);
      return;
    }

    const { rows, cols } = generateSolvableBoard();
    
    setColTeams(cols);
    setRowTeams(rows);
    setBoard(Array(3).fill(null).map(() => Array(3).fill({ owner: null, playerName: null })));
    setCurrentPlayer("X");
    setSearchQuery("");
    setErrorMsg(null);
    setWinnerData(null);
    setPendingSelection(null);
    setSuggestions([]);
    setTimeLeft(90);
    setTimerActive(true);
    confetti.reset();
  };

  const checkWin = (currentBoard: CellData[][]): WinData | null => {
    for (let i = 0; i < 3; i++) {
      if (currentBoard[i][0].owner && currentBoard[i][0].owner === currentBoard[i][1].owner && currentBoard[i][1].owner === currentBoard[i][2].owner) {
        return { player: currentBoard[i][0].owner as Player, line: [[i, 0], [i, 1], [i, 2]] };
      }
      if (currentBoard[0][i].owner && currentBoard[0][i].owner === currentBoard[1][i].owner && currentBoard[1][i].owner === currentBoard[2][i].owner) {
        return { player: currentBoard[0][i].owner as Player, line: [[0, i], [1, i], [2, i]] };
      }
    }
    if (currentBoard[0][0].owner && currentBoard[0][0].owner === currentBoard[1][1].owner && currentBoard[1][1].owner === currentBoard[2][2].owner) {
      return { player: currentBoard[0][0].owner as Player, line: [[0, 0], [1, 1], [2, 2]] };
    }
    if (currentBoard[0][2].owner && currentBoard[0][2].owner === currentBoard[1][1].owner && currentBoard[1][1].owner === currentBoard[2][0].owner) {
      return { player: currentBoard[0][2].owner as Player, line: [[0, 2], [1, 1], [2, 0]] };
    }
    
    const isDraw = currentBoard.every(row => row.every(cell => cell.owner !== null));
    if (isDraw) return { player: "Draw" };

    return null;
  };

  const placePlayer = (r: number, c: number, displayPlayer: string) => {
    const newBoard = board.map(row => [...row]);
    newBoard[r][c] = { owner: currentPlayer, playerName: displayPlayer };
    setBoard(newBoard);
    setErrorMsg(null);
    setPendingSelection(null);
    
    const newWinnerData = checkWin(newBoard);
    if (newWinnerData) {
      setWinnerData(newWinnerData);
      if (newWinnerData.player === "X" || newWinnerData.player === "O") {
        setScores(prev => {
          const next = { ...prev, [newWinnerData.player]: prev[newWinnerData.player as Player] + 1 };
          localStorage.setItem("grid-legends-scores", JSON.stringify(next));
          return next;
        });
      }
    } else {
      setCurrentPlayer(currentPlayer === "X" ? "O" : "X");
    }

    setSearchQuery("");
    setSuggestions([]);
  };

  const handlePlayerSubmit = (playerName: string) => {
    if (winner) return;
    
    const normalizedPlayer = normalizeString(playerName);
    const validCells: { r: number, c: number }[] = [];

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (board[r][c].owner === null) {
          const rowTeam = rowTeams[r];
          const colTeam = colTeams[c];
          
          const rowPlayers = teamsDatabase[rowTeam] || [];
          const colPlayers = teamsDatabase[colTeam] || [];
          
          const inRow = rowPlayers.some(p => normalizeString(p) === normalizedPlayer);
          const inCol = colPlayers.some(p => normalizeString(p) === normalizedPlayer);
          
          if (inRow && inCol) {
            validCells.push({ r, c });
          }
        }
      }
    }

    if (validCells.length > 0) {
      const displayPlayer = allPlayers.find(p => normalizeString(p) === normalizedPlayer) || playerName;
      
      if (validCells.length === 1) {
        placePlayer(validCells[0].r, validCells[0].c, displayPlayer);
      } else {
        setPendingSelection({ playerName, displayPlayer, validCells });
        setErrorMsg(null);
        setSearchQuery("");
        setSuggestions([]);
      }
    } else {
      setErrorMsg(`Incorrecto. '${playerName}' no encaja en ninguna casilla libre.`);
      setCurrentPlayer(currentPlayer === "X" ? "O" : "X");
      setSearchQuery("");
      setSuggestions([]);
      setPendingSelection(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && searchQuery.trim() !== "") {
      const match = suggestions.find(s => normalizeString(s) === normalizeString(searchQuery)) || suggestions[0] || searchQuery;
      handlePlayerSubmit(match);
    }
  };

  if (colTeams.length === 0) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pb-12 font-sans selection:bg-orange-500/30 relative overflow-x-hidden">
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-orange-600/20 blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none z-0" />

      {/* Fixed Header */}
      <header className="fixed top-0 left-0 z-40 w-full bg-slate-950/90 backdrop-blur-lg py-3 px-4 sm:px-6 border-b border-slate-800/80 shadow-2xl flex items-center justify-between">
        {/* Left: Logo */}
        <div className="flex-1 flex justify-start">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-blue-400 tracking-tight drop-shadow-lg truncate">
            Grid de Leyendas
          </h1>
        </div>

        {/* Center: Scoreboard */}
        <div className="hidden md:flex flex-1 justify-center items-center gap-3 lg:gap-4 px-3 lg:px-4 py-1.5 rounded-full bg-slate-900/60 border border-slate-800/80 shadow-inner max-w-fit">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black text-orange-500 drop-shadow-[0_0_10px_rgba(249,115,22,0.3)]">X</span>
              <span className="text-lg font-extrabold text-slate-100">{scores.X}</span>
            </div>
            <div className="h-4 w-[1px] bg-slate-800" />
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black text-blue-500 drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]">O</span>
              <span className="text-lg font-extrabold text-slate-100">{scores.O}</span>
            </div>
          </div>
          {(scores.X > 0 || scores.O > 0) && (
            <>
              <div className="h-4 w-[1px] bg-slate-800" />
              <div className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 whitespace-nowrap">
                👑 {scores.X > scores.O ? 'Líder X' : scores.O > scores.X ? 'Líder O' : 'Empate'}
              </div>
              <button
                onClick={() => setShowClearScoresModal(true)}
                className="text-slate-500 hover:text-red-400 transition-colors ml-1 p-0.5 rounded-full hover:bg-slate-800"
                title="Reiniciar marcador"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Right: Auth placeholders */}
        <div className="flex-1 flex justify-end items-center gap-2 sm:gap-4">
          <button className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white transition-colors">
            Iniciar sesión
          </button>
          <button className="text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3 sm:px-4 py-1.5 rounded-full transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)]">
            Registrarte
          </button>
        </div>
      </header>

      {/* Floating Tu Turno Indicator */}
      {showTurnIndicator && !winner && (
        <div className={`
          fixed top-24 left-1/2 -translate-x-1/2 z-50
          flex items-center gap-4 px-8 py-3 rounded-full backdrop-blur-xl border-2 shadow-2xl transition-all duration-300 animate-[bounce_0.5s_ease-out]
          ${currentPlayer === 'X' 
            ? 'bg-orange-600/90 border-orange-400 text-white shadow-[0_0_50px_rgba(249,115,22,0.6)]' 
            : 'bg-blue-600/90 border-blue-400 text-white shadow-[0_0_50px_rgba(59,130,246,0.6)]'}
        `}>
          <span className="text-3xl font-black drop-shadow-md">{currentPlayer}</span>
          <span className="text-lg uppercase tracking-widest font-black">TU TURNO</span>
        </div>
      )}

      <div className="z-10 flex flex-col items-center w-full max-w-5xl mt-24 sm:mt-28 px-4">
        
        {winner && (
          <div className="mb-6 h-12 flex items-center justify-center">
            <div className="text-3xl font-black bg-gradient-to-r from-amber-300 to-yellow-500 text-transparent bg-clip-text drop-shadow-md animate-bounce">
              {winner === "Draw" ? "¡Es un Empate!" : `¡Ganador: Jugador ${winner}!`}
            </div>
          </div>
        )}

        <div className="w-full flex flex-col md:flex-row gap-10 items-center justify-center">
          
          {/* Board Area */}
          <div className="w-full max-w-2xl aspect-square relative flex-shrink-0">
            <div className="w-full h-full grid grid-cols-4 grid-rows-4 gap-2 md:gap-4 absolute inset-0 z-10">
              <div className="bg-transparent" />
              
              {colTeams.map((team, idx) => (
                <div key={`col-${idx}`} className="flex flex-col items-center justify-center p-2 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-inner aspect-square min-h-0 min-w-0">
                  {teamsLogos[team] && (
                    <img src={teamsLogos[team]} alt={team} className="h-[45%] w-auto max-w-[85%] object-contain mb-1.5 drop-shadow-md" />
                  )}
                  <span className="text-[9px] min-[400px]:text-[11px] sm:text-xs md:text-sm font-bold text-center text-slate-200 leading-none drop-shadow-sm line-clamp-2 max-w-full px-0.5">{team}</span>
                </div>
              ))}

              {rowTeams.map((rowTeam, rIdx) => (
                <div className="contents" key={`row-${rIdx}`}>
                  <div className="flex flex-col items-center justify-center p-2 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-inner aspect-square min-h-0 min-w-0">
                    {teamsLogos[rowTeam] && (
                      <img src={teamsLogos[rowTeam]} alt={rowTeam} className="h-[45%] w-auto max-w-[85%] object-contain mb-1.5 drop-shadow-md" />
                    )}
                    <span className="text-[9px] min-[400px]:text-[11px] sm:text-xs md:text-sm font-bold text-center text-slate-200 leading-none drop-shadow-sm line-clamp-2 max-w-full px-0.5">{rowTeam}</span>
                  </div>
                  
                  {board[rIdx].map((cell, cIdx) => {
                    const isAvailable = cell.owner === null && !winner;
                    const isPendingHere = pendingSelection?.validCells.some(vc => vc.r === rIdx && vc.c === cIdx);
                    
                    return (
                      <div
                        key={`cell-${rIdx}-${cIdx}`}
                        onClick={() => isPendingHere && pendingSelection && placePlayer(rIdx, cIdx, pendingSelection.displayPlayer)}
                        className={`
                          relative flex flex-col items-center justify-center p-2 rounded-xl sm:rounded-2xl
                          transition-all duration-300 overflow-hidden aspect-square min-h-0 min-w-0
                          ${isAvailable && !isPendingHere ? 'bg-slate-800/40 border border-slate-700/50 shadow-sm' : ''}
                          ${!isAvailable && !cell.owner ? 'bg-slate-800/20 border border-slate-800/50' : ''}
                          ${cell.owner === 'X' ? 'bg-gradient-to-br from-orange-900/60 to-orange-800/40 border border-orange-500/50 shadow-[inset_0_0_20px_rgba(249,115,22,0.2)]' : ''}
                          ${cell.owner === 'O' ? 'bg-gradient-to-br from-blue-900/60 to-blue-800/40 border border-blue-500/50 shadow-[inset_0_0_20px_rgba(59,130,246,0.2)]' : ''}
                          ${isPendingHere ? 'cursor-pointer animate-pulse ring-4 ring-amber-500/50 bg-amber-500/20 border-amber-500' : ''}
                        `}
                      >
                        {cell.owner && (
                          <div className="flex flex-col items-center justify-between h-full w-full py-1">
                            {playerImages[cell.playerName || ""] ? (
                              <div className="h-[60%] sm:h-[65%] aspect-square relative mb-1 flex-shrink-0">
                                <img 
                                  src={playerImages[cell.playerName || ""]} 
                                  alt={cell.playerName || ""} 
                                  className="w-full h-full object-cover rounded-full border-2 border-slate-700/80 shadow-md select-none pointer-events-none"
                                />
                                <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-black shadow-md border ${
                                  cell.owner === 'X' 
                                    ? 'bg-orange-500 text-white border-orange-400' 
                                    : 'bg-blue-500 text-white border-blue-400'
                                }`}>
                                  {cell.owner}
                                </span>
                              </div>
                            ) : (
                              <div className="h-[60%] sm:h-[65%] aspect-square relative mb-1 flex-shrink-0">
                                <div className="w-full h-full rounded-full border-2 border-slate-700/80 shadow-md flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                                  <span className="text-xs sm:text-sm font-bold text-slate-400">
                                    {getInitials(cell.playerName || "")}
                                  </span>
                                </div>
                                <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-black shadow-md border ${
                                  cell.owner === 'X' 
                                    ? 'bg-orange-500 text-white border-orange-400' 
                                    : 'bg-blue-500 text-white border-blue-400'
                                }`}>
                                  {cell.owner}
                                </span>
                              </div>
                            )}
                            <span className="text-[9px] min-[400px]:text-[10px] sm:text-xs md:text-sm font-bold text-center text-slate-200 leading-tight line-clamp-2 max-w-full px-1 drop-shadow-md">
                              {cell.playerName}
                            </span>
                          </div>
                        )}
                        {!cell.owner && isPendingHere && pendingSelection && (
                          <div className="w-full h-full flex flex-col items-center justify-between py-1.5 opacity-60 pointer-events-none">
                            {playerImages[pendingSelection.displayPlayer] ? (
                              <div className="h-[60%] sm:h-[65%] aspect-square relative mb-1 flex-shrink-0">
                                <img 
                                  src={playerImages[pendingSelection.displayPlayer]} 
                                  alt={pendingSelection.displayPlayer} 
                                  className="w-full h-full object-cover rounded-full border-2 border-slate-500 shadow-md select-none"
                                />
                                <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-black shadow-md border ${
                                  currentPlayer === 'X' 
                                    ? 'bg-orange-500 text-white border-orange-400' 
                                    : 'bg-blue-500 text-white border-blue-400'
                                }`}>
                                  {currentPlayer}
                                </span>
                              </div>
                            ) : (
                              <div className="h-[60%] sm:h-[65%] aspect-square relative mb-1 flex-shrink-0">
                                <div className="w-full h-full rounded-full border-2 border-slate-500 shadow-md flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                                  <span className="text-xs sm:text-sm font-bold text-slate-400">
                                    {getInitials(pendingSelection.displayPlayer)}
                                  </span>
                                </div>
                                <span className={`absolute -bottom-1 -right-1 flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-black shadow-md border ${
                                  currentPlayer === 'X' 
                                    ? 'bg-orange-500 text-white border-orange-400' 
                                    : 'bg-blue-500 text-white border-blue-400'
                                }`}>
                                  {currentPlayer}
                                </span>
                              </div>
                            )}
                            <span className="text-[9px] min-[400px]:text-[10px] sm:text-xs md:text-sm font-bold text-center text-slate-300 leading-tight line-clamp-2 max-w-full px-1 drop-shadow-md">
                              {pendingSelection.displayPlayer}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {winnerData?.line && (() => {
              const [[r1, c1], [r2, c2], [r3, c3]] = winnerData.line;
              let x1 = 37.5 + (c1 * 25);
              let y1 = 37.5 + (r1 * 25);
              let x2 = 37.5 + (c3 * 25);
              let y2 = 37.5 + (r3 * 25);

              // Diagonal 1: (0,0) -> (2,2)
              if (r1 === 0 && c1 === 0 && r3 === 2 && c3 === 2) {
                x1 = 25; y1 = 25; x2 = 100; y2 = 100;
              }
              // Diagonal 2: (0,2) -> (2,0)
              else if (r1 === 0 && c1 === 2 && r3 === 2 && c3 === 0) {
                x1 = 100; y1 = 25; x2 = 25; y2 = 100;
              }
              // Horizontal win (r1 === r3)
              else if (r1 === r3) {
                x1 = 25; x2 = 100;
              }
              // Vertical win (c1 === c3)
              else if (c1 === c3) {
                y1 = 25; y2 = 100;
              }

              return (
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-50 drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line 
                    x1={x1} 
                    y1={y1} 
                    x2={x2} 
                    y2={y2} 
                    stroke={winnerData.player === 'X' ? '#f97316' : '#3b82f6'} 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                  />
                </svg>
              );
            })()}
          </div>

          {/* Search Area */}
          <div className="w-full max-w-sm flex flex-col relative flex-shrink-0">
            <div className="min-h-16 w-full mb-3 flex items-center justify-center relative z-20">
              {errorMsg && (
                 <div className="w-full bg-red-600/20 border border-red-500 text-red-100 px-5 py-3 rounded-2xl text-base sm:text-lg font-bold shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-[bounce_0.5s_ease-in-out_2] backdrop-blur-md text-center flex items-center justify-center gap-3">
                   <svg className="w-6 h-6 sm:w-8 sm:h-8 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                   <span>{errorMsg}</span>
                 </div>
              )}
            </div>

            {/* Timer component above search bar */}
            <div className={`relative overflow-hidden flex flex-col px-9 py-6 mb-8 bg-slate-900/80 backdrop-blur-md border rounded-[24px] shadow-xl transition-all duration-300 ${timerActive && timeLeft < 15 ? 'border-red-500/80 shadow-[0_0_30px_rgba(239,68,68,0.3)] animate-pulse' : 'border-slate-700/80'}`}>
              <div className="flex items-center justify-between mb-3 z-10 relative">
                <div className="flex items-center gap-4">
                  <svg className={`w-9 h-9 ${timerActive && timeLeft < 15 ? 'text-red-500' : timerActive ? 'text-amber-500 animate-[spin_3s_linear_infinite]' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm sm:text-base font-black text-slate-300 tracking-widest uppercase">
                    {timerActive ? (timeLeft < 15 ? "¡TIEMPO CRÍTICO!" : "TIEMPO RESTANTE") : "INICIAR JUEGO"}
                  </span>
                </div>
                <div className={`text-6xl font-black font-mono tracking-tighter transition-colors duration-300 drop-shadow-md ${
                  timerActive 
                    ? timeLeft < 15 
                      ? 'text-red-500' 
                      : 'text-amber-400' 
                    : 'text-slate-500'
                }`}>
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </div>
              </div>
              {/* Progress bar background */}
              {timerActive && (
                <div className="w-full bg-slate-800 rounded-full h-3 mt-1 relative z-10 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-linear ${timeLeft < 15 ? 'bg-red-500' : 'bg-gradient-to-r from-amber-500 to-orange-500'}`}
                    style={{ width: `${(timeLeft / 90) * 100}%` }}
                  ></div>
                </div>
              )}
            </div>

            <div className="relative group w-full mb-6 z-30">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (!winner && !pendingSelection) setTimerActive(true);
                }}
                onClick={() => {
                  if (!winner && !pendingSelection) setTimerActive(true);
                }}
                onKeyDown={handleKeyDown}
                disabled={!!winner || !!pendingSelection}
                placeholder={winner ? "Juego terminado" : pendingSelection ? "Selecciona en qué casilla colocarlo..." : "Busca un jugador..."}
                className="w-full bg-slate-900/80 backdrop-blur-md border-2 border-amber-500/40 text-white placeholder-slate-400/70 px-5 py-4 rounded-2xl focus:outline-none focus:border-amber-400 transition-all shadow-[0_8px_30px_rgba(245,158,11,0.15)] focus:shadow-[0_8px_40px_rgba(245,158,11,0.3)] text-lg font-medium disabled:opacity-50"
              />
              {!winner && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-wider bg-amber-500/10 px-2 py-1 rounded-md hidden sm:block">
                    Enter ↵
                  </span>
                </div>
              )}
              
              {suggestions.length > 0 && !winner && (
                <div className="absolute top-full mt-2 w-full bg-slate-800/95 backdrop-blur-xl border border-slate-600 rounded-xl shadow-2xl overflow-hidden z-50">
                  {suggestions.map((s, i) => (
                    <div 
                      key={s} 
                      onClick={() => handlePlayerSubmit(s)}
                      className={`px-5 py-3 cursor-pointer text-slate-200 hover:bg-amber-500/20 hover:text-white transition-colors ${i !== suggestions.length - 1 ? 'border-b border-slate-700/50' : ''}`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={() => startNewGame()}
              className="px-8 py-4 bg-slate-800/80 hover:bg-slate-700 border border-slate-600/50 hover:border-slate-500 rounded-2xl text-sm font-bold text-slate-300 hover:text-white transition-all duration-300 shadow-lg hover:shadow-xl backdrop-blur-sm group flex justify-center items-center gap-3 w-full"
            >
              <svg className="w-5 h-5 group-hover:-rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
              REINICIAR PARTIDA
            </button>

            {/* Ranking Placeholder */}
            <div className="mt-8 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 shadow-xl w-full">
              <h3 className="text-lg font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Ranking Global (Top 3)
              </h3>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-amber-400">1</span>
                    <span className="font-semibold text-slate-200">Futbolero99</span>
                  </div>
                  <span className="text-amber-500 font-bold text-sm">142 Victorias</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-slate-400">2</span>
                    <span className="font-semibold text-slate-200">MessiFan</span>
                  </div>
                  <span className="text-slate-400 font-bold text-sm">128 Victorias</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-orange-400">3</span>
                    <span className="font-semibold text-slate-200">LeyendaDT</span>
                  </div>
                  <span className="text-orange-400 font-bold text-sm">95 Victorias</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Custom Restart Modal matching the footer and website aesthetics */}
      {showRestartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl transform transition-all">
            <div className="px-6 pt-8 pb-4 flex flex-col items-center">
              <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/30 mb-4 animate-[pulse_2s_ease-in-out_infinite]">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-100 text-center">
                ¿Reiniciar Partida?
              </h3>
              <p className="text-slate-400 text-sm text-center mt-2 px-4 leading-relaxed">
                Hay una partida en curso. Si reinicias ahora, perderás todo el progreso actual.
              </p>
            </div>
            
            <div className="p-6 bg-slate-950/90 border-t border-slate-800/80 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowRestartModal(false)}
                className="flex-1 px-4 py-3 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 rounded-xl text-sm font-bold text-slate-300 hover:text-white transition-all duration-200"
              >
                CANCELAR
              </button>
              <button
                onClick={() => {
                  setShowRestartModal(false);
                  startNewGame(true);
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 transition-all duration-200"
              >
                SÍ, REINICIAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Clear Scores Modal matching website aesthetics */}
      {showClearScoresModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-slate-900/90 border border-slate-800/80 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl transform transition-all">
            <div className="px-6 pt-8 pb-4 flex flex-col items-center">
              <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center border border-red-500/30 mb-4 animate-[pulse_2s_ease-in-out_infinite]">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-100 text-center">
                ¿Reiniciar Marcador?
              </h3>
              <p className="text-slate-400 text-sm text-center mt-2 px-4 leading-relaxed">
                ¿Estás seguro de que deseas borrar el historial de victorias acumuladas de X y O?
              </p>
            </div>
            
            <div className="p-6 bg-slate-950/90 border-t border-slate-800/80 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setShowClearScoresModal(false)}
                className="flex-1 px-4 py-3 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/50 rounded-xl text-sm font-bold text-slate-300 hover:text-white transition-all duration-200"
              >
                CANCELAR
              </button>
              <button
                onClick={() => {
                  setScores({ X: 0, O: 0 });
                  localStorage.removeItem("grid-legends-scores");
                  setShowClearScoresModal(false);
                }}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-all duration-200"
              >
                SÍ, LIMPIAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
