import React, { useState, useEffect, useMemo } from 'react';
import { BookOpen, Bookmark, Trash2, Layers, Search } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { prefetchNoteDocument } from '../../services/documentCache';
import type { Note } from '../../types';

interface NotebookShelvesProps {
  notes?: Note[];
  onOpenNote?: (note: Note) => void;
  onDeleteNote?: (note: Note) => void;
  isSearching?: boolean;
  onClearSearch?: () => void;
}

export default function NotebookShelves({
  notes = [],
  onOpenNote,
  onDeleteNote,
  isSearching = false,
  onClearSearch,
}: NotebookShelvesProps) {
  const { access } = useAuth();
  const isAdmin = access === 'admin';

  const [savedIds, setSavedIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('nh_saved_notes');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleUpdate = () => {
      try {
        const raw = localStorage.getItem('nh_saved_notes');
        setSavedIds(raw ? JSON.parse(raw) : []);
      } catch {
        setSavedIds([]);
      }
    };
    window.addEventListener('nh:saved-notes-updated', handleUpdate);
    return () => window.removeEventListener('nh:saved-notes-updated', handleUpdate);
  }, []);

  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedIds.includes(id)
      ? savedIds.filter((item) => item !== id)
      : [...savedIds, id];
    setSavedIds(updated);
    localStorage.setItem('nh_saved_notes', JSON.stringify(updated));
    window.dispatchEvent(new Event('nh:saved-notes-updated'));
  };

  // Group notes into subject shelves
  const subjectShelves = useMemo(() => {
    const map = new Map<string, Note[]>();
    notes.forEach((note) => {
      const subj = (note.subject || 'General Notes').trim();
      if (!map.has(subj)) {
        map.set(subj, []);
      }
      map.get(subj)!.push(note);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [notes]);

  if (notes.length === 0) {
    if (isSearching) {
      return (
        <div className="nh-dim" style={{ textAlign: 'center', padding: '48px 16px' }}>
          <Search style={{ width: 36, height: 36, margin: '0 auto 12px', opacity: 0.5, color: '#818cf8' }} />
          <p style={{ margin: '0 0 14px', fontWeight: 600, fontSize: 17, color: '#fff' }}>
            No notes match your search
          </p>
          {onClearSearch && (
            <button
              type="button"
              onClick={onClearSearch}
              className="pill pill-sm pill-primary whitespace-nowrap btn-spring"
            >
              Clear search
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="nh-dim" style={{ textAlign: 'center', padding: '48px 16px' }}>
        <Layers style={{ width: 36, height: 36, margin: '0 auto 10px', opacity: 0.4 }} />
        <p style={{ margin: 0, fontWeight: 600 }}>No notebooks on shelf yet.</p>
        <span style={{ fontSize: 13 }}>Uploaded course notes will be organized here in a 2x2 grid.</span>
      </div>
    );
  }

  // Display notes organized across subject shelves
  return (
    <div className="space-y-6">
      {subjectShelves.map(([subject, shelfNotes]) => (
        <div key={subject} className="subject-shelf">
          {subjectShelves.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 'clamp(15px, 1.05vw, 18px)', fontWeight: 700, color: '#fff' }}>
                  {subject}
                </h3>
                <span className="pill pill-sm pill-ghost whitespace-nowrap" style={{ fontSize: 11, padding: '2px 8px' }}>
                  {shelfNotes.length} {shelfNotes.length === 1 ? 'note' : 'notes'}
                </span>
              </div>
            </div>
          )}

          <div className="shelf-grid">
            {shelfNotes.map((note, index) => {
              const isSaved = savedIds.includes(note.id);
              const staggerClass = `stagger-${(index % 8) + 1}`;

              return (
                <div
                  key={note.id}
                  className={`shelf-item animate-nh-card ${staggerClass}`}
                  onMouseEnter={() => prefetchNoteDocument(note)}
                  onFocus={() => prefetchNoteDocument(note)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 12,
                    minHeight: 140,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '3px 9px',
                          borderRadius: 6,
                          background: note.isLabRecord ? 'rgba(80,200,140,.18)' : 'rgba(139,123,255,.18)',
                          color: note.isLabRecord ? '#70f0b0' : '#b0a4ff',
                          border: '1px solid rgba(255,255,255,.1)',
                          whiteSpace: 'nowrap',
                        }}
                        className="whitespace-nowrap"
                      >
                        {note.subject}
                      </span>

                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#ffd37a',
                          background: 'rgba(255,211,122,.12)',
                          padding: '3px 8px',
                          borderRadius: 6,
                          fontFamily: 'monospace',
                          whiteSpace: 'nowrap',
                        }}
                        className="whitespace-nowrap"
                      >
                        {note.unit}
                      </span>
                    </div>

                    <h3
                      style={{
                        margin: '0 0 6px',
                        fontSize: 'clamp(16px, 1.1vw, 20px)',
                        fontWeight: 600,
                        color: '#fff',
                        cursor: 'pointer',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        minWidth: 0,
                        overflowWrap: 'break-word',
                        wordBreak: 'normal',
                      }}
                      className="break-words min-w-0 line-clamp-2"
                      onClick={() => onOpenNote && onOpenNote(note)}
                    >
                      {note.title}
                    </h3>

                    <div className="nh-dim" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                      {note.fileSizeFormatted} • {note.semester || 'Sem 6'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTop: '1px solid var(--glass-edge)' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        className="pill pill-sm pill-primary whitespace-nowrap bouncy-btn"
                        onClick={() => onOpenNote && onOpenNote(note)}
                      >
                        <BookOpen style={{ width: 14, height: 14, marginRight: 6 }} /> Read
                      </button>

                      <button
                        className={`pill pill-sm ${isSaved ? 'pill-ok' : 'pill-ghost'} whitespace-nowrap bouncy-btn`}
                        onClick={(e) => toggleBookmark(note.id, e)}
                      >
                        <Bookmark style={{ width: 14, height: 14, marginRight: 6, fill: isSaved ? 'currentColor' : 'none' }} />
                        {isSaved ? 'Saved' : 'Bookmark'}
                      </button>
                    </div>

                    {/* ADMIN ONLY: Delete button */}
                    {isAdmin && onDeleteNote && (
                      <button
                        className="pill pill-sm pill-no whitespace-nowrap bouncy-btn"
                        title="Delete note (Admin only)"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteNote(note);
                        }}
                        style={{ padding: '7px 11px' }}
                      >
                        <Trash2 style={{ width: 14, height: 14 }} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
