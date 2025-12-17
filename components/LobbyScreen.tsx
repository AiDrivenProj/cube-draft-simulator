import React from 'react';
import { Player } from '../types';
import { useModal } from './ModalSystem';

interface LobbyScreenProps {
  isHost: boolean;
  connectionError: boolean;
  inviteLink: string;
  connectedPlayers: Player[];
  maxPlayers: number;
  myClientId: string;
  loading: boolean;
  onExit: () => void;
  onStartDraft: () => void;
  onAddBot: () => void;
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({ isHost, connectionError, inviteLink, connectedPlayers, maxPlayers, myClientId, loading, onExit, onStartDraft, onAddBot }) => {
  const { showConfirm } = useModal();

  const handleExit = () => {
    showConfirm(
      "Leave Lobby?",
      "Are you sure you want to exit the lobby? You will need to rejoin or create a new room.",
      () => onExit()
    );
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
    <div className="max-w-lg w-full bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center">
      {!isHost && connectionError ? (
          <div className="animate-fade-in">
              <div className="text-red-500 mb-4"><h2 className="text-xl font-bold">Room Not Found</h2></div>
              <p className="text-slate-400 mb-6">We couldn't connect to the Host.</p>
              <button type="button" onClick={onExit} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all">Create New Draft</button>
          </div>
      ) : (
          <>
              <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-white">Lobby</h2>
                  <button type="button" onClick={handleExit} className="text-xs bg-red-900/50 hover:bg-red-700 text-red-200 px-3 py-1 rounded border border-red-800">Exit Room</button>
              </div>
              
              {isHost ? (
                <>
                  <p className="text-slate-400 mb-6">Share this link to invite players.</p>
                  <div className="bg-slate-900 p-4 rounded-lg flex items-center justify-between mb-8 border border-slate-600">
                     <code className="text-blue-400 text-sm truncate mr-4">{inviteLink}</code>
                     <button onClick={() => navigator.clipboard.writeText(inviteLink)} className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-white">Copy</button>
                  </div>
                </>
              ) : (
                <div className="mb-6">
                    <p className="text-slate-400">Waiting for Host to start...</p>
                    <div className="mt-4 animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                </div>
              )}

              <div className="space-y-2 mb-8 text-left bg-slate-900/50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="text-xs font-bold text-slate-500 uppercase">Players ({connectedPlayers.length}/{maxPlayers})</h3>
                   {isHost && connectedPlayers.length < maxPlayers && (
                     <button onClick={onAddBot} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded">+ Add Bot</button>
                   )}
                </div>
                {connectedPlayers.map((p) => (
                    <div key={p.clientId} className="flex items-center justify-between p-2 bg-slate-700 rounded border border-slate-600">
                        <span className="flex items-center gap-2">
                             <div className={`w-2 h-2 rounded-full ${p.isBot ? 'bg-indigo-400' : (p.clientId === myClientId ? 'bg-green-400' : 'bg-blue-400')}`}></div>
                             {p.name} {p.clientId === myClientId && "(You)"}
                             {p.isBot && <span className="text-xs bg-indigo-900 text-indigo-300 px-1 rounded ml-2">BOT</span>}
                        </span>
                    </div>
                ))}
              </div>
              
              {isHost && (
                <button onClick={onStartDraft} disabled={connectedPlayers.length < 2 || loading} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg transition-all">
                    {loading ? 'Preparing...' : connectedPlayers.length < 2 ? 'Need at least 2 Players' : 'Start Draft'}
                </button>
              )}
          </>
      )}
    </div>
  </div>
  );
};

export default LobbyScreen;