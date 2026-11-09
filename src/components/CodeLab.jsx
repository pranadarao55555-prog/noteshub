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

// Supported languages and Judge0 CE Language IDs:
// C (GCC 9.2.0): 50
// Java (OpenJDK 13.0.1): 62
// Python 3 (3.8.1): 71
// R (4.0.0): 80
const LANGUAGES = {
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

const LANG_KEYS = Object.keys(LANGUAGES);

const EXT_TO_LANG = {
  '.c': 'c',
  '.java': 'java',
  '.py': 'python',
  '.r': 'r',
};

// ==========================================
// Permanent User-Scoped Storage (fileStore)
// ==========================================
export const fileStore = {
  getStorageKey(userId) {
    return `noteshub_code_files_${userId || 'guest'}`;
  },
  load(userId) {
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
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (err) {
      console.warn('Failed to load files from localStorage:', err);
    }
    return null;
  },
  save(files, userId) {
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
export const saveToLocalDisk = async (filename, content) => {
  // Modern File System Access API (Opens real OS Save As dialog)
  if ('showSaveFilePicker' in window) {
    try {
      const ext = filename.split('.').pop() || 'txt';
      const handle = await window.showSaveFilePicker({
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
    } catch (err) {
      if (err.name === 'AbortError') return false; // User cancelled OS prompt
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
function createStarterFiles() {
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

// Extension to language mapper
function getLanguageFromFilename(filename) {
  const trimmed = (filename || '').trim();
  const dotIdx = trimmed.lastIndexOf('.');
  if (dotIdx === -1) return null;
  const ext = trimmed.slice(dotIdx).toLowerCase();
  return EXT_TO_LANG[ext] || null;
}

// Filename validator
function validateFilename(filename, existingFiles, currentFileId = null) {
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

// Generate template for new files
function getStarterContent(filename, lang) {
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

// Suggest next untitled filename
function getSuggestedFilename(existingFiles, preferredLang = 'python') {
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

// Base64 UTF-8 codecs
function utf8ToBase64(str) {
  if (!str) return '';
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    )
  );
}

function base64ToUtf8(b64) {
  if (!b64) return '';
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(b64), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
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

// Compute terminal snapped height
function computeSnappedTerminalHeight(rawHeight, usableHeight) {
  const minH = 100;
  const maxH = Math.max(minH, Math.min(Math.floor(usableHeight * 0.85), usableHeight - 120));
  let h = Math.max(minH, Math.min(maxH, rawHeight));

  const snap25 = Math.round(usableHeight * 0.25);
  const snap50 = Math.round(usableHeight * 0.50);
  const snap75 = Math.round(usableHeight * 0.75);

  if (Math.abs(h - snap25) <= 12 && snap25 >= minH && snap25 <= maxH) {
    h = snap25;
  } else if (Math.abs(h - snap50) <= 12 && snap50 >= minH && snap50 <= maxH) {
    h = snap50;
  } else if (Math.abs(h - snap75) <= 12 && snap75 >= minH && snap75 <= maxH) {
    h = snap75;
  }
  return h;
}

function getInitialTerminalHeight() {
  try {
    const saved = localStorage.getItem(STORAGE_TERMINAL_H_KEY);
    if (saved !== null) {
      const num = Number(saved);
      if (Number.isFinite(num) && num >= 100) {
        return num;
      }
    }
  } catch {}
  return DEFAULT_TERMINAL_HEIGHT;
}

function getInitialSidebarWidth() {
  try {
    const saved = localStorage.getItem(STORAGE_SIDEBAR_W_KEY);
    if (saved !== null) {
      const num = Number(saved);
      if (Number.isFinite(num) && num >= 160 && num <= 400) {
        return num;
      }
    }
  } catch {}
  return DEFAULT_SIDEBAR_WIDTH;
}

// ==========================================
// CodeLab Component
// ==========================================
export default function CodeLab({ onClose, userId = null }) {
  // 1. Files & Tabs State
  const [files, setFiles] = useState(() => {
    const loaded = fileStore.load(userId);
    return loaded || createStarterFiles();
  });

  const [openFileIds, setOpenFileIds] = useState(() => {
    const initialFiles = fileStore.load(userId) || createStarterFiles();
    const py = initialFiles.find((f) => f.name === 'main.py');
    return py ? [py.id] : [initialFiles[0]?.id || ''];
  });

  const [activeFileId, setActiveFileId] = useState(() => {
    const initialFiles = fileStore.load(userId) || createStarterFiles();
    const py = initialFiles.find((f) => f.name === 'main.py');
    return py ? py.id : initialFiles[0]?.id || '';
  });

  // 2. Unsaved Changes & Dirty State
  const [isDirty, setIsDirty] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Dirty map for individual file tab/explorer indicators: fileId -> boolean
  const [dirtyMap, setDirtyMap] = useState({});
  const [saveStatus, setSaveStatus] = useState('Saved');

  // Track the last saved content for each file
  const savedContentsRef = useRef({});

  // Sort state for Explorer: 'recent' | 'name'
  const [sortBy, setSortBy] = useState('recent');

  // Sidebar visibility & width
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);

  // Inline forms state
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileError, setNewFileError] = useState('');

  const [renamingFileId, setRenamingFileId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  // Context Menu & Dialogs
  const [contextMenu, setContextMenu] = useState(null); // { x, y, file }
  const [fileToDelete, setFileToDelete] = useState(null); // CodeFile | null
  const [tabPendingClose, setTabPendingClose] = useState(null); // fileId | null

  // Terminal & Execution State
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(getInitialTerminalHeight);
  const [prevTerminalHeight, setPrevTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT);
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState({ text: '', isError: false });
  const [cursor, setCursor] = useState({ ln: 1, col: 1 });

  // Divider Dragging State
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const isDraggingDividerRef = useRef(false);
  const startDividerYRef = useRef(0);
  const startTerminalHRef = useRef(terminalHeight);
  const rafDividerRef = useRef(null);

  // Sidebar Resizing State
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const isResizingSidebarRef = useRef(false);
  const startSidebarXRef = useRef(0);
  const startSidebarWRef = useRef(sidebarWidth);
  const rafSidebarRef = useRef(null);

  // Layout & DOM Refs
  const mainContainerRef = useRef(null);
  const terminalRef = useRef(null);
  const editorRef = useRef(null);
  const handleManualSaveRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const newFileInputRef = useRef(null);
  const renameInputRef = useRef(null);

  const filesRef = useRef(files);
  filesRef.current = files;
  const dirtyMapRef = useRef(dirtyMap);
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

  const activeLangKey = activeFile?.language || 'python';

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
  // Lock document.body scroll while mounted
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Persist terminal height & sidebar width to localStorage
  useEffect(() => {
    if (Number.isFinite(terminalHeight) && terminalHeight >= 100 && !isMaximized) {
      try {
        localStorage.setItem(STORAGE_TERMINAL_H_KEY, String(terminalHeight));
      } catch {}
    }
  }, [terminalHeight, isMaximized]);

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
  const handleEditorChange = (newVal) => {
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
  const handleOpenFile = (fileId) => {
    if (!openFileIds.includes(fileId)) {
      setOpenFileIds((prev) => [...prev, fileId]);
    }
    setActiveFileId(fileId);
  };

  const handleStartCreateFile = (preferredLang = activeLangKey) => {
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
    const newFile = {
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

  const handleStartRename = (file) => {
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

  const handleDuplicateFile = (file) => {
    const ext = LANGUAGES[file.language]?.ext || '.py';
    const baseName = file.name.slice(0, file.name.lastIndexOf('.')) || file.name;
    let candidate = `${baseName}-copy${ext}`;
    let counter = 2;
    while (files.some((f) => f.name.toLowerCase() === candidate.toLowerCase())) {
      candidate = `${baseName}-copy-${counter}${ext}`;
      counter++;
    }

    const now = Date.now();
    const newFile = {
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

  const handleCloseTabRequest = (fileId, e) => {
    e?.stopPropagation();
    if (dirtyMap[fileId]) {
      setTabPendingClose(fileId);
    } else {
      executeCloseTab(fileId);
    }
  };

  const executeCloseTab = (fileId) => {
    const nextOpen = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(nextOpen);
    if (activeFileId === fileId) {
      const currentIndex = openFileIds.indexOf(fileId);
      const nextActive = nextOpen[currentIndex] || nextOpen[currentIndex - 1] || nextOpen[0] || '';
      setActiveFileId(nextActive);
    }
  };

  const handleResolveTabClose = async (action) => {
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
  const handleLanguagePillClick = (langKey) => {
    const openWithLang = openFileIds
      .map((id) => files.find((f) => f.id === id))
      .filter((f) => f && f.language === langKey);
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
      const headers = { 'Content-Type': 'application/json' };
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
          text: statusDesc ? `[${statusDesc}]\n${message}` : message,
          isError: true,
        });
      } else if (statusId && statusId !== 3) {
        const extra = stderr || stdout || '';
        setOutput({
          text: `[${statusDesc || 'Execution Failed'}]${extra ? `\n${extra}` : ''}`,
          isError: true,
        });
      } else if (stdout && stdout.length > 0) {
        setOutput({ text: stdout, isError: false });
      } else {
        setOutput({
          text: 'Process finished with no output.',
          isError: false,
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setOutput({ text: 'Execution timed out after 40 seconds.', isError: true });
      } else {
        setOutput({
          text: `Network failure: ${err.message || 'Unable to connect to Judge0 execution server.'}`,
          isError: true,
        });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsRunning(false);
    }
  };

  // ==========================================
  // Divider & Sidebar Drag Handlers
  // ==========================================
  const handleDividerMouseDown = (e) => {
    e.preventDefault();
    isDraggingDividerRef.current = true;
    setIsDraggingDivider(true);
    startDividerYRef.current = e.clientY;
    startTerminalHRef.current = terminalHeight;
    setIsMaximized(false);
  };

  const handleDividerTouchStart = (e) => {
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

    const onMove = (clientY) => {
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

    const handleMouseMove = (e) => onMove(e.clientY);
    const handleTouchMove = (e) => {
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

  const handleSidebarMouseDown = (e) => {
    e.preventDefault();
    isResizingSidebarRef.current = true;
    setIsResizingSidebar(true);
    startSidebarXRef.current = e.clientX;
    startSidebarWRef.current = sidebarWidth;
  };

  useEffect(() => {
    if (!isResizingSidebar) return;

    const onMove = (clientX) => {
      if (rafSidebarRef.current) cancelAnimationFrame(rafSidebarRef.current);
      rafSidebarRef.current = requestAnimationFrame(() => {
        const delta = clientX - startSidebarXRef.current;
        const raw = startSidebarWRef.current + delta;
        const clamped = Math.max(160, Math.min(400, raw));
        setSidebarWidth(clamped);
      });
    };

    const handleMouseMove = (e) => onMove(e.clientX);
    const handleTouchMove = (e) => {
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

  // ==========================================
  // Terminal Presets & Quick Buttons
  // ==========================================
  const toggleMaximize = () => {
    const usable = mainContainerRef.current
      ? mainContainerRef.current.clientHeight - 6
      : window.innerHeight - 78;
    const maxH = Math.max(100, Math.floor(usable * 0.85));

    if (!isMaximized) {
      setPrevTerminalHeight(terminalHeight);
      setTerminalHeight(maxH);
      setIsMaximized(true);
    } else {
      setTerminalHeight(computeSnappedTerminalHeight(prevTerminalHeight, usable));
      setIsMaximized(false);
    }
  };

  const handleSetTerminalPreset = (preset) => {
    const usable = mainContainerRef.current
      ? mainContainerRef.current.clientHeight - 6
      : window.innerHeight - 78;

    if (preset === 'min') {
      setTerminalHeight(100);
      setIsMaximized(false);
    } else if (preset === 'half') {
      setTerminalHeight(Math.round(usable * 0.5));
      setIsMaximized(false);
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
    const handleKeyDown = (e) => {
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

  const handleFileContextMenu = (e, file) => {
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
      className="fixed inset-0 z-[99999] flex flex-col bg-[#1e1e1e] overflow-hidden select-none"
      style={{ height: '100dvh', isolation: 'isolate' }}
    >
      {/* Drag Overlays to prevent iframe event interception */}
      {isDraggingDivider && <div className="fixed inset-0 z-[100000] cursor-row-resize select-none" />}
      {isResizingSidebar && <div className="fixed inset-0 z-[100000] cursor-col-resize select-none" />}

      {/* 1. TOP HEADER BAR */}
      <header className="h-12 shrink-0 bg-[#252526] border-b border-[#333] px-4 flex items-center justify-between select-none">
        {/* Left Side: Sidebar Toggle & Language Selector Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className={`p-1.5 rounded text-xs transition-colors cursor-pointer border ${
              sidebarOpen
                ? 'bg-[#1e1e1e] border-[#333] text-sky-400'
                : 'bg-[#2d2d2d] border-[#444] text-slate-400 hover:text-white'
            }`}
            title="Toggle Sidebar (Ctrl+B)"
            aria-label="Toggle Sidebar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </button>

          <div className="flex items-center gap-1 bg-[#1e1e1e] p-1 rounded-md border border-[#333]">
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
            className="px-3 py-1.5 bg-[#333] hover:bg-[#444] text-slate-200 hover:text-white rounded text-xs font-medium border border-[#444] transition-colors cursor-pointer"
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
            <div className="h-9 shrink-0 px-3 bg-[#1f1f1f] border-b border-[#2d2d2d] flex items-center justify-between text-xs">
              <span className="font-bold tracking-wider text-slate-400 text-[11px]">EXPLORER</span>
              <div className="flex items-center gap-1">
                {/* Sort Toggle */}
                <button
                  type="button"
                  onClick={() => setSortBy((prev) => (prev === 'recent' ? 'name' : 'recent'))}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#2d2d2d] transition-colors cursor-pointer text-[10px]"
                  title={`Sort by: ${sortBy === 'recent' ? 'Most Recent' : 'Name (A-Z)'}`}
                  aria-label="Toggle sort order"
                >
                  {sortBy === 'recent' ? '🕒' : '🔤'}
                </button>
                {/* New File (+) */}
                <button
                  type="button"
                  onClick={() => handleStartCreateFile()}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#2d2d2d] transition-colors cursor-pointer"
                  title="New File"
                  aria-label="New File"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {/* Collapse */}
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-[#2d2d2d] transition-colors cursor-pointer"
                  title="Collapse Sidebar (Ctrl+B)"
                  aria-label="Collapse Sidebar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* File List */}
            <div className="flex-1 min-h-0 overflow-y-auto py-1">
              {/* Inline New File Input Form */}
              {isCreatingFile && (
                <div className="px-2 py-2 w-full min-w-0 box-border bg-[#252526] border-b border-[#333]">
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
                      setIsCreatingFile(false);
                      setNewFileName('');
                      setNewFileError('');
                    }}
                    className="w-full box-border bg-[#3c3c3c] text-white caret-white placeholder:text-neutral-400 border border-[#007acc] rounded-sm px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-[#007acc]"
                    style={{ color: '#ffffff', backgroundColor: '#3c3c3c' }}
                    placeholder="filename.py"
                  />
                  {newFileError && (
                    <div className="text-rose-400 text-xs mt-1 leading-tight">{newFileError}</div>
                  )}
                  <div className="text-[11px] text-neutral-400 mt-1">Enter to create • Esc to cancel</div>
                </div>
              )}

              {/* Files */}
              {sortedFiles.map((file) => {
                const isActive = file.id === activeFileId;
                const isItemDirty = Boolean(dirtyMap[file.id] || (isActive && isDirty));
                const isRenaming = renamingFileId === file.id;

                if (isRenaming) {
                  return (
                    <div key={file.id} className="px-2 py-2 w-full min-w-0 box-border bg-[#252526] border-b border-[#333]">
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
                        onBlur={() => {
                          setRenamingFileId(null);
                          setRenameValue('');
                          setRenameError('');
                        }}
                        className="w-full box-border bg-[#3c3c3c] text-white caret-white placeholder:text-neutral-400 border border-[#007acc] rounded-sm px-2 py-1 text-sm font-mono outline-none focus:ring-1 focus:ring-[#007acc]"
                        style={{ color: '#ffffff', backgroundColor: '#3c3c3c' }}
                      />
                      {renameError && (
                        <div className="text-rose-400 text-xs mt-1 leading-tight">{renameError}</div>
                      )}
                      <div className="text-[11px] text-neutral-400 mt-1">Enter to save • Esc to cancel</div>
                    </div>
                  );
                }

                return (
                  <div
                    key={file.id}
                    onClick={() => handleOpenFile(file.id)}
                    onContextMenu={(e) => handleFileContextMenu(e, file)}
                    className={`group px-3 py-1.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#2a2d2e] text-white font-medium border-l-2 border-indigo-500'
                        : 'text-slate-300 hover:bg-[#202224] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0 pr-1">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${LANGUAGES[file.language]?.color || 'bg-slate-400'}`} />
                      <span className="truncate font-mono text-[12px]">{file.name}</span>
                      {isItemDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved" />}
                    </div>

                    {/* Hover Action Icons */}
                    <div className="hidden group-hover:flex items-center gap-1 shrink-0 text-slate-400">
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

        {/* Sidebar Vertical Resizer */}
        {sidebarOpen && (
          <div
            onMouseDown={handleSidebarMouseDown}
            className={`w-[4px] shrink-0 cursor-col-resize hover:bg-[#007acc] transition-colors relative select-none ${
              isResizingSidebar ? 'bg-[#007acc]' : 'bg-[#2d2d2d]'
            }`}
            title="Drag to resize sidebar"
          >
            <div className="absolute -left-1 -right-1 top-0 bottom-0 z-10 cursor-col-resize" />
          </div>
        )}

        {/* RIGHT MAIN COLUMN: Editor Area + Resizable Divider + Terminal Drawer */}
        <div
          ref={mainContainerRef}
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

            {/* Editor Surface or Empty State */}
            {activeFile ? (
              <div className="flex-1 min-h-0 min-w-0 relative w-full bg-[#1e1e1e]">
                <Editor
                  height="100%"
                  width="100%"
                  path={`${activeFile.id}/${activeFile.name}`}
                  language={LANGUAGES[activeFile.language]?.monacoLang || 'python'}
                  value={activeFile.content}
                  onChange={handleEditorChange}
                  onMount={(editor, monaco) => {
                    editorRef.current = editor;
                    editor.onDidChangeCursorPosition((e) => {
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
                      title="Half Screen (50%)"
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
                    onClick={() => setOutput({ text: '', isError: false })}
                    className="text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded hover:bg-[#2d2d2d] transition-colors cursor-pointer"
                    title="Clear output"
                  >
                    Clear
                  </button>

                  {/* Maximize / Restore Toggle Button */}
                  <button
                    type="button"
                    onClick={toggleMaximize}
                    className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-[#2d2d2d] transition-colors cursor-pointer text-xs"
                    title={isMaximized ? 'Restore Terminal Size' : 'Maximize Terminal'}
                  >
                    {isMaximized ? '🗗' : '🗖'}
                  </button>

                  {/* Close Terminal Button */}
                  <button
                    type="button"
                    onClick={() => setTerminalOpen(false)}
                    className="text-slate-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-[#2d2d2d] transition-colors cursor-pointer text-xs"
                    title="Close Terminal (Ctrl+`)"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Terminal Output Body */}
              <pre
                ref={terminalRef}
                className={`flex-1 min-h-0 overflow-auto p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap select-text ${
                  output.isError
                    ? 'text-rose-400'
                    : output.text
                    ? 'text-emerald-400'
                    : 'text-neutral-400'
                }`}
              >
                {output.text || '$ Press "Run Code" or Ctrl+Enter to execute...'}
              </pre>
            </section>
          )}
        </div>
      </div>

      {/* 3. BOTTOM STATUS BAR (24px, bg-[#007acc], text-white) */}
      <footer className="h-6 shrink-0 bg-[#007acc] text-white text-[11px] font-sans px-3 flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium">
            <span>{LANGUAGES[activeLangKey]?.label || 'CodeLab'}</span>
            <span className="opacity-60">•</span>
            <span>{activeFile?.name || 'No file'}</span>
          </span>
        </div>

        <div className="flex items-center gap-4 text-[10px] font-mono opacity-90">
          <span>{`Ln ${cursor.ln}, Col ${cursor.col}`}</span>
          <span>Spaces: 4</span>
          <span>UTF-8</span>
          <span
            className={`font-sans font-medium px-1.5 py-0.2 rounded ${
              isDirty
                ? 'bg-amber-500/80 text-white'
                : saveStatus === 'Saving...'
                ? 'bg-sky-900/60 text-white animate-pulse'
                : 'text-white/80'
            }`}
          >
            {isDirty ? '● Unsaved' : saveStatus}
          </span>
        </div>
      </footer>

      {/* ========================================== */}
      {/* IN-APP MODALS & DIALOGS                    */}
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
                className="px-3 py-1.5 rounded bg-[#333] hover:bg-[#444] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Unsaved Tab Close Modal */}
      {tabPendingClose && (
        <div className="fixed inset-0 z-[100002] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-[#252526] border border-[#333] rounded-lg max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100 mb-2">Unsaved Changes</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              Do you want to save the changes you made to{' '}
              <span className="font-mono text-amber-300 font-semibold">
                {files.find((f) => f.id === tabPendingClose)?.name || 'this file'}
              </span>{' '}
              before closing? Your changes will be lost if you don't save them.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleResolveTabClose('cancel')}
                className="px-3 py-1.5 rounded bg-[#333] hover:bg-[#444] text-xs font-medium text-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResolveTabClose('dont-save')}
                className="px-3 py-1.5 rounded bg-amber-600/80 hover:bg-amber-600 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Don't Save
              </button>
              <button
                type="button"
                onClick={() => handleResolveTabClose('save')}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Save
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
