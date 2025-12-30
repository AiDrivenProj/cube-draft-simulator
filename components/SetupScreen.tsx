
import React, { useState, useEffect } from 'react';
import { Card, CubeSource } from '../types';
import { fetchCubeCobraList, parseCubeList, parseExportedDecklist } from '../services/cubeService';
import { useModal } from './ModalSystem';

interface SetupScreenProps {
  onCreateRoom: (cards: Card[], source: CubeSource, mode: 'local' | 'online') => void;
  onImportDeck: (data: { mainboard: Card[], sideboard: Card[] }) => void;
  loading: boolean;
  loadingMessage: string;
}

type AppMode = 'draft' | 'editor';
type DraftSource = 'cubecobra' | 'upload' | 'paste';
type ImportTab = 'file' | 'paste';
type NetworkMode = 'local' | 'online';

const SetupScreen: React.FC<SetupScreenProps> = ({ onCreateRoom, onImportDeck, loading, loadingMessage }) => {
  const [appMode, setAppMode] = useState<AppMode>('draft');
  const [draftSource, setDraftSource] = useState<DraftSource>('cubecobra');
  const [networkMode, setNetworkMode] = useState<NetworkMode>('online'); // Default to Online for better UX
  
  // Tabs state for Deck Viewer
  const [editorTab, setEditorTab] = useState<ImportTab>('file');
  
  const [cubeId, setCubeId] = useState('');
  
  // Manual List State (Paste Tab)
  const [manualList, setManualList] = useState('');

  // Upload File State (Upload Tab)
  const [uploadedFileContent, setUploadedFileContent] = useState('');
  const [manualFileName, setManualFileName] = useState<string | null>(null);

  // Deck Viewer State
  const [pastedDecklist, setPastedDecklist] = useState(''); 
  
  const [history, setHistory] = useState<string[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localLoadingStatus, setLocalLoadingStatus] = useState('');
  const { showAlert, showError } = useModal();

  useEffect(() => {
    const saved = localStorage.getItem('cube_history');
    if (saved) {
        try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  const addToHistory = (id: string) => {
    const newHistory = [id, ...history.filter(h => h !== id)].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('cube_history', JSON.stringify(newHistory));
  };

  const deleteFromHistory = (e: React.MouseEvent, idToDelete: string) => {
    e.stopPropagation();
    const newHistory = history.filter(h => h !== idToDelete);
    setHistory(newHistory);
    localStorage.setItem('cube_history', JSON.stringify(newHistory));
  };

  const handleManualFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      
      setManualFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
          const text = e.target?.result;
          if (typeof text === 'string') {
              setUploadedFileContent(text); // Store in separate state, do not touch manualList
          }
      };
      reader.readAsText(file);
      event.target.value = '';
  };

  const handleDeckImportUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
          const deckData = parseExportedDecklist(text);
          if (deckData.mainboard.length > 0 || deckData.sideboard.length > 0) {
              onImportDeck(deckData);
          } else {
              showAlert("Empty Deck", "No cards found in the selected file.");
          }
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handlePastedDeckImport = () => {
    if (!pastedDecklist.trim()) {
        showAlert("Empty List", "Please paste a decklist first.");
        return;
    }
    const deckData = parseExportedDecklist(pastedDecklist);
    if (deckData.mainboard.length > 0 || deckData.sideboard.length > 0) {
        onImportDeck(deckData);
    } else {
        showAlert("Invalid Deck", "No cards recognized in the pasted text. Please check the format.");
    }
  };

  const getCleanId = (raw: string) => {
     let clean = raw.trim();
     clean = clean.split('?')[0].split('#')[0];
     if (clean.endsWith('/')) clean = clean.slice(0, -1);
     const parts = clean.split('/');
     return parts[parts.length - 1];
  };

  const handleCreateClick = async () => {
    let cards: Card[] = [];
    let source: CubeSource = null;
    
    setLocalLoading(true);

    try {
      if (draftSource === 'cubecobra') {
          const cleanId = getCleanId(cubeId);
          if (!cleanId) {
              setLocalLoading(false);
              showAlert("Invalid ID", "Please enter a valid CubeCobra ID.");
              return;
          }
          
          setLocalLoadingStatus("Connecting to CubeCobra...");
          cards = await fetchCubeCobraList(cleanId);
          source = { type: 'cubecobra', id: cleanId };
          setLocalLoadingStatus("Validating data...");
          addToHistory(cleanId);
      } else if (draftSource === 'upload') {
          if (!uploadedFileContent.trim()) {
              setLocalLoading(false);
              showAlert("Empty File", "Please upload a valid text file containing card names.");
              return;
          }
          setLocalLoadingStatus("Parsing file...");
          cards = parseCubeList(uploadedFileContent);
          source = { type: 'manual', text: uploadedFileContent };
      } else if (draftSource === 'paste') {
          if (!manualList.trim()) {
              setLocalLoading(false);
              showAlert("Empty List", "Please paste a list of cards.");
              return;
          }
          setLocalLoadingStatus("Parsing list...");
          cards = parseCubeList(manualList);
          source = { type: 'manual', text: manualList };
      }

      // Minimum cards calculation: 2 players * 3 packs * 15 cards = 90 cards
      if (cards.length < 90) {
          setLocalLoading(false);
          showAlert(
              "Cube too small", 
              `The cube only has ${cards.length} cards. A minimum of 90 cards is required to allow at least 2 players to draft (3 packs of 15 cards each).`
          );
          return;
      }
      
      setLocalLoadingStatus("Finalizing room...");
      await onCreateRoom(cards, source, networkMode);
    } catch (e: any) {
        setLocalLoading(false);
        const errorMsg = e?.message || "";
        
        let errorType = "GENERIC_ERROR";
        let errorLabel = "Generic Error";
        let errorColor = "text-amber-500 bg-amber-500/10 border-amber-500/50";
        
        if (errorMsg.includes("NETWORK_ERROR")) {
            errorType = "NETWORK_ERROR";
            errorLabel = "Network Error";
            errorColor = "text-red-500 bg-red-500/10 border-red-500/50";
        } else if (errorMsg.includes("NOT_FOUND")) {
            errorType = "NOT_FOUND";
            errorLabel = "Cube not found";
            errorColor = "text-sky-500 bg-sky-500/10 border-sky-500/50";
        }

        const displayMessage = errorMsg.split(': ').pop() || "An unexpected error occurred.";

        const errorContent = (
            <div className="flex flex-col gap-4">
                <div className={`flex items-center gap-2 px-3 py-1 rounded border w-fit text-[10px] font-black uppercase tracking-widest ${errorColor}`}>
                    {errorLabel}
                </div>
                <div className="text-slate-300 space-y-2">
                    <p>{displayMessage}</p>
                    {errorType === "NETWORK_ERROR" && (
                        <p className="text-xs text-slate-400">Check your internet connection or try again in a few moments.</p>
                    )}
                    {errorType === "NOT_FOUND" && (
                        <p className="text-xs text-slate-400">Ensure the ID is correct and the cube is set to <b>Public</b> on CubeCobra.</p>
                    )}
                </div>
                <div className="pt-2 border-t border-slate-700/50">
                    <p className="text-[10px] text-slate-500 font-mono uppercase font-bold mb-1">Technical Details</p>
                    <div className="bg-slate-950/50 p-2 rounded border border-slate-700/50">
                        <code className="text-[10px] text-slate-400 font-mono break-words block">{errorMsg}</code>
                    </div>
                </div>
            </div>
        );
        showError("Import Failed", errorContent);
    }
  };

  const isAnyLoading = loading || localLoading;

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 animate-fade-in relative overflow-hidden">
      {/* Immersive Loading Overlay */}
      {isAnyLoading && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[100] flex flex-col items-center justify-center p-10 text-center animate-fade-in">
          <div className="relative mb-8">
              <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-2xl animate-pulse"></div>
              <div className="w-20 h-20 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                          <div 
                              key={i} 
                              className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }}
                          ></div>
                      ))}
                  </div>
              </div>
          </div>
          
          <div className="space-y-4 max-w-sm">
              <h3 className="text-3xl font-bold text-white tracking-tight">Gathering Resources</h3>
              <div className="h-1 w-24 bg-blue-600 mx-auto rounded-full"></div>
              <p className="text-slate-400 font-medium text-lg min-h-[1.5em] animate-pulse">
                {localLoadingStatus || loadingMessage || "Fetching cube data..."}
              </p>
              <div className="pt-4">
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-[0.2em]">Please stay on this page</p>
              </div>
          </div>
        </div>
      )}

      <div className={`max-w-md w-full bg-slate-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-slate-700/50 transition-all duration-500 transform overflow-hidden ${isAnyLoading ? 'scale-95 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}>
        
        {/* Top Mode Toggle */}
        <div className="grid grid-cols-2 bg-slate-950/50 p-1 gap-1">
            <button
                onClick={() => setAppMode('draft')}
                className={`py-3 text-sm font-bold uppercase tracking-wider transition-all rounded-lg flex items-center justify-center gap-2 ${appMode === 'draft' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Draft Simulator
            </button>
            <button
                onClick={() => setAppMode('editor')}
                className={`py-3 text-sm font-bold uppercase tracking-wider transition-all rounded-lg flex items-center justify-center gap-2 ${appMode === 'editor' ? 'bg-slate-700 text-white shadow-md' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Deck Viewer
            </button>
        </div>

        <div className="p-8">
            {appMode === 'draft' ? (
                /* DRAFT MODE SECTION */
                <div className="animate-fade-in">
                    <h2 className="text-xl font-bold mb-6 text-center text-white">Create Draft Lobby</h2>

                    {/* Network Mode Selection */}
                    <div className="flex gap-3 mb-6 bg-slate-900/50 p-1.5 rounded-xl border border-slate-700/50">
                        <button
                            onClick={() => setNetworkMode('local')}
                            className={`flex-1 py-2 px-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${networkMode === 'local' ? 'bg-slate-700 text-white shadow-sm ring-1 ring-slate-600' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Local Demo
                        </button>
                        <button
                            onClick={() => setNetworkMode('online')}
                            className={`flex-1 py-2 px-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all flex items-center justify-center gap-1.5 ${networkMode === 'online' ? 'bg-emerald-700 text-white shadow-sm ring-1 ring-emerald-600' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${networkMode === 'online' ? 'bg-emerald-300 animate-pulse' : 'bg-slate-600'}`}></span>
                            With Friends
                        </button>
                    </div>

                    {/* Top Level Tabs: CubeCobra | Upload File | Paste Text */}
                    <div className="flex border-b border-slate-600 mb-6">
                        <button 
                            onClick={() => setDraftSource('cubecobra')} 
                            className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors uppercase tracking-tight ${draftSource === 'cubecobra' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                        >
                            CubeCobra
                        </button>
                        <button 
                            onClick={() => setDraftSource('upload')} 
                            className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors uppercase tracking-tight ${draftSource === 'upload' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                        >
                            Upload File
                        </button>
                        <button 
                            onClick={() => setDraftSource('paste')} 
                            className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors uppercase tracking-tight ${draftSource === 'paste' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                        >
                            Paste Text
                        </button>
                    </div>

                    {draftSource === 'cubecobra' && (
                        <div className="mb-6 animate-fade-in">
                            <label className="block text-sm font-medium text-slate-400 mb-2">CubeCobra ID</label>
                            <div className="relative">
                                <input 
                                  type="text" 
                                  value={cubeId} 
                                  onChange={(e) => setCubeId(e.target.value)} 
                                  placeholder="e.g. pauper_cube" 
                                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-600 focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm transition-all" 
                                />
                                <a 
                                    href={`https://cubecobra.com/cube/list/${cubeId || 'pauper_cube'}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors mt-2 px-1 block w-fit"
                                >
                                    cubecobra.com/cube/list/<b>{cubeId || 'pauper_cube'}</b>
                                </a>
                            </div>
                            
                            {history.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs text-slate-500 mb-2 uppercase font-bold tracking-wider">Recent Cubes</p>
                                    <div className="flex flex-wrap gap-2">
                                        {history.map((histId) => (
                                            <div key={histId} onClick={() => setCubeId(histId)} className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs px-3 py-1 rounded-full cursor-pointer transition-colors border border-slate-600 group">
                                                <span className="font-mono">{histId}</span>
                                                <button onClick={(e) => deleteFromHistory(e, histId)} className="w-4 h-4 rounded-full bg-slate-600 group-hover:bg-slate-500 flex items-center justify-center text-[10px] text-slate-300 hover:text-white transition-colors">✕</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {draftSource === 'upload' && (
                        <div className="mb-6 animate-fade-in">
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Supports standard text lists</label>
                            <div className={`bg-slate-950/50 border-2 border-dashed rounded-xl p-6 text-center flex flex-row items-center justify-between gap-4 transition-colors group ${manualFileName ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-600 hover:border-emerald-500/50'}`}>
                                <div className="flex items-center gap-4 overflow-hidden">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform ${manualFileName ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-emerald-500 group-hover:scale-110'}`}>
                                        {manualFileName ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        )}
                                    </div>
                                    <div className="text-left overflow-hidden">
                                        <p className={`font-bold text-sm truncate ${manualFileName ? 'text-emerald-200' : 'text-white'}`}>{manualFileName || "Select .txt file"}</p>
                                        {manualFileName && <p className="text-[10px] text-emerald-400/70 uppercase font-bold tracking-wider">Ready to process</p>}
                                    </div>
                                </div>
                                <label className={`font-bold py-1.5 px-4 rounded-lg cursor-pointer transition-all shadow-lg text-xs whitespace-nowrap ${manualFileName ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-700 hover:bg-emerald-600 text-white'}`}>
                                    {manualFileName ? 'Change' : 'Browse'}
                                    <input type="file" accept=".txt" className="hidden" onChange={handleManualFileUpload} />
                                </label>
                            </div>
                        </div>
                    )}

                    {draftSource === 'paste' && (
                        <div className="mb-6 animate-fade-in">
                            <textarea 
                                value={manualList} 
                                onChange={(e) => { setManualList(e.target.value); setManualFileName(null); }} 
                                placeholder="1 Lightning Bolt&#10;1 Birds of Paradise..." 
                                className="w-full h-32 bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-xs text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono" 
                            />
                        </div>
                    )}

                    <button 
                        onClick={handleCreateClick} 
                        disabled={isAnyLoading} 
                        className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                        {isAnyLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                <span>Processing...</span>
                            </>
                        ) : 'Create Draft Room'}
                    </button>
                    {networkMode === 'local' && <p className="text-[10px] text-slate-500 text-center mt-2 italic">Local Mode: Multiplayer works only in tabs on this device.</p>}
                </div>
            ) : (
                /* DECK VIEWER MODE SECTION */
                <div className="animate-fade-in">
                    <h2 className="text-xl font-bold mb-4 text-center text-white">Deck Viewer</h2>

                    {/* Import Tabs */}
                    <div className="flex border-b border-slate-600 mb-6">
                        <button 
                            onClick={() => setEditorTab('file')} 
                            className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors uppercase tracking-tight ${editorTab === 'file' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                        >
                            Upload File
                        </button>
                        <button 
                            onClick={() => setEditorTab('paste')} 
                            className={`flex-1 py-2 text-[11px] font-bold border-b-2 transition-colors uppercase tracking-tight ${editorTab === 'paste' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                        >
                            Paste Text
                        </button>
                    </div>

                    {editorTab === 'file' && (
                         <div className="mb-6 animate-fade-in">
                            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">Supported: Arena, MTGO, Cockatrice</label>
                            <div className="bg-slate-950/50 border-2 border-dashed border-slate-600 rounded-xl p-6 text-center flex flex-row items-center justify-between gap-4 hover:border-blue-500/50 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-white font-bold text-sm">Select .txt file</p>
                                    </div>
                                </div>
                                <label className="bg-slate-700 hover:bg-blue-600 text-white font-bold py-1.5 px-4 rounded-lg cursor-pointer transition-all shadow-lg text-xs whitespace-nowrap">
                                    Browse
                                    <input type="file" accept=".txt" className="hidden" onChange={handleDeckImportUpload} />
                                </label>
                            </div>
                        </div>
                    )}

                    {editorTab === 'paste' && (
                        <div className="mb-6 animate-fade-in">
                            <textarea 
                                value={pastedDecklist} 
                                onChange={(e) => setPastedDecklist(e.target.value)} 
                                placeholder="4 Lightning Bolt&#10;20 Mountain" 
                                className="w-full h-24 bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-xs text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono" 
                            />
                            <button 
                                onClick={handlePastedDeckImport}
                                className="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
                            >
                                <span>Load Deck</span>
                            </button>
                        </div>
                    )}

                    <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-center">
                        <p className="text-[10px] text-slate-500 italic">This tool allows you to view or edit a saved deck without starting a lobby.</p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default SetupScreen;
