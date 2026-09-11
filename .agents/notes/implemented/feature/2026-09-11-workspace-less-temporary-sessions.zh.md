# Agent Note: 无工作区的临时会话获得独立 scratch 目录

Status: implemented

[English](2026-09-11-workspace-less-temporary-sessions.md) | 中文

## Problem

两个彼此无关的缺陷共用了同一个入口。侧边栏那个无作用域的 New Session 动作在创建会话前会先解析当前或最近的 Workspace，于是只想要一个随手即弃的临时对话的用户，被静默地继承了那个 Workspace 及其文件作用域。而一个既没有 Workspace 也没有显式 `cwd` 的会话，随后会落到部署级共享默认目录（`process.cwd()`），于是临时对话的文件产物会落在 harness 默认目录旁边，并可能与另一个会话的 scratch 工作互相碰撞。另一处独立的问题是：一个已存在但没有 Workspace 的会话，其输入框被渲染为只读，点击时会弹出 Workspace 选择器——最需要自由输入的那类会话反而无法输入。

## Decision

无作用域的 New Session 动作不再解析或连接 Workspace。它打开一个**无工作区临时会话**：若已存在空白的未分组会话就复用（因此反复点击不会堆积空行），否则请求宿主创建一个。工作区作用域的 New Session 动作（Workspace 浏览器行内的入口）仍然连接其 Workspace，因为在那里 Workspace 是用户的显式选择。

已存在的会话永远不会被 Workspace 选择器卡住：只有"没有会话"的状态保持 inert。对无工作区会话而言，被抬起的 composer block 仍然禁用输入，但模型座位保持可用，因此可以从输入框清除该 block。

宿主新增一个可选的 `temporarySessionRoot` 控制器内部选项，由服务默认取 `dshHomePath('tmp-sessions')`，目前只能通过该内部注入点传入（没有配置面）。一个既未指定 Workspace 也未指定 `cwd` 的会话创建请求会拿到 `join(temporarySessionRoot, <会话 id 的哈希>)`，而不是共享默认目录，因此每个临时会话拥有一个不会有其它会话写入的目录。该叶子名由会话身份派生而非每次新生成，因为对已存在的会话重复调用 `session.create({ sessionId })` 必须能收养它：若每次重新生成叶子名，持久化 `cwd` 校验就会失败并暴露为冲突。当该选项缺席时——即显式传入 `undefined`，隔离性单元测试就是这样做的——创建会保留旧的共享回退，而不会写进真实的 `$DSH_HOME`。

## Alternatives considered

**继续为无作用域动作解析最近的 Workspace。** 这个动作是唯一不指定 Workspace 的入口，因此从历史里推断一个 Workspace 与用户的诉求相矛盾；而继承了 Workspace 的临时对话，正是"隔离设置"要避免的那种情况。

**让每个临时会话都用共享默认 `cwd`，靠忽略规则兜底。** 默认目录属于部署而非会话，因此任何会话级清理都无法区分某个临时对话的产物与另一个的产物。每会话一个目录把边界做成结构性的，而不是约定性的。

**总是合成 scratch 目录，忽略配置的回退。** 希望未命名会话落在固定项目目录的部署会失去这项控制，测试挂具也会开始写入真实的 `$DSH_HOME`。该设置保持可选，显式 `undefined` 保留旧行为。

## Consequences

临时对话现在的行为如同 scratch 空间：其 `cwd` 每会话唯一，因此文件产物不会泄漏进 harness 默认目录，也不会进入另一个会话的 scratch 空间，侧边栏的快捷 New Session 也不再需要先做 Workspace 决策。工作区作用域的创建行为不变。由于 scratch 根位于 `$DSH_HOME` 之下，临时会话在 harness 重启后依然存在，但永远不会被自动删除；想清理它们的部署需要自己承担该策略。在该设置存在之前创建的会话保留其已记录的 `cwd`，因此这项变更是向前生效的。
