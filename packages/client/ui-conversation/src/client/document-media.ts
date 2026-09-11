/**
 * Browser-side document classification shared by draft intake (which kind a
 * picked file becomes) and the composer's intake pre-check (which files the
 * projected document limits apply to). One table keeps both decisions equal:
 * the Host re-verifies the declared media type from the bytes.
 */

import type { DocumentMediaType } from '@deepseek-ai/dsh-attachment'

/** Document media types accepted at intake; mirrors the Host's documentLimits. */
const DOCUMENT_MEDIA_TYPES: readonly DocumentMediaType[] = [
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]

/** Extension-only fallbacks for document types the browser reports without a MIME. */
const DOCUMENT_EXTENSIONS: Readonly<Record<string, DocumentMediaType>> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/**
 * Resolve a browser file's document media type from its MIME, then its extension.
 * @param file - browser file selected by the user.
 * @returns the accepted document media type, or undefined for every other file.
 */
export function documentMediaType(file: File): DocumentMediaType | undefined {
  if ((DOCUMENT_MEDIA_TYPES as readonly string[]).includes(file.type)) return file.type as DocumentMediaType
  const dot = file.name.lastIndexOf('.')
  if (dot < 0) return undefined
  return DOCUMENT_EXTENSIONS[file.name.slice(dot).toLowerCase()]
}
