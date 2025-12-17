import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ModalType = 'alert' | 'confirm';

interface ModalOptions {
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  type?: ModalType;
}

interface ModalContextType {
  showAlert: (title: string, message: React.ReactNode) => void;
  showConfirm: (title: string, message: React.ReactNode, onConfirm: () => void) => void;
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

  const showConfirm = useCallback((title: string, message: React.ReactNode, onConfirm: () => void) => {
    setOptions({
      title,
      message,
      type: 'confirm',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      onConfirm: () => {
        onConfirm();
        setIsOpen(false);
      },
    });
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => setIsOpen(false), []);

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm, closeModal }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-md w-full overflow-hidden scale-100 transition-transform">
            <div className="p-6">
              <h3 className="text-xl font-bold text-white mb-2">{options.title}</h3>
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
