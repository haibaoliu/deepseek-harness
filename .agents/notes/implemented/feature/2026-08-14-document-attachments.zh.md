# Agent Note: 文档附件把抽取出的文本送入模型可见的提示

Status: implemented

[English](2026-08-14-document-attachments.md) | 中文

## Problem

第一版附件链路只接受光栅图片（`image/png`、`image/jpeg`、`image/webp`、`image/gif`）。浏览器用户在输入框拖入或粘贴 `.md`、`.pdf`、`.docx`、`.pptx` 时会被入口拒绝，主机线协议也没有承载这类文件的 part。需求是让这些文档能通过同一个输入框到达 agent。

## Decision

文档对模型可见的形态是**抽取出的文本，而不是编码后的原始字节**。主机把原始文件内容寻址存储，抽取其纯文本，把文本放进普通的 `text` 内容块；一个并排的 `document` 内容块承载持久化引用，用于回显与回放，但对模型不可见。无需改动任何适配器，因为所有适配器本来就只 flatten `text` 块。

- `@deepseek-ai/dsh-attachment` 新增 `DocumentMediaType` 族（`text/markdown`、`application/pdf`、WordprocessingML 与 PresentationML 两种 OOXML 类型）、`DocumentAttachmentRef` / `DocumentAttachmentLimits`，以及 `documentLimits` + `validateDocument` / `saveDocument` / `readDocument` 四个 seam 成员。`saveDocument` 同时返回引用与抽取出的文本。
- `@deepseek-ai/dsh-attachment-local` 实现这些成员并拥有文本抽取：Markdown 走 UTF-8 解码，PDF 走 `unpdf`，DOCX/PPTX 走 `fflate` 解 ZIP 加内联 `<w:t>` / `<a:t>` 文本抓取；魔数校验媒体类型。
- `dsh-llm` 新增 `document` `ContentBlock`（merge-extensible 的 `ContentBlockMap`）；该块被记录以便回放，并被文本 flatten 适配器与 compaction 丢弃。
- `dsh-host-apiproxy` 接受 `document` prompt part，暴露 `documentLimits` 投影，其 `durablePromptContent` 产出 `<text>（文件名 + 抽取文本）</text>` 加一个 `<document ref>` 块。`session.attachment` 读取图片或文档引用均可。
- `dsh-client-ui-conversation` 接受并序列化文档文件（MIME 加 `.md`/`.pdf`/`.docx`/`.pptx` 扩展名兜底），`dsh-client-ui-attachment` 在输入框轨道与用户消息里渲染文档名 chip。

## Rejected alternatives

- **原生多模态文档**（把 PDF 字节作为模型输入 part 提交）：只有部分模型接受 PDF，且都不接受 DOCX/PPTX；需要逐适配器序列化并新增模态门禁。抽取文本对所有模型通用。
- **在主机代理里抽取后丢弃原始字节**：存储原始字节成本低（内容寻址），并让 `session.attachment` 以后能提供源文件；同时把字节校验留在存储 seam 里，与图片解码同处一地。

## Deferred

- PDF 抽取由 `unpdf` 覆盖，但包测试只覆盖 Markdown/DOCX/PPTX。
- 导出的会话日志 ZIP 内联图片字节但不内联文档原始字节（抽取文本已在日志里，模型内容可重建）。
