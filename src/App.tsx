/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  RotateCcw, 
  History, 
  Users, 
  Sword, 
  Shield, 
  ChevronRight, 
  ChevronLeft,
  Info,
  CheckCircle2,
  XCircle,
  Trophy,
  Share2,
  LogOut,
  Globe,
  RefreshCw
} from 'lucide-react';
import { Champion, GameState, DraftMode } from './types.ts';
import { fetchChampions, getChampionImageUrl } from './services/api.ts';
import { LANES_LIST, getLaneForChampion } from './utils/laneMapper.ts';
import { 
  isFirebaseConfigured, 
  createRoom, 
  updateRoom, 
  listenToRoom, 
  checkRoomExists 
} from './services/firebase.ts';

export default function App() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [games, setGames] = useState<GameState[]>([
    { gameNumber: 1, bluePicks: [], redPicks: [] }
  ]);
  const [currentGameIndex, setCurrentGameIndex] = useState(0);
  const [draftMode, setDraftMode] = useState<DraftMode>('global');

  const [activeTeam, setActiveTeam] = useState<'blue' | 'red'>('blue');
  const [showSummary, setShowSummary] = useState(false);

  // Collaborative Room State - Default to "GLOBAL_DRAFT" for single continuous synchronization
  const roomId = "GLOBAL_DRAFT";

  // Initial loads: fetch champions & load backup if offline
  useEffect(() => {
    async function load() {
      const data = await fetchChampions();
      setChampions(data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }
    load();

    if (!isFirebaseConfigured) {
      const backup = localStorage.getItem('fearless_games_backup');
      const indexBackup = localStorage.getItem('fearless_index_backup');
      if (backup) {
        try {
          setGames(JSON.parse(backup));
          if (indexBackup) {
            setCurrentGameIndex(Number(indexBackup));
          }
        } catch (e) {
          console.warn('Lỗi load local storage:', e);
        }
      }
    }
  }, []);

  // Firebase Real-time Subscription for single global board
  useEffect(() => {
    if (!isFirebaseConfigured) return;

    const unsubscribe = listenToRoom(
      roomId,
      (data) => {
        setGames(data.games);
        setCurrentGameIndex(data.currentGameIndex);
        setActiveTeam(data.activeTeam);
      },
      async (err) => {
        // If the document doesn't exist yet, auto initialize once
        if (err.message && err.message.includes("không tồn tại")) {
          console.log("Global draft board does not exist. Initializing shared series...");
          try {
            await createRoom(roomId, [{ gameNumber: 1, bluePicks: [], redPicks: [] }], 0, 'blue');
          } catch (createErr) {
            console.error("Lỗi tự động khởi tạo dữ liệu chung:", createErr);
          }
        } else {
          console.error("Lỗi đồng bộ dữ liệu chung:", err);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // Synchronized state updater
  const updateDraftState = (
    newGames: GameState[],
    newIndex: number = currentGameIndex,
    newTeam: 'blue' | 'red' = activeTeam
  ) => {
    if (isFirebaseConfigured) {
      updateRoom(roomId, {
        games: newGames,
        currentGameIndex: newIndex,
        activeTeam: newTeam
      }).catch(async (err) => {
        console.warn("Lỗi ghi đè database, thử tạo mới:", err);
        try {
          await createRoom(roomId, newGames, newIndex, newTeam);
        } catch (createErr) {
          console.error("Không thể khởi tạo dữ liệu:", createErr);
        }
      });
    } else {
      setGames(newGames);
      setCurrentGameIndex(newIndex);
      setActiveTeam(newTeam);
      localStorage.setItem('fearless_games_backup', JSON.stringify(newGames));
      localStorage.setItem('fearless_index_backup', String(newIndex));
    }
  };

  const handleSelectActiveTeam = (team: 'blue' | 'red') => {
    updateDraftState(games, currentGameIndex, team);
  };

  const allPicksFromPreviousGames = useMemo(() => {
    const previousGames = games.slice(0, currentGameIndex);
    const picks = new Set<string>();
    previousGames.forEach(game => {
      game.bluePicks.forEach(p => picks.add(p));
      game.redPicks.forEach(p => picks.add(p));
    });
    return picks;
  }, [games, currentGameIndex]);

  const filteredChampions = useMemo(() => {
    return champions.filter(champ => 
      champ.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [champions, search]);

  const usedChampionsByLane = useMemo(() => {
    const grouped: Record<'TOP' | 'JNG' | 'MID' | 'ADC' | 'SUP', Champion[]> = {
      TOP: [],
      JNG: [],
      MID: [],
      ADC: [],
      SUP: []
    };

    allPicksFromPreviousGames.forEach(id => {
      const champ = champions.find(c => c.id === id);
      if (champ) {
        const lane = getLaneForChampion(champ);
        grouped[lane].push(champ);
      }
    });

    return grouped;
  }, [allPicksFromPreviousGames, champions]);

  const isPickedInCurrentGame = (champId: string) => {
    const current = games[currentGameIndex];
    return current ? (current.bluePicks.includes(champId) || current.redPicks.includes(champId)) : false;
  };

  const isUnavailable = (champId: string) => {
    return allPicksFromPreviousGames.has(champId);
  };

  const togglePick = (champId: string, team: 'blue' | 'red') => {
    if (isUnavailable(champId)) return;

    const newGames = [...games];
    const current = { ...newGames[currentGameIndex] };
    if (!current) return;
    
    const blueIndex = current.bluePicks.indexOf(champId);
    const redIndex = current.redPicks.indexOf(champId);

    if (blueIndex > -1) {
      current.bluePicks = current.bluePicks.filter(id => id !== champId);
    } else if (redIndex > -1) {
      current.redPicks = current.redPicks.filter(id => id !== champId);
    } else {
      if (team === 'blue' && current.bluePicks.length < 5) {
        current.bluePicks = [...current.bluePicks, champId];
      } else if (team === 'red' && current.redPicks.length < 5) {
        current.redPicks = [...current.redPicks, champId];
      }
    }

    newGames[currentGameIndex] = current;
    updateDraftState(newGames, currentGameIndex, activeTeam);
  };

  const addGame = () => {
    const newGames = [
      ...games,
      { gameNumber: games.length + 1, bluePicks: [], redPicks: [] }
    ];
    updateDraftState(newGames, games.length, activeTeam);
  };

  const deleteGame = (index: number) => {
    if (games.length <= 1) {
      alert('Series phải có ít nhất 1 ván đấu!');
      return;
    }
    if (confirm(`Bạn có chắc muốn xóa Ván G${games[index].gameNumber} không? Các tướng đã chọn trong ván này sẽ được hoàn trả/mở khóa.`)) {
      const updatedGames = games.filter((_, idx) => idx !== index);
      const formattedGames = updatedGames.map((game, idx) => ({
        ...game,
        gameNumber: idx + 1
      }));
      
      let newIndex = currentGameIndex;
      if (currentGameIndex >= formattedGames.length) {
        newIndex = formattedGames.length - 1;
      } else if (currentGameIndex === index && currentGameIndex > 0) {
        newIndex = currentGameIndex - 1;
      }
      
      updateDraftState(formattedGames, newIndex, activeTeam);
    }
  };

  const resetAll = () => {
    if (confirm('Bạn có chắc chắn muốn reset toàn bộ series không? Toàn bộ tướng đã cấm/chọn sẽ được mở khóa lại.')) {
      updateDraftState([{ gameNumber: 1, bluePicks: [], redPicks: [] }], 0, 'blue');
      setSearch('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050608] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin shadow-[0_0_20px_rgba(6,182,212,0.3)]"></div>
          <p className="text-slate-400 font-medium tracking-widest text-xs uppercase">Initializing Draft System...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050608] text-slate-200 font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="h-20 border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sword className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white uppercase italic">Fearless Draft Helper</h1>
                {isFirebaseConfigured ? (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[9px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded-full font-black animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    ĐỒNG BỘ REALTIME
                  </span>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[9px] bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full font-black">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    LƯU MÁY LOCAL
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 font-mono tracking-wider">MODE: REGIONAL PRO FORMAT | S14</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-1 px-1.5">
              <button
                onClick={() => handleSelectActiveTeam('blue')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTeam === 'blue' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Blue Pick
              </button>
              <button
                onClick={() => handleSelectActiveTeam('red')}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTeam === 'red' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Red Pick
              </button>
            </div>

            <div className="hidden md:flex flex-col items-end">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Series Status</p>
              <div className="px-4 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 font-bold text-xs">
                GAME {games.length} - SELECTION
              </div>
            </div>
            
            <button 
              onClick={resetAll}
              className="p-2.5 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10"
              title="Reset Series"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 flex flex-col gap-6">
        {/* Restricted Champions Top Panel */}
        <section className="bg-gradient-to-b from-[#181115] to-[#0c0d12] border-2 border-red-500/50 rounded-2xl p-6 relative overflow-hidden shadow-[0_0_35px_rgba(239,68,68,0.2)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,_rgba(239,68,68,0.1),transparent_75%)] pointer-events-none" />
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/70 to-transparent" />
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping shrink-0" />
                <h3 className="text-2xl font-black text-red-500 tracking-tighter uppercase flex items-center gap-2 italic">
                  CHAMPIONS RESTRICTED (BỂ TƯỚNG ĐÃ KHÓA)
                </h3>
              </div>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono font-black mt-1">
                Các tướng đã sử dụng trong các ván trước • Không thể lựa chọn tiếp tục trong Loạt BO5 này
              </p>
            </div>
            <div className="bg-red-500/10 border border-red-500/40 px-5 py-2.5 rounded-xl text-center shadow-[0_0_20px_rgba(239,68,68,0.15)] shrink-0">
              <span className="text-[9px] text-red-400 font-mono font-black uppercase block tracking-widest leading-none mb-1.5">Đã Khóa Toàn Series</span>
              <span className="text-2xl font-mono font-black text-red-500 leading-none">{allPicksFromPreviousGames.size} CHAMPIONS</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 relative">
            {LANES_LIST.map((lane) => {
              const champs = usedChampionsByLane[lane.key] || [];
              return (
                <div key={lane.key} className="bg-black/45 border border-white/5 rounded-xl p-4.5 flex flex-col gap-3.5 shadow-2xl relative">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base filter drop-shadow-sm">{lane.icon}</span>
                      <div className="text-left">
                        <p className="text-xs font-black text-slate-100 uppercase tracking-wide leading-none">{lane.nameVi}</p>
                        <p className="text-[8px] text-slate-500 font-mono font-black leading-none tracking-widest mt-1">{lane.nameEn.toUpperCase()}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono font-black text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-0.5 rounded-full">
                      {champs.length}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2.5 content-start min-h-[75px]">
                    {champs.map((champ) => (
                      <div 
                        key={champ.id} 
                        className="group relative transition-all duration-300 hover:scale-110 z-10"
                        title={`${champ.name} (${lane.nameVi})`}
                      >
                        <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-red-600/70 shadow-[0_4px_12px_rgba(239,68,68,0.25)] bg-slate-950 transition-all duration-350 hover:border-red-500">
                          <img 
                            src={getChampionImageUrl(champ.id)} 
                            alt={champ.name} 
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                        </div>
                        <div className="text-center mt-1.5 w-16 overflow-hidden">
                          <p className="text-[8px] font-black font-sans text-slate-300 truncate uppercase tracking-wide group-hover:text-red-400 transition-colors">
                            {champ.name}
                          </p>
                        </div>
                      </div>
                    ))}
                    {champs.length === 0 && (
                      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-xl py-6 bg-white/[0.01]">
                        <span className="text-[9px] text-[#4ea3b1] font-mono uppercase tracking-widest font-black">Sẵn Sàng</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Draft Status */}
        <div className="lg:col-span-4 space-y-6">
          {/* Game Selector */}
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            <div className="flex items-center justify-between mb-4 relative">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-cyan-400" />
                Ván đấu (History)
              </h2>
              <button 
                onClick={addGame}
                className="text-[10px] font-black px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-md transition-all shadow-lg active:scale-95"
              >
                + LIÊN TIẾP (NEW)
              </button>
            </div>
            <div className="flex flex-wrap gap-2 relative animate-fade-in">
              {games.map((game, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-black/45 border border-white/5 hover:border-white/15 rounded-xl p-1 transition-all">
                  <button
                    onClick={() => setCurrentGameIndex(idx)}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                      currentGameIndex === idx 
                        ? 'bg-cyan-500/15 text-cyan-400 shadow-inner font-extrabold' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    V{game.gameNumber}
                  </button>
                  {games.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteGame(idx);
                      }}
                      className="p-1 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                      title={`Xóa ván ${game.gameNumber}`}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Current Selection */}
          <div className="space-y-4">
            {/* Blue Side */}
            <div className="bg-blue-900/10 border border-blue-500/20 rounded-2xl p-5 overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Shield className="w-24 h-24 text-blue-500" />
              </div>
              <h3 className="text-blue-400 font-black text-[10px] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                Blue Side Used
              </h3>
              <div className="grid grid-cols-5 gap-2 relative">
                {Array.from({ length: 5 }).map((_, i) => {
                  const champId = games[currentGameIndex].bluePicks[i];
                  const champ = champId ? champions.find(c => c.id === champId) : null;
                  return (
                    <div key={i} className="aspect-square rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center relative shadow-inner">
                      {champ ? (
                        <motion.img 
                          initial={{ scale: 1.1, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          src={getChampionImageUrl(champ.id)} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-900/50" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Red Side */}
            <div className="bg-red-900/10 border border-red-500/20 rounded-2xl p-5 overflow-hidden relative group">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Shield className="w-24 h-24 text-red-500" />
              </div>
              <h3 className="text-red-400 font-black text-[10px] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                Red Side Used
              </h3>
              <div className="grid grid-cols-5 gap-2 relative">
                {Array.from({ length: 5 }).map((_, i) => {
                  const champId = games[currentGameIndex].redPicks[i];
                  const champ = champId ? champions.find(c => c.id === champId) : null;
                  return (
                    <div key={i} className="aspect-square rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center relative shadow-inner">
                      {champ ? (
                        <motion.img 
                          initial={{ scale: 1.1, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          src={getChampionImageUrl(champ.id)} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-900/50" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Guidelines */}
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,_rgba(56,189,248,0.05),transparent_50%)]" />
            <h4 className="font-black text-slate-200 text-xs uppercase tracking-widest mb-3 flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400" />
              Series Info
            </h4>
            <ul className="space-y-2 text-[10px] font-medium text-slate-400 leading-relaxed relative">
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-cyan-500 mt-1 shrink-0" />
                Champions used in previous games are restricted.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-cyan-500 mt-1 shrink-0" />
                Click to pick for BLUE, Right-click to pick for RED.
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-red-500 mt-1 shrink-0" />
                Unavailable champions are marked with a strike.
              </li>
            </ul>
          </div>
        </div>

        {/* Right Column: Champion Grid */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="flex justify-between items-end relative">
            <div className="relative">
              <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">Restricted Pool</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">Series Progress: {allPicksFromPreviousGames.size} Champions Locked</p>
            </div>
            <div className="text-right hidden sm:block">
              <span className="text-5xl font-black text-white/5 font-mono select-none">
                {champions.length - allPicksFromPreviousGames.size} AVL
              </span>
            </div>
          </div>

          {/* Active Picking Selector */}
          <div className="bg-[#111317] border border-cyan-500/30 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg shadow-cyan-500/5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/[0.03] to-red-500/[0.03] pointer-events-none" />
            <div className="text-left relative z-10">
              <span className="text-[9px] text-[#4ea3b1] font-black uppercase tracking-widest block font-mono leading-none">ĐANG THỰC HIỆN CẤM / CHỌN</span>
              <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5 mt-1.5">
                Đội đang kích hoạt tướng
              </h4>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto relative z-10">
              <button
                onClick={() => handleSelectActiveTeam('blue')}
                className={`flex-1 md:flex-initial px-5 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all duration-300 flex items-center justify-center gap-2 border ${
                  activeTeam === 'blue' 
                    ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.4)] scale-105' 
                    : 'bg-black/40 text-slate-500 border-white/10 hover:text-slate-300'
                }`}
              >
                <div className={`w-2 h-2 rounded-full bg-blue-500 ${activeTeam === 'blue' && 'animate-pulse bg-blue-300'}`} />
                🔵 TEAM XANH (BLUE)
              </button>
              <button
                onClick={() => handleSelectActiveTeam('red')}
                className={`flex-1 md:flex-initial px-5 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all duration-300 flex items-center justify-center gap-2 border ${
                  activeTeam === 'red' 
                    ? 'bg-red-600 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)] scale-105' 
                    : 'bg-black/40 text-slate-500 border-white/10 hover:text-slate-300'
                }`}
              >
                <div className={`w-2 h-2 rounded-full bg-red-500 ${activeTeam === 'red' && 'animate-pulse bg-red-300'}`} />
                🔴 TEAM ĐỎ (RED)
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 transition-colors group-focus-within:text-cyan-500" />
            <input
              type="text"
              placeholder="FILTER CHAMPIONS..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all font-black text-xs placeholder:text-slate-600 uppercase tracking-widest"
            />
          </div>

          {/* Champion Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 gap-3 content-start">
            <AnimatePresence mode="popLayout">
              {filteredChampions.map((champ) => {
                const unavailable = isUnavailable(champ.id);
                const bluePicked = games[currentGameIndex].bluePicks.includes(champ.id);
                const redPicked = games[currentGameIndex].redPicks.includes(champ.id);
                
                return (
                  <motion.div
                    layout
                    key={champ.id}
                    className={`relative group flex flex-col gap-1.5 transition-all ${unavailable ? 'opacity-40' : 'opacity-100'}`}
                  >
                    <div 
                      className={`
                        aspect-square rounded-xl overflow-hidden border transition-all duration-300 relative
                        ${bluePicked ? 'border-blue-500 scale-105 shadow-[0_0_20px_rgba(59,130,246,0.3)] z-10' : ''}
                        ${redPicked ? 'border-red-500 scale-105 shadow-[0_0_20px_rgba(239,68,68,0.3)] z-10' : ''}
                        ${!bluePicked && !redPicked ? 'border-white/10 hover:border-white/40' : ''}
                        ${unavailable ? 'cursor-not-allowed grayscale contrast-125 border-red-500/20 bg-slate-900' : 'cursor-pointer'}
                      `}
                    >
                      <img 
                        src={getChampionImageUrl(champ.id)} 
                        alt={champ.name}
                        onClick={() => !unavailable && togglePick(champ.id, activeTeam)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!unavailable) togglePick(champ.id, activeTeam === 'blue' ? 'red' : 'blue');
                        }}
                        className={`w-full h-full object-cover select-none transition-transform duration-500 ${!unavailable && 'group-hover:scale-110'}`}
                      />

                      {/* Overlay indicators */}
                      {unavailable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-red-950/20 backdrop-blur-[0.5px]">
                          <div className="w-7 h-7 bg-red-600/80 rounded-full flex items-center justify-center text-white shadow-lg">
                            <XCircle className="w-5 h-5" />
                          </div>
                        </div>
                      )}

                      {!unavailable && (bluePicked || redPicked) && (
                        <div className={`absolute inset-0 border-2 pointer-events-none ${bluePicked ? 'border-blue-500' : 'border-red-500'}`} />
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="absolute bottom-1 left-0 right-0 text-[7px] text-center font-black uppercase text-white tracking-[0.2em]">
                          {bluePicked || redPicked ? 'SELECTED' : 'SELECT'}
                        </div>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black text-center truncate px-0.5 uppercase tracking-wider ${unavailable ? 'text-slate-600' : 'text-slate-400 group-hover:text-white'}`}>
                      {champ.name}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {filteredChampions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-700">
              <Search className="w-16 h-16 mb-4 opacity-10" />
              <p className="font-mono text-xs tracking-widest uppercase">No target localized in archive</p>
            </div>
          )}
        </div>
      </div>
      </main>

      {/* Mobile Footer helper */}
      <div className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-sm bg-black/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 flex flex-col gap-4 z-50 shadow-2xl">
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl p-1">
          <button
            onClick={() => handleSelectActiveTeam('blue')}
            className={`flex-1 py-2 px-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 border ${
              activeTeam === 'blue' 
                ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]' 
                : 'bg-black/40 text-slate-500 border-white/5 hover:text-slate-300'
            }`}
          >
            🔵 BLUE Pick
          </button>
          <button
            onClick={() => handleSelectActiveTeam('red')}
            className={`flex-1 py-1 px-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all duration-300 flex items-center justify-center gap-1.5 border ${
              activeTeam === 'red' 
                ? 'bg-red-600 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
                : 'bg-black/40 text-slate-500 border-white/5 hover:text-slate-300'
            }`}
          >
            🔴 RED Pick
          </button>
        </div>
        
        <div className="flex justify-around items-center">
          <div className="flex flex-col items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Active Blue</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Active Red</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Used</span>
          </div>
        </div>
      </div>
    </div>
  );
}
