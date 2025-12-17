import React, { useState, useEffect } from 'react';
import { Card } from '../types';
import { fetchCubeCobraList, parseCubeList } from '../services/cubeService';
import { useModal } from './ModalSystem';

interface SetupScreenProps {
  onCreateRoom: (cards: Card[]) => void;
  loading: boolean;
  loadingMessage: string;
}

const SetupScreen: React.FC<SetupScreenProps> = ({ onCreateRoom, loading, loadingMessage }) => {
  const [importMode, setImportMode] = useState<'cubecobra' | 'manual'>('cubecobra');
  const [cubeId, setCubeId] = useState('');
  const [manualList, setManualList] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const { showAlert } = useModal();

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') setManualList(text);
    };
    reader.readAsText(file);
    event.target.value = '';
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
    if (importMode === 'cubecobra') {
        const cleanId = getCleanId(cubeId);
        if (!cleanId) {
            showAlert("Invalid ID", "Please enter a valid CubeCobra ID.");
            return;
        }
        
        try {
            cards = await fetchCubeCobraList(cleanId);
            addToHistory(cleanId);
        } catch (e: any) {
            const technicalError = e?.message || "Unknown error occurred";
            
            const errorContent = (
                <div className="flex flex-col gap-4">
                    <div className="text-slate-300 space-y-2">
                        <p>We couldn't retrieve the list for <strong>{cleanId}</strong>.</p>
                        <p>Please check the following:</p>
                        <ul className="list-disc pl-5 text-sm space-y-1 text-slate-400">
                            <li>The Cube ID is correct.</li>
                            <li>The cube is set to <strong>Public</strong> on CubeCobra.</li>
                            <li>CubeCobra is currently online.</li>
                        </ul>
                    </div>
                    
                    <div className="pt-2 border-t border-slate-700/50">
                        <p className="text-[10px] text-slate-500 font-mono uppercase font-bold mb-1">Technical Details</p>
                        <div className="bg-slate-950/50 p-2 rounded border border-slate-700/50">
                            <code className="text-xs text-red-400 font-mono break-words block">
                                {technicalError}
                            </code>
                        </div>
                    </div>
                </div>
            );

            showAlert("Import Failed", errorContent);
            return;
        }
    } else {
        if (!manualList.trim()) {
            showAlert("Empty List", "Please paste a list or upload a file.");
            return;
        }
        cards = parseCubeList(manualList);
    }

    if (cards.length < 45) {
        showAlert("Cube Too Small", `Cube is too small (${cards.length} cards). Minimum 45 required.`);
        return;
    }
    onCreateRoom(cards);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 animate-fade-in">
    <div className="max-w-md w-full bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
      <h2 className="text-2xl font-bold mb-6 text-center text-white">Start a New Draft</h2>
      <div className="flex border-b border-slate-600 mb-6">
          <button onClick={() => setImportMode('cubecobra')} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${importMode === 'cubecobra' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>CubeCobra ID</button>
          <button onClick={() => setImportMode('manual')} className={`flex-1 py-2 text-sm font-bold border-b-2 transition-colors ${importMode === 'manual' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>Manual List</button>
      </div>

      {importMode === 'cubecobra' && (
          <div className="mb-6 animate-fade-in">
            <label className="block text-sm font-medium text-slate-400 mb-2">CubeCobra ID</label>
            <div className="relative">
                <input type="text" value={cubeId} onChange={(e) => setCubeId(e.target.value)} placeholder="e.g. pauper_cube" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono" />
                <div className="text-[10px] text-slate-500 mt-1">cubecobra.com/cube/list/<b>{cubeId || 'pauper_cube'}</b></div>
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

      {importMode === 'manual' && (
          <div className="mb-6 animate-fade-in">
            <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-slate-400">Card List</label>
                <label className="cursor-pointer flex items-center gap-1 text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded transition-colors border border-slate-600">
                    Upload .txt <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
                </label>
            </div>
            <textarea value={manualList} onChange={(e) => setManualList(e.target.value)} placeholder="# mainboard&#10;Lightning Bolt..." className="w-full h-48 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 text-xs text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none font-mono" />
          </div>
      )}

      <button onClick={handleCreateClick} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2">
        {loading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>}
        {loading ? 'Processing...' : 'Create Room'}
      </button>
      {loading && loadingMessage && <p className="text-center text-xs text-slate-400 mt-4 animate-pulse">{loadingMessage}</p>}
    </div>
  </div>
  );
};

export default SetupScreen;