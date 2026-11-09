import { useState, useEffect } from 'react';

export function OwnerNavButton() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* 1. Navbar Pill Button (First in Order) */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 hover:border-indigo-500/50 transition-all cursor-pointer group bouncy-btn select-none"
        title="View Platform Owner Profile"
        aria-label="View Platform Owner Profile"
      >
        <div className="w-6 h-6 rounded-full overflow-hidden border border-indigo-400/60 shrink-0 bg-slate-900 relative">
          <img
            src="/images/pranada_rao_owner.jpg"
            alt="Pranada Rao"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 4%',
              transform: 'scale(1.8)',
              transformOrigin: 'center 6%'
            }}
          />
        </div>
        <span className="text-xs font-semibold text-slate-200 group-hover:text-white transition-colors">
          Owner
        </span>
      </button>

      {/* 2. Compact Owner Profile Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Platform Owner Profile"
        >
          <div 
            className="relative w-full max-w-sm rounded-2xl bg-[#0e1629]/95 border border-slate-800/90 p-6 shadow-2xl text-center"
            style={{ backgroundColor: 'rgba(14, 22, 41, 0.95)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-slate-800/70 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors"
              aria-label="Close Profile Modal"
            >
              ✕
            </button>

            {/* Profile Avatar (Larger Portrait Card View) */}
            <div 
              className="w-36 h-48 mx-auto rounded-2xl overflow-hidden border-2 border-indigo-500/50 shadow-xl mb-4 bg-slate-950"
              style={{ width: '9rem', height: '12rem', minWidth: '9rem', minHeight: '12rem' }}
            >
              <img
                src="/images/pranada_rao_owner.jpg"
                alt="Pranada Rao"
                className="w-full h-full object-cover object-top"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'top',
                }}
              />
            </div>

            {/* Profile Details */}
            <h3 className="text-xl font-bold text-white tracking-tight">Pranada Rao</h3>
            <p className="text-xs text-indigo-400 font-medium mb-3">Founder &amp; Developer • NotesHub</p>

            <p className="text-xs text-slate-300 leading-relaxed mb-5 px-2">
              Computer Science &amp; Engineering student at NMAMIT Nitte. Aspiring software developer, UI designer, and Hindustani classical musician dedicated to building clean, accessible academic tools.
            </p>

            {/* Badges */}
            <div className="flex flex-wrap justify-center gap-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
                NMAMIT CSE
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-800/50">
                Web Development
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                React
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                Supabase
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default OwnerNavButton;
