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
needed because every adapter already flattens only `text` blocks.

- `@deepseek-ai/dsh-attachment` gains a `DocumentMediaType` family
  (`text/markdown`, `application/pdf`, the WordprocessingML and PresentationML OOXML types),
  `DocumentAttachmentRef` / `DocumentAttachmentLimits`, and the `documentLimits` +
  `validateDocument` / `saveDocument` / `readDocument` seam members. `saveDocument` returns
  both the reference and the extracted text.
- `@deepseek-ai/dsh-attachment-local` implements those members and owns text extraction:
  Markdown is UTF-8-decoded, PDF via `unpdf`, DOCX/PPTX via `fflate` unzip plus an
  inline `<w:t>` / `<a:t>` run scrape. Magic-byte checks verify the declared media type.
- `dsh-llm` adds a `document` `ContentBlock` (merge-extensible `ContentBlockMap`); the block
  is logged for replay and dropped by text-flattening adapters and by compaction.
- `dsh-host-apiproxy` accepts a `document` prompt part, exposes a `documentLimits` projection,
  and its `durablePromptContent` emits `<text>(filename + extracted text)</text>` plus a
  `<document ref>` block. `session.attachment` reads either image or document references.
- `dsh-client-ui-conversation` accepts and serializes document files (MIME plus extension
  fallback for `.md`/`.pdf`/`.docx`/`.pptx`), and `dsh-client-ui-attachment` renders document
  name chips in the composer rail and in user messages.

## Rejected alternatives

- **Native multimodal documents** (submit PDF bytes as a model input part): only some models
  accept PDF, and none accept DOCX/PPTX; it would force per-adapter serialization and a new
  modality gate. Extracted text works with every model.
- **Extract in the host proxy and discard the original bytes**: storing the original is
  cheap (content-addressed) and keeps `session.attachment` able to serve the source file
  later; it also keeps byte validation in the storage seam where image decode already lives.

## Deferred

- PDF extraction is exercised by `unpdf`, but the package tests cover Markdown/DOCX/PPTX only.
- The exported session-log ZIP inlines image bytes but not document originals (extracted text
  is already in the log, so model content stays reconstructable).
