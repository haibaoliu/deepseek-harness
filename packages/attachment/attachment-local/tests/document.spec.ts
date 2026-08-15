import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type { DocumentMediaType } from '@deepseek-ai/dsh-attachment'
import { detectDocument, extractDocumentText } from '../src/document.ts'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
const PDF = 'application/pdf'

function docx(runs: string[]): Uint8Array {
  const paragraphs = runs.map(run => `<w:p><w:r><w:t>${run}</w:t></w:r></w:p>`).join('')
  return zipSync({ 'word/document.xml': strToU8(`<w:document>${paragraphs}</w:document>`) })
}

/** Build a minimal single-page PDF whose content stream draws `text` with Helvetica. */
function pdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 0; i < objects.length; i++) {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefStart = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return new TextEncoder().encode(body)
}

function pptx(slides: string[][]): Uint8Array {
  const entries: Record<string, Uint8Array> = { 'ppt/presentation.xml': strToU8('<p:presentation/>') }
  for (const [index, slide] of slides.entries()) {
    const paragraphs = slide.map(run => `<a:p><a:r><a:t>${run}</a:t></a:r></a:p>`).join('')
    entries[`ppt/slides/slide${index + 1}.xml`] = strToU8(`<p:sld>${paragraphs}</p:sld>`)
  }
  return zipSync(entries)
}

describe('document inspection', () => {
  it('extracts markdown as plain UTF-8 text', async () => {
    const data = new TextEncoder().encode('# 标题\n\n正文 **加粗**')
    await expect(extractDocumentText(data, 'text/markdown')).resolves.toBe('# 标题\n\n正文 **加粗**')
  })

  it('extracts DOCX paragraphs joined by newlines', async () => {
    await expect(extractDocumentText(docx(['第一段', '第二段']), DOCX)).resolves.toBe('第一段\n第二段')
  })

  it('extracts PPTX slides in numeric order, paragraphs newline-separated', async () => {
    await expect(extractDocumentText(pptx([['第一页'], ['第二页', '同页第二段']]), PPTX))
      .resolves.toBe('第一页\n\n第二页\n同页第二段')
  })

  it('extracts text from a minimal PDF', async () => {
    await expect(extractDocumentText(pdf('Hello PDF'), PDF)).resolves.toBe('Hello PDF')
  })

  it('verifies declared media types against container bytes', async () => {
    await expect(detectDocument(docx(['a']), DOCX)).resolves.toBeUndefined()
    await expect(detectDocument(pptx([['a']]), PPTX)).resolves.toBeUndefined()
    await expect(detectDocument(new TextEncoder().encode('x'), 'text/markdown')).resolves.toBeUndefined()
    await expect(detectDocument(docx(['a']), PPTX)).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_MISMATCH' })
    await expect(detectDocument(new TextEncoder().encode('x'), DOCX)).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_MISMATCH' })
  })

  it('rejects empty bytes and invalid UTF-8 markdown', async () => {
    await expect(detectDocument(new Uint8Array(0), 'text/markdown')).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' })
    await expect(detectDocument(Uint8Array.of(0xff, 0xfe, 0xfd), 'text/markdown')).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' })
  })

  it('rejects a non-ZIP payload declared as a DOCX container', async () => {
    await expect(detectDocument(Uint8Array.of(1, 2, 3), DOCX)).rejects.toMatchObject({ code: 'DOCUMENT_TYPE_MISMATCH' })
  })

  it('exhausts every document media type through the extractor', async () => {
    const cases: Array<[Uint8Array, DocumentMediaType]> = [
      [new TextEncoder().encode('md'), 'text/markdown'],
      [docx(['a']), DOCX],
      [pptx([['a']]), PPTX],
    ]
    for (const [data, mediaType] of cases) {
      await expect(extractDocumentText(data, mediaType)).resolves.toBeTypeOf('string')
    }
  })
})
