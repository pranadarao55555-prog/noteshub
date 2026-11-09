import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, Sparkles, BookOpen, Layers } from 'lucide-react';
import confetti from 'canvas-confetti';
import { uploadNoteResumable, fetchSubjects, createSubject } from '../../services/notesService';
import { useAuth } from '../../auth/AuthProvider';
import type { Note, Subject, UploadProgressState } from '../../types';

interface UploaderProps {
  onSuccess?: (note: Note) => void;
}

const PREDEFINED_UNITS = ['Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 5'];

export default function Uploader({ onSuccess }: UploaderProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [isCreatingSubject, setIsCreatingSubject] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('Unit 1');
  const [semester] = useState('Sem 6');
  const [description, setDescription] = useState('');
  const [isLabRecord, setIsLabRecord] = useState(false);

  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSubjects = async () => {
    const list = await fetchSubjects();
    setSubjects(list);
    if (list.length > 0 && !selectedSubjectId) {
      setSelectedSubjectId(list[0].id);
    }
  };

  useEffect(() => {
    loadSubjects();
  }, []);

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    try {
      const created = await createSubject(newSubjectName.trim());
      setSubjects((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedSubjectId(created.id);
      setNewSubjectName('');
      setIsCreatingSubject(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create subject.');
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
        setTitle(file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
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
    if (!selectedFile || !user) return;
    if (!title.trim() || !selectedSubjectId || !unit.trim()) {
      setErrorMessage('Please enter Title, choose Subject, and select Unit.');
      return;
    }

    setErrorMessage(null);

    uploadNoteResumable(
      selectedFile,
      {
        title: title.trim(),
        subjectId: selectedSubjectId,
        unit: unit.trim(),
        semester,
        description: description.trim(),
        isLabRecord,
        user: {
          uid: user.id || user.uid,
          email: user.email || '',
          displayName: user.displayName || 'Admin',
        },
      },
      (progress) => {
        setUploadProgress(progress);
      },
      (completedNote) => {
        setIsCompleted(true);
        setUploadProgress(null);
        try {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.7 } });
        } catch {
          // ignore
        }
        if (onSuccess) onSuccess(completedNote);
        setTimeout(() => {
          setSelectedFile(null);
          setTitle('');
          setDescription('');
          setIsLabRecord(false);
          setIsCompleted(false);
        }, 1500);
      },
      (error) => {
        setErrorMessage(error.message || 'Upload failed.');
        setUploadProgress(null);
      }
    );
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {errorMessage && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(255,110,130,.15)', border: '1px solid rgba(255,110,130,.4)', color: '#ff9aa8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {isCompleted && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(80,200,140,.2)', border: '1px solid rgba(80,200,140,.5)', color: '#70f0b0', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 style={{ width: 18, height: 18 }} />
          <span><strong>Upload Published!</strong> Note is now available to cohort students.</span>
        </div>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed var(--glass-edge)',
          borderRadius: 20,
          padding: '24px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: selectedFile ? 'rgba(91,91,214,.15)' : 'rgba(8,14,40,.35)',
          transition: 'border-color .18s ease, background .18s ease',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf,.pptx,.ppt,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {selectedFile ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <FileText style={{ width: 28, height: 28, color: '#8b7bff' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{selectedFile.name}</div>
              <div className="nh-dim" style={{ fontSize: 12 }}>
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.name.toLowerCase().endsWith('.pptx') || selectedFile.name.toLowerCase().endsWith('.ppt') ? 'PowerPoint Presentation' : 'PDF Document'}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <Upload style={{ width: 28, height: 28, margin: '0 auto 8px', color: '#8b7bff', opacity: 0.8 }} />
            <p style={{ margin: 0, fontWeight: 600, color: 'var(--text)' }}>
              Drag &amp; drop handwritten PDF or PPTX here, or <span style={{ color: '#8b7bff', textDecoration: 'underline' }}>browse</span>
            </p>
            <span className="nh-dim" style={{ fontSize: 12 }}>Supports course notebooks &amp; presentation slides up to 500 MB</span>
          </div>
        )}
      </div>

      {uploadProgress && (
        <div style={{ display: 'grid', gap: 6, padding: '12px 14px', borderRadius: 14, background: 'rgba(8,14,40,.6)', border: '1px solid var(--glass-edge)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--text)' }}>{uploadProgress.fileName}</span>
            <span style={{ color: '#ffd37a', fontWeight: 700 }}>{uploadProgress.progressPercent}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${uploadProgress.progressPercent}%`,
                background: 'linear-gradient(90deg, #6a6bf0, #ffd37a)',
                transition: 'width .2s ease',
              }}
            />
          </div>
          <span className="nh-dim" style={{ fontSize: 11 }}>
            {uploadProgress.transferredFormatted} / {uploadProgress.totalFormatted} transferred
          </span>
        </div>
      )}

      {/* Fields */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
            Document Title *
          </label>
          <input
            className="field"
            type="text"
            placeholder="e.g. Computer Networks Unit 3 Notes"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)' }}>
              Subject *
            </label>
            <button
              type="button"
              onClick={() => setIsCreatingSubject(!isCreatingSubject)}
              style={{ background: 'none', border: 'none', color: '#8b7bff', fontSize: 11, cursor: 'pointer', padding: 0 }}
            >
              {isCreatingSubject ? 'Choose existing' : '+ Add subject'}
            </button>
          </div>

          {isCreatingSubject ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="field"
                type="text"
                placeholder="New Subject Name"
                value={newSubjectName}
                onChange={(e) => setNewSubjectName(e.target.value)}
              />
              <button className="pill pill-sm pill-primary" type="button" onClick={handleCreateSubject}>
                Save
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <BookOpen style={{ width: 14, height: 14, position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <select
                className="field"
                style={{ paddingLeft: 38 }}
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
              >
                {subjects.length === 0 ? (
                  <option value="">No subjects yet - add above</option>
                ) : (
                  subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
            Unit / Module *
          </label>
          <div style={{ position: 'relative' }}>
            <Layers style={{ width: 14, height: 14, position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <select
              className="field"
              style={{ paddingLeft: 38 }}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              {PREDEFINED_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4 }}>
            Document Category
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={`pill pill-sm ${!isLabRecord ? 'pill-primary' : 'pill-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => setIsLabRecord(false)}
            >
              Lecture Notes
            </button>
            <button
              type="button"
              className={`pill pill-sm ${isLabRecord ? 'pill-ok' : 'pill-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => setIsLabRecord(true)}
            >
              Lab Record
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
        <button
          type="button"
          className="pill pill-primary"
          disabled={!selectedFile || !title.trim() || !selectedSubjectId || Boolean(uploadProgress)}
          onClick={startUpload}
        >
          <Sparkles style={{ width: 14, height: 14, marginRight: 6 }} /> Publish to Class
        </button>
      </div>
    </div>
  );
}
