import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  X, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  FileUp, 
  Layers,
  Plus,
  BookOpen
} from 'lucide-react';
import { 
  uploadNoteResumable, 
  fetchSubjects, 
  createSubject, 
  type UploadController 
} from '../../services/notesService';
import { useAuth } from '../../context/AuthContext';
import type { Note, Subject, UploadProgressState } from '../../types';

interface ResumableUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (note: Note) => void;
}

const PREDEFINED_UNITS = [
  'Unit 1',
  'Unit 2',
  'Unit 3',
  'Unit 4',
  'Unit 5',
];

export const ResumableUploadModal: React.FC<ResumableUploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [creatingSubjectLoading, setCreatingSubjectLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('Unit 1');
  const [semester, setSemester] = useState('Sem 6');
  const [description, setDescription] = useState('');
  const [isLabRecord, setIsLabRecord] = useState(false);

  const [uploadController, setUploadController] = useState<UploadController | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSubjects().then((subs) => {
        setSubjects(subs);
        setSelectedSubjectId((prev) => (prev || (subs.length > 0 ? subs[0].id : '')));
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateSubject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newSubjectName.trim()) return;

    setCreatingSubjectLoading(true);
    setErrorMessage(null);
    try {
      const created = await createSubject(newSubjectName.trim());
      setSubjects((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSubjectId(created.id);
      setNewSubjectName('');
      setIsCreatingSubject(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create subject.');
    } finally {
      setCreatingSubjectLoading(false);
    }
  };

  const isValidFileType = (file: File) => {
    const name = file.name.toLowerCase();
    return (
      file.type === 'application/pdf' ||
      name.endsWith('.pdf') ||
      name.endsWith('.pptx') ||
      name.endsWith('.ppt') ||
      file.type.includes('presentation') ||
      file.type.includes('powerpoint')
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!isValidFileType(file)) {
        setErrorMessage('Only PDF and PowerPoint (.pptx, .ppt) documents are supported.');
        return;
      }
      setSelectedFile(file);
      setErrorMessage(null);

      if (!title) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        setTitle(cleanName);
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!isValidFileType(file)) {
        setErrorMessage('Only PDF and PowerPoint (.pptx, .ppt) documents are supported.');
        return;
      }
      setSelectedFile(file);
      setErrorMessage(null);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
      }
    }
  };

  const startUpload = () => {
    if (!selectedFile || !currentUser) return;
    if (!title.trim() || !selectedSubjectId || !unit.trim()) {
      setErrorMessage('Please select a Subject, choose a Unit, and enter a Document Title.');
      return;
    }

    setErrorMessage(null);

    const controller = uploadNoteResumable(
      selectedFile,
      {
        title: title.trim(),
        subjectId: selectedSubjectId,
        unit: unit.trim(),
        semester,
        description: description.trim(),
        isLabRecord,
        user: {
          uid: currentUser.uid,
          email: currentUser.email,
          displayName: currentUser.displayName,
        },
      },
      (progress) => {
        setUploadProgress(progress);
      },
      (completedNote) => {
        setIsCompleted(true);
        setUploadProgress(null);
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch {
          // ignore
        }
        setTimeout(() => {
          onSuccess(completedNote);
          resetForm();
          onClose();
        }, 1200);
      },
      (error) => {
        setErrorMessage(error.message || 'Supabase upload failed.');
        setUploadController(null);
        setUploadProgress(null);
      }
    );

    setUploadController(controller);
  };

  const resetForm = () => {
    setSelectedFile(null);
    setTitle('');
    setDescription('');
    setIsLabRecord(false);
    setUploadProgress(null);
    setUploadController(null);
    setIsCompleted(false);
    setErrorMessage(null);
    setIsCreatingSubject(false);
    setNewSubjectName('');
  };

  const handleClose = () => {
    if (uploadProgress?.isUploading) {
      if (window.confirm('Upload is currently in progress. Cancel upload?')) {
        uploadController?.cancel();
        resetForm();
        onClose();
      }
    } else {
      resetForm();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-nh-fade">
      <div className="relative w-[calc(100%-2rem)] max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] overscroll-contain animate-nh-modal">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600/10 text-indigo-400 border border-indigo-500/20">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Upload Note to Supabase</h3>
              <p className="text-xs text-slate-400">
                Organized by Subject &amp; Unit • Supabase Storage
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-950/50 border border-red-800/80 rounded-xl text-xs text-red-200 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Drag & Drop File Zone */}
          {!uploadProgress && !isCompleted && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Document File (PDF or PPTX) *
              </label>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                  selectedFile
                    ? 'border-indigo-500/50 bg-indigo-950/20'
                    : 'border-slate-700/80 hover:border-indigo-500/40 bg-slate-950/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf,.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-8 h-8 text-indigo-400 shrink-0" />
                    <div className="text-left">
                      <div className="text-sm font-semibold text-white truncate max-w-sm">
                        {selectedFile.name}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for Supabase Storage
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <FileUp className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-200">
                      Drag &amp; drop PDF document here, or <span className="text-indigo-400 underline">browse</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Scanned lecture notes or lab observation manuals
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Upload Progress State */}
          {uploadProgress && (
            <div className="p-4 bg-slate-950/80 border border-indigo-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200 truncate max-w-xs">
                  {uploadProgress.fileName}
                </span>
                <span className="font-mono font-bold text-indigo-400">
                  {uploadProgress.progressPercent}%
                </span>
              </div>

              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-150 rounded-full"
                  style={{ width: `${uploadProgress.progressPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>
                  {uploadProgress.transferredFormatted} / {uploadProgress.totalFormatted} ({uploadProgress.progressPercent}%)
                </span>
                <span className="text-indigo-400">Uploading to Supabase bucket...</span>
              </div>
            </div>
          )}

          {isCompleted && (
            <div className="py-6 text-center text-emerald-400 space-y-2">
              <CheckCircle2 className="w-12 h-12 mx-auto animate-bounce" />
              <h4 className="text-base font-bold text-white">Upload Complete &amp; Secured!</h4>
              <p className="text-xs text-slate-400">
                Uploaded to Supabase Storage and published to Cohort.
              </p>
            </div>
          )}

          {/* Form Fields */}
          {!uploadProgress && !isCompleted && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g., Computer Networks Unit 3 Routing Algorithms"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Subject Selection & Dynamic Creation */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-300">
                    Subject *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCreatingSubject(!isCreatingSubject)}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{isCreatingSubject ? 'Choose existing' : '+ Add New Subject'}</span>
                  </button>
                </div>

                {isCreatingSubject ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter new subject name (e.g., Deep Learning)"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      className="flex-1 px-3.5 py-2 bg-slate-950 border border-indigo-500/50 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={creatingSubjectLoading || !newSubjectName.trim()}
                      onClick={() => handleCreateSubject()}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40"
                    >
                      {creatingSubjectLoading ? 'Adding...' : 'Save'}
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <BookOpen className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                    >
                      {subjects.length === 0 ? (
                        <option value="">No subjects found - add one above</option>
                      ) : (
                        subjects.map((sub) => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Unit Hierarchy & Semester */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Unit / Module *
                  </label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    {PREDEFINED_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Semester
                  </label>
                  <select
                    value={semester}
                    onChange={(e) => setSemester(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Sem 1">Semester 1</option>
                    <option value="Sem 2">Semester 2</option>
                    <option value="Sem 3">Semester 3</option>
                    <option value="Sem 4">Semester 4</option>
                    <option value="Sem 5">Semester 5</option>
                    <option value="Sem 6">Semester 6</option>
                    <option value="Sem 7">Semester 7</option>
                    <option value="Sem 8">Semester 8</option>
                  </select>
                </div>
              </div>

              {/* Category Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Category Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsLabRecord(false)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      !isLabRecord
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Lecture Notes
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLabRecord(true)}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all ${
                      isLabRecord
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Lab Record
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description &amp; Topics (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Key concepts, circuit diagrams, derivations, or lab steps included..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!uploadProgress && !isCompleted && (
          <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Supabase Storage Engine</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={startUpload}
                disabled={!selectedFile || !title.trim() || !selectedSubjectId}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Publish Note</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
