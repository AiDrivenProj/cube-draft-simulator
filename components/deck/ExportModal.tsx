
import React from 'react';

interface ExportModalProps {
  onExportDetailed: () => void;
  onExportSimple: () => void;
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ onExportDetailed, onExportSimple, onClose }) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden p-6 text-center">
            <h3 className="text-xl font-bold text-white mb-2">Export Decklist</h3>
            <p className="text-slate-400 text-sm mb-6">Choose the format you prefer.</p>
            <div className="flex flex-col gap-3">
                <button 
                onClick={onExportDetailed} 
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <span>Detailed Format</span>
                    <span className="text-[10px] bg-blue-800 px-1.5 py-0.5 rounded text-blue-200">Cockatrice / App</span>
                </button>
                <button 
                onClick={onExportSimple} 
                className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    <span>Simple Format</span>
                    <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400">MTGO / Arena</span>
                </button>
            </div>
            <button onClick={onClose} className="mt-4 text-slate-500 hover:text-white text-sm">Cancel</button>
        </div>
    </div>
  );
};

export default ExportModal;
