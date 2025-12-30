
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GamePhase, DraftState, Player, Card, NetworkMessage, CubeSource } from '../types';
import { generatePacks } from '../services/cubeService';
import { IMultiplayerService, MultiplayerFactory } from '../services/multiplayerService';
import { useModal } from '../components/ModalSystem';

export const useDraftGame = () => {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [fetchedCards, setFetchedCards] = useState<Card[]>([]);
  const [cubeSource, setCubeSource] = useState<CubeSource>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  
  const [isHost, setIsHost] = useState(false);
  const [myClientId] = useState(() => Math.random().toString(36).substring(2));
  const [connectedPlayers, setConnectedPlayers] = useState<Player[]>([]);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [baseTimer, setBaseTimer] = useState(120);
  
  // Track the selected network mode ('local' or 'online')
  const [networkMode, setNetworkMode] = useState<'local' | 'online'>('local');

  // Use the service abstraction
  const multiplayerRef = useRef<IMultiplayerService | null>(null);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const connectionTimeoutRef = useRef<number | null>(null);
  const joinRetryIntervalRef = useRef<number | null>(null);
  
  // Ref to track if we have already processed the URL hash to avoid loops
  const hasJoinedViaHash = useRef(false);

  // Access Modal System
  const { showConfirm } = useModal();

  // Refs for callbacks to access latest state without re-binding
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const connectedPlayersRef = useRef(connectedPlayers);
  useEffect(() => { connectedPlayersRef.current = connectedPlayers; }, [connectedPlayers]);
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  const cubeSourceRef = useRef(cubeSource);
  useEffect(() => { cubeSourceRef.current = cubeSource; }, [cubeSource]);
  const draftStateRef = useRef(draftState);
  useEffect(() => { draftStateRef.current = draftState; }, [draftState]);

  // Separated cleanup logic from resetToSetup so it can be used by popstate
  const cleanupInternalState = useCallback(() => {
      try {
          if (joinRetryIntervalRef.current) { clearTimeout(joinRetryIntervalRef.current); joinRetryIntervalRef.current = null; }
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
          
          multiplayerRef.current?.disconnect();
          multiplayerRef.current = null;

          setRoomId(null); 
          setConnectionError(false); 
          setFetchedCards([]); 
          setCubeSource(null);
          setConnectedPlayers([]); 
          setDraftState(null); 
          setIsHost(false);
          setLoading(false);
          setBaseTimer(120);
          hasJoinedViaHash.current = false; // Reset hash join tracking
      } catch (err) { 
          console.warn("Minor error during cleanup:", err); 
      }
  }, []);

  const resetToSetup = useCallback(() => {
      cleanupInternalState();
      setPhase(GamePhase.SETUP);
      
      // CRITICAL FIX: Use pushState to clear query params BUT allow back button to work
      if (window.location.protocol !== 'blob:' && window.history && window.history.pushState) {
          window.history.pushState({ phase: GamePhase.SETUP }, '', window.location.pathname);
      }
  }, [cleanupInternalState]);

  // --- BROWSER REFRESH / CLOSE PROTECTION ---
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        // Only protect if we are NOT in the Setup phase
        if (phaseRef.current !== GamePhase.SETUP) {
            e.preventDefault();
            e.returnValue = 'Are you sure you want to leave the active session?'; // Required for some browsers
            return 'Are you sure you want to leave the active session?';
        }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // --- HISTORY API MANAGEMENT & BACK BUTTON PROTECTION ---
  useEffect(() => {
    // If no state exists, establish SETUP as the baseline
    if (!window.history.state) {
        window.history.replaceState({ phase: GamePhase.SETUP }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
        const currentPhase = phaseRef.current;
        const newPhase = event.state?.phase;

        // 1. Define active game phases where we want to prevent accidental exit
        const isGameActive = currentPhase === GamePhase.LOBBY || currentPhase === GamePhase.DRAFT || currentPhase === GamePhase.RECAP;

        // 2. Determine if the navigation is attempting to change the phase
        // If newPhase is the same as currentPhase, it's likely a sub-state change (like closing a modal), which we allow.
        // If newPhase is different (or undefined), it means we are leaving the current screen context.
        const isPhaseChange = newPhase !== currentPhase;

        if (isGameActive && isPhaseChange) {
            // Prevent the navigation visually by pushing the current state back immediately.
            // We use the current phase to "stay" where we are visually.
            window.history.pushState({ phase: currentPhase }, '');
            
            // Show Custom Modal
            showConfirm(
                "Exit Session?",
                React.createElement('div', { className: 'space-y-2' },
                    React.createElement('p', null, "You are about to leave the active session."),
                    React.createElement('p', { className: 'text-sm text-slate-400' }, "This will disconnect you from the room and your draft progress may be lost.")
                ),
                () => {
                    // If confirmed, manually trigger the reset to Setup
                    resetToSetup();
                }
            );
            return;
        }

        // Normal Phase Transition (e.g. sub-state changes or valid navigation if not blocked above)
        if (newPhase) {
            if (newPhase === GamePhase.SETUP) {
                cleanupInternalState();
            }
            setPhase(newPhase);
        } else {
            // Fallback for empty state (e.g. clean load), default to SETUP
            cleanupInternalState();
            setPhase(GamePhase.SETUP);
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [cleanupInternalState, showConfirm, resetToSetup]);

  // Helper to push phase to history
  const transitionToPhase = (newPhase: GamePhase) => {
      window.history.pushState({ phase: newPhase }, '');
      setPhase(newPhase);
  };

  useEffect(() => {
    if (draftState?.isFinished && phase === GamePhase.DRAFT) {
        // Auto transition to RECAP needs history push
        transitionToPhase(GamePhase.RECAP);
    }
  }, [draftState, phase]);

  const executeBotPicks = (state: DraftState) => {
    state.players.forEach((player, seatIndex) => {
      if (!player.isBot || player.hasPicked) return;
      
      const packIndex = state.currentPackIndex[seatIndex];
      if (!state.packs[seatIndex] || !state.packs[seatIndex][packIndex]) return;
      
      const currentPack = state.packs[seatIndex][packIndex];
      if (currentPack.length > 0) {
        const pickIndex = Math.floor(Math.random() * currentPack.length);
        const pickedCard = currentPack[pickIndex];
        player.pool.push(pickedCard);
        player.hasPicked = true;
        state.packs[seatIndex][packIndex] = currentPack.filter(c => c.id !== pickedCard.id);
      }
    });
    return state;
  };

  const processTurn = useCallback((state: DraftState) => {
      const humans = state.players.filter(p => !p.isBot);
      const allPicked = humans.every(p => p.hasPicked);
      
      if (!allPicked) { 
          multiplayerRef.current?.send({ type: 'STATE_UPDATE', state }); 
          return state; 
      }
      
      let newState = executeBotPicks(state);
      newState.players.forEach(p => p.hasPicked = false);
      
      const currentRoundPackIndex = newState.currentPackIndex[0];
      const isCurrentPackEmpty = newState.packs[0][currentRoundPackIndex].length === 0;
      
      if (isCurrentPackEmpty) {
          if (newState.round === 3) { 
              newState.isFinished = true; 
              newState.isActive = false; 
          } else {
              newState.round += 1;
              newState.direction = newState.round % 2 === 0 ? 'right' : 'left';
              newState.currentPackIndex = newState.players.map(() => newState.round - 1);
          }
      } else {
          const totalPlayers = newState.players.length;
          const currentPacksRefs = newState.players.map((_, i) => newState.packs[i][newState.currentPackIndex[i]]);
          
          for (let i = 0; i < totalPlayers; i++) {
              let sourceSeatIndex = newState.direction === 'left' 
                ? (i - 1 + totalPlayers) % totalPlayers 
                : (i + 1) % totalPlayers;
              newState.packs[i][newState.currentPackIndex[i]] = currentPacksRefs[sourceSeatIndex];
          }
      }
      
      multiplayerRef.current?.send({ type: 'STATE_UPDATE', state: newState });
      return newState;
  }, []);

  const handlePlayerDisconnect = useCallback((clientId: string) => {
      const currentPlayers = connectedPlayersRef.current;
      const isLobby = phaseRef.current === GamePhase.LOBBY;
      
      let updatedPlayers: Player[] = [];
      if (isLobby) {
          updatedPlayers = currentPlayers.filter(p => p.clientId !== clientId);
      } else {
          updatedPlayers = currentPlayers.map(p => 
            p.clientId === clientId ? { ...p, isBot: true, name: `${p.name.replace(' (You)', '')} (Bot)` } : p
          );
      }
      
      const remainingHumans = updatedPlayers.filter(p => !p.isBot);
      if (remainingHumans.length === 0) {
          multiplayerRef.current?.disconnect();
          return;
      }

      let amINewHost = false;
      if (!isHostRef.current && remainingHumans[0].clientId === myClientId) {
          amINewHost = true;
          setIsHost(true);
          setNotification("The Host has left. You are now the Host.");
          updatedPlayers = updatedPlayers.map(p => 
            p.clientId === myClientId ? { ...p, name: `${p.name.replace(' (You)', '').replace(' (Host)', '')} (Host)` } : p
          );
      }

      setConnectedPlayers(updatedPlayers);
      const activeHost = isHostRef.current || amINewHost;

      if (activeHost) {
          if (isLobby) {
              multiplayerRef.current?.send({ 
                type: 'LOBBY_UPDATE', 
                players: updatedPlayers, 
                hostId: myClientId, 
                maxPlayers: maxPlayers,
                cubeSource: cubeSourceRef.current,
                baseTimer: baseTimer
              });
          } else {
              setDraftState(prevState => {
                  if (!prevState) return null;
                  let newState = JSON.parse(JSON.stringify(prevState));
                  newState.players = updatedPlayers;
                  return processTurn(newState);
              });
          }
      }
  }, [myClientId, maxPlayers, processTurn, baseTimer]);

  const handleExit = useCallback(() => {
      try { multiplayerRef.current?.send({ type: 'LEAVE', clientId: myClientId }); }
      catch (err) { console.error("Failed to post LEAVE message:", err); }
      finally { resetToSetup(); }
  }, [myClientId, resetToSetup]);

  const handleNetworkMessage = useCallback((msg: NetworkMessage) => {
      if (['LOBBY_UPDATE', 'START_GAME'].includes(msg.type)) {
          // Success! We are connected and receiving data. Stop retrying JOIN and stop error timer.
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
          if (joinRetryIntervalRef.current) { clearTimeout(joinRetryIntervalRef.current); joinRetryIntervalRef.current = null; }
          setConnectionError(false);
      }
      switch (msg.type) {
          case 'LOBBY_UPDATE': 
              setConnectedPlayers(msg.players); 
              if (msg.maxPlayers) setMaxPlayers(msg.maxPlayers); 
              if (msg.cubeSource) setCubeSource(msg.cubeSource);
              if (msg.baseTimer) setBaseTimer(msg.baseTimer);
              break;
          case 'START_GAME': 
              setDraftState(msg.state); 
              // IMPORTANT: When remote start triggers, we must sync history
              if (phaseRef.current !== GamePhase.DRAFT) {
                  window.history.pushState({ phase: GamePhase.DRAFT }, '');
                  setPhase(GamePhase.DRAFT); 
              }
              break;
          case 'STATE_UPDATE': setDraftState(msg.state); break;
          case 'PLAYER_LEFT': setNotification(`${msg.name} left and was replaced by a Bot.`); break;
          case 'LEAVE': handlePlayerDisconnect(msg.clientId); break;
      }
  }, [handlePlayerDisconnect]);

  const handleRemotePick = useCallback((clientId: string, cardId: string) => {
    setDraftState(prevState => {
        if (!prevState) return null;
        const newState = JSON.parse(JSON.stringify(prevState));
        const pIdx = newState.players.findIndex((p: Player) => p.clientId === clientId);
        if (pIdx === -1 || newState.players[pIdx].hasPicked) return prevState;
        const packIdx = newState.currentPackIndex[pIdx];
        const pack = newState.packs[pIdx][packIdx];
        const card = pack.find((c: Card) => c.id === cardId);
        if (card) {
            newState.packs[pIdx][packIdx] = pack.filter((c: Card) => c.id !== cardId);
            newState.players[pIdx].pool.push(card);
            newState.players[pIdx].hasPicked = true;
        }
        return processTurn(newState);
    });
  }, [processTurn]);

  // Handle incoming messages
  const onMessageReceived = useCallback((msg: NetworkMessage) => {
     const activeHost = isHostRef.current;
     if (activeHost && phaseRef.current !== GamePhase.SETUP) {
         if (msg.type === 'PICK_CARD') handleRemotePick(msg.clientId, msg.cardId);
         else if (msg.type === 'JOIN') {
             const currentPlayers = connectedPlayersRef.current;
             // Check if already connected
             if (!currentPlayers.find(p => p.clientId === msg.clientId) && currentPlayers.length < maxPlayers) {
                 const newList = [...currentPlayers, { id: currentPlayers.length, name: msg.name, isBot: false, pool: [], clientId: msg.clientId }];
                 setConnectedPlayers(newList);
                 multiplayerRef.current?.send({ 
                    type: 'LOBBY_UPDATE', 
                    players: newList, 
                    hostId: myClientId, 
                    maxPlayers, 
                    cubeSource: cubeSourceRef.current,
                    baseTimer 
                 });
             } else {
                 // Resend state to existing/rejoining player
                 multiplayerRef.current?.send({ 
                    type: 'LOBBY_UPDATE', 
                    players: currentPlayers, 
                    hostId: myClientId, 
                    maxPlayers, 
                    cubeSource: cubeSourceRef.current,
                    baseTimer
                 });
             }
         } else if (msg.type === 'LEAVE') handlePlayerDisconnect(msg.clientId);
     } else { 
         handleNetworkMessage(msg); 
     }
  }, [phase, handleNetworkMessage, handleRemotePick, handlePlayerDisconnect, myClientId, maxPlayers, baseTimer]);

  const createRoom = useCallback(async (cards: Card[], source: CubeSource, mode: 'local' | 'online' = 'local') => {
    setLoading(true); setLoadingMessage('Initializing Room...');
    setFetchedCards(cards);
    setCubeSource(source);
    setNetworkMode(mode);
    
    const limit = Math.min(16, Math.max(1, Math.floor(cards.length / 45)));
    setMaxPlayers(limit);
    setBaseTimer(120);
    
    // Generate Room ID
    const id = Math.random().toString(36).substring(7);
    setRoomId(id);
    
    // Set Link with Mode param
    const baseUrl = window.location.origin + window.location.pathname;
    setInviteLink(`${baseUrl}#room=${id}&mode=${mode}`);
    
    setIsHost(true);
    setConnectedPlayers([{ id: 0, name: "Host", isBot: false, pool: [], clientId: myClientId }]);
    
    // Initialize Service
    multiplayerRef.current?.disconnect();
    multiplayerRef.current = MultiplayerFactory.getService(mode);
    await multiplayerRef.current.connect(id, onMessageReceived);

    setLoading(false); 
    transitionToPhase(GamePhase.LOBBY);
  }, [myClientId, onMessageReceived]);

  const joinRoom = useCallback(async (id: string, mode: 'local' | 'online') => {
    setRoomId(id); 
    setIsHost(false); 
    setNetworkMode(mode);
    transitionToPhase(GamePhase.LOBBY);
    
    // Reset previous connection attempts
    if (joinRetryIntervalRef.current) clearInterval(joinRetryIntervalRef.current);
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

    multiplayerRef.current?.disconnect();
    multiplayerRef.current = MultiplayerFactory.getService(mode);
    
    // Set timeout for connection failure (Increased to 15s for mobile stability)
    connectionTimeoutRef.current = window.setTimeout(() => { 
        setConnectionError(true); 
        // Stop retrying if we hit the hard timeout
        if (joinRetryIntervalRef.current) clearInterval(joinRetryIntervalRef.current);
    }, 15000); 
    
    await multiplayerRef.current.connect(id, onMessageReceived);
    
    // RETRY LOGIC: Send Join Message repeatedly until we get a LOBBY_UPDATE or timeout
    // This handles race conditions where 'connect' is finished but the socket isn't ready,
    // or if the Host temporarily missed the message.
    const attemptJoin = () => {
        multiplayerRef.current?.send({ 
            type: 'JOIN', 
            clientId: myClientId, 
            name: `Guest ${Math.floor(Math.random() * 1000)}` 
        });
    };
    
    // Immediate attempt
    attemptJoin();
    // Retry every 2 seconds
    joinRetryIntervalRef.current = window.setInterval(attemptJoin, 2000);

  }, [myClientId, onMessageReceived]);

  const updateBaseTimer = useCallback((newTimer: number) => {
    const clamped = Math.max(45, Math.min(300, newTimer));
    setBaseTimer(clamped);
    if (isHost && multiplayerRef.current) {
        multiplayerRef.current.send({
            type: 'LOBBY_UPDATE',
            players: connectedPlayers,
            hostId: myClientId,
            maxPlayers,
            cubeSource,
            baseTimer: clamped
        });
    }
  }, [isHost, connectedPlayers, myClientId, maxPlayers, cubeSource]);

  const switchToLocalMode = useCallback(async () => {
      setNetworkMode('local');
      multiplayerRef.current?.disconnect();
      multiplayerRef.current = MultiplayerFactory.getService('local');
      // Reconnect using the same Room ID but on the Local Service
      if (roomId) {
          await multiplayerRef.current.connect(roomId, onMessageReceived);
      }
  }, [roomId, onMessageReceived]);

  const addBot = useCallback(() => {
      const currentPlayers = connectedPlayersRef.current;
      if (currentPlayers.length >= maxPlayers) return;
      const newList = [...currentPlayers, { id: currentPlayers.length, name: `Bot ${currentPlayers.length + 1}`, isBot: true, pool: [], clientId: `bot-${Date.now()}` }];
      setConnectedPlayers(newList);
      multiplayerRef.current?.send({ 
        type: 'LOBBY_UPDATE', 
        players: newList, 
        hostId: myClientId, 
        maxPlayers, 
        cubeSource: cubeSourceRef.current,
        baseTimer
      });
  }, [maxPlayers, myClientId, baseTimer]);

  const removePlayer = useCallback((clientId: string) => {
      const currentPlayers = connectedPlayersRef.current;
      const newList = currentPlayers.filter(p => p.clientId !== clientId);
      setConnectedPlayers(newList);
      multiplayerRef.current?.send({ 
        type: 'LOBBY_UPDATE', 
        players: newList, 
        hostId: myClientId, 
        maxPlayers, 
        cubeSource: cubeSourceRef.current,
        baseTimer
      });
  }, [maxPlayers, myClientId, baseTimer]);

  const startDraft = useCallback(() => {
    setLoading(true); setLoadingMessage('Generating packs...');
    setTimeout(() => {
        try {
            const packs = generatePacks(fetchedCards, connectedPlayers.length, 3, 15);
            const initialState: DraftState = { 
                isActive: true, 
                round: 1, 
                packSize: 15, 
                players: connectedPlayers, 
                packs, 
                currentPackIndex: Array(connectedPlayers.length).fill(0), 
                direction: 'left', 
                isFinished: false, 
                waitingForPlayers: false,
                baseTimer: baseTimer
            };
            setDraftState(initialState);
            multiplayerRef.current?.send({ type: 'START_GAME', state: initialState });
            transitionToPhase(GamePhase.DRAFT);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, 100);
  }, [connectedPlayers, fetchedCards, baseTimer]);

  const handleLocalPick = (card: Card) => {
      if (!draftState) return;
      const mySeatIndex = draftState.players.findIndex(p => p.clientId === myClientId);
      if (mySeatIndex === -1) return;

      if (!isHost) {
          // Client: Optimistic update then send
          const newState = { ...draftState };
          const p = newState.players[mySeatIndex];
          if (p) p.hasPicked = true;
          setDraftState(newState);
          multiplayerRef.current?.send({ type: 'PICK_CARD', clientId: myClientId, cardId: card.id });
          return;
      }
      
      // Host: Process turn immediately
      setDraftState(prevState => {
          if (!prevState) return null;
          const newState = JSON.parse(JSON.stringify(prevState));
          const packIdx = newState.currentPackIndex[mySeatIndex];
          const pack = newState.packs[mySeatIndex][packIdx];
          if (!pack.find((c: Card) => c.id === card.id)) return prevState;
          newState.packs[mySeatIndex][packIdx] = pack.filter((c: Card) => c.id !== card.id);
          newState.players[mySeatIndex].pool.push(card);
          newState.players[mySeatIndex].hasPicked = true;
          return processTurn(newState);
      });
  };

  const importDeck = useCallback((data: { mainboard: Card[], sideboard: Card[] }) => {
      setLoading(true);
      setLoadingMessage('Loading saved deck...');
      setTimeout(() => {
          const initialState: DraftState = { 
              isActive: false, 
              round: 3, 
              packSize: 15, 
              players: [{ 
                  id: 0, 
                  name: "Shared Deck", 
                  isBot: false, 
                  pool: data.mainboard,
                  sideboard: data.sideboard,
                  clientId: myClientId 
              }], 
              packs: [], 
              currentPackIndex: [], 
              direction: 'left', 
              isFinished: true, 
              waitingForPlayers: false,
              baseTimer: 120
          };
          setDraftState(initialState);
          transitionToPhase(GamePhase.RECAP);
          setLoading(false);
      }, 500);
  }, [myClientId]);

  // Handle URL Hash for Joining and Query Params for Sharing
  useEffect(() => {
    // 1. Check Hash for Room Joining
    const handleHash = () => {
        // Prevent double joining which causes disconnect loops
        if (hasJoinedViaHash.current) return;
        
        const hash = window.location.hash;
        if (hash.includes('room=')) {
            // Robust parsing for various hash formats (e.g. #/room= or #room=)
            const cleanHash = hash.replace(/^#\/?/, ''); // Removes # or #/
            const params = new URLSearchParams(cleanHash.replace(/&amp;/g, '&'));
            
            const room = params.get('room');
            const mode = (params.get('mode') as 'local' | 'online') || 'local';
            
            if (room) {
                hasJoinedViaHash.current = true; // Mark as handled
                joinRoom(room, mode);
            }
        }
    };
    
    // 2. Check Search Params for Shared Decks
    const handleDeckShare = () => {
        const params = new URLSearchParams(window.location.search);
        const deckData = params.get('deck');
        if (deckData) {
            try {
                // Decode: Base64 -> URI encoded -> JSON string
                const json = decodeURIComponent(escape(atob(deckData)));
                const parsed = JSON.parse(json);
                
                // Reconstruct Card objects from simple name arrays
                // Enriched later by DeckView
                const main = (parsed.m || []).map((name: string) => ({ 
                    id: `shared-${Math.random().toString(36).substr(2, 9)}`, 
                    name 
                }));
                const side = (parsed.s || []).map((name: string) => ({ 
                    id: `shared-sb-${Math.random().toString(36).substr(2, 9)}`, 
                    name 
                }));

                if (main.length > 0 || side.length > 0) {
                    importDeck({ mainboard: main, sideboard: side });
                }
            } catch (e) {
                console.error("Failed to parse shared deck:", e);
                setNotification("Invalid shared deck link.");
            }
        }
    };

    window.addEventListener('hashchange', handleHash);
    
    // Execute checks on mount
    handleHash();
    handleDeckShare();

    return () => window.removeEventListener('hashchange', handleHash);
  }, [joinRoom, importDeck]);

  useEffect(() => { if (notification) { const t = setTimeout(() => setNotification(null), 5000); return () => clearTimeout(t); } }, [notification]);

  return { 
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
  };
};
