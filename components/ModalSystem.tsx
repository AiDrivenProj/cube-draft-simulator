import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ModalType = 'alert' | 'confirm' | 'error';

interface ModalOptions {
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void | Promise<void>;
  type?: ModalType;
}

interface ModalContextType {
  showAlert: (title: string, message: React.ReactNode) => void;
  showError: (title: string, message: React.ReactNode) => void;
  showConfirm: (title: string, message: React.ReactNode, onConfirm: () => void | Promise<void>) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ModalOptions>({ title: '', message: '' });

  const closeModal = useCallback(() => setIsOpen(false), []);

  const showAlert = useCallback((title: string, message: React.ReactNode) => {
    setOptions({
      title,
      message,
      type: 'alert',
      confirmText: 'OK',
      onConfirm: () => setIsOpen(false),
    });
    setIsOpen(true);
  }, []);

  const showError = useCallback((title: string, message: React.ReactNode) => {
    setOptions({
      title,
      message,
      type: 'error',
      confirmText: 'Dismiss',
      onConfirm: () => setIsOpen(false),
    });
    setIsOpen(true);
  }, []);

  const showConfirm = useCallback((title: string, message: React.ReactNode, onConfirm: () => void | Promise<void>) => {
    setOptions({
      title,
      message,
      type: 'confirm',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          // We close the modal first to avoid issues with unmounting components
          // that might be triggered by state changes inside onConfirm
          setIsOpen(false);
          await onConfirm();
        } catch (error: any) {
          console.error("Action execution failed:", error);
          // Re-open with error information
          showError("System Error", (
            <div className="space-y-2">
              <p>An unexpected error occurred during this action.</p>
              <div className="bg-red-950/30 p-2 rounded border border-red-500/30 font-mono text-xs text-red-400 overflow-auto max-h-32">
                {error?.message || String(error)}
              </div>
            </div>
          ));
        }
      },
    });
    setIsOpen(true);
  }, [showError]);

  return (
    <ModalContext.Provider value={{ showAlert, showError, showConfirm, closeModal }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-md w-full overflow-hidden scale-100 transition-transform">
            <div className="p-6">
              <h3 className={`text-xl font-bold mb-2 ${options.type === 'error' ? 'text-red-400' : 'text-white'}`}>
                {options.title}
              </h3>
              <div className="text-slate-300 text-sm mb-6">{options.message}</div>
              <div className="flex justify-end gap-3">
                {options.type === 'confirm' && (
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  >
                    {options.cancelText || 'Cancel'}
                  </button>
                )}
                <button
                  onClick={options.onConfirm}
                  className={`px-4 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-transform active:scale-95 ${
                    options.type === 'alert' 
                      ? 'bg-blue-600 hover:bg-blue-500' 
                      : options.type === 'error'
                      ? 'bg-red-600 hover:bg-red-500'
                      : 'bg-emerald-600 hover:bg-emerald-500'
                  }`}
                >
                  {options.confirmText || 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
};