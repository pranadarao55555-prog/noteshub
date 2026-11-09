import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X, Bookmark } from 'lucide-react';
import { useAuth, isEmailAdmin } from '../auth/AuthProvider';
import { usePresence } from '../context/PresenceContext';
import './dashboard.css';
import SavedNotes from './existing/SavedNotes';
import NotebookShelves from './existing/NotebookShelves';
import LatestUploads from './existing/LatestUploads';
import AdminPanel from '../admin/AdminPanel';
import { OwnerNavButton } from '../components/Owner/OwnerNavButton';
import { DrmPdfReader } from '../components/Reader/DrmPdfReader';
import { GeminiAssistantDrawer } from '../components/AI/GeminiAssistantDrawer';
import { OnlineClassmatesDrawer } from '../components/Presence/OnlineClassmatesDrawer';
import CodeLab from './components/CodeLab';
import { subscribeToNotes, deleteNote } from '../services/notesService';
import type { Note } from '../types';

export default function DashboardHome() {
  const { access, user, logout } = useAuth();
  const { peerCount, setPresenceDrawerOpen } = usePresence();
  const isAdmin = access === 'admin' || isEmailAdmin(user?.email);

  const [notes, setNotes] = useState<Note[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [activePage, setActivePage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isGeminiOpen, setGeminiOpen] = useState(false);
  const [isCodeLabOpen, setIsCodeLabOpen] = useState(false);
  const [currentTab, setCurrentTab] = useState<'home' | 'saves'>('home');
  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('nh_saved_notes');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const shelvesRef = useRef<HTMLElement | null>(null);
  const savedNotesRef = useRef<HTMLElement | null>(null);

  // Sync saved notes IDs from localStorage
  useEffect(() => {
    const handleSavedUpdate = () => {
      try {
        const raw = localStorage.getItem('nh_saved_notes');
        setSavedIds(raw ? JSON.parse(raw) : []);
      } catch {
        setSavedIds([]);
      }
    };
    window.addEventListener('nh:saved-notes-updated', handleSavedUpdate);
    return () => window.removeEventListener('nh:saved-notes-updated', handleSavedUpdate);
  }, []);

  // Sync notes from database
  useEffect(() => {
    const unsub = subscribeToNotes((list) => {
      setNotes(list);
    });

    const handleNotesUpdated = () => {
      subscribeToNotes(setNotes);
    };
    window.addEventListener('nh:notes-updated', handleNotesUpdated);

    return () => {
      unsub();
      window.removeEventListener('nh:notes-updated', handleNotesUpdated);
    };
  }, []);

  const handleOpenNote = useCallback((note: Note) => {
    setActiveNote(note);
    setActivePage(1);
    setTotalPages(note.totalPages || 1);
  }, []);

  const handleCloseNote = useCallback(() => {
    setActiveNote(null);
    setGeminiOpen(false);
  }, []);

  const handleOpenGemini = useCallback(() => {
    setGeminiOpen(true);
  }, []);

  const handleCloseGemini = useCallback(() => {
    setGeminiOpen(false);
  }, []);

  const handlePageChange = useCallback((curr: number, total: number) => {
    setActivePage(curr);
    setTotalPages(total);
  }, []);

  const handleDeleteNote = async (note: Note) => {
    if (!isAdmin) return;
    if (window.confirm(`Permanently delete "${note.title}"?`)) {
      try {
        await deleteNote(note);
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        if (activeNote?.id === note.id) {
          handleCloseNote();
        }
      } catch (err: any) {
        alert(err.message || 'Failed to delete note');
      }
    }
  };

  // Deferred multi-word real-time search across title, subject, unit, semester, and description
  const deferredSearch = useDeferredValue(searchQuery);

  const filteredNotes = useMemo(() => {
    const trimmed = deferredSearch.trim();
    if (!trimmed) return notes;
    const words = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return notes;

    return notes.filter((n) => {
      const searchTarget = [
        n.title || '',
        n.subject || '',
        n.unit || '',
        n.semester || '',
        n.description || '',
      ].join(' ').toLowerCase();

      return words.every((w) => searchTarget.includes(w));
    });
  }, [notes, deferredSearch]);

  const savedNotesList = useMemo(() => {
    return filteredNotes.filter((n) => savedIds.includes(n.id));
  }, [filteredNotes, savedIds]);

  const handleHomeClick = () => {
    setCurrentTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSavesClick = () => {
    setCurrentTab('saves');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // When VS Code Lab is open, early-return ONLY CodeLab so the dashboard and navbar are completely unmounted from the DOM
  if (isCodeLabOpen) {
    return <CodeLab onClose={() => setIsCodeLabOpen(false)} />;
  }

  return (
    <div className="nh-dash dash">
      <header className="dash-top">
        <h1 className="nh-logo">Notes Hub<span className="nh-dot" /></h1>
        <nav className="dash-nav" aria-label="Main Navigation">
          {/* Owner Button (First in Order) */}
          <OwnerNavButton />

          <button
            type="button"
            className={`pill pill-sm ${
              currentTab === 'home'
                ? 'is-active bg-indigo-600 text-white font-semibold'
                : 'pill-ghost text-slate-300 hover:text-white'
            } transition-all bouncy-btn`}
            onClick={handleHomeClick}
          >
            Home
          </button>
          <button
            type="button"
            className={`pill pill-sm ${
              currentTab === 'saves'
                ? 'is-active bg-indigo-600 text-white font-semibold'
                : 'pill-ghost text-slate-300 hover:text-white'
            } transition-all bouncy-btn`}
            onClick={handleSavesClick}
          >
            Saves
          </button>
          <button
            type="button"
            onClick={() => setIsCodeLabOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/70 transition-all cursor-pointer shadow-sm hover:border-indigo-400/50"
            title="Open VS Code Practice Lab"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
            VS Code
          </button>
          <button
            type="button"
            className="pill pill-sm pill-ghost inline-flex items-center gap-1.5 whitespace-nowrap bouncy-btn"
            onClick={() => setPresenceDrawerOpen(true)}
            title="View online classmates in real-time"
            aria-label={`My Class (${peerCount} online)`}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>My Class</span>
            {peerCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono shrink-0">
                {peerCount}
              </span>
            )}
          </button>
          {isAdmin && (
            <Link to="/admin" className="pill pill-sm pill-ghost bouncy-btn">
              Admin Portal
            </Link>
          )}
          {isAdmin && <AdminPanel.Trigger />}
          <button type="button" className="pill pill-sm pill-ghost bouncy-btn" onClick={logout}>Sign out</button>
        </nav>
      </header>

      <div className="dash-search" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input
          className="field"
          style={{ width: '100%', paddingRight: searchQuery ? 38 : undefined }}
          placeholder={currentTab === 'saves' ? 'Search within your saved notes...' : 'Search subjects, topics, or chapters...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label={currentTab === 'saves' ? 'Search within your saved notes' : 'Search subjects, topics, or chapters'}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            title="Clear search"
            style={{
              position: 'absolute',
              right: 12,
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.6)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 4,
              borderRadius: '50%',
            }}
            className="hover:text-white btn-spring"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>

      <div className="flex justify-center -mt-1 mb-6">
        <span
          className="text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 text-xs sm:text-sm font-semibold tracking-wide px-4 py-1.5 rounded-full inline-block mx-auto shadow-sm shadow-indigo-500/5 backdrop-blur-md select-none"
          role="status"
          aria-label="Welcome greeting"
        >
          WELCOME! YOU'RE IN!
        </span>
      </div>

      {currentTab === 'saves' ? (
        <main className="w-full max-w-7xl mx-auto animate-nh-fade">
          <section className="glass-card dash-panel rounded-2xl p-6 border border-white/10 w-full">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>Saved Notes</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Your personal pinned study collection</p>
                </div>
              </div>
              {savedNotesList.length > 0 && (
                <span className="nh-dim" style={{ fontSize: 13 }}>
                  {savedNotesList.length} saved note{savedNotesList.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {savedNotesList.length === 0 ? (
              <div className="py-20 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4">
                  <Bookmark className="w-7 h-7 opacity-70" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">No saved notes yet</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
                  No saved notes yet. Bookmark notes from the shelves to view them here.
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentTab('home')}
                  className="pill pill-primary text-sm font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 btn-spring"
                >
                  Browse Notebook Shelves
                </button>
              </div>
            ) : (
              <NotebookShelves
                notes={savedNotesList}
                onOpenNote={handleOpenNote}
                onDeleteNote={handleDeleteNote}
                isSearching={Boolean(searchQuery.trim())}
                onClearSearch={() => setSearchQuery('')}
              />
            )}
          </section>
        </main>
      ) : (
        <main className="dash-grid grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
          {/* Primary Main Section: Notebook Shelves */}
          <section
            ref={shelvesRef}
            className="glass-card dash-panel dash-main lg:col-span-7 xl:col-span-8 rounded-2xl p-6 border border-white/10"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>Notebook Shelves</h2>
              <span className="nh-dim" style={{ fontSize: 13 }}>
                {filteredNotes.length} note{filteredNotes.length === 1 ? '' : 's'} available
              </span>
            </div>
            <NotebookShelves
              notes={filteredNotes}
              onOpenNote={handleOpenNote}
              onDeleteNote={handleDeleteNote}
              isSearching={Boolean(searchQuery.trim())}
              onClearSearch={() => setSearchQuery('')}
            />
          </section>

          {/* Clean Right Sidebar: My Saved Notes & Real Uploads */}
          <aside className="dash-side lg:col-span-5 xl:col-span-4 flex flex-col gap-6 w-full">
            <section
              ref={savedNotesRef}
              id="saves"
              className="glass-card dash-panel rounded-2xl p-6 border border-white/10"
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h2 style={{ margin: 0 }}>My Saved Notes</h2>
                {savedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentTab('saves')}
                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium btn-spring"
                  >
                    View all ({savedIds.length})
                  </button>
                )}
              </div>
              <SavedNotes notes={notes} onOpenNote={handleOpenNote} />
            </section>

            {notes.length > 0 && (
              <section className="glass-card dash-panel rounded-2xl p-6 border border-white/10">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ margin: 0 }}>Latest Uploads</h2>
                  <span className="nh-dim" style={{ fontSize: 12 }}>
                    Recent from Supabase
                  </span>
                </div>
                <LatestUploads notes={notes} onOpenNote={handleOpenNote} />
              </section>
            )}
          </aside>
        </main>
      )}

      {/* Rendered ONLY for admin: not hidden by CSS, absent from the DOM for students */}
      {isAdmin && (
        <AdminPanel.ErrorBoundary>
          <AdminPanel.Upload />
          <AdminPanel.Drawer />
        </AdminPanel.ErrorBoundary>
      )}

      {/* Strict DRM Canvas Streaming Reader Modal */}
      {activeNote && (
        <DrmPdfReader
          note={activeNote}
          onClose={handleCloseNote}
          onOpenGemini={handleOpenGemini}
          isGeminiOpen={isGeminiOpen}
          onPageChange={handlePageChange}
        />
      )}

      {/* Gemini AI Study Assistant Floating Slide-out Drawer */}
      <GeminiAssistantDrawer
        isOpen={isGeminiOpen}
        onClose={handleCloseGemini}
        currentNote={activeNote}
        currentPage={activePage}
        totalPages={totalPages}
      />

      {/* Online Classmates Realtime Drawer */}
      <OnlineClassmatesDrawer />
    </div>
  );
}
