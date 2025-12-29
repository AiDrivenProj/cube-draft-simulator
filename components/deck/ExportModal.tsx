
import React from 'react';

interface ExportModalProps {
  onExportDetailed: () => void;
  onExportSimple: () => void;
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({ onExportDetailed, onExportSimple, onClose }) => {
  return (
    <div 
        className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in cursor-default"
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'auto' }}
    >
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden p-6 text-center transform transition-all scale-100">
            <h3 className="text-xl font-bold text-white mb-2">Export Decklist</h3>
            <p className="text-slate-400 text-sm mb-6">Choose the format you prefer.</p>
            <div className="flex flex-col gap-3">
                <button 
                    onClick={onExportDetailed} 
                    className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                    <span>Detailed Format</span>
                    <span className="text-[10px] bg-blue-800 px-1.5 py-0.5 rounded text-blue-200 uppercase tracking-wide">Cockatrice / App</span>
                </button>
                <button 
                    onClick={onExportSimple} 
                    className="w-full bg-slate-700 hover:bg-slate-600 active:scale-[0.98] text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg border border-slate-600"
                >
                    <span>Simple Format</span>
                    <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 uppercase tracking-wide">MTGO / Arena</span>
                </button>
            </div>
            <button 
                onClick={onClose} 
                className="mt-6 text-slate-500 hover:text-white text-sm font-medium px-4 py-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
                Cancel
            </button>
        </div>
    </div>
  );
};

export default ExportModal;
