/** Document inspection: media-type verification and text extraction. */

import { unzipSync } from 'fflate'
import { extractText, getDocumentProxy } from 'unpdf'
import { AttachmentError } from '@deepseek-ai/dsh-attachment'
import type { DocumentMediaType } from '@deepseek-ai/dsh-attachment'

/** `%PDF-` prefix identifying a PDF byte stream. */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const
/** `PK\x03\x04` local-file-header magic shared by DOCX and PPTX ZIP containers. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const

/** OOXML inline text run tag for WordprocessingML. */
const DOCX_TEXT_TAG = 'w:t'
/** OOXML inline text run tag for PresentationML. */
const PPTX_TEXT_TAG = 'a:t'

/** The five predefined XML entities and their literal replacements. */
const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

/** Decode UTF-8 bytes, rejecting malformed input instead of replacing it. */
function decodeUtf8(data: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch (error) {
    throw new AttachmentError('Document is not valid UTF-8 text.', 'INVALID_DOCUMENT', { cause: error })
  }
}

/** Whether the byte stream starts with the exact magic prefix. */
function startsWith(data: Uint8Array, magic: readonly number[]): boolean {
  if (data.byteLength < magic.length) return false
  return magic.every((byte, index) => data[index] === byte)
}

/** Replace predefined and numeric XML entities in one text run. */
function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (entity) => {
    const known = XML_ENTITIES[entity]
    if (known !== undefined) return known
    const hex = entity.startsWith('&#x')
    const code = Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : entity
  })
}

/** Concatenate every `<tag>…</tag>` text run in one XML fragment. */
function extractRuns(xml: string, tag: string): string {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'g')
  const runs: string[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml)) !== null) {
    runs.push(decodeXmlEntities(match[1] ?? ''))
  }
  return runs.join('')
}

/** Unzip a document container, normalizing invalid archives to an attachment error. */
function unzip(data: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(data)
  } catch (error) {
    throw new AttachmentError('Document is not a valid ZIP archive.', 'INVALID_DOCUMENT', { cause: error })
  }
}

/** Concatenate WordprocessingML paragraphs, one line per non-empty paragraph. */
function extractDocxText(files: Record<string, Uint8Array>): string {
  const documentXml = files['word/document.xml']
  if (documentXml === undefined) throw new AttachmentError('DOCX document is missing word/document.xml.', 'INVALID_DOCUMENT')
  const xml = decodeUtf8(documentXml)
  return xml.split(/<\/w:p>/)
    .map(paragraph => extractRuns(paragraph, DOCX_TEXT_TAG))
    .filter(paragraph => paragraph.length > 0)
    .join('\n')
}

/** Concatenate PresentationML slides in numeric slide order, paragraphs newline-separated. */
function extractPptxText(files: Record<string, Uint8Array>): string {
  const slideNames = Object.keys(files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
  const slides = slideNames.map((name) => {
    const xml = decodeUtf8(files[name] as Uint8Array)
    return xml.split(/<\/a:p>/)
      .map(paragraph => extractRuns(paragraph, PPTX_TEXT_TAG))
      .filter(paragraph => paragraph.length > 0)
      .join('\n')
  })
  return slides.filter(slide => slide.length > 0).join('\n\n')
}

/** Extract text from a PDF via the serverless PDF.js build bundled with unpdf. */
async function extractPdfText(data: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(data)
    const { text } = await extractText(pdf, { mergePages: true })
    return text.trim()
  } catch (error) {
    if (error instanceof AttachmentError) throw error
    throw new AttachmentError('Unable to extract text from PDF document.', 'INVALID_DOCUMENT', { cause: error })
  }
}

/**
 * Verify that the bytes match the declared document media type.
 * @param data - complete encoded document bytes.
 * @param declaredMediaType - caller-declared type, checked against the decoded container.
 * @returns completion after the container has been inspected.
 */
export async function detectDocument(data: Uint8Array, declaredMediaType: DocumentMediaType): Promise<void> {
  if (data.byteLength === 0) throw new AttachmentError('Document is empty.', 'INVALID_DOCUMENT')
  switch (declaredMediaType) {
    case 'application/pdf': {
      if (!startsWith(data, PDF_MAGIC)) throw new AttachmentError('Declared document type does not match its bytes.', 'DOCUMENT_TYPE_MISMATCH')
      return
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
      if (!startsWith(data, ZIP_MAGIC) || unzip(data)['word/document.xml'] === undefined) {
        throw new AttachmentError('Declared document type does not match its bytes.', 'DOCUMENT_TYPE_MISMATCH')
      }
      return
    }
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
      if (!startsWith(data, ZIP_MAGIC) || unzip(data)['ppt/presentation.xml'] === undefined) {
        throw new AttachmentError('Declared document type does not match its bytes.', 'DOCUMENT_TYPE_MISMATCH')
      }
      return
    }
    case 'text/markdown': {
      decodeUtf8(data)
      return
    }
    default: {
      const exhaustive: never = declaredMediaType
      throw new AttachmentError(`Unsupported document media type: ${String(exhaustive)}`, 'INVALID_DOCUMENT')
    }
  }
}

/**
 * Extract the model-visible plain text from one verified document.
 * @param data - complete encoded document bytes, already admitted by {@link detectDocument}.
 * @param mediaType - the verified document media type.
 * @returns the extracted text.
 */
export async function extractDocumentText(data: Uint8Array, mediaType: DocumentMediaType): Promise<string> {
  switch (mediaType) {
    case 'text/markdown': return decodeUtf8(data)
    case 'application/pdf': return extractPdfText(data)
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return extractDocxText(unzip(data))
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation': return extractPptxText(unzip(data))
    default: {
      const exhaustive: never = mediaType
      throw new AttachmentError(`Unsupported document media type: ${String(exhaustive)}`, 'INVALID_DOCUMENT')
    }
  }
}
