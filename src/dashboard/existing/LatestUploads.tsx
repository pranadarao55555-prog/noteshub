import { FileText, Clock, ExternalLink } from 'lucide-react';
import { prefetchNoteDocument } from '../../services/documentCache';
import type { Note } from '../../types';

interface LatestUploadsProps {
  notes?: Note[];
  onOpenNote?: (note: Note) => void;
}

export default function LatestUploads({ notes = [], onOpenNote }: LatestUploadsProps) {
  // Sort real uploaded notes from Supabase by latest upload timestamp first
  const recentNotes = [...notes]
    .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
    .slice(0, 5);

  if (recentNotes.length === 0) {
    return (
      <div className="nh-dim" style={{ textAlign: 'center', padding: '24px 8px' }}>
        <p style={{ margin: 0, fontSize: 13 }}>No recent uploads found.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {recentNotes.map((note) => {
        const timeStr = note.uploadedAt 
          ? new Date(note.uploadedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })
          : 'Recent';

        return (
          <div
            key={note.id}
            className="feed-item"
            onMouseEnter={() => prefetchNoteDocument(note)}
            onFocus={() => prefetchNoteDocument(note)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              cursor: 'pointer',
              transition: 'background .15s ease',
            }}
            onClick={() => onOpenNote && onOpenNote(note)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: note.isLabRecord ? 'rgba(80,200,140,.18)' : 'rgba(91,91,214,.2)',
                  border: '1px solid var(--glass-edge)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: note.isLabRecord ? '#70f0b0' : '#8b7bff',
                  flexShrink: 0,
                }}
              >
                <FileText style={{ width: 16, height: 16 }} />
              </div>

              <div style={{ minWidth: 0 }}>
                <strong
                  className="break-words min-w-0 line-clamp-2"
                  style={{
                    display: 'block',
                    fontSize: 'clamp(14px, 0.95vw, 16px)',
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span className="nh-dim" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                <Clock style={{ width: 12, height: 12 }} /> {timeStr}
              </span>
              <ExternalLink style={{ width: 14, height: 14, color: '#8b7bff', opacity: 0.7 }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
