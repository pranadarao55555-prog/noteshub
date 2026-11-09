import React from 'react';
import { 
  FileText, 
  Trash2, 
  Lock, 
  Clock, 
  Layers 
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { Note } from '../../types';

interface NoteCardProps {
  note: Note;
  onOpen: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({ note, onOpen, onDelete }) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.isAdmin;

  const uploadedDate = new Date(note.uploadedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="group relative flex flex-col bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 shadow-lg hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-200">
      {/* Top Badges */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
            {note.subject}
          </span>
          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/25 font-mono">
            {note.unit}
          </span>
          {note.isLabRecord ? (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
              Lab Record
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/25">
              Lecture Notes
            </span>
          )}
        </div>

        <span className="text-[11px] font-semibold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/60 font-mono">
          {note.semester || 'Sem 6'}
        </span>
      </div>

      {/* Note Title */}
      <h3
        onClick={() => onOpen(note)}
        className="text-sm sm:text-base font-bold text-white group-hover:text-indigo-300 transition-colors cursor-pointer line-clamp-2 mb-1.5 leading-snug"
      >
        {note.title}
      </h3>

      {/* Unit / Topic */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3 truncate">
        <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
        <span className="truncate">{note.unit}</span>
      </div>

      {/* Description if present */}
      {note.description && (
        <p className="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">
          {note.description}
        </p>
      )}

      {/* Metadata Bar */}
      <div className="mt-auto pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-300 font-semibold">{note.fileSizeFormatted}</span>
        </div>

        <div className="flex items-center gap-1 text-slate-500">
          <Clock className="w-3 h-3" />
          <span>{uploadedDate}</span>
        </div>
      </div>

      {/* Action Area */}
      <div className="mt-3 pt-3 border-t border-slate-800/50 flex items-center justify-between gap-2">
        <button
          onClick={() => onOpen(note)}
          className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-semibold bouncy-btn group/btn"
        >
          <Lock className="w-3.5 h-3.5 text-amber-400 group-hover/btn:text-white transition-colors" />
          <span>Open Secure Reader</span>
        </button>

        {/* Delete control is strictly restricted to Admin only */}
        {isAdmin && (
          <button
            onClick={() => onDelete(note)}
            className="p-2 rounded-xl bg-slate-800/60 hover:bg-red-950/60 border border-slate-700/60 hover:border-red-500/40 text-slate-400 hover:text-red-300 transition-colors"
            title="Delete this note (Admin authority)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
