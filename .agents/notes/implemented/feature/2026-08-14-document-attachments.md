# Agent Note: Document attachments extract text into the model-visible prompt

Status: implemented

English | [中文](2026-08-14-document-attachments.zh.md)

## Problem

The version-one attachment path accepts raster images only (`image/png`, `image/jpeg`,
`image/webp`, `image/gif`). A browser user who drags or pastes an `.md`, `.pdf`, `.docx`,
or `.pptx` is rejected at intake, and the host wire has no part to carry such a file. The
request is to let those documents reach the agent through the same composer surface.

## Decision

Documents are **model-visible as extracted text, never as encoded bytes**. The harness
stores the original file content-addressed, extracts its plain text on the host, and places
that text in an ordinary `text` content block; a sibling `document` content block carries the
durable reference for rendering and replay while staying model-hidden. No adapter change is
needed because every adapter flattens `text` (and projects `file` handles), so an
unrecognized block is dropped rather than serialized.

- `@deepseek-ai/dsh-attachment` gains a `DocumentMediaType` family
  (`text/markdown`, `application/pdf`, the WordprocessingML and PresentationML OOXML types),
  `DocumentAttachmentRef` / `DocumentAttachmentLimits`, a `document` member on the
  browser-submitted `PromptContentPart` union, and the `documentLimits` +
  `validateDocument` / `saveDocument` / `readDocument` seam members. `saveDocument` returns
  both the reference and the extracted text.
- `@deepseek-ai/dsh-attachment-local` implements those members and owns text extraction:
  Markdown is UTF-8-decoded, PDF via `unpdf`, DOCX/PPTX via `fflate` unzip plus an
  inline `<w:t>` / `<a:t>` run scrape. Magic-byte checks verify the declared media type.
- `@deepseek-ai/dsh-llm` adds a `document` `ContentBlock` (merge-extensible
  `ContentBlockMap`); the block is logged for replay and dropped by text-flattening
  adapters and by compaction.
- `@deepseek-ai/dsh-api-session-controller` accepts a `document` prompt part, enforces the
  configured per-message document count and aggregate byte budget before validating and
  saving any member, exposes a `documentLimits` session projection, and emits a
  model-visible `<name>: <extracted text>` text block followed by the model-hidden
  `document` block. `session.attachment` resolves image or document references.
- The web client accepts document files (MIME plus extension fallback for
  `.md`/`.pdf`/`.docx`/`.pptx`), serializes them as `document` prompt parts, and renders
  document name chips in both the composer rail and user messages.

## Alternatives considered

- **Native multimodal documents** (submit PDF bytes as a model input part): only some models
  accept PDF, and none accept DOCX/PPTX; it would force per-adapter serialization and a new
  modality gate. Extracted text works with every model.
- **Extract in the host proxy and discard the original bytes**: storing the original is
  cheap (content-addressed) and keeps `session.attachment` able to serve the source file
  later; it also keeps byte validation in the storage seam where image decode already lives.
- **Route documents through the generic staged file-upload path** (store the file verbatim
  and hand the model a readable path): a PDF, DOCX, or PPTX stored verbatim is not readable
  text, so the agent would need its own converter before the content could reach the model.
  Extracting once at admission keeps the first turn usable and makes the extracted text
  durable in the session log.

## Consequences

A prompt carrying documents has its bytes decoded, limit-checked, validated, and extracted
before any message is created, so a refused document batch never produces a partial message.
Only the extracted text is model-visible; the `document` block keeps the durable reference
for replay, rendering, and later `session.attachment` reads of the original bytes. Document
admission shares the serialized image-admission path, so the ordering guarantees that
already covered images now cover documents too. Extraction coverage is split: Markdown,
DOCX, and PPTX extraction are unit-tested, while the PDF path relies on `unpdf` and is not
covered by a package test. The exported session-log ZIP still inlines image bytes only;
document originals are not inlined, but the extracted text is already in the log, so model
content remains reconstructable.
