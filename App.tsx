import React from 'react';
import { GamePhase } from './types';
import SetupScreen from './components/SetupScreen';
import LobbyScreen from './components/LobbyScreen';
import DraftView from './components/DraftView';
import RecapView from './components/RecapView';
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
      handleLocalPick,
      resetToSetup,
      importDeck,
      baseTimer,
      updateBaseTimer
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

      <nav className="border-b border-slate-700 bg-slate-950 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => phase !== GamePhase.SETUP && !isHost && resetToSetup()}>
             <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-md"></div>
             <h1 className="text-xl font-bold tracking-tight">CubeDraft Simulator</h1>
          </div>
          <div className="text-sm text-slate-400">
            {phase === GamePhase.DRAFT && "Draft in Progress"}
            {phase === GamePhase.RECAP && "Deck Building"}
            {phase === GamePhase.LOBBY && "Lobby"}
            {phase === GamePhase.SETUP && "Welcome"}
          </div>
        </div>
      </nav>

      <main className="h-[calc(100vh-65px)]">
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
            baseTimer={baseTimer}
            onUpdateTimer={updateBaseTimer}
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
            <RecapView 
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