
import React from 'react';
import { GamePhase } from './types';
import SetupScreen from './components/SetupScreen';
import LobbyScreen from './components/LobbyScreen';
import DraftView from './components/DraftView';
import DeckView from './components/DeckView';
import { useDraftGame } from './hooks/useDraftGame';

function App() {
  const {
      phase,
      draftState,
      cubeSource,
      loading,
      loadingMessage,
      inviteLink,
      isHost,
      connectedPlayers,
      maxPlayers,
      myClientId,
      notification,
      setNotification,
      connectionError,
      createRoom,
      handleExit,
      startDraft,
      addBot,
      removePlayer,
      handleLocalPick,
      resetToSetup,
      importDeck,
      baseTimer,
      updateBaseTimer,
      networkMode,
      switchToLocalMode
  } = useDraftGame();

  const mySeatIndex = draftState?.players.findIndex(p => p.clientId === myClientId) ?? -1;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans relative">
      {notification && (
          <div className="fixed top-20 right-4 z-[100] max-w-sm w-full bg-slate-800 border-l-4 border-yellow-500 rounded shadow-2xl p-4 flex items-start gap-3 animate-fade-in-left">
              <div className="text-yellow-500"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
              <div className="flex-1"><p className="text-sm text-white font-medium">{notification}</p></div>
              <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
      )}

      <nav className="border-b border-slate-700 bg-slate-950 p-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer group" onClick={() => phase !== GamePhase.SETUP && !isHost && resetToSetup()}>
             <div className="w-9 h-9 relative flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-600 to-blue-600 rounded-lg shadow-lg border border-white/10 group-hover:scale-105 transition-transform overflow-hidden">
                {/* Custom Isometric Cube Logo */}
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white drop-shadow-md">
                    <path d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="url(#logoGrad)"/>
                    <path d="M12 3V12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M12 12L20 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <path d="M12 12L4 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    <defs>
                        <linearGradient id="logoGrad" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
                        <stop stopColor="rgba(255,255,255,0.2)" />
                        <stop offset="1" stopColor="rgba(255,255,255,0)" />
                        </linearGradient>
                    </defs>
                </svg>
             </div>
             <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-none">Cube & Deck</h1>
             </div>
          </div>
          <div className="text-sm text-slate-400 font-medium">
            {phase === GamePhase.DRAFT && "Drafting"}
            {phase === GamePhase.RECAP && "Deck Builder"}
            {phase === GamePhase.LOBBY && "Lobby"}
            {phase === GamePhase.SETUP && "Welcome"}
          </div>
        </div>
      </nav>

      <main className="h-[calc(100vh-69px)]">
        {phase === GamePhase.SETUP && (
          <SetupScreen onCreateRoom={createRoom} onImportDeck={importDeck} loading={loading} loadingMessage={loadingMessage} />
        )}
        {phase === GamePhase.LOBBY && (
          <LobbyScreen 
            isHost={isHost} 
            connectionError={connectionError} 
            inviteLink={inviteLink} 
            connectedPlayers={connectedPlayers} 
            maxPlayers={maxPlayers} 
            myClientId={myClientId} 
            loading={loading} 
            cubeSource={cubeSource}
            onExit={handleExit} 
            onStartDraft={startDraft} 
            onAddBot={addBot} 
            onRemovePlayer={removePlayer}
            baseTimer={baseTimer}
            onUpdateTimer={updateBaseTimer}
            networkMode={networkMode}
            onSwitchToLocal={switchToLocalMode}
          />
        )}
        {phase === GamePhase.DRAFT && draftState && (
          <div className="h-full p-4">
            {mySeatIndex !== -1 ? (
              <DraftView 
                draftState={draftState} 
                onPick={handleLocalPick} 
                userSeatIndex={mySeatIndex} 
                onExit={handleExit}
                myClientId={myClientId} 
              />
            ) : (
              <div className="text-center text-red-400 mt-10">Error: Player not found in draft state.</div>
            )}
          </div>
        )}
        {phase === GamePhase.RECAP && draftState && (
          <div className="h-full">
            <DeckView 
              draftState={draftState} 
              myClientId={myClientId} 
              onProceed={() => resetToSetup()} 
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
