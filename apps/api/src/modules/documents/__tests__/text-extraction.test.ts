/*
 * FEATURE (ledger #12 — 2026-08-05): unit pins for the real binary-format
 * extractors used by DOCUMENT_RAG_INGEST. These exercise the actual
 * unpdf/mammoth/exceljs code paths (not mocks) so a dependency bump that
 * silently changes extraction semantics fails loudly.
 *
 * The PDF fixture (../__fixtures__/rag-sample.pdf) is a real, valid PDF
 * generated with pdf-lib at build time; its text content is pinned below.
 *
 * FEATURE (ledger #14 — 2026-08-05): pins for the slides and legacy-Word
 * extractors, against two more REAL committed fixtures:
 *   - ../__fixtures__/rag-sample.pptx — a genuine OPC deck (2 slides,
 *     speaker notes on slide 1, entity-escaped runs + a hard break on
 *     slide 2) generated with jszip at build time.
 *   - ../__fixtures__/rag-sample.doc — a genuine Word 97–2003 OLE2 file
 *     (provenance: test corpus of morungos/node-word-extractor, MIT;
 *     authored in Microsoft Office Word). Its body text — including the
 *     embedded Unicode — is pinned below.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  extractBinaryText,
  TextExtractionError,
} from '../text-extraction';

const fixturePath = path.join(__dirname, '..', '__fixtures__', 'rag-sample.pdf');
const pptxFixturePath = path.join(__dirname, '..', '__fixtures__', 'rag-sample.pptx');
const docFixturePath = path.join(__dirname, '..', '__fixtures__', 'rag-sample.doc');

/** Build a minimal valid DOCX in-memory. (jszip is a direct dep since
 * ledger #14; it used to be resolved through mammoth's tree.) */
const buildDocx = async (paragraphs: string[]): Promise<Buffer> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`)
    .join('');
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      `<w:body>${body}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
};

const buildXlsx = async (): Promise<Buffer> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const q1 = workbook.addWorksheet('Q1');
  q1.addRow(['Revenue', 4200.5]);
  q1.addRow(['Note', 'exceljs round trip works']);
  workbook.addWorksheet('Q2').addRow(['Second sheet row']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

describe('text-extraction (ledger #12)', () => {
  it('extracts real text from a real PDF fixture via unpdf', async () => {
    const buffer = fs.readFileSync(fixturePath);
    const text = await extractBinaryText('pdf', buffer);
    expect(text).toContain('TeamSynch RAG pipeline PDF extraction proof.');
    expect(text).toContain('Ledger item twelve makes binary ingestion real.');
  });

  it('rejects non-PDF bytes for the pdf format with a non-retryable error', async () => {
    await expect(
      extractBinaryText('pdf', Buffer.from('not a pdf, just text bytes')),
    ).rejects.toMatchObject({
      name: 'TextExtractionError',
      retryable: false,
    });
  });

  it('rejects PDF garbage that has the signature but no valid structure', async () => {
    const fake = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.from('total garbage with no xref table at all'),
    ]);
    await expect(extractBinaryText('pdf', fake)).rejects.toMatchObject({
      name: 'TextExtractionError',
      retryable: false,
    });
  });

  it('extracts paragraphs from a real DOCX container via mammoth', async () => {
    const docx = await buildDocx([
      'TeamSynch DOCX extraction proof paragraph one.',
      'Second paragraph confirms the mammoth pipeline.',
    ]);
    const text = await extractBinaryText('docx', docx);
    expect(text).toContain('TeamSynch DOCX extraction proof paragraph one.');
    expect(text).toContain('Second paragraph confirms the mammoth pipeline.');
  });

  it('rejects non-ZIP bytes for the docx format (legacy .doc honesty)', async () => {
    await expect(
      extractBinaryText('docx', Buffer.from('\xD0\xCF\x11\xE0 legacy OLE header')),
    ).rejects.toMatchObject({ name: 'TextExtractionError', retryable: false });
  });

  it('extracts sheet sections from a real XLSX via exceljs', async () => {
    const xlsx = await buildXlsx();
    const text = await extractBinaryText('xlsx', xlsx);
    expect(text).toContain('# Sheet: Q1');
    expect(text).toContain('# Sheet: Q2');
    expect(text).toContain('Revenue');
    expect(text).toContain('4200.5');
    expect(text).toContain('exceljs round trip works');
    expect(text).toContain('Second sheet row');
  });

  it('rejects non-ZIP bytes for the xlsx format (legacy .xls honesty)', async () => {
    await expect(
      extractBinaryText('xlsx', Buffer.from('\xD0\xCF\x11\xE0 legacy OLE header')),
    ).rejects.toMatchObject({ name: 'TextExtractionError', retryable: false });
  });

  it('TextExtractionError carries the honest reason string', async () => {
    try {
      await extractBinaryText('pdf', Buffer.from('plain text'));
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TextExtractionError);
      expect((error as TextExtractionError).reason).toContain('signature');
    }
  });
});

/* ------------------------------------------------------------------ */
/* ledger #14 — pptx (jszip OPC XML walk)                              */
/* ------------------------------------------------------------------ */

/** Minimal OPC-ish container carrying the given slide parts. Structure
 * pins live here; real-deck rendering is covered by the committed
 * fixture above. */
const buildPptx = async (slides: Record<string, string>): Promise<Buffer> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
  );
  for (const [entry, xml] of Object.entries(slides)) {
    zip.file(entry, xml);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
};

const slideXmlWithText = (text: string): string =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  `<p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p>` +
  '</p:txBody></p:sp></p:spTree></p:cSld></p:sld>';

describe('text-extraction pptx (ledger #14)', () => {
  it('extracts slides, notes, entities and breaks from the real PPTX fixture', async () => {
    const buffer = fs.readFileSync(pptxFixturePath);
    const text = await extractBinaryText('pptx', buffer);
    expect(text).toContain('# Slide 1:');
    expect(text).toContain('TeamSynch RAG pipeline PPTX extraction proof.');
    expect(text).toContain('Ledger item fourteen makes slide ingestion real.');
    expect(text).toContain('# Slide 1 notes:');
    expect(text).toContain('Speaker notes: cite the roadmap slide twice.');
    expect(text).toContain('# Slide 2:');
    // Entities MUST be unescaped and the <a:br/> MUST become a newline —
    // otherwise chunks embed literal '&amp;' noise (dishonest retrieval).
    expect(text).toContain('Q3 outlook: draft & review\nAngle <brackets> survive unescape.');
    // Slide order in the narrative: slide → its notes → next slide.
    const slide1 = text.indexOf('# Slide 1:');
    const notes1 = text.indexOf('# Slide 1 notes:');
    const slide2 = text.indexOf('# Slide 2:');
    expect(slide1).toBeGreaterThanOrEqual(0);
    expect(notes1).toBeGreaterThan(slide1);
    expect(slide2).toBeGreaterThan(notes1);
  });

  it('orders slides NUMERICALLY (slide10 after slide9, not after slide1)', async () => {
    const slides: Record<string, string> = {};
    for (let n = 1; n <= 10; n += 1) {
      slides[`ppt/slides/slide${n}.xml`] = slideXmlWithText(`content of slide ${n}`);
    }
    const text = await extractBinaryText('pptx', await buildPptx(slides));
    expect(text).toContain('# Slide 10:');
    expect(text.indexOf('# Slide 2:')).toBeLessThan(text.indexOf('# Slide 10:'));
  });

  it('rejects non-ZIP bytes for the pptx format (legacy .ppt honesty)', async () => {
    await expect(
      extractBinaryText('pptx', Buffer.from('\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1 legacy ppt', 'latin1')),
    ).rejects.toMatchObject({ name: 'TextExtractionError', retryable: false });
  });

  it('rejects PK-signed garbage that is not a ZIP archive', async () => {
    const fake = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from('this tail is not a real zip structure'),
    ]);
    await expect(extractBinaryText('pptx', fake)).rejects.toMatchObject({
      name: 'TextExtractionError',
      retryable: false,
      reason: expect.stringContaining('not a readable PPTX'),
    });
  });

  it('rejects a DOCX container fed to the pptx path (no slide XML parts)', async () => {
    const docx = await buildDocx(['this is a docx, not a deck']);
    await expect(extractBinaryText('pptx', docx)).rejects.toMatchObject({
      name: 'TextExtractionError',
      retryable: false,
      reason: expect.stringContaining('no slide XML parts'),
    });
  });
});

/* ------------------------------------------------------------------ */
/* ledger #14 — legacy .doc (word-extractor, OLE2)                     */
/* ------------------------------------------------------------------ */

describe('text-extraction legacy .doc (ledger #14)', () => {
  it('extracts body text — including Unicode — from the real .doc fixture', async () => {
    const buffer = fs.readFileSync(docFixturePath);
    const text = await extractBinaryText('doc', buffer);
    expect(text).toContain('This is a test of reviewing');
    expect(text).toContain('inserted, ✻and should be included');
  });

  it('rejects non-OLE bytes for the doc format (modern .docx honesty)', async () => {
    const docx = await buildDocx(['a modern docx has a PK signature']);
    await expect(extractBinaryText('doc', docx)).rejects.toMatchObject({
      name: 'TextExtractionError',
      retryable: false,
      reason: expect.stringContaining('OLE2 signature missing'),
    });
  });

  it('maps a truncated OLE file to a non-retryable failure (never burns retries)', async () => {
    const truncated = fs.readFileSync(docFixturePath).subarray(0, 512);
    await expect(extractBinaryText('doc', truncated)).rejects.toMatchObject({
      name: 'TextExtractionError',
      retryable: false,
      reason: expect.stringContaining('not a readable .doc'),
    });
  });
});
