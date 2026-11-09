import React from 'react';
import { ShieldAlert, X } from 'lucide-react';

interface SecurityToastProps {
  message: string;
  onClose: () => void;
}

export const SecurityToast: React.FC<SecurityToastProps> = ({ message, onClose }) => {
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md bg-slate-900/95 border border-red-500/40 text-slate-100 rounded-xl shadow-2xl backdrop-blur-md p-4 animate-in fade-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-red-500/20 text-red-400 rounded-lg shrink-0">
          <ShieldAlert className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-red-300">Security Warning: Action Intercepted</h4>
          <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{message}</p>
          <div className="mt-2 text-[10px] text-slate-400 font-mono">
            DRM Protection Active • User session logged with institutional watermark
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
