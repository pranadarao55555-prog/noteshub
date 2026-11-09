import * as pdfjsLib from 'pdfjs-dist';
import type { Note } from '../types';

export interface PptxSlideData {
  slideNumber: number;
  title: string;
  paragraphs: string[];
  fullText: string;
}

// In-memory cache for extracted text per document and page/slide
// NoteId -> Map<PageNumber, ExtractedText>
const documentTextStore = new Map<string, Map<number, string>>();

// Cache for structured PPTX slides: NoteId -> PptxSlideData[]
const pptxSlideStore = new Map<string, PptxSlideData[]>();

// In-flight extraction promises to prevent redundant duplicate work
const inFlightExtractions = new Map<string, Promise<any>>();

/**
 * Checks if a note is a PowerPoint presentation (PPTX / PPT)
 */
export function isPptxDocument(note: Note | null | undefined): boolean {
  if (!note) return false;
  const url = (note.file_url || note.fileUrl || '').toLowerCase();
  if (url.endsWith('.pdf') || url.includes('.pdf?')) return false;

  const fileType = (note.file_type || '').toLowerCase();
  if (fileType === 'application/pdf') return false;

  const title = (note.title || '').toLowerCase();
  const fileName = (note.fileName || '').toLowerCase();

  return (
    url.endsWith('.pptx') ||
    url.endsWith('.ppt') ||
    url.includes('.pptx?') ||
    url.includes('.ppt?') ||
    fileName.endsWith('.pptx') ||
    fileName.endsWith('.ppt') ||
    title.endsWith('.pptx') ||
    title.endsWith('.ppt') ||
    fileType.includes('presentation') ||
    fileType.includes('powerpoint')
  );
}

/**
 * Get slide/page text from cache
 */
export function getSlideText(noteId: string, pageOrSlide: number): string | undefined {
  const noteMap = documentTextStore.get(String(noteId));
  return noteMap?.get(pageOrSlide);
}

/**
 * Store slide/page text in cache
 */
export function setSlideText(noteId: string, pageOrSlide: number, text: string): void {
  const id = String(noteId);
  if (!documentTextStore.has(id)) {
    documentTextStore.set(id, new Map());
  }
  documentTextStore.get(id)!.set(pageOrSlide, text.trim());
}

/**
 * Get structured PPTX slides from cache
 */
export function getPptxSlides(noteId: string): PptxSlideData[] | undefined {
  return pptxSlideStore.get(String(noteId));
}

/**
 * Fast zero-dependency ZIP reader for modern browser environments.
 * Uses native DecompressionStream('deflate-raw') to unpack PPTX files.
 */
async function extractZipEntries(buffer: ArrayBuffer): Promise<Map<string, { compression: number; data: Uint8Array }>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Search for End of Central Directory record (0x06054b50) from the tail
  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minEocdSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error('Not a valid ZIP/PPTX archive');
  }

  const cdCount = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  const entries = new Map<string, { compression: number; data: Uint8Array }>();
  let ptr = cdOffset;
  const decoder = new TextDecoder();

  for (let i = 0; i < cdCount && ptr < bytes.length; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;

    const compression = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const fileNameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);

    const fileNameBytes = bytes.subarray(ptr + 46, ptr + 46 + fileNameLen);
    const fileName = decoder.decode(fileNameBytes);

    if (localHeaderOffset + 30 <= bytes.length) {
      const localFileNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localFileNameLen + localExtraLen;
      const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);

      entries.set(fileName, { compression, data: compressedData });
    }

    ptr += 46 + fileNameLen + extraLen + commentLen;
  }

  return entries;
}

/**
 * Decompress a single ZIP entry using native DecompressionStream
 */
async function decompressEntry(entry: { compression: number; data: Uint8Array }): Promise<string> {
  if (entry.compression === 0) {
    return new TextDecoder().decode(entry.data);
  }

  if (entry.compression === 8) {
    if (typeof DecompressionStream !== 'undefined') {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(entry.data as any);
      writer.close();
      return await new Response(ds.readable).text();
    }
  }

  throw new Error(`Unsupported compression method: ${entry.compression}`);
}

/**
 * Extracts slide text and structure from a PPTX ArrayBuffer
 */
export async function parsePptxBuffer(buffer: ArrayBuffer, noteTitle?: string): Promise<PptxSlideData[]> {
  try {
    const entries = await extractZipEntries(buffer);

    // Find all slide XML files: ppt/slides/slide1.xml, slide2.xml, ...
    const slideEntries: { index: number; name: string }[] = [];
    entries.forEach((_, name) => {
      const match = name.match(/ppt\/slides\/slide(\d+)\.xml$/i);
      if (match) {
        slideEntries.push({
          index: parseInt(match[1], 10),
          name,
        });
      }
    });

    slideEntries.sort((a, b) => a.index - b.index);

    if (slideEntries.length === 0) {
      return [
        {
          slideNumber: 1,
          title: noteTitle || 'Presentation Overview',
          paragraphs: ['Presentation document loaded.'],
          fullText: noteTitle || 'Presentation Overview',
        },
      ];
    }

    const slides: PptxSlideData[] = [];

    for (let i = 0; i < slideEntries.length; i++) {
      const { index, name } = slideEntries[i];
      const entry = entries.get(name);
      if (!entry) continue;

      const xml = await decompressEntry(entry);

      // Extract paragraphs from XML: <a:p>...</a:p>
      const paragraphs: string[] = [];
      const pRegex = /<a:p\b[^>]*>(.*?)<\/a:p>/gs;
      let pMatch: RegExpExecArray | null;

      while ((pMatch = pRegex.exec(xml)) !== null) {
        const pContent = pMatch[1];
        const tRegex = /<a:t\b[^>]*>(.*?)<\/a:t>/gs;
        let textRun = '';
        let tMatch: RegExpExecArray | null;
        while ((tMatch = tRegex.exec(pContent)) !== null) {
          textRun += tMatch[1];
        }
        const cleaned = textRun.trim();
        if (cleaned) {
          paragraphs.push(cleaned);
        }
      }

      // Title detection: first paragraph or fallback
      let title = `Slide ${index}`;
      if (paragraphs.length > 0) {
        title = paragraphs[0];
      }

      slides.push({
        slideNumber: i + 1,
        title,
        paragraphs: paragraphs.slice(1),
        fullText: paragraphs.join('\n'),
      });
    }

    return slides;
  } catch (err) {
    console.warn('PPTX buffer parsing fallback:', err);
    return [
      {
        slideNumber: 1,
        title: noteTitle || 'Slide 1',
        paragraphs: ['Document content ready.'],
        fullText: noteTitle || 'Slide 1',
      },
    ];
  }
}

/**
 * Asynchronously extract and cache slide text for a PPTX note
 */
export async function loadAndCachePptx(note: Note): Promise<PptxSlideData[]> {
  const noteId = String(note.id);
  const cached = pptxSlideStore.get(noteId);
  if (cached) return cached;

  if (inFlightExtractions.has(noteId)) {
    return inFlightExtractions.get(noteId)!;
  }

  const promise = (async () => {
    try {
      const fileUrl = note.file_url || note.fileUrl;
      if (!fileUrl) {
        throw new Error('Note does not have a valid file URL.');
      }

      const res = await fetch(fileUrl);
      if (!res.ok) {
        throw new Error(`Failed to fetch PPTX file: HTTP ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      const slides = await parsePptxBuffer(buffer, note.title);

      pptxSlideStore.set(noteId, slides);

      // Populate documentTextStore per slide
      slides.forEach((slide) => {
        setSlideText(noteId, slide.slideNumber, `${slide.title}\n${slide.paragraphs.join('\n')}`);
      });

      return slides;
    } catch (err) {
      console.warn('loadAndCachePptx error:', err);
      // Return safe fallback slide
      const fallback: PptxSlideData[] = [
        {
          slideNumber: 1,
          title: note.title,
          paragraphs: [note.description || `${note.subject} - ${note.unit}`],
          fullText: `${note.title}\n${note.description || ''}`,
        },
      ];
      pptxSlideStore.set(noteId, fallback);
      setSlideText(noteId, 1, fallback[0].fullText);
      return fallback;
    } finally {
      inFlightExtractions.delete(noteId);
    }
  })();

  inFlightExtractions.set(noteId, promise);
  return promise;
}

/**
 * Extracts clean text from a specific PDF page using PDF.js
 */
export async function extractPdfPageText(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNum: number
): Promise<string> {
  try {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const strings: string[] = [];

    for (const item of textContent.items) {
      if ('str' in item && typeof item.str === 'string') {
        const s = item.str.trim();
        if (s) strings.push(s);
      }
    }

    return strings.join(' ');
  } catch (err) {
    console.warn(`Error extracting text from PDF page ${pageNum}:`, err);
    return '';
  }
}

/**
 * Non-blocking background extraction of all PDF pages during browser idle time
 */
export function queueBackgroundPdfTextExtraction(
  noteId: string,
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  currentPage: number = 1
): void {
  const id = String(noteId);
  const total = pdfDoc.numPages;

  const scheduleTask = typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (cb: () => void) => window.requestIdleCallback(cb, { timeout: 1500 })
    : (cb: () => void) => setTimeout(cb, 100);

  // 1. Immediately extract current active page first
  scheduleTask(async () => {
    if (!getSlideText(id, currentPage)) {
      const text = await extractPdfPageText(pdfDoc, currentPage);
      if (text) setSlideText(id, currentPage, text);
    }

    // 2. Incrementally extract remaining pages in subsequent idle callbacks
    let nextP = 1;
    const processNext = () => {
      if (nextP > total) return;
      if (nextP === currentPage || getSlideText(id, nextP)) {
        nextP++;
        scheduleTask(processNext);
        return;
      }

      scheduleTask(async () => {
        const text = await extractPdfPageText(pdfDoc, nextP);
        if (text) setSlideText(id, nextP, text);
        nextP++;
        processNext();
      });
    };

    scheduleTask(processNext);
  });
}

/**
 * Builds an optimized, concise prompt context payload.
 * Passes ONLY the currently active slide's content and essential metadata to eliminate overhead.
 */
export function getRelevantSlideContext(
  note: Note | null,
  currentPage: number,
  totalPages: number
): string {
  if (!note) return '';

  const noteId = String(note.id);
  const activeSlideText = getSlideText(noteId, currentPage);

  let context = `[ACTIVE SLIDE CONTEXT]
Document: ${note.title} (${note.subject} • ${note.unit})
Active Slide: Slide ${currentPage} of ${totalPages}\n`;

  if (activeSlideText && activeSlideText.trim()) {
    context += `Slide Content:\n${activeSlideText.trim()}`;
  } else if (note.description) {
    context += `Slide Overview:\n${note.description.trim()}`;
  }

  return context;
}

