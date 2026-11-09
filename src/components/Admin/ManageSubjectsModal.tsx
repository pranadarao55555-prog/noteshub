import React, { useState, useEffect } from 'react';
import { 
  X, 
  BookOpen, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Check, 
  Layers 
} from 'lucide-react';
import { 
  fetchSubjects, 
  createSubject, 
  deleteSubject 
} from '../../services/notesService';
import type { Subject } from '../../types';

interface ManageSubjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubjectsUpdated?: () => void;
}

export const ManageSubjectsModal: React.FC<ManageSubjectsModalProps> = ({
  isOpen,
  onClose,
  onSubjectsUpdated,
}) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadSubjects = async () => {
    setLoading(true);
    const list = await fetchSubjects();
    setSubjects(list);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadSubjects();
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await createSubject(newSubjectName.trim());
      setSuccessMsg(`Subject "${newSubjectName.trim()}" created successfully!`);
      setNewSubjectName('');
      await loadSubjects();
      if (onSubjectsUpdated) onSubjectsUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create subject.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (sub: Subject) => {
    if (!window.confirm(`Are you sure you want to delete "${sub.name}"? Notes referencing this subject will also be removed or unlinked.`)) {
      return;
    }

    try {
      await deleteSubject(sub.id);
      setSuccessMsg(`Deleted subject "${sub.name}".`);
      await loadSubjects();
      if (onSubjectsUpdated) onSubjectsUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete subject.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-nh-fade">
      <div className="w-[calc(100%-2rem)] max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] overscroll-contain animate-nh-modal">
        {/* Header */}
        <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">Manage Course Subjects</h3>
              <p className="text-[11px] text-slate-400">Add or remove subjects dynamically</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-xl text-xs text-emerald-200 flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Add Subject Input */}
          <form onSubmit={handleAdd} className="p-3.5 bg-slate-950/60 rounded-2xl border border-slate-800">
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Add New Subject to Curriculum
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g., Computer Architecture, Embedded Systems"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
                className="flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={submitting || !newSubjectName.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white text-xs font-semibold shadow-md transition-all active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{submitting ? 'Adding...' : 'Add'}</span>
              </button>
            </div>
          </form>

          {/* Existing Subjects List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Current Subjects ({subjects.length})
              </span>
            </div>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Loading subjects from Supabase...
              </div>
            ) : subjects.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No subjects found in database. Add your first subject above!
              </div>
            ) : (
              <div className="space-y-2">
                {subjects.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded-2xl flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Layers className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-white truncate">
                        {sub.name}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDelete(sub)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-950/40 transition-colors"
                      title="Delete subject"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/90 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
