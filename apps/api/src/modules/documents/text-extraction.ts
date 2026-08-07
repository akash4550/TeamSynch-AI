/*
 * FEATURE (ledger #12 — 2026-08-05): real binary-format text extractors
 * for the RAG ingestion pipeline (DOCUMENT_RAG_INGEST). Before this build,
 * PDF/DOCX/XLSX uploads were skipped with an honest log line because the
 * pipeline only knew UTF-8 decoding — naive decoding of binaries would
 * stuff the vector store with garbage (dishonest retrieval). These
 * extractors make binary ingestion REAL:
 *
 *   pdf  → unpdf  (pdf.js, MIT; text extraction runs in-process —
 *                  @napi-rs/canvas peer is only needed for rendering)
 *   docx → mammoth.extractRawText (BSD-2-Clause)
 *   xlsx → exceljs Workbook read (MIT). SheetJS xlsx@0.18.5 was rejected:
 *          open high-severity advisories on the npm build.
 *   pptx → jszip OPC XML walk (MIT)            — ledger #14 (2026-08-05)
 *   doc  → word-extractor (MIT; saxes+yauzl)   — ledger #14 (2026-08-05)
 *
 * pdf-parse@1.1.x was probed first and REJECTED: its bundled pdf.js fake
 * worker throws FormatError 'bad XRef entry' for byte-perfect documents
 * (verified against a pdf-lib-generated control file) under Node 20 —
 * empirically dead in this runtime.
 *
 * FEATURE (ledger #14 — 2026-08-05): slides and legacy Word.
 *   pptx → a deterministic OPC walk: <a:t> runs in document order per
 *          slide, slides ordered NUMERICALLY (slide10 after slide9, not
 *          slide2), <a:br/> and </a:p> become newlines, and a slide's
 *          notesSlide follows its slide as "# Slide N notes:". This is a
 *          text-rendering extractor, not a visual one (no position/box
 *          semantics) — sufficient and honest for RAG retrieval.
 *   doc  → word-extractor parses the OLE2 compound file and Word binary
 *          piece table. DISCLOSED residual risk: word-extractor has no
 *          explicit encryption check (the FIB fEncrypted bit is not
 *          consulted, verified against its lib/word-ole-extractor.js);
 *          encrypted bodies overwhelmingly trip its strict parser into the
 *          non-retryable taxonomy below, but a pathological file could in
 *          principle extract as garbled text. Accepted 2026-08-05.
 * Legacy .xls/.ppt keep their HONEST SKIP: the only maintained .xls
 * parser is SheetJS (rejected; open high-severity advisories) and no
 * maintained .ppt OLE parser exists at all.
 *
 * Failure taxonomy (honest-failure contract):
 *   - Signature mismatch / corrupt archive / encrypted document
 *       → TextExtractionError(retryable=false) → the processor SKIPS with
 *         the reason; retrying permanent bytes would just burn attempts.
 *   - Anything unexpected from an extractor
 *       → thrown raw (retryable) → BullMQ retries (attempts:3) → job FAILS
 *         visibly instead of silently ingesting nothing.
 *
 * Libraries are require()d lazily inside each extractor: the API and the
 * web build pay zero boot cost, and environments that never ingest
 * binaries never touch these code paths.
 */

export type BinaryIngestFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'doc';

export class TextExtractionError extends Error {
  /** false = the bytes will never parse; true = a retry could succeed. */
  readonly retryable: boolean;
  /** Log/UI-safe reason — never contains document content. */
  readonly reason: string;

  constructor(reason: string, retryable: boolean, cause?: unknown) {
    super(reason);
    this.name = 'TextExtractionError';
    this.reason = reason;
    this.retryable = retryable;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

/* ---- shared cheap guards ------------------------------------------------ */

const hasPdfSignature = (buffer: Buffer): boolean =>
  buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';

/** DOCX/XLSX are ZIP containers (PK\x03\x04; empty archives start PK\x05\x06). */
const hasZipSignature = (buffer: Buffer): boolean =>
  buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b &&
  (buffer[2] === 0x03 || buffer[2] === 0x05);

const isZipCorruptionLike = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /end of central directory|central directory|corrupt|could not find|not a valid zip|invalid.*(zip|archive)/i.test(
    message,
  );
};

const isEncryptionLike = (error: unknown): boolean => {
  // Structural reads — NOT instanceof: under jest's --experimental-vm-modules
  // each suite gets a fresh vm context, and errors constructed by Node core
  // or ESM deps can come from a DIFFERENT realm, where instanceof fails.
  // (Ledger #14 self-catch: an instanceof-gated check let a raw RangeError
  // escape taxonomy mapping; String()/property fallbacks were masking this
  // elsewhere.)
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name)
      : '';
  const message = error instanceof Error ? error.message : String(error);
  // pdf.js reports encrypted files as PasswordException; Office parsers
  // usually name the encryption library (msoffcrypto) or say "encrypted".
  return (
    name === 'PasswordException' ||
    /password[- ]protected|encrypted|msoffcrypto|decryption/i.test(message)
  );
};

/** Realm-proof .code reader (errors may be cross-realm under jest vm
 * modules — see isEncryptionLike). */
const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;

/* ---- pdf (unpdf / pdf.js) ----------------------------------------------- */

interface UnpdfTextResult {
  totalPages: number;
  // unpdf >= 0.11 returns one string per page; mergePages:true flattens to a
  // single string. Accept both so minor upgrades never silently change shape.
  text: string[] | string;
}
type UnpdfModule = {
  extractText: (data: Uint8Array, options?: Record<string, unknown>) => Promise<UnpdfTextResult>;
};

const extractPdfText = async (buffer: Buffer): Promise<string> => {
  if (!hasPdfSignature(buffer)) {
    throw new TextExtractionError(
      'file bytes are not a PDF (%.PDF signature missing) — likely renamed or truncated',
      false,
    );
  }
  const { extractText } = require('unpdf') as UnpdfModule;
  try {
    const result = await extractText(new Uint8Array(buffer));
    const pages = Array.isArray(result.text) ? result.text : [result.text ?? ''];
    return pages.join('\n');
  } catch (error) {
    if (isEncryptionLike(error)) {
      throw new TextExtractionError('password-protected PDF cannot be ingested', false, error);
    }
    if (error instanceof Error && error.name === 'InvalidPDFException') {
      throw new TextExtractionError('document is not a readable PDF', false, error);
    }
    throw error; // unexpected → retryable, surfaces as FAILED job
  }
};

/* ---- docx (mammoth) ----------------------------------------------------- */

type MammothModule = {
  extractRawText: (options: { buffer: Buffer }) => Promise<{ value: string }>;
};

const extractDocxText = async (buffer: Buffer): Promise<string> => {
  if (!hasZipSignature(buffer)) {
    throw new TextExtractionError(
      'file bytes are not a DOCX (ZIP signature missing) — legacy .doc or renamed file',
      false,
    );
  }
  const mammoth = require('mammoth') as MammothModule;
  try {
    const { value } = await mammoth.extractRawText({ buffer });
    return typeof value === 'string' ? value : '';
  } catch (error) {
    if (isEncryptionLike(error)) {
      throw new TextExtractionError('encrypted DOCX cannot be ingested', false, error);
    }
    if (isZipCorruptionLike(error)) {
      throw new TextExtractionError('document is not a readable DOCX', false, error);
    }
    throw error;
  }
};

/* ---- xlsx (exceljs) ----------------------------------------------------- */

interface ExcelLikeCellValue {
  richText?: Array<{ text: string }>;
  text?: unknown;
  formula?: unknown;
  result?: unknown;
  error?: unknown;
  hyperlink?: unknown;
}
interface ExcelLikeCell {
  value: unknown;
}
interface ExcelLikeRow {
  // Public, version-stable iteration API. (row.cells does NOT exist in
  // exceljs 4.x — the private field is _cells — so do not touch .cells.)
  eachCell: (cb: (cell: ExcelLikeCell, colNumber: number) => void) => void;
}
interface ExcelLikeWorksheet {
  name: string;
  eachRow: (options: { includeEmpty: boolean }, cb: (row: ExcelLikeRow) => void) => void;
}
interface ExcelLikeWorkbook {
  xlsx: { load: (buffer: Buffer) => Promise<unknown> };
  worksheets: ExcelLikeWorksheet[];
}
type ExcelJSModule = { Workbook: new () => ExcelLikeWorkbook };

/** Duck-typed cell renderer — handles primitives, Date, richText runs,
 * hyperlinks ({text}), formulas ({formula,result}) and error values without
 * depending on exceljs ValueType internals. */
const cellToText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as ExcelLikeCellValue;
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined && v.result !== null) return cellToText(v.result);
    if (v.error) return '';
    return String(value);
  }
  return String(value);
};

const extractXlsxText = async (buffer: Buffer): Promise<string> => {
  if (!hasZipSignature(buffer)) {
    throw new TextExtractionError(
      'file bytes are not an XLSX (ZIP signature missing) — legacy .xls or renamed file',
      false,
    );
  }
  const ExcelJS = require('exceljs') as ExcelJSModule;
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const lines: string[] = [];
    for (const sheet of workbook.worksheets) {
      lines.push(`# Sheet: ${sheet.name}`);
      sheet.eachRow({ includeEmpty: false }, (row) => {
        // Place cells by column number so empty middle cells keep their
        // position (eachCell skips them); holes join as empty text.
        const cells: string[] = [];
        row.eachCell((cell, colNumber) => {
          cells[colNumber - 1] = cellToText(cell ? cell.value : '');
        });
        while (cells.length > 0 && !cells[cells.length - 1]) cells.pop();
        if (cells.some((cell) => cell)) lines.push(cells.join('\t'));
      });
    }
    return lines.join('\n');
  } catch (error) {
    if (isEncryptionLike(error)) {
      throw new TextExtractionError('encrypted XLSX cannot be ingested', false, error);
    }
    if (isZipCorruptionLike(error)) {
      throw new TextExtractionError('document is not a readable XLSX', false, error);
    }
    throw error;
  }
};

/* ---- pptx (jszip, OPC XML walk) — ledger #14 ----------------------------- */

interface JszipEntry {
  dir: boolean;
  async: (type: 'string') => Promise<string>;
}
interface JszipZip {
  files: Record<string, JszipEntry>;
}
type JszipModule = { loadAsync: (data: Buffer) => Promise<JszipZip> };

/**
 * Minimal deterministic XML entity unescape for DrawingML text runs. The
 * payload inside <a:t> is well-formed, entity-escaped XML — the five named
 * entities and numeric character references are the only escapes possible,
 * so a table walk is exact (no parser dependency needed for text runs).
 */
const unescapeXmlEntities = (text: string): string =>
  text.replace(
    /&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g,
    (entity, body: string) => {
      switch (body) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default: {
          const codePoint =
            body.startsWith('#x') || body.startsWith('#X')
              ? parseInt(body.slice(2), 16)
              : parseInt(body.slice(1), 10);
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
        }
      }
    },
  );

/**
 * Flatten one slide/notesSlide XML part to plain text: <a:t> runs in
 * document order; hard breaks (<a:br/>) and paragraph ends (</a:p>) become
 * newlines. A regex walk is sound here precisely BECAUSE run payloads are
 * entity-escaped — a raw '<' can never appear inside a text run.
 */
const slideXmlToText = (xml: string): string => {
  const out: string[] = [];
  const token = /<a:t\b[^>]*>[\s\S]*?<\/a:t\s*>|<a:br\b[^>]*\/?>|<\/a:p\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = token.exec(xml)) !== null) {
    const piece = match[0];
    if (piece.startsWith('<a:t')) {
      out.push(
        unescapeXmlEntities(
          piece.replace(/^<a:t\b[^>]*>/i, '').replace(/<\/a:t\s*>$/i, ''),
        ),
      );
    } else {
      out.push('\n');
    }
  }
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
};

const SLIDE_PART = /^ppt\/slides\/slide(\d+)\.xml$/;
const NOTES_PART = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/;

const collectPptxParts = (zip: JszipZip, pattern: RegExp): Map<number, JszipEntry> => {
  const parts = new Map<number, JszipEntry>();
  for (const [entryName, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const match = entryName.match(pattern);
    if (match) parts.set(Number(match[1]), entry);
  }
  return parts;
};

const extractPptxText = async (buffer: Buffer): Promise<string> => {
  if (!hasZipSignature(buffer)) {
    throw new TextExtractionError(
      'file bytes are not a PPTX (ZIP signature missing) — legacy .ppt or renamed file',
      false,
    );
  }
  const JSZip = require('jszip') as JszipModule;
  let zip: JszipZip;
  try {
    // Any load failure is a property of THESE bytes (bad central directory,
    // unknown compression method) — retrying cannot succeed, so the
    // corruption is mapped non-retryable, not rethrown raw.
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new TextExtractionError('document is not a readable PPTX', false, error);
  }
  const slideParts = collectPptxParts(zip, SLIDE_PART);
  if (slideParts.size === 0) {
    // e.g. a DOCX/XLSX fed to the pptx path — valid ZIP, wrong container.
    throw new TextExtractionError('archive is not a PPTX (no slide XML parts)', false);
  }
  const notesParts = collectPptxParts(zip, NOTES_PART);
  const lines: string[] = [];
  // Ascending NUMERIC slide order — lexicographic entry order would place
  // slide10 between slide1 and slide2 and scramble the narrative.
  for (const [number, entry] of [...slideParts].sort((a, b) => a[0] - b[0])) {
    const slideText = slideXmlToText(await entry.async('string'));
    lines.push(`# Slide ${number}:`);
    if (slideText) lines.push(slideText);
    const notesEntry = notesParts.get(number);
    if (notesEntry) {
      const notesText = slideXmlToText(await notesEntry.async('string'));
      if (notesText) lines.push(`# Slide ${number} notes:`, notesText);
    }
  }
  return lines.join('\n');
};

/* ---- legacy .doc (word-extractor, OLE2) — ledger #14 --------------------- */

/** OLE2 compound-document magic (Word 97–2003 .doc; also .xls/.ppt). */
const hasOleSignature = (buffer: Buffer): boolean =>
  buffer.length >= 8 &&
  buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0 &&
  buffer[4] === 0xa1 && buffer[5] === 0xb1 && buffer[6] === 0x1a && buffer[7] === 0xe1;

type WordExtractorModule = new () => {
  extract: (buffer: Buffer) => Promise<{ getBody: () => string }>;
};

/**
 * word-extractor failure classes that these bytes can never outgrow
 * (verified against its lib sources, 2026-08-05):
 *  - 'does not seem to be a Word document' — non-Word OLE (wrong stream magic)
 *  - 'Not a valid compound document' / 'Invalid Short Sector Allocation
 *    Table' — broken OLE container
 *  - 'Unable to read this type of file' — unknown container to its detector
 *  - 'ccorrupted Word file' (sic — upstream typo) — broken piece table
 *  - Node ERR_OUT_OF_RANGE — reached for a TRUNCATED .doc AND for a true-
 *    OLE file with no WordDocument stream (e.g. a renamed .xls/.ppt):
 *    word-extractor streams an empty buffer and the FIB read overruns
 *    (verified empirically). Deterministic for these bytes → non-retryable.
 */
const isDocCorruptionLike = (error: unknown): boolean => {
  // Realm-proof structural check — instanceof Error fails cross-realm here
  // (jest vm modules), which previously let this RangeError escape raw.
  if (errorCode(error) === 'ERR_OUT_OF_RANGE') {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /does not seem to be a Word document|not a valid compound document|unable to read this type of file|allocation table|corrupted Word file/i.test(
    message,
  );
};

const extractDocText = async (buffer: Buffer): Promise<string> => {
  if (!hasOleSignature(buffer)) {
    throw new TextExtractionError(
      'file bytes are not a legacy .doc (OLE2 signature missing) — modern .docx or renamed file',
      false,
    );
  }
  const WordExtractor = require('word-extractor') as WordExtractorModule;
  try {
    const doc = await new WordExtractor().extract(buffer);
    const body = doc.getBody();
    return typeof body === 'string' ? body : '';
  } catch (error) {
    if (isEncryptionLike(error)) {
      throw new TextExtractionError('encrypted .doc cannot be ingested', false, error);
    }
    if (isDocCorruptionLike(error)) {
      throw new TextExtractionError('document is not a readable .doc', false, error);
    }
    throw error;
  }
};

/* ---- dispatch ----------------------------------------------------------- */

/** Extract plain text from a binary document buffer. Throws
 * TextExtractionError for known-permanent failures (corrupt/encrypted/
 * signature mismatch) and rethrows unexpected extractor errors for retry. */
export const extractBinaryText = async (
  format: BinaryIngestFormat,
  buffer: Buffer,
): Promise<string> => {
  switch (format) {
    case 'pdf':
      return extractPdfText(buffer);
    case 'docx':
      return extractDocxText(buffer);
    case 'xlsx':
      return extractXlsxText(buffer);
    case 'pptx':
      return extractPptxText(buffer);
    case 'doc':
      return extractDocText(buffer);
    default: {
      // Exhaustiveness guard — a new BinaryIngestFormat must add a case.
      const never: never = format;
      throw new TextExtractionError(`no extractor for format ${String(never)}`, false);
    }
  }
};
