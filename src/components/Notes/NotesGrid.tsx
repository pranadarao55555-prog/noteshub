import React, { useState, useMemo } from 'react';
import { 
  Search, 
  SlidersHorizontal, 
  PlusCircle, 
  Layers, 
  Tag
} from 'lucide-react';
import { NoteCard } from './NoteCard';
import { EmptyNotesState } from './EmptyNotesState';
import { useAuth } from '../../context/AuthContext';
import type { Note } from '../../types';

interface NotesGridProps {
  notes: Note[];
  onOpenNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  onOpenUpload: () => void;
  onOpenManageSubjects?: () => void;
}

const PREDEFINED_UNITS = ['ALL', 'Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'];

export const NotesGrid: React.FC<NotesGridProps> = ({
  notes,
  onOpenNote,
  onDeleteNote,
  onOpenUpload,
  onOpenManageSubjects,
}) => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.isAdmin;

  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedUnit, setSelectedUnit] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'LECTURE' | 'LAB'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [groupByUnit, setGroupByUnit] = useState<boolean>(true);

  const handleClearFilters = () => {
    setSelectedSubject('ALL');
    setSelectedUnit('ALL');
    setSelectedType('ALL');
    setSearchQuery('');
  };

  // Derive all unique subjects from notes
  const subjects = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => {
      if (n.subject && n.subject.trim()) {
        set.add(n.subject.trim());
      }
    });
    return Array.from(set).sort();
  }, [notes]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      // Subject filter
      if (selectedSubject !== 'ALL' && n.subject.trim().toLowerCase() !== selectedSubject.toLowerCase()) {
        return false;
      }

      // Unit filter
      if (selectedUnit !== 'ALL' && n.unit.trim().toLowerCase() !== selectedUnit.toLowerCase()) {
        return false;
      }

      // Type filter
      if (selectedType === 'LECTURE' && n.isLabRecord) return false;
      if (selectedType === 'LAB' && !n.isLabRecord) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = n.title.toLowerCase().includes(q);
        const matchesSubject = n.subject.toLowerCase().includes(q);
        const matchesUnit = n.unit.toLowerCase().includes(q);
        const matchesSemester = n.semester ? n.semester.toLowerCase().includes(q) : false;
        const matchesDesc = n.description ? n.description.toLowerCase().includes(q) : false;
        return matchesTitle || matchesSubject || matchesUnit || matchesSemester || matchesDesc;
      }

      return true;
    });
  }, [notes, selectedSubject, selectedUnit, selectedType, searchQuery]);

  // Group notes by Unit when grouping is enabled
  const groupedByUnit = useMemo(() => {
    const groups: { [unitName: string]: Note[] } = {};
    filteredNotes.forEach((n) => {
      const u = n.unit || 'Other';
      if (!groups[u]) groups[u] = [];
      groups[u].push(n);
    });

    // Sort unit keys: Unit 1, Unit 2, Unit 3, Unit 4, Unit 5, followed by others
    return Object.entries(groups).sort(([a], [b]) => {
      const numA = parseInt(a.replace(/\D/g, ''), 10);
      const numB = parseInt(b.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [filteredNotes]);

  const isFiltered =
    selectedSubject !== 'ALL' ||
    selectedUnit !== 'ALL' ||
    selectedType !== 'ALL' ||
    searchQuery.trim().length > 0;

  if (notes.length === 0) {
    return (
      <EmptyNotesState
        isFiltered={false}
        onClearFilters={handleClearFilters}
        onOpenUpload={onOpenUpload}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search notes by title, unit, or subject..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
          />
        </div>

        {/* Category Type Pills (All / Lecture Notes / Lab Records) */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl self-start md:self-auto">
          <button
            onClick={() => setSelectedType('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedType === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All ({notes.length})
          </button>
          <button
            onClick={() => setSelectedType('LECTURE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedType === 'LECTURE'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lectures ({notes.filter((n) => !n.isLabRecord).length})
          </button>
          <button
            onClick={() => setSelectedType('LAB')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedType === 'LAB'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lab Records ({notes.filter((n) => n.isLabRecord).length})
          </button>
        </div>
      </div>

      {/* Subjects Filter Bar with Admin "+ Manage Subjects" Button */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Subjects:
          </span>

          <button
            onClick={() => {
              setSelectedSubject('ALL');
              setSelectedUnit('ALL');
            }}
            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedSubject === 'ALL'
                ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            All Subjects
          </button>

          {subjects.map((sub) => {
            const count = notes.filter((n) => n.subject.trim().toLowerCase() === sub.toLowerCase()).length;
            return (
              <button
                key={sub}
                onClick={() => {
                  setSelectedSubject(sub);
                  setSelectedUnit('ALL');
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                  selectedSubject.toLowerCase() === sub.toLowerCase()
                    ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {sub} <span className="text-[10px] opacity-60 ml-0.5">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Admin Manage Subjects Button */}
        {isAdmin && onOpenManageSubjects && (
          <button
            onClick={onOpenManageSubjects}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 whitespace-nowrap shrink-0 transition-all"
            title="Manage curriculum subjects in Supabase"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Manage Subjects</span>
          </button>
        )}
      </div>

      {/* Unit Filter Pills & Grouping Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/40 rounded-2xl border border-slate-800/80">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Layers className="w-3.5 h-3.5" /> Units:
          </span>
          {PREDEFINED_UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setSelectedUnit(u)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedUnit === u
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {u === 'ALL' ? 'All Units' : u}
            </button>
          ))}
        </div>

        <button
          onClick={() => setGroupByUnit(!groupByUnit)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors border ${
            groupByUnit
              ? 'bg-indigo-950/40 border-indigo-700/50 text-indigo-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
          }`}
          title="Toggle grouping notes by Unit"
        >
          <Tag className="w-3 h-3" />
          <span>{groupByUnit ? 'Grouped by Unit' : 'Flat Grid'}</span>
        </button>
      </div>

      {/* Notes Display */}
      {filteredNotes.length === 0 ? (
        <EmptyNotesState
          isFiltered={isFiltered}
          onClearFilters={handleClearFilters}
          onOpenUpload={onOpenUpload}
        />
      ) : groupByUnit ? (
        /* Grouped by Unit View */
        <div className="space-y-8">
          {groupedByUnit.map(([unitName, unitNotes]) => (
            <div key={unitName} className="space-y-4">
              <div className="flex items-center gap-3 pb-2 border-b border-slate-800">
                <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{unitName}</span>
                  <span className="text-xs font-normal text-slate-400">
                    ({unitNotes.length} note{unitNotes.length > 1 ? 's' : ''})
                  </span>
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {unitNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onOpen={onOpenNote}
                    onDelete={onDeleteNote}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onOpen={onOpenNote}
              onDelete={onDeleteNote}
            />
          ))}
        </div>
      )}
    </div>
  );
};
