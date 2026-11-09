import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import Editor from '@monaco-editor/react';

// ==========================================
// Judge0 CE Endpoint Configuration
// ==========================================
const JUDGE0_URL = (import.meta.env.VITE_JUDGE0_URL || 'https://ce.judge0.com').replace(/\/+$/, '');
const JUDGE0_KEY = import.meta.env.VITE_JUDGE0_KEY || '';
const JUDGE0_HOST = import.meta.env.VITE_JUDGE0_HOST || (JUDGE0_KEY ? 'judge0-ce.p.rapidapi.com' : '');

const STORAGE_TERMINAL_H_KEY = 'nh_codelab_terminal_height';
const STORAGE_SIDEBAR_W_KEY = 'nh_codelab_sidebar_width';
const DEFAULT_TERMINAL_HEIGHT = 260;
const DEFAULT_SIDEBAR_WIDTH = 240;

export interface CodeLabProps {
  isOpen?: boolean;
  onClose: () => void;
  userId?: string | null;
}

export type SupportedLang = 'c' | 'java' | 'python' | 'r';

export interface CodeFile {
  id: string;
  name: string;
  language: SupportedLang;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface LanguageConfig {
  label: string;
  id: number;
  monacoLang: string;
  ext: string;
  defaultName: string;
  color: string;
  starterCode: string;
}

export const LANGUAGES: Record<SupportedLang, LanguageConfig> = {
  c: {
    label: 'C (GCC)',
    id: 50,
    monacoLang: 'c',
    ext: '.c',
    defaultName: 'main.c',
    color: 'bg-blue-400',
    starterCode: `#include <stdio.h>\n\nint main() {\n    printf("Hello from NotesHub C Practice!\\n");\n    return 0;\n}\n`,
  },
  java: {
    label: 'Java',
    id: 62,
    monacoLang: 'java',
    ext: '.java',
    defaultName: 'Main.java',
    color: 'bg-orange-400',
    starterCode: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from NotesHub Java Practice!");\n    }\n}\n`,
  },
  python: {
    label: 'Python 3',
    id: 71,
    monacoLang: 'python',
    ext: '.py',
    defaultName: 'main.py',
    color: 'bg-emerald-400',
    starterCode: `# NotesHub Python Practice\nprint("Hello from NotesHub Python Practice!")\n`,
  },
  r: {
    label: 'R',
    id: 80,
    monacoLang: 'r',
    ext: '.r',
    defaultName: 'script.R',
    color: 'bg-purple-400',
    starterCode: `# NotesHub R Practice\ncat("Hello from NotesHub R Practice!\\n")\nx <- c(10, 20, 30, 40)\nprint(summary(x))\n`,
  },
};

export const LANG_KEYS = Object.keys(LANGUAGES) as SupportedLang[];

const EXT_TO_LANG: Record<string, SupportedLang> = {
  '.c': 'c',
  '.java': 'java',
  '.py': 'python',
  '.r': 'r',
};

// ==========================================
// Permanent User-Scoped Storage (fileStore)
// ==========================================
export const fileStore = {
  getStorageKey(userId?: string | null) {
    return `noteshub_code_files_${userId || 'guest'}`;
  },
  load(userId?: string | null): CodeFile[] | null {
    try {
      const primaryKey = this.getStorageKey(userId);
      let raw = localStorage.getItem(primaryKey);
      if (!raw) {
        // Fallback to legacy key if user has existing files
        const legacyKey = userId ? `noteshub.codelab.files.v1.${userId}` : 'noteshub.codelab.files.v1';
        raw = localStorage.getItem(legacyKey);
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as CodeFile[];
      }
    } catch (err) {
      console.warn('Failed to load files from localStorage:', err);
    }
    return null;
  },
  save(files: CodeFile[], userId?: string | null) {
    try {
      localStorage.setItem(this.getStorageKey(userId), JSON.stringify(files));
    } catch (err) {
      console.warn('Failed to save files to localStorage:', err);
    }
  },
};

// ==========================================
// Native Disk Export & File System Access API
// ==========================================
export const saveToLocalDisk = async (filename: string, content: string): Promise<boolean> => {
  // Modern File System Access API (Opens real OS Save As dialog)
  if ('showSaveFilePicker' in window && typeof (window as any).showSaveFilePicker === 'function') {
    try {
      const ext = filename.split('.').pop() || 'txt';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Source Code File',
            accept: { 'text/plain': [`.${ext}`] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err: any) {
      if (err?.name === 'AbortError') return false; // User cancelled OS prompt
    }
  }

  // Fallback: direct download link to Downloads / File Manager
  try {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Failed to download file:', err);
    return false;
  }
};

// Helper to create starter files on first load
function createStarterFiles(): CodeFile[] {
  const now = Date.now();
  return [
    {
      id: 'starter-py',
      name: 'main.py',
      language: 'python',
      content: LANGUAGES.python.starterCode,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'starter-java',
      name: 'Main.java',
      language: 'java',
      content: LANGUAGES.java.starterCode,
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
    {
      id: 'starter-c',
      name: 'main.c',
      language: 'c',
      content: LANGUAGES.c.starterCode,
      createdAt: now - 2000,
      updatedAt: now - 2000,
    },
    {
      id: 'starter-r',
      name: 'script.R',
      language: 'r',
      content: LANGUAGES.r.starterCode,
      createdAt: now - 3000,
      updatedAt: now - 3000,
    },
  ];
}

function getLanguageFromFilename(filename: string): SupportedLang | null {
  const trimmed = (filename || '').trim();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const ext = trimmed.slice(dotIdx).toLowerCase();
  return EXT_TO_LANG[ext] || null;
}

function validateFilename(
  filename: string,
  existingFiles: CodeFile[],
  currentFileId: string | null = null
): string | null {
  const trimmed = (filename || '').trim();
  if (!trimmed) {
    return 'File name cannot be empty.';
  }
  if (/[\\/:*?"<>|]/.test(trimmed)) {
    return 'File name contains invalid characters.';
  }
  const lang = getLanguageFromFilename(trimmed);
  if (!lang) {
    return 'Only .py, .java, .c, or .r files are supported.';
  }
  const duplicate = existingFiles.some(
    (f) => f.id !== currentFileId && f.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    return 'A file with this name already exists.';
  }
  return null;
}

function getStarterContent(filename: string, lang: SupportedLang): string {
  if (lang === 'c') {
    return `#include <stdio.h>\n\nint main() {\n    printf("Hello from ${filename}!\\n");\n    return 0;\n}\n`;
  }
  if (lang === 'java') {
    const className = filename.replace(/\.java$/i, '') || 'Main';
    return `public class ${className} {\n    public static void main(String[] args) {\n        System.out.println("Hello from ${className}!");\n    }\n}\n`;
  }
  if (lang === 'python') {
    return `# ${filename}\nprint("Hello from ${filename}!")\n`;
  }
  if (lang === 'r') {
    return `# ${filename}\ncat("Hello from ${filename}!\\n")\n`;
  }
  return '';
}

function getSuggestedFilename(existingFiles: CodeFile[], preferredLang: SupportedLang = 'python'): string {
  const ext = LANGUAGES[preferredLang]?.ext || '.py';
  let counter = 1;
  while (true) {
    const candidate = `untitled${counter}${ext}`;
    if (!existingFiles.some((f) => f.name.toLowerCase() === candidate.toLowerCase())) {
      return candidate;
    }
    counter++;
  }
}

function utf8ToBase64(str: string): string {
  if (!str) return '';
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

function base64ToUtf8(b64: string): string {
  if (!b64) return '';
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(b64), (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch {
    try {
      return atob(b64);
    } catch {
      return b64;
    }
  }
}

function computeSnappedTerminalHeight(rawHeight: number, usableHeight: number): number {
  const min = 100;
  const max = Math.max(min, Math.min(Math.floor(usableHeight * 0.85), usableHeight - 120));
  let h = Math.max(min, Math.min(max, rawHeight));

  const snap25 = Math.round(usableHeight * 0.25);
  const snap50 = Math.round(usableHeight * 0.5);
  const snap75 = Math.round(usableHeight * 0.75);
  const threshold = 12;

  if (Math.abs(h - snap25) <= threshold && snap25 >= min && snap25 <= max) {
    h = snap25;
  } else if (Math.abs(h - snap50) <= threshold && snap50 >= min && snap50 <= max) {
    h = snap50;
  } else if (Math.abs(h - snap75) <= threshold && snap75 >= min && snap75 <= max) {
    h = snap75;
  }
  return h;
}

function getInitialTerminalHeight(): number {
  try {
    const stored = localStorage.getItem(STORAGE_TERMINAL_H_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed >= 100) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_TERMINAL_HEIGHT;
}

function getInitialSidebarWidth(): number {
  try {
    const stored = localStorage.getItem(STORAGE_SIDEBAR_W_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed >= 160 && parsed <= 400) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_SIDEBAR_WIDTH;
}

// ==========================================
// CodeLab Component
// ==========================================
export default function CodeLab({ onClose, userId = null }: CodeLabProps) {
  // 1. Files & Active Tab State
  const [files, setFiles] = useState<CodeFile[]>(() => {
    return fileStore.load(userId) || createStarterFiles();
  });

  const [openFileIds, setOpenFileIds] = useState<string[]>(() => {
    const initialFiles = fileStore.load(userId) || createStarterFiles();
    const py = initialFiles.find((f) => f.name === 'main.py');
    return py ? [py.id] : [initialFiles[0]?.id || ''];
  });

  const [activeFileId, setActiveFileId] = useState<string>(() => {
    const initialFiles = fileStore.load(userId) || createStarterFiles();
    const py = initialFiles.find((f) => f.name === 'main.py');
    return py ? py.id : initialFiles[0]?.id || '';
  });

  // 2. Unsaved Changes & Dirty State
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  // Dirty map for individual file tab/explorer indicators: fileId -> boolean
  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<string>('Saved');

  // Track the last saved content for each file
  const savedContentsRef = useRef<Record<string, string>>({});

  // Sort state for Explorer: 'recent' | 'name'
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');

  // Sidebar visibility & width
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(getInitialSidebarWidth);

  // Inline forms state
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [newFileError, setNewFileError] = useState<string>('');

  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');
  const [renameError, setRenameError] = useState<string>('');

  // Context Menu & Dialogs
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: CodeFile } | null>(null);
  const [fileToDelete, setFileToDelete] = useState<CodeFile | null>(null);
  const [tabPendingClose, setTabPendingClose] = useState<string | null>(null);

  // Terminal & Execution State
  const [terminalOpen, setTerminalOpen] = useState<boolean>(false);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [terminalHeight, setTerminalHeight] = useState<number>(getInitialTerminalHeight);
  const [prevTerminalHeight, setPrevTerminalHeight] = useState<number>(DEFAULT_TERMINAL_HEIGHT);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [output, setOutput] = useState<{ text: string; isError: boolean }>({ text: '', isError: false });
  const [cursor, setCursor] = useState<{ ln: number; col: number }>({ ln: 1, col: 1 });

  // Divider Dragging State
  const [isDraggingDivider, setIsDraggingDivider] = useState<boolean>(false);
  const isDraggingDividerRef = useRef<boolean>(false);
  const startDividerYRef = useRef<number>(0);
  const startTerminalHRef = useRef<number>(terminalHeight);
  const rafDividerRef = useRef<number | null>(null);

  // Sidebar Resizing State
  const [isResizingSidebar, setIsResizingSidebar] = useState<boolean>(false);
  const isResizingSidebarRef = useRef<boolean>(false);
  const startSidebarXRef = useRef<number>(0);
  const startSidebarWRef = useRef<number>(sidebarWidth);
  const rafSidebarRef = useRef<number | null>(null);

  // Layout & DOM Refs
  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<HTMLPreElement | null>(null);
  const editorRef = useRef<any>(null);
  const handleManualSaveRef = useRef<(() => Promise<void>) | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  const filesRef = useRef<CodeFile[]>(files);
  filesRef.current = files;
  const dirtyMapRef = useRef<Record<string, boolean>>(dirtyMap);
  dirtyMapRef.current = dirtyMap;

  // Initialize savedContentsRef for loaded files
  useEffect(() => {
    files.forEach((f) => {
      if (savedContentsRef.current[f.id] === undefined) {
        savedContentsRef.current[f.id] = f.content;
      }
    });
  }, [files]);

  // Autofocus and select text when creating new file
  useEffect(() => {
    if (isCreatingFile) {
      const timer = setTimeout(() => {
        if (newFileInputRef.current) {
          newFileInputRef.current.focus();
          newFileInputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isCreatingFile]);

  // Autofocus and select text when renaming file
  useEffect(() => {
    if (renamingFileId) {
      const timer = setTimeout(() => {
        if (renameInputRef.current) {
          renameInputRef.current.focus();
          renameInputRef.current.select();
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [renamingFileId]);

  // Active File object
  const activeFile = useMemo(() => {
    return files.find((f) => f.id === activeFileId) || null;
  }, [files, activeFileId]);

  const activeLangKey: SupportedLang = activeFile?.language || 'python';

  // Update isDirty whenever active file changes
  useEffect(() => {
    if (activeFileId) {
      const current = filesRef.current.find((f) => f.id === activeFileId);
      const saved = savedContentsRef.current[activeFileId] ?? '';
      const dirty = Boolean(current && current.content !== saved);
      setIsDirty(dirty);
      setSaveStatus(dirty ? 'Unsaved changes' : 'Saved');
    } else {
      setIsDirty(false);
      setSaveStatus('Saved');
    }
  }, [activeFileId]);

  // Sorted file list for Explorer
  const sortedFiles = useMemo(() => {
    const list = [...files];
    if (sortBy === 'name') {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [files, sortBy]);

  // ==========================================
  // Lifecycle & Listeners
  // ==========================================
  // Lock body scroll
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Persist terminal height in localStorage
  useEffect(() => {
    if (Number.isFinite(terminalHeight) && terminalHeight >= 100 && !isMaximized) {
      try {
        localStorage.setItem(STORAGE_TERMINAL_H_KEY, String(terminalHeight));
      } catch {}
    }
  }, [terminalHeight, isMaximized]);

  // Persist sidebar width in localStorage
  useEffect(() => {
    if (Number.isFinite(sidebarWidth) && sidebarWidth >= 160 && sidebarWidth <= 400) {
      try {
        localStorage.setItem(STORAGE_SIDEBAR_W_KEY, String(sidebarWidth));
      } catch {}
    }
  }, [sidebarWidth]);

  // Re-clamp terminal height on window resize
  useEffect(() => {
    const handleResize = () => {
      const usable = mainContainerRef.current
        ? mainContainerRef.current.clientHeight - 6
        : window.innerHeight - 78;
      if (isMaximized) {
        const maxH = Math.max(100, Math.floor(usable * 0.85));
        setTerminalHeight(maxH);
      } else {
        setTerminalHeight((prev) => computeSnappedTerminalHeight(prev, usable));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMaximized]);

  // Auto-scroll terminal on new output
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output, terminalOpen]);

  // Close Context Menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = () => setContextMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  // ==========================================
  // Storage & Save Operations
  // ==========================================
  // Commit in-memory changes to permanent localStorage
  const commitToStorage = useCallback(() => {
    const now = Date.now();
    const updated = filesRef.current.map((f) =>
      dirtyMapRef.current[f.id] ? { ...f, updatedAt: now } : f
    );
    setFiles(updated);
    fileStore.save(updated, userId);
    Object.keys(dirtyMapRef.current).forEach((id) => {
      if (dirtyMapRef.current[id]) {
        const file = updated.find((f) => f.id === id);
        if (file) savedContentsRef.current[id] = file.content;
      }
    });
    setDirtyMap({});
    if (activeFileId) {
      const activeCurrent = updated.find((f) => f.id === activeFileId);
      const activeSaved = savedContentsRef.current[activeFileId] ?? '';
      setIsDirty(Boolean(activeCurrent && activeCurrent.content !== activeSaved));
    }
    setSaveStatus('Saved');
  }, [userId, activeFileId]);

  // Manual save routine (Top bar Save button or Ctrl+S)
  const handleManualSave = useCallback(async () => {
    if (!activeFile) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    // 1. Commit changes to permanent user-scoped storage
    const now = Date.now();
    const updated = filesRef.current.map((f) =>
      f.id === activeFile.id ? { ...f, updatedAt: now } : f
    );
    setFiles(updated);
    fileStore.save(updated, userId);
    savedContentsRef.current[activeFile.id] = activeFile.content;

    // 2. Open native OS Save As dialog / download
    const saved = await saveToLocalDisk(activeFile.name, activeFile.content);

    // 3. Flash green "✓ Saved!" badge for 1.5s
    if (saved !== false) {
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 1500);
    }

    // 4. Update dirty state
    setIsDirty(false);
    setDirtyMap((prev) => ({ ...prev, [activeFile.id]: false }));
    setSaveStatus('Saved');
  }, [activeFile, userId]);

  handleManualSaveRef.current = handleManualSave;

  // Editor content change handler with comparison to saved version
  const handleEditorChange = (newVal: string | undefined) => {
    if (!activeFileId) return;
    const val = newVal ?? '';
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: val } : f))
    );

    const saved = savedContentsRef.current[activeFileId] ?? '';
    const dirty = val !== saved;
    setIsDirty(dirty);
    setDirtyMap((prev) => ({ ...prev, [activeFileId]: dirty }));
    setSaveStatus(dirty ? 'Unsaved changes' : 'Saved');

    // Debounce auto-save to storage after 1.5s
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      commitToStorage();
    }, 1500);
  };

  // Beforeunload listener: commit to storage on page refresh or browser close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (Object.values(dirtyMapRef.current).some(Boolean)) {
        const now = Date.now();
        const updated = filesRef.current.map((f) =>
          dirtyMapRef.current[f.id] ? { ...f, updatedAt: now } : f
        );
        fileStore.save(updated, userId);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [userId]);

  // ==========================================
  // Exit Confirmation Handlers
  // ==========================================
  const handleBackToHomeClick = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      onClose?.();
    }
  };

  // Exit Modal: [ Save ]
  const handleExitSave = async () => {
    if (activeFile) {
      // 1. Trigger saveToLocalDisk to open OS file explorer dialog
      await saveToLocalDisk(activeFile.name, activeFile.content);
      // 2. Commit content to localStorage under noteshub_code_files_${userId || 'guest'}
      const now = Date.now();
      const updated = filesRef.current.map((f) =>
        f.id === activeFile.id ? { ...f, updatedAt: now } : f
      );
      setFiles(updated);
      fileStore.save(updated, userId);
      savedContentsRef.current[activeFile.id] = activeFile.content;
    }
    // 3. Set isDirty(false)
    setIsDirty(false);
    setShowExitConfirm(false);
    // 4. Return to Home
    onClose?.();
  };

  // Exit Modal: [ Don't Save ]
  const handleExitDontSave = () => {
    // 1. Discard recent unsaved changes (revert content of active file from storage)
    const savedList = fileStore.load(userId) || [];
    const original = savedList.find((f) => f.id === activeFileId);
    if (original && activeFileId) {
      setFiles((prev) =>
        prev.map((f) => (f.id === activeFileId ? { ...f, content: original.content } : f))
      );
    }
    // 2. Set isDirty(false)
    setIsDirty(false);
    setShowExitConfirm(false);
    // 3. Proceed directly to Home
    onClose?.();
  };

  // Exit Modal: [ Cancel ]
  const handleExitCancel = () => {
    setShowExitConfirm(false);
  };

  // ==========================================
  // File Management Actions
  // ==========================================
  const handleOpenFile = (fileId: string) => {
    if (!openFileIds.includes(fileId)) {
      setOpenFileIds((prev) => [...prev, fileId]);
    }
    setActiveFileId(fileId);
  };

  const handleStartCreateFile = (preferredLang: SupportedLang = activeLangKey) => {
    const suggested = getSuggestedFilename(files, preferredLang);
    setNewFileName(suggested);
    setNewFileError('');
    setIsCreatingFile(true);
    if (!sidebarOpen) setSidebarOpen(true);
  };

  const handleConfirmCreateFile = () => {
    const error = validateFilename(newFileName, files);
    if (error) {
      setNewFileError(error);
      return;
    }
    const lang = getLanguageFromFilename(newFileName) || 'python';
    const now = Date.now();
    const newFile: CodeFile = {
      id: `file-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name: newFileName.trim(),
      language: lang,
      content: getStarterContent(newFileName.trim(), lang),
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newFile, ...files];
    setFiles(updated);
    fileStore.save(updated, userId);
    savedContentsRef.current[newFile.id] = newFile.content;
    setOpenFileIds((prev) => [...prev, newFile.id]);
    setActiveFileId(newFile.id);
    setIsCreatingFile(false);
    setNewFileName('');
    setNewFileError('');
  };

  const handleStartRename = (file: CodeFile) => {
    setRenamingFileId(file.id);
    setRenameValue(file.name);
    setRenameError('');
    setContextMenu(null);
  };

  const handleConfirmRename = () => {
    if (!renamingFileId) return;
    const error = validateFilename(renameValue, files, renamingFileId);
    if (error) {
      setRenameError(error);
      return;
    }
    const lang = getLanguageFromFilename(renameValue) || 'python';
    const now = Date.now();
    const updated = files.map((f) =>
      f.id === renamingFileId
        ? { ...f, name: renameValue.trim(), language: lang, updatedAt: now }
        : f
    );
    setFiles(updated);
    fileStore.save(updated, userId);
    setRenamingFileId(null);
    setRenameValue('');
    setRenameError('');
  };

  const handleDuplicateFile = (file: CodeFile) => {
    const ext = LANGUAGES[file.language]?.ext || '.py';
    const baseName = file.name.slice(0, file.name.lastIndexOf('.')) || file.name;
    let candidate = `${baseName}-copy${ext}`;
    let counter = 2;
    while (files.some((f) => f.name.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${baseName}-copy-${counter}${ext}`;
      counter++;
    }

    const now = Date.now();
    const newFile: CodeFile = {
      id: `file-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name: candidate,
      language: file.language,
      content: file.content,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newFile, ...files];
    setFiles(updated);
    fileStore.save(updated, userId);
    savedContentsRef.current[newFile.id] = newFile.content;
    setOpenFileIds((prev) => [...prev, newFile.id]);
    setActiveFileId(newFile.id);
    setContextMenu(null);
  };

  const handleConfirmDelete = () => {
    if (!fileToDelete) return;
    const fileId = fileToDelete.id;
    const updated = files.filter((f) => f.id !== fileId);
    setFiles(updated);
    fileStore.save(updated, userId);
    delete savedContentsRef.current[fileId];

    const remainingOpen = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(remainingOpen);
    if (activeFileId === fileId) {
      setActiveFileId(remainingOpen[remainingOpen.length - 1] || '');
    }
    setDirtyMap((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
    setFileToDelete(null);
  };

  const handleCloseTabRequest = (fileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (dirtyMap[fileId]) {
      setTabPendingClose(fileId);
    } else {
      executeCloseTab(fileId);
    }
  };

  const executeCloseTab = (fileId: string) => {
    const nextOpen = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(nextOpen);
    if (activeFileId === fileId) {
      const currentIndex = openFileIds.indexOf(fileId);
      const nextActive = nextOpen[currentIndex] || nextOpen[currentIndex - 1] || nextOpen[0] || '';
      setActiveFileId(nextActive);
    }
  };

  const handleResolveTabClose = async (action: 'save' | 'dont-save' | 'cancel') => {
    if (!tabPendingClose) return;
    const fileId = tabPendingClose;
    if (action === 'save') {
      const fileToSave = files.find((f) => f.id === fileId);
      if (fileToSave) {
        await saveToLocalDisk(fileToSave.name, fileToSave.content);
        const now = Date.now();
        const updated = files.map((f) =>
          f.id === fileId ? { ...f, updatedAt: now } : f
        );
        setFiles(updated);
        fileStore.save(updated, userId);
        savedContentsRef.current[fileId] = fileToSave.content;
      }
      setDirtyMap((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      if (fileId === activeFileId) setIsDirty(false);
      executeCloseTab(fileId);
    } else if (action === 'dont-save') {
      const savedFiles = fileStore.load(userId) || [];
      const savedVersion = savedFiles.find((f) => f.id === fileId);
      if (savedVersion) {
        setFiles((prev) =>
          prev.map((f) => (f.id === fileId ? { ...f, content: savedVersion.content } : f))
        );
      }
      setDirtyMap((prev) => {
        const next = { ...prev };
        delete next[fileId];
        return next;
      });
      if (fileId === activeFileId) setIsDirty(false);
      executeCloseTab(fileId);
    }
    setTabPendingClose(null);
  };

  // ==========================================
  // Language Selector Handler
  // ==========================================
  const handleLanguagePillClick = (langKey: SupportedLang) => {
    const openWithLang = openFileIds
      .map((id) => files.find((f) => f.id === id))
      .filter((f): f is CodeFile => Boolean(f && f.language === langKey));
    if (openWithLang.length > 0) {
      setActiveFileId(openWithLang[0].id);
      return;
    }

    const filesWithLang = files.filter((f) => f.language === langKey);
    if (filesWithLang.length > 0) {
      handleOpenFile(filesWithLang[0].id);
      return;
    }

    handleStartCreateFile(langKey);
  };

  // ==========================================
  // Execution (Judge0 CE)
  // ==========================================
  const handleRun = async () => {
    if (!activeFile) return;

    if (isDirty) {
      commitToStorage();
    }

    setTerminalOpen(true);
    setIsRunning(true);
    setOutput({
      text: `$ Running ${activeFile.name} ...\n`,
      isError: false,
    });

    const isRapidApi = JUDGE0_URL.includes('rapidapi.com') || JUDGE0_HOST.includes('rapidapi.com');
    if (isRapidApi && !JUDGE0_KEY) {
      setOutput({
        text: 'Add VITE_JUDGE0_KEY to .env and restart Vite to use RapidAPI Judge0.',
        isError: true,
      });
      setIsRunning(false);
      return;
    }

    const targetLang = LANGUAGES[activeFile.language] || LANGUAGES.python;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (JUDGE0_KEY) headers['X-RapidAPI-Key'] = JUDGE0_KEY;
      if (JUDGE0_HOST) headers['X-RapidAPI-Host'] = JUDGE0_HOST;

      const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=true&wait=true&fields=*`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          language_id: targetLang.id,
          source_code: utf8ToBase64(activeFile.content),
          stdin: utf8ToBase64(''),
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '');
        setOutput({
          text: `HTTP ${res.status}: ${res.statusText || 'Execution request failed'}\n${errorBody}`,
          isError: true,
        });
        return;
      }

      const data = await res.json();
      const stdout = base64ToUtf8(data.stdout || '');
      const stderr = base64ToUtf8(data.stderr || '');
      const compileOutput = base64ToUtf8(data.compile_output || '');
      const message = base64ToUtf8(data.message || '');
      const statusDesc = data.status?.description || '';
      const statusId = data.status?.id;

      if (compileOutput && compileOutput.trim()) {
        setOutput({ text: compileOutput, isError: true });
      } else if (stderr && stderr.trim()) {
        setOutput({ text: stderr, isError: true });
      } else if (message && message.trim()) {
        setOutput({
          text: `${message}\n${stderr || stdout}`.trim(),
          isError: true,
        });
      } else if (statusId && statusId > 3) {
        setOutput({
          text: `${statusDesc}\n${stderr || stdout || '(no output)'}`.trim(),
          isError: true,
        });
      } else if (stdout) {
        setOutput({ text: stdout, isError: false });
      } else {
        setOutput({
          text: '(Program finished with exit code 0 and produced no output)',
          isError: false,
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setOutput({
          text: 'Execution timed out after 40 seconds.',
          isError: true,
        });
      } else {
        setOutput({
          text: `Execution failed to reach Judge0:\n${err.message || String(err)}\nCheck your connection or API status.`,
          isError: true,
        });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsRunning(false);
    }
  };

  const handleClearTerminal = () => {
    setOutput({ text: '', isError: false });
  };

  // ==========================================
  // Resizing Handlers (Terminal & Sidebar)
  // ==========================================
  const toggleMaximize = () => {
    const usable = mainContainerRef.current
      ? mainContainerRef.current.clientHeight - 6
      : window.innerHeight - 78;
    const maxH = Math.max(100, Math.floor(usable * 0.85));

    if (isMaximized) {
      setTerminalHeight(prevTerminalHeight);
      setIsMaximized(false);
    } else {
      setPrevTerminalHeight(terminalHeight);
      setTerminalHeight(maxH);
      setIsMaximized(true);
    }
  };

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingDividerRef.current = true;
    setIsDraggingDivider(true);
    startDividerYRef.current = e.clientY;
    startTerminalHRef.current = terminalHeight;
    setIsMaximized(false);
  };

  const handleDividerTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      isDraggingDividerRef.current = true;
      setIsDraggingDivider(true);
      startDividerYRef.current = e.touches[0].clientY;
      startTerminalHRef.current = terminalHeight;
      setIsMaximized(false);
    }
  };

  useEffect(() => {
    if (!isDraggingDivider) return;

    const onMove = (clientY: number) => {
      if (rafDividerRef.current) cancelAnimationFrame(rafDividerRef.current);
      rafDividerRef.current = requestAnimationFrame(() => {
        const delta = clientY - startDividerYRef.current;
        const raw = startTerminalHRef.current - delta;
        const usable = mainContainerRef.current
          ? mainContainerRef.current.clientHeight - 6
          : window.innerHeight - 78;
        const clamped = computeSnappedTerminalHeight(raw, usable);
        setTerminalHeight(clamped);
      });
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientY);
    };

    const stopDrag = () => {
      if (rafDividerRef.current) cancelAnimationFrame(rafDividerRef.current);
      isDraggingDividerRef.current = false;
      setIsDraggingDivider(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);

    return () => {
      if (rafDividerRef.current) cancelAnimationFrame(rafDividerRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDraggingDivider]);

  const handleSidebarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingSidebarRef.current = true;
    setIsResizingSidebar(true);
    startSidebarXRef.current = e.clientX;
    startSidebarWRef.current = sidebarWidth;
  };

  useEffect(() => {
    if (!isResizingSidebar) return;

    const onMove = (clientX: number) => {
      if (rafSidebarRef.current) cancelAnimationFrame(rafSidebarRef.current);
      rafSidebarRef.current = requestAnimationFrame(() => {
        const delta = clientX - startSidebarXRef.current;
        const raw = startSidebarWRef.current + delta;
        const clamped = Math.max(160, Math.min(400, raw));
        setSidebarWidth(clamped);
      });
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) onMove(e.touches[0].clientX);
    };

    const stopDrag = () => {
      if (rafSidebarRef.current) cancelAnimationFrame(rafSidebarRef.current);
      isResizingSidebarRef.current = false;
      setIsResizingSidebar(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDrag);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', stopDrag);
    window.addEventListener('touchcancel', stopDrag);

    return () => {
      if (rafSidebarRef.current) cancelAnimationFrame(rafSidebarRef.current);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopDrag);
      window.removeEventListener('touchcancel', stopDrag);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingSidebar]);

  // Terminal Quick Preset Sizing
  const handleSetTerminalPreset = (preset: 'min' | 'half' | 'max') => {
    const usable = mainContainerRef.current
      ? mainContainerRef.current.clientHeight - 6
      : window.innerHeight - 78;

    if (preset === 'min') {
      setIsMaximized(false);
      setTerminalHeight(100);
    } else if (preset === 'half') {
      setIsMaximized(false);
      setTerminalHeight(Math.round(usable * 0.5));
    } else if (preset === 'max') {
      setPrevTerminalHeight(terminalHeight);
      setTerminalHeight(Math.max(100, Math.floor(usable * 0.85)));
      setIsMaximized(true);
    }
  };

  // ==========================================
  // Keyboard Shortcuts
  // ==========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showExitConfirm) {
          setShowExitConfirm(false);
          return;
        }
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (fileToDelete) {
          setFileToDelete(null);
          return;
        }
        if (tabPendingClose) {
          setTabPendingClose(null);
          return;
        }
        if (isCreatingFile) {
          setIsCreatingFile(false);
          setNewFileName('');
          setNewFileError('');
          return;
        }
        if (renamingFileId) {
          setRenamingFileId(null);
          setRenameValue('');
          setRenameError('');
          return;
        }
        handleBackToHomeClick();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setTerminalOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isRunning && activeFile) {
          handleRun();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showExitConfirm,
    isDirty,
    handleManualSave,
    contextMenu,
    fileToDelete,
    tabPendingClose,
    isCreatingFile,
    renamingFileId,
    isRunning,
    activeFile,
  ]);

  const handleFileContextMenu = (e: React.MouseEvent, file: CodeFile) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
    });
  };

  // ==========================================
  // Render Main Modal
  // ==========================================
  const modalContent = (
    <div
      ref={mainContainerRef}
      className="fixed inset-0 w-screen h-screen z-[99999] flex flex-col bg-[#1e1e1e] text-slate-200 overflow-hidden select-none font-sans"
      style={{ margin: 0, padding: 0 }}
    >
      {/* 1. SOLID TOP BAR */}
      <header className="h-12 w-full bg-[#181818] border-b border-[#2d2d2d] px-3 flex items-center justify-between shrink-0 z-30 select-none">
        {/* Left Side: Sidebar Toggle & Language Pills */}
        <div className="flex items-center gap-3">
          {/* Toggle Sidebar Button */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className={`p-1.5 rounded transition-colors text-slate-400 hover:text-white cursor-pointer ${
              sidebarOpen ? 'bg-[#2a2a2a] text-white' : 'hover:bg-[#252526]'
            }`}
            title="Toggle File Explorer (Ctrl+B)"
            aria-label="Toggle File Explorer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
              <path d="M9 3v18" strokeWidth="2" />
            </svg>
          </button>

          {/* Language Selector Pills */}
          <div className="flex items-center gap-1 bg-[#121212] p-1 rounded-md border border-[#262626]">
            {LANG_KEYS.map((key) => {
              const item = LANGUAGES[key];
              const isActive = activeLangKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleLanguagePillClick(key)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#2d2d2d]'
                  }`}
                  title={`Switch to or create ${item.label} file`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Active File Badge */}
        {activeFile ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded bg-[#1e1e1e] border border-[#333] text-xs font-mono text-slate-300">
            <span className={`w-2 h-2 rounded-full ${LANGUAGES[activeFile.language]?.color || 'bg-blue-400'}`} />
            <span>{activeFile.name}</span>
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Unsaved changes" />}
          </div>
        ) : (
          <div className="text-xs text-slate-500 font-mono">No active file</div>
        )}

        {/* Right Side: Save, Run, Back to Home */}
        <div className="flex items-center gap-2">
          {/* Green "✓ Saved!" Badge Flash */}
          {showSavedToast && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold shadow-sm animate-in fade-in duration-150">
              ✓ Saved!
            </span>
          )}

          {/* Save Button */}
          <button
            type="button"
            onClick={handleManualSave}
            disabled={!activeFile}
            className={`px-3 py-1.5 rounded text-xs font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
              isDirty
                ? 'bg-sky-700 hover:bg-sky-600 text-white border-sky-500 shadow-sm'
                : 'bg-[#2a2a2a] text-slate-300 hover:text-white border-[#383838]'
            }`}
            title="Save to Disk & Storage (Ctrl+S)"
          >
            <span>💾</span>
            <span>Save</span>
          </button>

          {/* Run Code Button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={isRunning || !activeFile}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-semibold text-white shadow transition-all flex items-center gap-1.5 cursor-pointer"
            title="Run Code (Ctrl+Enter)"
          >
            {isRunning ? (
              <>
                <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Running...</span>
              </>
            ) : (
              <>
                <span>▶</span>
                <span>Run Code</span>
              </>
            )}
          </button>

          {/* Back to Home Button */}
          <button
            type="button"
            onClick={handleBackToHomeClick}
            className="px-3.5 py-1.5 bg-[#333] hover:bg-[#444] text-slate-200 hover:text-white rounded text-xs font-medium border border-[#444] transition-colors cursor-pointer"
            title="Return to NotesHub Dashboard (Esc)"
          >
            ← Back to Home
          </button>
        </div>
      </header>

      {/* 2. MIDDLE HORIZONTAL AREA: [Sidebar | Main Column] */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-row overflow-hidden relative w-full">
        {/* LEFT SIDEBAR: File Explorer */}
        {sidebarOpen && (
          <aside
            style={{ width: `${sidebarWidth}px` }}
            className="shrink-0 flex flex-col bg-[#181818] border-r border-[#2d2d2d] overflow-hidden select-none"
          >
            {/* Sidebar Header */}
            <div className="h-9 px-3 border-b border-[#2d2d2d] flex items-center justify-between text-xs font-semibold text-slate-400 tracking-wider">
              <span>EXPLORER</span>
              <div className="flex items-center gap-1">
                {/* Sort Toggle */}
                <button
                  type="button"
                  onClick={() => setSortBy((prev) => (prev === 'recent' ? 'name' : 'recent'))}
                  className="p-1 hover:text-white rounded hover:bg-[#252526] transition-colors cursor-pointer"
                  title={`Sort by: ${sortBy === 'recent' ? 'Most Recent' : 'Name (A-Z)'}`}
                  aria-label="Toggle sort order"
                >
                  {sortBy === 'recent' ? '🕒' : '🔤'}
                </button>
                {/* New File (+) */}
                <button
                  type="button"
                  onClick={() => handleStartCreateFile()}
                  className="p-1 hover:text-white rounded hover:bg-[#252526] transition-colors cursor-pointer"
                  title="New File (Ctrl+N)"
                  aria-label="Create new file"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Inline New File Input Form */}
            {isCreatingFile && (
              <div className="p-2 border-b border-[#2d2d2d] bg-[#222]">
                <input
                  ref={newFileInputRef}
                  type="text"
                  value={newFileName}
                  onChange={(e) => {
                    setNewFileName(e.target.value);
                    setNewFileError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreateFile();
                    if (e.key === 'Escape') {
                      setIsCreatingFile(false);
                      setNewFileName('');
                      setNewFileError('');
                    }
                  }}
                  onBlur={() => {
                    if (!newFileName.trim()) {
                      setIsCreatingFile(false);
                      setNewFileError('');
                    }
                  }}
                  placeholder="e.g. solution.py, App.java"
                  className="w-full box-border bg-[#3c3c3c] text-white caret-white placeholder:text-neutral-400 border border-[#007acc] rounded-sm px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-[#007acc]"
                  style={{ color: '#ffffff', backgroundColor: '#3c3c3c' }}
                />
                {newFileError ? (
                  <p className="text-[11px] text-rose-400 mt-1 leading-tight">{newFileError}</p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">Press Enter to create • Esc to cancel</p>
                )}
              </div>
            )}

            {/* File List */}
            <div className="flex-1 overflow-y-auto py-1">
              {sortedFiles.map((file) => {
                const isActive = file.id === activeFileId;
                const isRenaming = renamingFileId === file.id;
                const isItemDirty = Boolean(dirtyMap[file.id] || (isActive && isDirty));

                if (isRenaming) {
                  return (
                    <div key={file.id} className="p-2 bg-[#222] border-b border-[#2d2d2d]">
                      <input
                        ref={renameInputRef}
                        type="text"
                        value={renameValue}
                        onChange={(e) => {
                          setRenameValue(e.target.value);
                          setRenameError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirmRename();
                          if (e.key === 'Escape') {
                            setRenamingFileId(null);
                            setRenameValue('');
                            setRenameError('');
                          }
                        }}
                        className="w-full box-border bg-[#3c3c3c] text-white caret-white placeholder:text-neutral-400 border border-[#007acc] rounded-sm px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-[#007acc]"
                        style={{ color: '#ffffff', backgroundColor: '#3c3c3c' }}
                      />
                      {renameError && (
                        <p className="text-[11px] text-rose-400 mt-1 leading-tight">{renameError}</p>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={file.id}
                    onClick={() => handleOpenFile(file.id)}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                    className={`group px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer border-l-2 transition-colors ${
                      isActive
                        ? 'bg-[#2a2d2e] text-white border-l-[#007acc] font-medium'
                        : 'text-slate-300 hover:bg-[#222] border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LANGUAGES[file.language]?.color || 'bg-slate-400'}`} />
                      <span className="truncate font-mono text-[12px]">{file.name}</span>
                      {isItemDirty && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
                      )}
                    </div>

                    {/* Quick Action Icons on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartRename(file);
                        }}
                        className="hover:text-white p-0.5 rounded cursor-pointer"
                        title="Rename"
                        aria-label="Rename file"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateFile(file);
                        }}
                        className="hover:text-white p-0.5 rounded cursor-pointer"
                        title="Duplicate"
                        aria-label="Duplicate file"
                      >
                        📄
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveToLocalDisk(file.name, file.content);
                        }}
                        className="hover:text-white p-0.5 rounded cursor-pointer"
                        title="Download / Save to Disk"
                        aria-label="Download file"
                      >
                        ⬇️
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFileToDelete(file);
                        }}
                        className="hover:text-rose-400 p-0.5 rounded cursor-pointer"
                        title="Delete"
                        aria-label="Delete file"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Resizable Sidebar Handle (Vertical Drag Strip) */}
        {sidebarOpen && (
          <div
            onMouseDown={handleSidebarMouseDown}
            className={`w-[4px] relative shrink-0 cursor-col-resize select-none transition-colors ${
              isResizingSidebar ? 'bg-[#007acc]' : 'bg-[#262626] hover:bg-[#007acc]'
            }`}
            title="Drag to resize Explorer"
          >
            <div className="absolute -left-[3px] -right-[3px] top-0 bottom-0 z-10 cursor-col-resize" />
          </div>
        )}

        {/* MAIN COLUMN: [Editor (flex-1) | Resizable Divider | Terminal Drawer] */}
        <main
          className="flex-1 min-h-0 min-w-0 grid w-full overflow-hidden relative"
          style={{
            gridTemplateRows: terminalOpen
              ? `minmax(0, 1fr) 6px ${terminalHeight}px`
              : 'minmax(0, 1fr)',
          }}
        >
          {/* ROW 1: Editor Tabs Bar & Monaco Editor */}
          <div className="min-h-0 min-w-0 flex flex-col relative overflow-hidden bg-[#1e1e1e]">
            {/* Editor Tabs Bar */}
            <div className="h-9 shrink-0 bg-[#252526] border-b border-[#333] flex items-center overflow-x-auto select-none no-scrollbar">
              {openFileIds.map((fileId) => {
                const file = files.find((f) => f.id === fileId);
                if (!file) return null;
                const isActive = fileId === activeFileId;
                const isTabDirty = Boolean(dirtyMap[fileId] || (isActive && isDirty));

                return (
                  <div
                    key={fileId}
                    onClick={() => setActiveFileId(fileId)}
                    onAuxClick={(e) => {
                      if (e.button === 1) handleCloseTabRequest(fileId, e); // middle click closes tab
                    }}
                    className={`h-full flex items-center gap-2 px-3 text-xs border-r border-[#333] cursor-pointer transition-colors shrink-0 group ${
                      isActive
                        ? 'bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc] font-medium'
                        : 'bg-[#2d2d2d]/60 text-slate-400 hover:bg-[#2d2d2d] hover:text-slate-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${LANGUAGES[file.language]?.color || 'bg-slate-400'}`} />
                    <span className="font-mono text-[12px]">{file.name}</span>
                    {isTabDirty ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => handleCloseTabRequest(fileId, e)}
                        className="text-slate-400 hover:text-white hover:bg-[#444] rounded p-0.5 text-[11px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Close tab (Middle click)"
                        aria-label="Close tab"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add tab button */}
              <button
                type="button"
                onClick={() => handleStartCreateFile()}
                className="px-2.5 h-full text-slate-400 hover:text-white hover:bg-[#2d2d2d] transition-colors text-xs flex items-center justify-center cursor-pointer"
                title="New File"
                aria-label="New file"
              >
                +
              </button>
            </div>

            {/* Monaco Editor Canvas */}
            {activeFile ? (
              <div className="flex-1 min-h-0 relative w-full overflow-hidden">
                <Editor
                  height="100%"
                  width="100%"
                  language={LANGUAGES[activeFile.language]?.monacoLang || 'python'}
                  value={activeFile.content}
                  onChange={handleEditorChange}
                  onMount={(editor: any, monaco: any) => {
                    editorRef.current = editor;
                    editor.onDidChangeCursorPosition((e: any) => {
                      setCursor({
                        ln: e.position.lineNumber,
                        col: e.position.column,
                      });
                    });

                    // Bind Ctrl+S / Cmd+S in Monaco to prevent browser save dialog
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
                      handleManualSaveRef.current?.();
                    });
                  }}
                  theme="vs-dark"
                  options={{
                    fontSize: 14,
                    fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                    minimap: { enabled: true },
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    tabSize: 4,
                    bracketPairColorization: { enabled: true },
                    wordWrap: 'on',
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-[#1e1e1e] text-slate-500">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-sm font-medium text-slate-400 mb-1">No file open</p>
                <p className="text-xs text-slate-600 mb-4">Create or open a file from the Explorer to begin coding.</p>
                <button
                  type="button"
                  onClick={() => handleStartCreateFile()}
                  className="px-3.5 py-1.5 bg-[#007acc] hover:bg-[#0062a3] text-white rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  + New File
                </button>
              </div>
            )}
          </div>

          {/* ROW 2: VS Code-Style Resizable Divider */}
          {terminalOpen && (
            <div
              onMouseDown={handleDividerMouseDown}
              onTouchStart={handleDividerTouchStart}
              onDoubleClick={toggleMaximize}
              className={`h-[6px] relative shrink-0 cursor-row-resize select-none transition-colors ${
                isDraggingDivider ? 'bg-[#007acc]' : 'bg-[#2d2d2d] hover:bg-[#007acc]'
              }`}
              title="Drag up or down to resize terminal (Double-click to toggle maximize)"
            >
              <div className="absolute -top-[3px] -bottom-[3px] left-0 right-0 z-10 cursor-row-resize" />
            </div>
          )}

          {/* ROW 3: Terminal Drawer */}
          {terminalOpen && (
            <section className="min-h-0 flex flex-col bg-[#181818] overflow-hidden select-text">
              {/* Terminal Header */}
              <div className="h-9 shrink-0 px-4 flex items-center justify-between bg-[#1f1f1f] border-b border-[#2d2d2d] text-xs select-none">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-bold text-slate-200 tracking-wider">TERMINAL</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                      output.isError
                        ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                        : isRunning
                        ? 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                        : 'bg-[#2d2d2d] text-slate-400 border-[#444]'
                    }`}
                  >
                    {isRunning ? 'Running' : output.isError ? 'Error' : 'Ready'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Preset Quick Sizing Buttons (Minimize / Half / Maximize) */}
                  <div className="flex items-center bg-[#252526] rounded border border-[#333] p-0.5">
                    <button
                      type="button"
                      onClick={() => handleSetTerminalPreset('min')}
                      className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white hover:bg-[#333] rounded transition-colors"
                      title="Minimize Terminal (100px)"
                    >
                      Min
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTerminalPreset('half')}
                      className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white hover:bg-[#333] rounded transition-colors"
                      title="Half Height (50%)"
                    >
                      Half
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetTerminalPreset('max')}
                      className="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-white hover:bg-[#333] rounded transition-colors"
                      title="Maximize Terminal (85%)"
                    >
                      Max
                    </button>
                  </div>

                  {/* Clear Button */}
                  <button
                    type="button"
                    onClick={handleClearTerminal}
                    className="px-2 py-0.5 text-slate-400 hover:text-white hover:bg-[#333] rounded transition-colors cursor-pointer text-xs"
                    title="Clear Console Output"
                  >
                    Clear
                  </button>

                  {/* Maximize Toggle Icon */}
                  <button
                    type="button"
                    onClick={toggleMaximize}
                    className="p-1 text-slate-400 hover:text-white hover:bg-[#333] rounded transition-colors cursor-pointer"
                    title={isMaximized ? 'Restore Terminal Size' : 'Maximize Terminal'}
                  >
                    {isMaximized ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </button>

                  {/* Close Terminal Button */}
                  <button
                    type="button"
                    onClick={() => setTerminalOpen(false)}
                    className="p-1 text-slate-400 hover:text-rose-400 hover:bg-[#333] rounded transition-colors cursor-pointer"
                    title="Hide Terminal (Ctrl+`)"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Terminal Body */}
              <pre
                ref={terminalRef}
                className={`flex-1 min-h-0 p-4 font-mono text-[13px] overflow-auto select-text leading-relaxed whitespace-pre-wrap ${
                  output.isError ? 'text-rose-400' : 'text-emerald-400'
                }`}
                style={{
                  backgroundColor: '#141414',
                  margin: 0,
                  fontFamily: "'Fira Code', Consolas, Monaco, monospace",
                }}
              >
                {output.text || (
                  <span className="text-slate-600 italic select-none">
                    Terminal ready. Click "▶ Run Code" or press Ctrl+Enter to compile and run.
                  </span>
                )}
              </pre>
            </section>
          )}
        </main>
      </div>

      {/* 3. SOLID BOTTOM STATUS BAR */}
      <footer className="h-6 w-full bg-[#007acc] text-white px-3 flex items-center justify-between text-[11px] shrink-0 z-30 select-none font-sans">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold tracking-wide">NotesHub Lab</span>
            <span className="opacity-75">•</span>
            <span>{LANGUAGES[activeLangKey]?.label || 'CodeLab'}</span>
          </div>

          {/* Quick Terminal Toggle Button in status bar */}
          <button
            type="button"
            onClick={() => setTerminalOpen((prev) => !prev)}
            className="flex items-center gap-1 hover:bg-black/20 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
            title="Toggle Output Terminal (Ctrl+`)"
          >
            <span>💻</span>
            <span>Terminal {terminalOpen ? '▲' : '▼'}</span>
          </button>
        </div>

        <div className="flex items-center gap-4 font-mono">
          {/* Unsaved / Saved status indication */}
          <span
            className={`font-sans cursor-pointer hover:underline ${
              isDirty
                ? 'text-amber-200 font-semibold'
                : 'text-white/80'
            }`}
            onClick={handleManualSave}
            title={isDirty ? 'Unsaved changes. Click to save to storage and disk.' : 'All changes saved.'}
          >
            {isDirty ? '● Unsaved' : saveStatus}
          </span>
          <span>UTF-8</span>
          <span>
            Ln {cursor.ln}, Col {cursor.col}
          </span>
        </div>
      </footer>

      {/* ========================================== */}
      {/* DIALOGS AND MODALS                         */}
      {/* ========================================== */}

      {/* 1. Unsaved Changes Exit Confirmation Modal */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#252526] border border-[#3e3e3e] rounded-lg max-w-md w-full p-5 shadow-2xl text-white">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-xl">⚠️</span>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">
                  Do you want to save the changes you made to{' '}
                  <span className="font-mono text-amber-300 font-semibold">{activeFile?.name || 'this file'}</span>?
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Your changes will be lost if you don't save them.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleExitSave}
                className="px-4 py-1.5 rounded bg-[#007acc] hover:bg-[#0062a3] text-xs font-semibold text-white transition-colors cursor-pointer shadow-sm"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleExitDontSave}
                className="px-3.5 py-1.5 rounded bg-[#333333] hover:bg-[#444444] text-xs font-medium text-slate-200 transition-colors cursor-pointer border border-[#444444]"
              >
                Don't Save
              </button>
              <button
                type="button"
                onClick={handleExitCancel}
                className="px-3.5 py-1.5 rounded bg-transparent hover:bg-[#333333] text-xs font-medium text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. File Explorer Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-[100001] bg-[#252526] border border-[#333] rounded shadow-2xl py-1 w-48 text-xs text-slate-200 select-none animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleStartRename(contextMenu.file)}
            className="w-full text-left px-3 py-1.5 hover:bg-[#007acc] hover:text-white flex items-center gap-2 cursor-pointer"
          >
            <span>✏️</span>
            <span>Rename</span>
          </button>
          <button
            type="button"
            onClick={() => handleDuplicateFile(contextMenu.file)}
            className="w-full text-left px-3 py-1.5 hover:bg-[#007acc] hover:text-white flex items-center gap-2 cursor-pointer"
          >
            <span>📄</span>
            <span>Duplicate</span>
          </button>
          <button
            type="button"
            onClick={() => {
              saveToLocalDisk(contextMenu.file.name, contextMenu.file.content);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#007acc] hover:text-white flex items-center gap-2 cursor-pointer"
          >
            <span>⬇️</span>
            <span>Download to Disk</span>
          </button>
          <div className="border-t border-[#333] my-1" />
          <button
            type="button"
            onClick={() => {
              setFileToDelete(contextMenu.file);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-rose-600 hover:text-white text-rose-300 flex items-center gap-2 cursor-pointer"
          >
            <span>🗑️</span>
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* 3. Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-[100002] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#252526] border border-[#333] rounded-lg max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Delete File?</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              Are you sure you want to permanently delete{' '}
              <span className="font-mono text-amber-300 font-semibold">{fileToDelete.name}</span>? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                className="px-3.5 py-1.5 rounded bg-[#333] hover:bg-[#444] text-xs font-medium text-slate-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors cursor-pointer shadow"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Tab Close with Unsaved Changes Modal */}
      {tabPendingClose && (
        <div className="fixed inset-0 z-[100002] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#252526] border border-[#333] rounded-lg max-w-sm w-full p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Save changes before closing?</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              Do you want to save the changes you made to{' '}
              <span className="font-mono text-amber-300 font-semibold">
                {files.find((f) => f.id === tabPendingClose)?.name || 'this file'}
              </span>
              ? Your changes will be lost if you don't save them.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleResolveTabClose('save')}
                className="px-3 py-1.5 rounded bg-[#007acc] hover:bg-[#0062a3] text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => handleResolveTabClose('dont-save')}
                className="px-3 py-1.5 rounded bg-[#333] hover:bg-[#444] text-xs font-medium text-slate-300 transition-colors cursor-pointer"
              >
                Don't Save
              </button>
              <button
                type="button"
                onClick={() => setTabPendingClose(null)}
                className="px-3 py-1.5 rounded bg-transparent hover:bg-[#333] text-xs font-medium text-slate-400 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
}

export { CodeLab };
