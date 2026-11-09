import { useState, useEffect } from 'react';
import { Bookmark, FileText, BookOpen, Trash2 } from 'lucide-react';
import { prefetchNoteDocument } from '../../services/documentCache';
import type { Note } from '../../types';

interface SavedNotesProps {
  notes?: Note[];
  onOpenNote?: (note: Note) => void;
}

export default function SavedNotes({ notes = [], onOpenNote }: SavedNotesProps) {
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

  const removeBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedIds.filter((item) => item !== id);
    setSavedIds(updated);
    localStorage.setItem('nh_saved_notes', JSON.stringify(updated));
    window.dispatchEvent(new Event('nh:saved-notes-updated'));
  };

  const savedNotes = notes.filter((n) => savedIds.includes(n.id));

  if (savedNotes.length === 0) {
    return (
      <div className="nh-dim" style={{ textAlign: 'center', padding: '36px 12px' }}>
        <Bookmark style={{ width: 32, height: 32, margin: '0 auto 8px', opacity: 0.4 }} />
        <p style={{ margin: 0 }}>No saved notes yet.</p>
        <span style={{ fontSize: 12 }}>Click "Bookmark" on any notebook shelf to pin notes here.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {savedNotes.map((note) => (
        <div
          key={note.id}
          className="shelf-item"
          onMouseEnter={() => prefetchNoteDocument(note)}
          onFocus={() => prefetchNoteDocument(note)}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          onClick={() => onOpenNote && onOpenNote(note)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #ffd37a22, #8b7bff33)',
              border: '1px solid rgba(255,211,122,.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffd37a',
              flexShrink: 0
            }}>
              <FileText style={{ width: 18, height: 18 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <strong 
                className="break-words min-w-0 line-clamp-2"
                style={{ 
                  display: 'block', 
                  fontSize: 'clamp(15px, 1vw, 17px)', 
                  fontWeight: 600, 
                  color: '#fff',
                  lineHeight: 1.35,
                  overflowWrap: 'break-word',
                  wordBreak: 'normal',
                }}
              >
                {note.title}
              </strong>
              <span className="nh-dim" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                {note.subject} • {note.unit}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              className="pill pill-sm pill-primary whitespace-nowrap bouncy-btn"
              onClick={() => onOpenNote && onOpenNote(note)}
            >
              <BookOpen style={{ width: 14, height: 14, marginRight: 5 }} /> Read
            </button>
            <button
              className="pill pill-sm pill-ghost whitespace-nowrap bouncy-btn"
              title="Remove bookmark"
              onClick={(e) => removeBookmark(note.id, e)}
              style={{ padding: '7px 11px' }}
            >
              <Trash2 style={{ width: 14, height: 14, color: '#ff9aa8' }} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
