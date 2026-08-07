/*
 * FEATURE (ledger #12 — 2026-08-05): pins the ingestibility classifier.
 * Before #12 the classifier only admitted text-like formats; now PDF/DOCX/
 * XLSX must be admitted (by extension OR MIME) while formats with no real
 * extractor stay honestly rejected. FEATURE (ledger #14 — 2026-08-05):
 * .pptx and .doc GRADUATED into the admitted set (jszip OPC walk /
 * word-extractor OLE2); .xls/.ppt, images, media and archives STAY
 * honestly rejected. These pins guard against a future refactor quietly
 * shrinking — or dishonestly inflating — the ingestible set.
 */
import {
  classifyDocumentIngest,
  isIngestibleDocument,
} from '../rag-ingestion.processor';

describe('classifyDocumentIngest (ledger #12)', () => {
  describe('text formats', () => {
    it.each([
      ['text/plain', 'notes.txt'],
      ['text/markdown', 'README.md'],
      ['text/csv', 'export.csv'],
      ['application/json', 'payload.json'],
      ['application/octet-stream', 'server.log'], // extension wins
      ['text/plain', 'noextension'], // MIME fallback
    ])('classifies %s / %s as text', (mime, name) => {
      expect(classifyDocumentIngest(mime, name)).toBe('text');
    });
  });

  describe('binary formats with real extractors', () => {
    it.each([
      ['application/pdf', 'report.pdf', 'pdf'],
      ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'spec.docx', 'docx'],
      ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'ledger.xlsx', 'xlsx'],
      // ledger #14 — slides and legacy Word graduated to real extractors:
      ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'deck.pptx', 'pptx'],
      ['application/msword', 'legacy.doc', 'doc'],
      ['application/octet-stream', 'deck.pptx', 'pptx'], // extension wins over opaque MIME
      ['application/msword', 'download2', 'doc'], // extensionless: MIME decides
      ['application/octet-stream', 'report.pdf', 'pdf'], // extension wins over opaque MIME
      ['application/pdf', 'download', 'pdf'], // extensionless: MIME decides
    ])('classifies %s / %s as %s', (mime, name, expected) => {
      expect(classifyDocumentIngest(mime, name)).toBe(expected);
    });
  });

  describe('formats with NO extractor stay honestly rejected', () => {
    it.each([
      // ledger #14: .xls (SheetJS stays rejected) and .ppt (no maintained
      // parser) remain the rejected Office formats; .doc/.pptx MOVED OUT
      // of this list into the admitted set above.
      ['application/vnd.ms-excel', 'legacy.xls'],
      ['application/vnd.ms-powerpoint', 'deck.ppt'],
      ['image/png', 'screenshot.png'],
      ['image/svg+xml', 'logo.svg'],
      ['video/mp4', 'demo.mp4'],
      ['audio/mpeg', 'podcast.mp3'],
      ['application/zip', 'bundle.zip'],
      ['application/gzip', 'archive.tar.gz'],
      ['', ''], // nothing to go on
      ['application/octet-stream', 'noextension'], // opaque + extensionless
      ['application/octet-stream', 'weird.xyz'], // unknown extension
    ])('rejects %s / %s', (mime, name) => {
      expect(classifyDocumentIngest(mime, name)).toBeNull();
      expect(isIngestibleDocument(mime, name)).toBe(false);
    });
  });

  it('isIngestibleDocument mirrors classifyDocumentIngest (compat shim)', () => {
    expect(isIngestibleDocument('application/pdf', 'a.pdf')).toBe(true);
    expect(isIngestibleDocument('text/plain', 'a.md')).toBe(true);
    expect(isIngestibleDocument('image/png', 'a.png')).toBe(false);
  });

  it('extension check is case-insensitive and last-extension wins', () => {
    expect(classifyDocumentIngest('application/octet-stream', 'REPORT.PDF')).toBe('pdf');
    expect(classifyDocumentIngest('text/plain', 'data.pdf.txt')).toBe('text');
    // An unknown extension is INCONCLUSIVE — the known MIME then decides
    // (the extractor signature guard fails safely if the bytes lie).
    expect(classifyDocumentIngest('application/pdf', 'document.bak')).toBe('pdf');
    // ...but a known-BLOCKED extension stays blocked even with a good MIME
    // (ledger #14: .doc graduated to a real extractor, so the block pin now
    // uses .xls — the last rejected Office format with a MIME entry).
    expect(classifyDocumentIngest('application/pdf', 'document.xls')).toBeNull();
    // ...while a known-EXTRACTABLE extension wins over a conflicting MIME —
    // the extractor's signature guard is the honest backstop if bytes lie.
    expect(classifyDocumentIngest('application/pdf', 'document.doc')).toBe('doc');
  });
});
