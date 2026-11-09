import * as pdfjsLib from 'pdfjs-dist';
import type { Note } from '../types';

// Ensure the PDF.js web worker is configured once globally
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

interface CachedDocument {
  noteId: string;
  pdf: pdfjsLib.PDFDocumentProxy;
  accessedAt: number;
  url: string;
}

// Module-level document cache (keeps last 5 documents for instant reopening)
const MAX_CACHED_DOCS = 5;
const documentCache = new Map<string, CachedDocument>();

// In-flight Promise and Task maps for deduplication and cancellation
const inFlightPromises = new Map<string, Promise<pdfjsLib.PDFDocumentProxy>>();
const inFlightTasks = new Map<string, any>();

/**
 * Evict oldest documents when cache exceeds MAX_CACHED_DOCS
 */
function evictOldestIfNeeded(): void {
  if (documentCache.size <= MAX_CACHED_DOCS) return;

  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  documentCache.forEach((entry, key) => {
    if (entry.accessedAt < oldestTime) {
      oldestTime = entry.accessedAt;
      oldestKey = key;
    }
  });

  if (oldestKey) {
    const evicted = documentCache.get(oldestKey);
    if (evicted) {
      try {
        evicted.pdf.destroy();
      } catch {
        // ignore
      }
    }
    documentCache.delete(oldestKey);
  }
}

/**
 * Fetch or retrieve cached PDFDocumentProxy with range-chunk streaming, request deduplication, and AbortSignal support.
 */
export async function getOrLoadPdfDocument(note: Note, signal?: AbortSignal): Promise<pdfjsLib.PDFDocumentProxy> {
  const noteId = String(note.id);
  const rawUrl = note.file_url || note.fileUrl;

  if (!rawUrl) {
    throw new Error('Note does not have a valid document URL.');
  }

  const urlLower = rawUrl.toLowerCase();
  const isPptx =
    urlLower.endsWith('.pptx') ||
    urlLower.endsWith('.ppt') ||
    urlLower.includes('.pptx?') ||
    urlLower.includes('.ppt?');

  const fileUrl = isPptx ? `/api/convert-pptx?url=${encodeURIComponent(rawUrl)}` : rawUrl;

  // 1. Check in-memory cache
  const cached = documentCache.get(noteId);
  if (cached && cached.url === fileUrl) {
    cached.accessedAt = Date.now();
    return cached.pdf;
  }

  // 2. Check in-flight requests to deduplicate concurrent requests
  const existingPromise = inFlightPromises.get(noteId);
  if (existingPromise) {
    return existingPromise;
  }

  // If already aborted before start
  if (signal?.aborted) {
    throw new DOMException('Document loading aborted', 'AbortError');
  }

  // 3. Initiate loading with HTTP range chunk streaming (1MB chunks)
  const loadingTask = pdfjsLib.getDocument({
    url: fileUrl,
    rangeChunkSize: 1048576, // 1MB chunks on demand
    disableAutoFetch: true,   // Never download entire 200MB+ file upfront
    disableStream: false,     // Stream progressive pages
    withCredentials: false,
  });

  inFlightTasks.set(noteId, loadingTask);

  const abortHandler = () => {
    try {
      loadingTask.destroy();
    } catch {
      // ignore
    }
    inFlightPromises.delete(noteId);
    inFlightTasks.delete(noteId);
  };

  if (signal) {
    signal.addEventListener('abort', abortHandler, { once: true });
  }

  const loadPromise = (async () => {
    try {
      const pdf = await loadingTask.promise;

      // Store in LRU cache
      documentCache.set(noteId, {
        noteId,
        pdf,
        accessedAt: Date.now(),
        url: fileUrl,
      });

      evictOldestIfNeeded();
      return pdf;
    } finally {
      inFlightPromises.delete(noteId);
      inFlightTasks.delete(noteId);
      if (signal) {
        signal.removeEventListener('abort', abortHandler);
      }
    }
  })();

  inFlightPromises.set(noteId, loadPromise);
  return loadPromise;
}

/**
 * Prefetch document on note card hover or focus
 */
export function prefetchNoteDocument(note: Note): void {
  const noteId = String(note.id);
  const fileUrl = note.file_url || note.fileUrl;
  if (!fileUrl) return;

  // If already cached or currently in flight, do nothing
  if (documentCache.has(noteId) || inFlightPromises.has(noteId)) {
    return;
  }

  // Non-blocking prefetch during browser idle time
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => {
      getOrLoadPdfDocument(note).catch(() => {
        // Silent catch for speculative prefetch
      });
    }, { timeout: 2000 });
  } else {
    setTimeout(() => {
      getOrLoadPdfDocument(note).catch(() => {});
    }, 200);
  }
}

/**
 * Clean up a specific document from cache
 */
export function evictDocument(noteId: string): void {
  const cached = documentCache.get(noteId);
  if (cached) {
    try {
      cached.pdf.destroy();
    } catch {
      // ignore
    }
    documentCache.delete(noteId);
  }
  inFlightPromises.delete(noteId);
}
