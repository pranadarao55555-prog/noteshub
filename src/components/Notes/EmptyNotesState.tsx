import React from 'react';
import { BookOpen, Upload, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface EmptyNotesStateProps {
  isFiltered: boolean;
  onClearFilters: () => void;
  onOpenUpload: () => void;
}

export const EmptyNotesState: React.FC<EmptyNotesStateProps> = ({
  isFiltered,
  onClearFilters,
  onOpenUpload,
}) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.isAdmin;

  if (isFiltered) {
    return (
      <div className="py-16 text-center max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Search className="w-7 h-7" />
        </div>
        <h3 className="text-base font-semibold text-white mb-1">No Matching Notes Found</h3>
        <p className="text-xs text-slate-400 mb-4">
          Try adjusting your subject tab or search keywords.
        </p>
        <button
          onClick={onClearFilters}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-indigo-400 hover:text-indigo-300 border border-slate-700 transition-colors"
        >
          Clear All Filters
        </button>
      </div>
    );
  }

  return (
    <div className="py-20 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-600/10">
        <BookOpen className="w-8 h-8" />
      </div>

      <h3 className="text-lg font-bold text-white mb-2">No Notes Uploaded Yet</h3>
      
      <p className="text-xs text-slate-400 leading-relaxed mb-6">
        No notes uploaded yet. Notes uploaded by the Admin will appear here.
      </p>

      {isAdmin && (
        <div className="flex justify-center">
          <button
            onClick={onOpenUpload}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-xl shadow-indigo-600/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Note</span>
          </button>
        </div>
      )}
    </div>
  );
};
