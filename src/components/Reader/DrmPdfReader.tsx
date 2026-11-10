import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Minimize, 
  RotateCw, 
  Sparkles, 
  ArrowLeft, 
  Loader2, 
  Shield, 
  AlertCircle,
  RefreshCw,
  MoreVertical,
  Maximize2
} from 'lucide-react';
import { DisclaimerBanner } from '../Common/DisclaimerBanner';
import { SecurityToast } from '../Common/SecurityToast';
import { usePresence } from '../../context/PresenceContext';
import { getOrLoadPdfDocument } from '../../services/documentCache';
import {
  isPptxDocument,
  queueBackgroundPdfTextExtraction,
} from '../../services/documentTextService';
import type { Note } from '../../types';

interface DrmPdfReaderProps {
  note: Note;
  onClose: () => void;
  onOpenGemini: () => void;
  isGeminiOpen?: boolean;
  onPageChange?: (currentPage: number, totalPages: number) => void;
}

/**
 * Isolated presence tracker to completely decouple presence updates from the document reader.
 * This prevents Realtime presence broadcast loops from causing reader re-renders for students.
 */
const PresenceTracker: React.FC<{ noteId: string; noteTitle: string }> = React.memo(({ noteId, noteTitle }) => {
  const { updateCurrentNoteViewing } = usePresence();
  const lastTrackedKeyRef = useRef<string>('');

  useEffect(() => {
    const key = `${noteId}:${noteTitle}`;
    if (lastTrackedKeyRef.current !== key) {
      lastTrackedKeyRef.current = key;
      updateCurrentNoteViewing(noteId, noteTitle);
    }

    return () => {
      updateCurrentNoteViewing();
    };
  }, [noteId, noteTitle, updateCurrentNoteViewing]);

  return null;
});

export const DrmPdfReaderComponent: React.FC<DrmPdfReaderProps> = ({
  note,
  onClose,
  onOpenGemini,
  isGeminiOpen: _isGeminiOpen,
  onPageChange,
}) => {
  const isPptx = isPptxDocument(note);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<any>(null);
  const prefetchedPagesRef = useRef<Map<number, pdfjsLib.PDFPageProxy>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  const renderTokenRef = useRef<number>(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInputValue, setPageInputValue] = useState<string>('1');
  const [scale, setScale] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      const avail = Math.max(280, window.innerWidth - 24);
      return Math.max(0.45, Math.min(avail / (isPptx ? 960 : 612), 2.0));
    }
    return 1.15;
  });
  const [previewScaleRatio, setPreviewScaleRatio] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [securityAlert, setSecurityAlert] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState<boolean>(false);
  const [pageAspectRatio, setPageAspectRatio] = useState<number>(isPptx ? 0.5625 : 1.294); // Standard A4 (1.294) or 16:9 Presentation (0.5625)
  const [showMoreMenu, setShowMoreMenu] = useState<boolean>(false);

  useEffect(() => {
    setPageInputValue(String(currentPage));
  }, [currentPage]);

  const onPageChangeRef = useRef(onPageChange);
  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  const goToPrevPage = useCallback(() => {
    setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));
  }, []);

  const goToNextPage = useCallback(() => {
    setCurrentPage((prev) => (prev < numPages ? prev + 1 : prev));
  }, [numPages]);

  // Strict DRM Keyboard & Shortcut Interception
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Intercept Print
      if (isCtrlOrMeta && key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        setSecurityAlert('Printing is strictly disabled. All note pages are DRM protected.');
        return false;
      }

      // Intercept Save / Download
      if (isCtrlOrMeta && key === 's') {
        e.preventDefault();
        e.stopPropagation();
        setSecurityAlert('Direct file downloads and saving are prohibited to prevent unauthorized distribution.');
        return false;
      }

      // Intercept View Source
      if (isCtrlOrMeta && key === 'u') {
        e.preventDefault();
        e.stopPropagation();
        setSecurityAlert('Page source inspection is restricted.');
        return false;
      }

      // Intercept Copy
      if (isCtrlOrMeta && key === 'c') {
        e.preventDefault();
        e.stopPropagation();
        setSecurityAlert('Clipboard extraction is blocked on secure document pages.');
        return false;
      }

      // Intercept Developer Tools
      if (
        e.key === 'F12' ||
        (isCtrlOrMeta && e.shiftKey && (key === 'i' || key === 'j' || key === 'c'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        setSecurityAlert('Developer tools and DOM inspection are restricted.');
        return false;
      }

      // Arrow navigation
      if (key === 'arrowleft') {
        goToPrevPage();
      } else if (key === 'arrowright') {
        goToNextPage();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setSecurityAlert('Right-click context menu is disabled for protected lecture notes.');
      return false;
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [goToPrevPage, goToNextPage]);

  // Discrete Signature Watermark onto the rendered Canvas
  const drawDynamicWatermark = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number) => {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = 'rgba(140, 140, 140, 0.45)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';

      ctx.fillText('Notes by Pranada', width - 24, height - 20);
      ctx.restore();
    },
    []
  );

  // Load document (PDF.js prioritized to directly render original presentation with authentic logos & layouts)
  const loadDocument = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    // Primary path: Load via PDF.js to directly paint the authentic original page stream
    try {
      const pdf = await getOrLoadPdfDocument(note, controller.signal);
      if (controller.signal.aborted) return;

      pdfDocRef.current = pdf;
      setNumPages(pdf.numPages);
      setCurrentPage(1);

      // Dynamically detect page 1 aspect ratio to match exact slide format (e.g. 16:9)
      try {
        const firstPage = await pdf.getPage(1);
        const vp = firstPage.getViewport({ scale: 1 });
        if (vp.width > 0) {
          setPageAspectRatio(vp.height / vp.width);
          if (typeof window !== 'undefined' && window.innerWidth < 768) {
            const availWidth = (containerRef.current?.clientWidth || window.innerWidth) - 24;
            const fitScale = Math.max(0.4, Math.min(availWidth / vp.width, 2.0));
            setScale(fitScale);
          }
        }
      } catch {
        // use default aspect ratio
      }

      setLoading(false);

      if (onPageChangeRef.current) {
        onPageChangeRef.current(1, pdf.numPages);
      }

      // Schedule background text extraction for study assistant (non-blocking)
      queueBackgroundPdfTextExtraction(note.id, pdf, 1);
    } catch (pdfErr: any) {
      if (pdfErr?.name === 'AbortError' || controller.signal.aborted) {
        return;
      }

      console.error('Failed to stream document:', pdfErr);
      setError(
        pdfErr.message || 'Failed to stream document. Range chunk requests failed or file is unavailable.'
      );
      setLoading(false);
    }
  }, [note]);

  useEffect(() => {
    loadDocument();

    const prefetched = prefetchedPagesRef.current;
    return () => {
      abortControllerRef.current?.abort();
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      prefetched.forEach((page) => {
        try {
          page.cleanup();
        } catch {
          // ignore
        }
      });
      prefetched.clear();
    };
  }, [loadDocument]);

  // Prefetch adjacent pages into memory (1-page forward, 1-page back buffer) using requestIdleCallback
  const prefetchAdjacentPages = useCallback(
    (pageNum: number, total: number) => {
      if (!pdfDocRef.current) return;
      const pagesToPrefetch: number[] = [];
      if (pageNum + 1 <= total && !prefetchedPagesRef.current.has(pageNum + 1)) {
        pagesToPrefetch.push(pageNum + 1);
      }
      if (pageNum - 1 >= 1 && !prefetchedPagesRef.current.has(pageNum - 1)) {
        pagesToPrefetch.push(pageNum - 1);
      }

      if (pagesToPrefetch.length === 0) return;

      const schedulePrefetch = (typeof window !== 'undefined' && 'requestIdleCallback' in window)
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 100);

      schedulePrefetch(() => {
        pagesToPrefetch.forEach(async (pNum) => {
          try {
            if (!pdfDocRef.current) return;
            const page = await pdfDocRef.current.getPage(pNum);
            prefetchedPagesRef.current.set(pNum, page);
          } catch {
            // speculative prefetch silent catch
          }
        });
      });
    },
    []
  );

  // Render authentic PDF page directly from page stream onto Canvas
  const renderPdfPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDocRef.current || !canvasRef.current) return;

      const renderToken = ++renderTokenRef.current;

      // Cancel any ongoing render task before starting new render
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }

      setRenderProgress(true);

      try {
        let page = prefetchedPagesRef.current.get(pageNum);
        if (!page) {
          page = await pdfDocRef.current.getPage(pageNum);
        }

        if (renderToken !== renderTokenRef.current) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) return;

        const viewport = page.getViewport({ scale, rotation });
        // Cap DPR to 2 to eliminate multi-megabyte canvas explosion on Retina / high-DPI screens
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        // Track aspect ratio for responsive centering
        if (viewport.width > 0) {
          setPageAspectRatio(viewport.height / viewport.width);
        }

        // Set dimensions
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        // 1. Ensure canvas viewport uses a pure #ffffff background directly before rendering
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, viewport.width, viewport.height);

        // 2. Directly paint the original page stream without CSS filter inversions or color modifications
        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          background: 'rgb(255, 255, 255)',
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;

        if (renderToken !== renderTokenRef.current) return;

        // 3. Burn discrete watermark in bottom-right without altering slide pixels
        drawDynamicWatermark(context, viewport.width, viewport.height, dpr);

        // Reset any temporary CSS zoom preview transform
        setPreviewScaleRatio(1);
        setRenderProgress(false);

        if (onPageChangeRef.current) {
          onPageChangeRef.current(pageNum, numPages);
        }

        prefetchAdjacentPages(pageNum, numPages);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('Error rendering PDF page:', err);
        }
        if (renderToken === renderTokenRef.current) {
          setRenderProgress(false);
        }
      }
    },
    [scale, rotation, numPages, drawDynamicWatermark, prefetchAdjacentPages]
  );

  // Render visible page: strictly paint the authentic original page stream
  const renderPage = useCallback(
    async (pageNum: number) => {
      if (pdfDocRef.current) {
        await renderPdfPage(pageNum);
      }
    },
    [renderPdfPage]
  );

  // Render visible page with requestAnimationFrame
  useEffect(() => {
    if (!loading && numPages > 0) {
      let animId: number;
      animId = window.requestAnimationFrame(() => {
        renderPage(currentPage);
      });
      return () => {
        window.cancelAnimationFrame(animId);
      };
    }
  }, [loading, currentPage, scale, rotation, renderPage, numPages]);

  // Debounce resize listener (200ms) to avoid continuous rasterization loops
  useEffect(() => {
    let timeoutId: number | undefined;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        if (!loading && numPages > 0) {
          renderPage(currentPage);
        }
      }, 200);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
    };
  }, [loading, numPages, currentPage, renderPage]);

  // Instant CSS transform preview for zoom with debounced rasterization
  const zoomDebounceRef = useRef<number | undefined>(undefined);

  const applyZoom = useCallback((newScale: number) => {
    const clampedScale = Math.max(0.6, Math.min(newScale, 3.0));
    const ratio = clampedScale / scale;
    setPreviewScaleRatio(ratio);

    window.clearTimeout(zoomDebounceRef.current);
    zoomDebounceRef.current = window.setTimeout(() => {
      setScale(clampedScale);
    }, 180);
  }, [scale]);

  const handleZoomIn = () => {
    applyZoom(scale + 0.25);
  };

  const handleZoomOut = () => {
    applyZoom(scale - 0.25);
  };

  const handleFitWidth = () => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth - 24;
      const baseWidth = isPptx ? 960 : 612;
      const estimatedScale = containerWidth / baseWidth;
      applyZoom(Math.max(0.4, Math.min(estimatedScale, 2.5)));
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-40 flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden h-[100dvh] max-h-[100dvh] max-w-full"
      style={{
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        setSecurityAlert('Context menu is disabled on DRM protected material.');
      }}
    >
      {/* Isolated Presence Tracker (runs silently without re-rendering the reader) */}
      <PresenceTracker noteId={note.id} noteTitle={note.title} />

      {/* Persistent Disclaimer Banner */}
      <DisclaimerBanner />

      {/* Reader Shell Header (Renders instantly before file finishes streaming) */}
      <div className="relative flex items-center justify-between gap-1.5 sm:gap-3 px-2 sm:px-4 py-2 sm:py-2.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md shrink-0">
        {/* Document Info & Back Button */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={onClose}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium btn-spring focus:ring-2 focus:ring-indigo-500 focus:outline-none shrink-0"
            title="Return to Notes Library"
            aria-label="Back to Notes"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1.5">Back</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1 sm:gap-2">
              <span className="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-xs font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0 whitespace-nowrap">
                {note.subject}
              </span>
              {isPptx ? (
                <span className="hidden xs:inline px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-xs font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0 whitespace-nowrap">
                  Presentation
                </span>
              ) : note.isLabRecord ? (
                <span className="hidden xs:inline px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-xs font-semibold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0 whitespace-nowrap">
                  Lab Record
                </span>
              ) : null}
            </div>
            <h2 className="text-xs sm:text-sm md:text-base font-semibold text-slate-100 truncate max-w-[100px] xs:max-w-[140px] sm:max-w-xs md:max-w-md">
              {note.title}
            </h2>
          </div>
        </div>

        {/* Page Jump & Navigation */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1 || loading}
            className="min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 transition-colors btn-spring cursor-pointer"
            title="Previous Page (Left Arrow)"
            aria-label="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 text-xs font-mono px-1.5 sm:px-2 py-1 bg-slate-950/60 rounded-md border border-slate-800 shrink-0">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInputValue}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setPageInputValue(val);
              }}
              onBlur={() => {
                const num = parseInt(pageInputValue, 10);
                if (!isNaN(num)) {
                  const clamped = Math.max(1, Math.min(num, numPages || 1));
                  setCurrentPage(clamped);
                  setPageInputValue(String(clamped));
                } else {
                  setPageInputValue(String(currentPage));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const num = parseInt(pageInputValue, 10);
                  if (!isNaN(num)) {
                    const clamped = Math.max(1, Math.min(num, numPages || 1));
                    setCurrentPage(clamped);
                    setPageInputValue(String(clamped));
                  }
                }
              }}
              className="w-8 sm:w-10 bg-transparent text-center font-bold text-indigo-300 focus:outline-none"
              aria-label="Current page number"
            />
            <span className="text-slate-500">/</span>
            <span className="text-slate-400">{numPages || '–'}</span>
          </div>

          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages || loading}
            className="min-w-[32px] min-h-[32px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 transition-colors btn-spring cursor-pointer"
            title="Next Page (Right Arrow)"
            aria-label="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport Tools: Desktop full bar vs Mobile Kebab menu */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Desktop inline zoom controls */}
          <div className="hidden md:flex items-center gap-1.5">
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors btn-spring cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <button
              onClick={handleFitWidth}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors btn-spring whitespace-nowrap cursor-pointer"
              title="Fit to Width"
            >
              Fit
            </button>

            <span className="text-xs font-mono text-slate-400 w-12 text-center inline-block">
              {Math.round(scale * 100)}%
            </span>

            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors btn-spring cursor-pointer"
              title="Zoom In"
              aria-label="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors btn-spring cursor-pointer"
              title="Rotate Page"
              aria-label="Rotate Page"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors btn-spring cursor-pointer"
              title="Toggle Fullscreen"
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            <div className="h-5 w-px bg-slate-800 mx-1" />
          </div>

          {/* Ask Gemini AI Trigger Button: Icon-only on mobile, full on desktop */}
          <button
            onClick={onOpenGemini}
            className="min-h-[36px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 bouncy-btn shrink-0 whitespace-nowrap cursor-pointer"
            title="Ask AI Study Assistant about this document"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-spin-slow shrink-0" />
            <span className="hidden sm:inline">Ask Gemini AI</span>
          </button>

          {/* Mobile Kebab Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setShowMoreMenu((prev) => !prev)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors md:hidden cursor-pointer"
            title="More Options"
            aria-label="More Options"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile More Popover Menu */}
        {showMoreMenu && (
          <div
            className="absolute right-3 top-14 z-50 bg-slate-900/95 border border-slate-800 rounded-xl shadow-2xl p-2 w-48 text-xs text-slate-200 select-none animate-in fade-in zoom-in-95 backdrop-blur-md md:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-800/80 mb-1 flex items-center justify-between">
              <span>Zoom: {Math.round(scale * 100)}%</span>
            </div>

            <button
              type="button"
              onClick={() => {
                handleZoomIn();
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
            >
              <ZoomIn className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Zoom In (+25%)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleZoomOut();
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
            >
              <ZoomOut className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Zoom Out (-25%)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleFitWidth();
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
            >
              <Maximize2 className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Fit to Width</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRotation((r) => (r + 90) % 360);
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left"
            >
              <RotateCw className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>Rotate Page (+90°)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                toggleFullscreen();
                setShowMoreMenu(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition-colors cursor-pointer text-left border-t border-slate-800/80 mt-1 pt-2"
            >
              {isFullscreen ? <Minimize className="w-4 h-4 text-indigo-400 shrink-0" /> : <Maximize className="w-4 h-4 text-indigo-400 shrink-0" />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Document Stage */}
      <div
        className="flex-1 relative overflow-auto flex items-center justify-center p-3 sm:p-6 bg-slate-950 select-none"
        onDragStart={(e) => e.preventDefault()}
        onClick={() => setShowMoreMenu(false)}
      >
        {/* Instant Lightweight CSS Skeleton Placeholder with Pure White Slide Background */}
        {loading && (
          <div 
            className="w-full max-w-[800px] rounded-lg bg-white shadow-2xl p-6 sm:p-12 flex flex-col items-center justify-center border border-slate-200/40"
            style={{ 
              aspectRatio: `${1 / pageAspectRatio}`,
              transform: `scale(${scale * previewScaleRatio})`,
              transformOrigin: 'center center',
              transition: 'transform 120ms ease-out',
              backgroundColor: '#ffffff',
              colorScheme: 'light',
            }}
          >
            <div className="flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-xs font-semibold text-slate-700">Streaming authentic presentation slides...</span>
            </div>
          </div>
        )}

        {/* Error State with Retry Button */}
        {error && (
          <div className="max-w-md p-6 bg-red-950/40 border border-red-800/60 rounded-2xl text-center animate-nh-card">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-red-200 mb-1">Failed to Stream Note</h3>
            <p className="text-xs text-slate-300 mb-4">{error}</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={loadDocument}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg btn-spring"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg btn-spring text-slate-300"
              >
                Back to Notes
              </button>
            </div>
          </div>
        )}

        {/* The slide container itself sits centered with its original aspect ratio */}
        <div
          className={`relative transition-opacity duration-200 ${
            loading || error ? 'hidden' : 'flex items-center justify-center'
          }`}
          style={{
            transform: previewScaleRatio !== 1 ? `scale(${previewScaleRatio})` : 'none',
            transformOrigin: 'center center',
            transition: 'transform 120ms ease-out',
          }}
        >
          <div
            className="relative rounded-lg overflow-hidden bg-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.12)]"
            style={{
              backgroundColor: '#ffffff',
              filter: 'none',
              colorScheme: 'light',
            }}
          >
            {/* DRM Badge positioned directly inside canvas corner */}
            {!loading && !error && (
              <div className="absolute top-2 left-2 z-20 pointer-events-none opacity-60 hover:opacity-100 transition-opacity">
                <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-900/80 border border-slate-800 rounded-md text-[9px] sm:text-[10px] text-slate-400 font-mono backdrop-blur-sm shadow-md">
                  <Shield className="w-2.5 h-2.5 text-emerald-400" />
                  <span>DRM Active</span>
                </div>
              </div>
            )}

            {renderProgress && (
              <div className="absolute top-2 right-2 z-20 px-2 py-1 bg-slate-900/80 rounded text-[10px] text-indigo-300 font-mono flex items-center gap-1 shadow-md">
                <Loader2 className="w-3 h-3 animate-spin" /> Rendering...
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="block max-w-none cursor-default bg-white"
              style={{
                backgroundColor: '#ffffff',
                filter: 'none',
                colorScheme: 'light',
                display: 'block',
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setSecurityAlert('Canvas extraction is blocked. Note identity is permanently watermarked.');
              }}
            />
          </div>
        </div>
      </div>

      {/* Security alert toast */}
      {securityAlert && (
        <SecurityToast message={securityAlert} onClose={() => setSecurityAlert(null)} />
      )}
    </div>
  );
};

export const DrmPdfReader = React.memo(DrmPdfReaderComponent);
