/**
 * Deterministic multi-page PDF generator for the built-in Knowex sample paper.
 *
 * Produces a valid PDF 1.4 document with exact xref byte offsets, selectable
 * Helvetica text, and vector diagrams so web users can immediately verify
 * reading, text selection, highlighting, region capture, and Markdown export.
 */

export const SAMPLE_PDF_FILENAME = 'Knowex_Web_Research_Guide.pdf'
export const SAMPLE_PDF_TITLE = 'Knowex: Region-Bound Evidence & Local-First Academic Reading'

export function buildSampleResearchPdf(): Uint8Array {
  const page1Stream = [
    'BT',
    '/F2 18 Tf',
    '54 742 Td',
    '(Knowex: Region-Bound Evidence & Local-First Reading) Tj',
    '/F1 10.5 Tf',
    '0 -22 Td',
    '(Knowex Research Note Benchmark Document  |  Web Edition 0.7.0) Tj',
    '/F2 13 Tf',
    '0 -32 Td',
    '(Abstract) Tj',
    '/F1 11 Tf',
    '0 -18 Td',
    '(Academic reading workflows frequently fragment across PDF viewers, screenshot folders,) Tj',
    '0 -16 Td',
    '(and disconnected note files. Knowex binds page-normalized regions, selected text) Tj',
    '0 -16 Td',
    '(highlights, and positioned page notes directly to durable Markdown records.) Tj',
    '/F2 13 Tf',
    '0 -30 Td',
    '(1. Coordinate Normalization & Evidence Binding) Tj',
    '/F1 11 Tf',
    '0 -18 Td',
    '(All spatial anchors are stored in normalized [0, 1] page coordinates. Resizing the) Tj',
    '0 -16 Td',
    '(browser viewport, zooming with Ctrl+Wheel, or switching between single-page and) Tj',
    '0 -16 Td',
    '(continuous reading modes preserves exact highlight and screenshot alignment.) Tj',
    '/F2 13 Tf',
    '0 -30 Td',
    '(2. Explicit Evidence Submission Boundary) Tj',
    '/F1 11 Tf',
    '0 -18 Td',
    '(Neither Exa academic search nor AI Q&A uploads entire PDFs automatically. Only the) Tj',
    '0 -16 Td',
    '(passage or captured region explicitly chosen by the researcher is transmitted.) Tj',
    '0 -16 Td',
    '(All API credentials remain encrypted on the server and are never returned to clients.) Tj',
    '/F2 13 Tf',
    '0 -30 Td',
    '(3. Try These Interactive Steps on This Sample Paper) Tj',
    '/F1 11 Tf',
    '0 -18 Td',
    '(* Select any sentence above to create a colored highlight, underline, or copy text.) Tj',
    '0 -16 Td',
    '(* Click Capture Region in the top bar and drag around the chart on Page 2.) Tj',
    '0 -16 Td',
    '(* Edit your note title and tags on the right, then preview the generated Markdown.) Tj',
    'ET'
  ].join('\n')

  // Page 2 includes a vector bar chart so users can test region screenshot capture visually.
  const page2Stream = [
    'BT',
    '/F2 15 Tf',
    '54 742 Td',
    '(4. Empirical Workflow Comparison (Page 2)) Tj',
    '/F1 11 Tf',
    '0 -22 Td',
    '(Figure 1 illustrates context retention across three note-taking strategies when) Tj',
    '0 -16 Td',
    '(revisiting multi-page technical papers after fourteen days.) Tj',
    'ET',
    // Vector chart frame
    '0.85 0.87 0.85 RG',
    '1 w',
    '64 430 460 220 re S',
    // Horizontal grid lines
    '0.92 0.93 0.92 RG',
    '64 485 m 524 485 l S',
    '64 540 m 524 540 l S',
    '64 595 m 524 595 l S',
    // Bars (Normalized retention score)
    '0.75 0.78 0.76 rg',
    '120 430 68 85 re f',
    '0.53 0.65 0.58 rg',
    '255 430 68 138 re f',
    '0.18 0.41 0.31 rg',
    '390 430 68 188 re f',
    // Chart labels
    '0.13 0.14 0.13 rg',
    'BT',
    '/F1 10 Tf',
    '112 412 Td (Plain Text (39%)) Tj',
    '134 0 Td (PDF Comments (63%)) Tj',
    '130 0 Td (Knowex Bound (86%)) Tj',
    '/F2 10.5 Tf',
    '-250 -28 Td (Figure 1: Fourteen-day evidence trace retention across academic reading workflows.) Tj',
    '/F1 11 Tf',
    '-126 -38 Td',
    '(Drag Capture Region over Figure 1 to store a crisp PNG crop alongside your Markdown) Tj',
    '0 -16 Td',
    '(note, or attach system screenshots via Ctrl+V inside the annotation AI chat.) Tj',
    'ET'
  ].join('\n')

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 7 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 8 0 R >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `7 0 obj\n<< /Length ${Buffer.byteLength(page1Stream, 'latin1')} >>\nstream\n${page1Stream}\nendstream\nendobj\n`,
    `8 0 obj\n<< /Length ${Buffer.byteLength(page2Stream, 'latin1')} >>\nstream\n${page2Stream}\nendstream\nendobj\n`
  ]

  const header = '%PDF-1.4\n'
  const offsets: number[] = [0]
  let body = ''
  let currentOffset = Buffer.byteLength(header, 'latin1')

  for (const obj of objects) {
    offsets.push(currentOffset)
    body += obj
    currentOffset += Buffer.byteLength(obj, 'latin1')
  }

  const xrefOffset = currentOffset
  const xrefLines = [
    `xref`,
    `0 ${objects.length + 1}`,
    `0000000000 65535 f `
  ]
  for (let i = 1; i < offsets.length; i += 1) {
    xrefLines.push(`${String(offsets[i]).padStart(10, '0')} 00000 n `)
  }
  const trailer = [
    ...xrefLines,
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF\n'
  ].join('\n')

  return new Uint8Array(Buffer.from(`${header}${body}${trailer}`, 'latin1'))
}
