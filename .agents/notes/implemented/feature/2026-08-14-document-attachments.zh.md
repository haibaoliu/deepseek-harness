# Agent Note: 文档附件把抽取出的文本送入模型可见的提示

Status: implemented

[English](2026-08-14-document-attachments.md) | 中文

## Problem

第一版附件链路只接受光栅图片（`image/png`、`image/jpeg`、`image/webp`、`image/gif`）。浏览器用户在输入框拖入或粘贴 `.md`、`.pdf`、`.docx`、`.pptx` 时会被入口拒绝，主机线协议也没有承载这类文件的 part。需求是让这些文档能通过同一个输入框到达 agent。

## Decision

文档对模型可见的形态是**抽取出的文本，而不是编码后的原始字节**。主机把原始文件内容寻址存储，抽取其纯文本，把文本放进普通的 `text` 内容块；一个并排的 `document` 内容块承载持久化引用，用于回显与回放，但对模型不可见。无需改动任何适配器，因为所有适配器只 flatten `text`（并把 `file` 投影成句柄），无法识别的块会被丢弃而不是被序列化。

- `@deepseek-ai/dsh-attachment` 新增 `DocumentMediaType` 族（`text/markdown`、`application/pdf`、WordprocessingML 与 PresentationML 两种 OOXML 类型）、`DocumentAttachmentRef` / `DocumentAttachmentLimits`、浏览器提交的 `PromptContentPart` 联合类型上的 `document` 成员，以及 `documentLimits` + `validateDocument` / `saveDocument` / `readDocument` 四个 seam 成员。`saveDocument` 同时返回引用与抽取出的文本。
- `@deepseek-ai/dsh-attachment-local` 实现这些成员并拥有文本抽取：Markdown 走 UTF-8 解码，PDF 走 `unpdf`，DOCX/PPTX 走 `fflate` 解 ZIP 加内联 `<w:t>` / `<a:t>` 文本抓取；魔数校验媒体类型。
- `@deepseek-ai/dsh-llm` 新增 `document` `ContentBlock`（merge-extensible 的 `ContentBlockMap`）；该块被记录以便回放，并被文本 flatten 适配器与 compaction 丢弃。
- `@deepseek-ai/dsh-api-session-controller` 接受 `document` prompt part，在保存任何成员**之前**先校验单条消息的文档数量与总字节预算，暴露 `documentLimits` 会话投影，并产出模型可见的 `<文件名>: <抽取文本>` 文本块，随后是模型不可见的 `document` 块。`session.attachment` 可读取图片或文档引用。
- Web 客户端接受文档文件（MIME 加 `.md`/`.pdf`/`.docx`/`.pptx` 扩展名兜底），序列化为 `document` prompt part，并在输入框轨道与用户消息里渲染文档名 chip。

## Alternatives considered

- **原生多模态文档**（把 PDF 字节作为模型输入 part 提交）：只有部分模型接受 PDF，且都不接受 DOCX/PPTX；需要逐适配器序列化并新增模态门禁。抽取文本对所有模型通用。
- **在主机代理里抽取后丢弃原始字节**：存储原始字节成本低（内容寻址），并让 `session.attachment` 以后能提供源文件；同时把字节校验留在存储 seam 里，与图片解码同处一地。
- **走通用暂存上传链路**（把文件逐字节存储并把可读路径交给模型）：逐字节存储的 PDF/DOCX/PPTX 不是可读文本，agent 得先自己转换才能拿到内容。在准入时抽取一次可让首轮即可用，并让抽取文本持久留在会话日志里。

## Consequences

携带文档的 prompt 会在创建任何消息**之前**完成解码、限额检查、校验与抽取，因此被拒的文档批次不会产生半截消息。只有抽取文本对模型可见；`document` 块保留持久化引用，供回放、渲染以及之后通过 `session.attachment` 取回原始字节。文档准入与图片准入共用同一条串行通道，因此原先只覆盖图片的顺序保证现在也覆盖文档。抽取同时约束解码后的字节预算与容器可声明的条目数，因此精心构造的 ZIP 容器无法用一个永远不必解压的条目数拖住宿主。抽取的测试覆盖是分裂的：Markdown、DOCX、PPTX 用本包构造的容器做单元测试，PDF 路径由一份手写的最小 PDF 覆盖，而非语料库。导出的会话日志 ZIP 仍然只内联图片字节；文档原始字节不内联，但抽取文本已在日志里，模型内容仍可重建。
