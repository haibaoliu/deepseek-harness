/** Durable attachment vocabulary. @module @deepseek-ai/dsh-attachment/types */

import type { AttachmentId, ImageVariantId } from './brand.ts'

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

/** Durable, serializable reference to one immutable normalized image. */
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
  /**
   * Input dimensions after applying EXIF orientation and before normalization
   * scaling. Present only when normalization reduced the image.
   */
  originalDimensions?: {
    width: number
    height: number
  }
}

/**
 * Durable, serializable reference to one verbatim stored file. Files are
 * stored byte-for-byte with no normalization; `attachmentId` is the sha256
 * digest of exactly those bytes.
 */
export interface FileAttachmentRef {
  /** Opaque content-addressed storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Sanitized display filename, also the stored object's leaf name. */
  name: string
  /** Exact byte length. */
  bytes: number
}

/** Base64-encoded file upload accompanying one wire request. */
export interface EncodedFileAttachment {
  /** Canonical base64 encoding of the file bytes. */
  data: string
  /** Optional display name; it is never interpreted as a path. */
  name?: string
}

/** Request to durably commit one file verbatim. */
export interface SaveFileAttachment {
  data: Uint8Array
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}

/** Request to durably commit one file from bounded byte chunks. */
export interface SaveFileStreamAttachment {
  /** Exact file bytes in order; providers must not retain the complete sequence in memory. */
  data: AsyncIterable<Uint8Array>
  /** Optional cancellation for source reads and storage writes. */
  signal?: AbortSignal
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}

/** Deployment-resolved limits used by upload admission and request buffering. */
export interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  /** Maximum intrinsic width and maximum intrinsic height in pixels for one image. */
  maxImageDimension: number
  mediaTypes: readonly ImageMediaType[]
}

/** Base64-encoded image upload accompanying one wire request. */
export interface EncodedImageAttachment {
  /** Declared media type, verified against the decoded bytes during admission. */
  mediaType: ImageMediaType
  /** Canonical base64 encoding of the image bytes. */
  data: string
  /** Optional display name; it is never interpreted as a path. */
  name?: string
}

/**
 * Browser-submitted prompt content accepted by Host prompt endpoints; the
 * accepting Host promotes image parts to durable references through
 * `ctx.attachments.admitPromptContent()` before any message is created, so a wire caller can
 * never cite an attachment it did not upload.
 */
export type PromptContentPart =
  | { readonly type: 'text'; readonly text: string }
  | {
    readonly type: 'image'
    readonly mediaType: ImageMediaType
    readonly data: string
    readonly name?: string
  }
  | {
    readonly type: 'document'
    readonly mediaType: DocumentMediaType
    readonly data: string
    readonly name?: string
  }

/** Host prompt content whose file receipts are resolved and whose image bytes await admission. */
export type AttachmentAdmissionPart =
  | PromptContentPart
  | { readonly type: 'file'; readonly attachment: FileAttachmentRef }

/** Host-admitted prompt content with every attachment represented by its durable reference. */
export type AdmittedPromptContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly attachment: ImageAttachmentRef }
  | { readonly type: 'file'; readonly attachment: FileAttachmentRef }

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

/** Deterministic request-image policy selected by one exact model route. */
export interface ImageRequestPolicy {
  /** Maximum width multiplied by height after aspect-preserving projection. */
  maxPixels: number
  /** Encoded-byte target before base64 expansion or Files API upload; the smallest quality-ladder output is kept when no quality fits. */
  maxBytes: number
}

/** Cached request version derived from one provider-independent normalized attachment. */
export interface RequestImageAttachment {
  /** Cache and upload-index key over the attachment id, policy, and fixed encoder parameters. */
  variantId: ImageVariantId
  /** Durable normalized attachment from which this request version was derived. */
  attachment: ImageAttachmentRef
  /** Encoded request bytes. */
  data: Uint8Array
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  /** Provider-compatible sample depth proven after request encoding. */
  depth: 'uchar'
  /** Provider-compatible color space proven after request encoding. */
  space: 'srgb'
  /** Whether the encoded request version retains an alpha channel. */
  hasAlpha: boolean
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
