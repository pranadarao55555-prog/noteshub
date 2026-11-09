import { GoogleGenAI } from '@google/genai';
import type { Note, ChatMessage } from '../types';
import { getRelevantSlideContext } from './documentTextService.ts';

export const PRIMARY_MODEL = 'gemini-3.8-flash';
export const FALLBACK_MODEL = 'gemini-3-flash-preview';

export const SYSTEM_PROMPT = `You are a versatile academic study assistant for university courses across all disciplines—including theoretical concepts, code, algorithms, case studies, definitions, and technical formulas.

Strict Answer Formatting Rules:
1. Output in clean plain text only, for both theory and math topics.
2. Do not use LaTeX or dollar-sign math. Never output $, $$, \\sum, \\frac, \\int, \\sqrt, or any backslash commands.
3. Write math with standard keyboard characters, for example: x^2, a/b, sqrt(x), sum from i=1 to n of i, integral from 0 to 1 of x dx, pi, theta, <=, >=, !=, ->.
4. Do not use Markdown artifacts such as ###, ##, #, **, __, backticks, or tables.
5. Use short paragraphs separated by blank lines. For lists, use a hyphen and a space (- item) on each line. For ordered steps, use "1.", "2.", "3." at the start of the line.
6. Write headings as plain text lines, optionally in capital letters, with no symbols.
7. Provide direct, structured, exam-oriented explanations.`;

/**
 * Client-side safety sanitizer to strip LaTeX artifacts, markdown symbols, and normalize bullet points.
 */
export function sanitizeAssistantText(rawText: string, isPartial: boolean = false): string {
  if (!rawText) return '';

  let text = rawText;

  // 1. Remove code fences and backticks
  text = text.replace(/```[a-zA-Z]*\n?/g, '');
  text = text.replace(/```/g, '');
  text = text.replace(/`([^`]+)`/g, '$1');

  // 2. Remove $ and $$ delimiters as well as \( \) and \[ \]
  text = text.replace(/\$\$/g, '');
  text = text.replace(/\$/g, '');
  text = text.replace(/\\\[|\\\]/g, '');
  text = text.replace(/\\\(|\\\)/g, '');

  // 3. Replace LaTeX fractions: \frac{num}{den} -> (num)/(den) or num/den
  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(text)) {
    text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1/$2');
  }
  text = text.replace(/\\frac\s*([a-zA-Z0-9]+)\s*([a-zA-Z0-9]+)/g, '$1/$2');

  // 4. Replace LaTeX square roots
  text = text.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '($2)^(1/$1)');
  text = text.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
  text = text.replace(/\\sqrt\b/g, 'sqrt');

  // Superscripts & Subscripts: x^{2} -> x^2, x_{i} -> x_i
  text = text.replace(/\^\{([^{}]+)\}/g, '^$1');
  text = text.replace(/_\{([^{}]+)\}/g, '_$1');

  // 5. Replace common LaTeX operators and symbols
  const latexReplacements: [RegExp, string][] = [
    [/\\sum\b/g, 'sum'],
    [/\\int\b/g, 'integral'],
    [/\\prod\b/g, 'product'],
    [/\\times\b/g, 'x'],
    [/\\cdot\b/g, '*'],
    [/\\div\b/g, '/'],
    [/\\pm\b/g, '+/-'],
    [/\\mp\b/g, '-/+'],
    [/\\leq\b|\\le\b/g, '<='],
    [/\\geq\b|\\ge\b/g, '>='],
    [/\\neq\b|\\ne\b/g, '!='],
    [/\\approx\b/g, '~='],
    [/\\equiv\b/g, '=='],
    [/\\rightarrow\b|\\to\b/g, '->'],
    [/\\leftarrow\b/g, '<-'],
    [/\\Rightarrow\b/g, '=>'],
    [/\\Leftarrow\b/g, '<='],
    [/\\leftrightarrow\b/g, '<->'],
    [/\\infty\b/g, 'infinity'],
    [/\\partial\b/g, 'd'],
    [/\\nabla\b/g, 'del'],
    [/\\Delta\b/g, 'Delta'],
    [/\\delta\b/g, 'delta'],
    [/\\pi\b/g, 'pi'],
    [/\\theta\b/g, 'theta'],
    [/\\alpha\b/g, 'alpha'],
    [/\\beta\b/g, 'beta'],
    [/\\gamma\b/g, 'gamma'],
    [/\\lambda\b/g, 'lambda'],
    [/\\mu\b/g, 'mu'],
    [/\\sigma\b/g, 'sigma'],
    [/\\omega\b/g, 'omega'],
    [/\\Omega\b/g, 'Omega'],
    [/\\phi\b/g, 'phi'],
    [/\\psi\b/g, 'psi'],
    [/\\in\b/g, 'in'],
    [/\\subset\b/g, 'subset of'],
    [/\\cup\b/g, 'union'],
    [/\\cap\b/g, 'intersection'],
    [/\\forall\b/g, 'for all'],
    [/\\exists\b/g, 'there exists'],
    [/\\mathbf\{([^}]+)\}/g, '$1'],
    [/\\mathit\{([^}]+)\}/g, '$1'],
    [/\\mathrm\{([^}]+)\}/g, '$1'],
    [/\\text\{([^}]+)\}/g, '$1'],
    [/\\left\s*([([{|])/g, '$1'],
    [/\\right\s*([)\]}|])/g, '$1'],
  ];

  for (const [pattern, replacement] of latexReplacements) {
    text = text.replace(pattern, replacement);
  }

  // 6. Clean up remaining stray backslashes before words
  text = text.replace(/\\([a-zA-Z]+)/g, '$1');

  // 7. Strip bold and italic markdown markers
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, '$1');
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/__(.*?)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');

  // 8. Process line by line for heading markers, bullet points
  const lines = text.split('\n');
  const cleanedLines = lines.map((line) => {
    let l = line.replace(/^\s*#{1,6}\s+/, '');
    l = l.replace(/^\s*[*+-]\s+/, '• ');
    return l;
  });

  text = cleanedLines.join('\n');

  // 9. Collapse 3 or more blank lines into a single blank line
  text = text.replace(/\n{3,}/g, '\n\n');

  return isPartial ? text : text.trim();
}

/**
 * Executes an operation with exponential backoff retry.
 * 3 retries: 1000ms base delay, doubling to 2000ms, 4000ms on 503 / 429 / UNAVAILABLE / RESOURCE_EXHAUSTED.
 */
export async function withExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || err || '');
      const status = err?.status || err?.code;
      const isRetryable =
        status === 503 ||
        status === 429 ||
        status === 'UNAVAILABLE' ||
        status === 'RESOURCE_EXHAUSTED' ||
        /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|rate limit|overloaded|temporarily unavailable/i.test(msg);

      if (!isRetryable || attempt >= retries) {
        throw err;
      }

      // 1000ms base delay, doubling on 503 / 429 / UNAVAILABLE
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 200;
      console.warn(
        `[Gemini Retry] Attempt ${attempt + 1}/${retries} failed with ${status || msg}. Retrying in ${Math.round(delay)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export interface StreamAssistantOptions {
  userQuery: string;
  history: ChatMessage[];
  currentNote: Note | null;
  currentPage: number;
  totalPages: number;
  onChunk: (accumulatedText: string, latestChunk: string) => void;
  customApiKey?: string;
}

/**
 * Fallback REST SSE streaming when browser SDK stream fails
 */
async function streamViaRestSSE(
  modelName: string,
  apiKey: string,
  payload: any,
  onChunk: (accumulatedText: string, latestChunk: string) => void
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Readable stream not supported on this device.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulatedText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        try {
          const data = JSON.parse(jsonStr);
          const chunkText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (chunkText) {
            accumulatedText += chunkText;
            onChunk(sanitizeAssistantText(accumulatedText), chunkText);
          }
        } catch {
          // ignore unparseable SSE chunk
        }
      }
    }
  }

  return sanitizeAssistantText(accumulatedText);
}

/**
 * Primary streaming study assistant call with:
 * - gemini-3.8-flash (fallback to gemini-3-flash-preview)
 * - Exponential backoff retry (3 retries: 1000ms base delay, doubling on 503 / 429 / UNAVAILABLE)
 * - Word-by-word streaming via generateContentStream()
 * - Slide-level extracted text context injection (NEVER full binary files)
 */
export async function askGeminiStudyAssistantStream(options: StreamAssistantOptions): Promise<string> {
  const { userQuery, history, currentNote, currentPage, totalPages, onChunk, customApiKey } = options;

  const apiKey = customApiKey || import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    const errorMsg = '⚠️ Gemini API Key not configured. Please add VITE_GEMINI_API_KEY to your .env file or enter your API key via the Key icon.';
    onChunk(errorMsg, errorMsg);
    return errorMsg;
  }

  // 1. INJECT ONLY CURRENT ACTIVE SLIDE CONTEXT (NO MULTI-MEGABYTE DECKS OR REDUNDANT SLIDES)
  const contextBlock = getRelevantSlideContext(currentNote, currentPage, totalPages);
  const promptWithContext = contextBlock
    ? `${contextBlock}\nStudent Question: ${userQuery}\n\nRespond in clean plain text without Markdown or LaTeX.`
    : `Student Question: ${userQuery}\n\nRespond in clean plain text without Markdown or LaTeX.`;

  // 2. Prepare conversation contents (trimmed history to minimize payload overhead)
  const contents: any[] = [];
  const recentHistory = history.slice(-4);
  if (recentHistory.length > 0) {
    for (const msg of recentHistory) {
      if (msg.content) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }
  }

  contents.push({
    role: 'user',
    parts: [{ text: promptWithContext }],
  });

  // Attempt streaming with primary model first, with fallback to preview model on 503/404 or persistent failures
  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];

  for (let modelIdx = 0; modelIdx < modelsToTry.length; modelIdx++) {
    const model = modelsToTry[modelIdx];
    try {
      const fullResult = await withExponentialBackoff(async () => {
        let accumulatedRawText = '';
        const ai = new GoogleGenAI({ apiKey });

        try {
          // Use generateContentStream for instant chunk-by-chunk real-time response
          const responseStream = await ai.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: SYSTEM_PROMPT,
            },
          });

          const streamIter = (responseStream as any).stream || responseStream;
          for await (const chunk of streamIter) {
            const chunkText = typeof (chunk as any).text === 'function'
              ? (chunk as any).text()
              : ((chunk as any).text || '');
            if (chunkText) {
              accumulatedRawText += chunkText;
              onChunk(accumulatedRawText, chunkText);
            }
          }

          if (accumulatedRawText) {
            return sanitizeAssistantText(accumulatedRawText, false);
          }
        } catch (streamErr: any) {
          console.warn(`generateContentStream with ${model} failed, attempting REST SSE fallback:`, streamErr);
          // Fallback to REST SSE streaming
          return await streamViaRestSSE(
            model,
            apiKey,
            {
              contents,
              systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            },
            onChunk
          );
        }

        return sanitizeAssistantText(accumulatedRawText || 'No response received.', false);
      }, modelIdx === 0 ? 1 : 2, 800);

      return fullResult;
    } catch (err: any) {
      const isLastModel = modelIdx === modelsToTry.length - 1;
      const errMsg = String(err?.message || err);
      console.warn(`Model ${model} invocation error:`, errMsg);

      if (isLastModel) {
        const userFriendlyError = `❌ Gemini AI Assistant Error: ${errMsg}. Please verify your network connection or Gemini API key.`;
        onChunk(userFriendlyError, userFriendlyError);
        return userFriendlyError;
      }
      console.log(`Falling back from ${model} to ${modelsToTry[modelIdx + 1]}...`);
    }
  }

  return 'No response generated.';
}

/**
 * Backward compatible helper for single-promise queries
 */
export async function askGeminiStudyAssistant(
  userQuery: string,
  history: ChatMessage[],
  currentNote: Note | null,
  currentPage: number,
  totalPages: number,
  customApiKey?: string
): Promise<string> {
  return await askGeminiStudyAssistantStream({
    userQuery,
    history,
    currentNote,
    currentPage,
    totalPages,
    onChunk: () => {},
    customApiKey,
  });
}
