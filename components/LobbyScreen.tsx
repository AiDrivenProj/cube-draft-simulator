
import React from 'react';
import { Player, CubeSource } from '../types';
import { useModal } from './ModalSystem';

interface LobbyScreenProps {
  isHost: boolean;
  connectionError: boolean;
  inviteLink: string;
  connectedPlayers: Player[];
  maxPlayers: number;
  myClientId: string;
  loading: boolean;
  cubeSource: CubeSource;
  onExit: () => void;
  onStartDraft: () => void;
  onAddBot: () => void;
  onRemovePlayer: (clientId: string) => void;
  baseTimer: number;
  onUpdateTimer: (time: number) => void;
  networkMode: 'local' | 'online';
  onSwitchToLocal: () => Promise<void>;
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({ 
  isHost, 
  connectionError, 
  inviteLink, 
  connectedPlayers, 
  maxPlayers, 
  myClientId, 
  loading, 
  cubeSource, 
  onExit, 
  onStartDraft, 
  onAddBot, 
  onRemovePlayer,
  baseTimer, 
  onUpdateTimer,
  networkMode,
  onSwitchToLocal
}) => {
  const { showConfirm } = useModal();

  const handleExit = () => {
    showConfirm(
      "Leave Lobby?",
      "Are you sure you want to exit the lobby? You will need to rejoin or create a new room.",
      () => onExit()
    );
  };

  const handleStartDraftClick = () => {
      // Check if Online Mode and Only 1 Human
      const humanPlayers = connectedPlayers.filter(p => !p.isBot);
      if (networkMode === 'online' && humanPlayers.length === 1) {
          showConfirm(
              "Single Player Online?",
              <div className="space-y-4">
                  <p>You are about to start an <b>Online Multiplayer</b> draft, but you are the only human player in the lobby.</p>
                  <p>For a single-player experience with bots, we recommend switching to <b>Local Demo</b> mode for better performance.</p>
                  <p className="text-sm text-slate-400 italic">Alternatively, stay here and copy the invite link to play with friends.</p>
              </div>,
              async () => {
                  // User clicked 'Confirm' (Switch to Local & Start)
                  await onSwitchToLocal();
                  onStartDraft();
              }
          );
          // Note: The ModalSystem confirm button text defaults to "Confirm" / "Cancel".
          // In this context: Confirm = Switch & Start, Cancel = Stay & Invite.
          return;
      }

      onStartDraft();
  };

  const downloadManualList = () => {
    if (cubeSource?.type !== 'manual') return;
    const blob = new Blob([cubeSource.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cube-list-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  return (
    <div className="flex flex-col items-center h-full p-4 overflow-y-auto">
    <div className="max-w-lg w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center shadow-2xl my-auto">
      {!isHost && connectionError ? (
          <div className="animate-fade-in">
              <div className="text-red-500 mb-4"><h2 className="text-xl font-bold">Room Not Found</h2></div>
              <p className="text-slate-400 mb-6">We couldn't connect to the Host.</p>
              <button type="button" onClick={onExit} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all">Create New Draft</button>
          </div>
      ) : (
          <>
              <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-white">Lobby <span className="text-xs font-normal text-slate-500 uppercase tracking-wider ml-2 px-2 py-0.5 border border-slate-600 rounded bg-slate-700/50">{networkMode}</span></h2>
                  <button 
                    type="button" 
                    onClick={handleExit} 
                    className="hidden md:flex bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-200 px-3 py-1 rounded text-xs font-bold border border-slate-600 hover:border-red-800 transition-all items-center gap-1 min-h-[26px]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Exit Room</span>
                  </button>
              </div>
              
              {isHost ? (
                <>
                  {networkMode === 'online' ? (
                      <>
                        <p className="text-slate-400 mb-4">Share this link to invite players.</p>
                        <div className="bg-slate-900 p-4 rounded-lg flex items-center justify-between mb-8 border border-slate-600">
                            <code className="text-blue-400 text-sm truncate mr-4">{inviteLink}</code>
                            <button onClick={() => navigator.clipboard.writeText(inviteLink)} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-white active:bg-blue-600 transition-colors">Copy</button>
                        </div>
                      </>
                  ) : (
                      <div className="mb-6 p-3 bg-blue-900/20 border border-blue-500/30 rounded text-blue-200 text-sm">
                          <p>You are in <b>Local Demo</b> mode.</p>
                          <p className="text-xs opacity-70 mt-1">Multiplayer is disabled. Invite link will not work for others.</p>
                      </div>
                  )}
                </>
              ) : (
                <div className="mb-6">
                    <p className="text-slate-400">Waiting for Host to start...</p>
                    <div className="mt-4 animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                </div>
              )}

              {/* Cube Information Section */}
              {cubeSource && (
                <div className="mb-6 p-4 bg-slate-900/80 rounded-xl border border-blue-500/20 text-left">
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-2">Drafting from Cube:</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        {cubeSource.type === 'cubecobra' ? (
                          <svg className="w-5 h-5 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-bold text-slate-200 truncate">
                        {cubeSource.type === 'cubecobra' ? cubeSource.id : 'Manual Card List'}
                      </span>
                    </div>
                    
                    {cubeSource.type === 'cubecobra' ? (
                      <a 
                        href={`https://cubecobra.com/cube/list/${cubeSource.id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-all font-bold shrink-0 flex items-center gap-1"
                      >
                        View List
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ) : (
                      <button 
                        onClick={downloadManualList}
                        className="text-xs bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg transition-all font-bold shrink-0 flex items-center gap-1"
                      >
                        Download .txt
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Game Settings */}
              <div className="mb-6 bg-slate-700/30 p-4 rounded-xl border border-slate-600/50">
                  <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Pick Timer
                      </h3>
                      <span className={`text-sm font-mono font-bold ${baseTimer > 120 ? 'text-red-400' : 'text-blue-400'}`}>{formatTimer(baseTimer)}</span>
                  </div>
                  
                  {isHost ? (
                      <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-500 font-bold">45s</span>
                          <input 
                            type="range" 
                            min="45" 
                            max="300" 
                            step="15" 
                            value={baseTimer} 
                            onChange={(e) => onUpdateTimer(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                          />
                          <span className="text-[10px] text-slate-500 font-bold">5m</span>
                      </div>
                  ) : (
                      <div className="w-full h-1 bg-slate-600 rounded-full overflow-hidden mt-2">
                          <div className="h-full bg-blue-500" style={{ width: `${((baseTimer - 45) / (300 - 45)) * 100}%` }}></div>
                      </div>
                  )}
                  {isHost && <p className="text-[10px] text-slate-500 mt-2 text-left italic">Timer decreases by ~6% for each card picked.</p>}
              </div>

              <div className="space-y-2 mb-8 text-left bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Players ({connectedPlayers.length}/{maxPlayers})</h3>
                   {isHost && connectedPlayers.length < maxPlayers && (
                     <button onClick={onAddBot} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded-lg font-bold transition-colors">+ Add Bot</button>
                   )}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {connectedPlayers.map((p) => (
                      <div key={p.clientId} className="flex items-center justify-between p-2.5 bg-slate-700/50 rounded-lg border border-slate-600/50">
                          <span className="flex items-center gap-2">
                               <div className={`w-2.5 h-2.5 rounded-full ${p.isBot ? 'bg-indigo-400' : (p.clientId === myClientId ? 'bg-green-400 animate-pulse' : 'bg-blue-400')}`}></div>
                               <span className={`text-sm font-medium ${p.clientId === myClientId ? 'text-white' : 'text-slate-300'}`}>
                                 {p.name} {p.clientId === myClientId && "(You)"}
                               </span>
                               {p.isBot && <span className="text-[9px] font-black uppercase tracking-tighter bg-indigo-900/60 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-700/50 ml-1">BOT</span>}
                          </span>
                          {isHost && p.isBot && (
                              <button 
                                onClick={() => onRemovePlayer(p.clientId)}
                                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-slate-600/50 rounded transition-colors"
                                title="Remove Bot"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                          )}
                      </div>
                  ))}
                </div>
              </div>
              
              {isHost && (
                <button onClick={handleStartDraftClick} disabled={connectedPlayers.length < 2 || loading} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl transition-all shadow-xl active:scale-[0.98]">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        <span>Preparing packs...</span>
                      </div>
                    ) : connectedPlayers.length < 2 ? 'Need at least 2 Players' : 'Start Draft'}
                </button>
              )}
          </>
      )}
    </div>
  </div>
  );
};

export default LobbyScreen;
