/** Durable attachment vocabulary. @module @deepseek-ai/dsh-attachment/types */

import type { AttachmentId } from './brand.ts'

export type { AttachmentId } from './brand.ts'

/** Raster image formats accepted by the version-one attachment path. */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/**
 * Text-bearing document formats accepted by the document attachment path.
 * The harness extracts model-visible text from these bytes and never submits
 * the encoded document itself to a model.
 */
export type DocumentMediaType =
  | 'text/markdown'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/** Durable, serializable metadata for one immutable image object. */
export interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name stripped of local path information. */
  name?: string
}

/** Deployment-resolved limits used by upload admission and request buffering. */
export interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  mediaTypes: readonly ImageMediaType[]
}

/** Request to validate and durably commit one image. */
export interface SaveImageAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against fully decoded bytes. */
  mediaType: ImageMediaType
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}

/** Stored image bytes returned after reference and digest verification. */
export interface StoredImageAttachment {
  ref: ImageAttachmentRef
  data: Uint8Array
}

/** Durable, serializable metadata for one immutable document object. */
export interface DocumentAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: DocumentMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Optional display name stripped of local path information. */
  name?: string
}

/** Deployment-resolved limits used by document upload admission and request buffering. */
export interface DocumentAttachmentLimits {
  maxDocumentBytes: number
  maxDocumentsPerMessage: number
  maxMessageDocumentBytes: number
  mediaTypes: readonly DocumentMediaType[]
}

/** Request to validate and durably commit one document. */
export interface SaveDocumentAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against the decoded document. */
  mediaType: DocumentMediaType
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}

/** A durably committed document: its reference plus the extracted model-visible text. */
export interface SavedDocumentAttachment {
  ref: DocumentAttachmentRef
  /** Plain text extracted from the document, ready to reach the model. */
  text: string
}

/** Stored document bytes returned after reference and digest verification. */
export interface StoredDocumentAttachment {
  ref: DocumentAttachmentRef
  data: Uint8Array
}
