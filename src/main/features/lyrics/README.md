# 歌词后端互转

## LRC 原文编辑接入（2026-10-14）

主界面歌词右键「编辑歌词」连接 `LyricsEditPanel.vue`，外壳使用共享 `AppDialog`、主题颜色、语义字体和 Lucide 图标。LRC 模式提供原文编辑、单行时间工具和保存为 TTML；打开 TTML 或保存为 TTML 后，切换为逐句分唱标记列表，支持单选、Ctrl/Cmd 多选、Shift 范围选择、全选，以及标记演唱者 1、2 和清除标记。保存复用已有 TTML 会话、备份和外部修改检测。合唱及复杂分配行保留只读，不提供姓名、合唱或预览区；TTML 转 LRC 的界面后续接入。主界面同步歌词保留演唱者标记，演唱者 1 左对齐、演唱者 2 右对齐。

新增 `lyrics.openLrcEditor(trackId)`、`saveLrcEditor({ sessionId, expectedRevision, text, target: 'tag' | 'file' | 'ttml' })`、`closeLrcEditor(sessionId)`。沿用可信窗口/top-frame和显式 Preload，主进程按窗口绑定会话、最多8个会话、30分钟空闲过期、128 Ki字符文本上限；目标路径由数据库和曲库根目录决定，Renderer不传路径。歌词原文读取保留空白，文本区将CRLF/CR规范为LF以匹配原生光标索引。LRC原文保存不排序、不合并、不删除空行。

LRC 模式底部「保存 ▾」展开动作菜单，选择保存到歌曲标签（LRC）、保存为 LRC 文件或保存为 TTML 文件后立即执行；「保存并关闭」复用同一菜单，Ctrl+S 打开当前保存菜单。各项独立禁用，未修改时仍可导出 LRC/TTML，歌曲标签仅在有修改且格式支持时可选。菜单复用 Auralis 样式、共享浮层定位和键盘导航，放在面板内部以保留焦点管理，Esc 只收起菜单。选择 TTML 时，即使原文未修改也可保存；主进程复用纯转换器生成同目录同名 `.ttml`，沿用备份、并发修改拒绝和排他发布，原 LRC 和标签保留。转换存在未打点正文或无效时间戳时拒绝写入，不静默遗漏正文；正常转换仍沿用转换器的时间排序、结束时间推断、LRC offset 和逐字时间规则，返回转换警告。已知歌曲时长用于末句结束时间，未知时默认末句 5 秒并提示；负时间截断也提示。保存为 TTML 后进入分唱列表，TTML 模式的保存按钮与 Ctrl+S 直接保存当前分唱草稿，不再展开格式菜单；保存成功后建立新会话，保存失败保留当前草稿。播放器 `useTrackLyrics` 消费已有 `ttmlPlayback` 投影，沿用单活动行语义；主界面按演唱者左右对齐，不显示 XML，不提供逐字或重叠声部的独立高亮。

LRC文件保存到歌曲同目录同主文件名 `.lrc`，复用原有排他发布、旧文件备份、外部修改检测和恢复路径；需要文件系统支持硬链接。内嵌保存支持MP3/FLAC/M4A/OGG/Opus；AAC/WAV只提供LRC文件保存。复用元数据写协调器和现有播放中文件写回机制；`node-taglib-sharp`只在Worker里改临时副本的歌词字段，验证歌词及其他元数据保留后才发布，不向公开元数据IPC新增字段。使用现有依赖API，未复制第三方实现。

保存后重新读取实际歌词来源、更新两个歌词缓存并广播库变更，编辑面板重新建立文件基线；写入成功后缓存/播放恢复失败会作为已写入警告返回，不把已提交结果当作可重复提交的失败。已有歌词读取优先级保持不变（外置TTML、内嵌定时歌词、外置LRC、内嵌普通文本），如果其他来源仍优先，面板提示已保存但仍使用其他来源，不删除或暗改内嵌/其他文件。

编辑对象固定为打开时的歌曲；切歌后仍可编辑和保存，播放打点和进度控制禁用。光标所在行单时间戳替换、纯文字行补时间，微调0.1秒且不小于0；空白、头部信息、多时间戳/畸形时间行不自动改写。原文、时间操作可撤销/重做，历史最多150项且受1 Mi字符预算限制；关闭和页面/模式切换请求经过保存/放弃/继续编辑，保存中不关闭。工具栏不常驻解释文案。

实现完成，未测试，待独立验收。施工仅阅读源码和复查差异，未运行测试、类型检查、构建、播放器或视觉验收。已补充 `lrcEditorService.test.ts`、`lrcTextEditing.test.ts`、IPC边界、原文空白、标签保留及FLAC临时副本写回用例。独立验收应使用隔离音频检查五种格式、播放中保存/暂停/跳转/切歌、备份及外部修改、缓存来源优先级、中文输入/撤销、未保存关闭、主题和尺寸；不得用真实收藏做破坏性验证。

入口为 `lyricsConversion.ts`：

```ts
const ttml = convertLrcToTtml(lrcText, { durationMs: 180000 })
const lrc = convertTtmlToLrc(ttmlText)
```

两个函数均返回 `{ text, format, warnings }`，失败抛出带稳定 `code` 的 `LyricsConversionError`。转换只处理传入的字符串，不读写文件、不更新曲库、不覆盖原文。本阶段未接入 IPC 或 Renderer。

## LRC → TTML

- 支持逐行时间戳、重复时间戳、同时间多行、空歌词行，以及一至三位小数；兼容秒与小数之间的冒号。
- 增强 LRC 的 `<mm:ss.xxx>` 标记生成逐字 `span`。末尾独立的逐字标记作为显式结束时间。重复行的逐字时间随行一起平移。
- 未提供结束时间时，使用下一组不同的行开始时间。末组依次使用调用方 `durationMs`、`[length:]`、默认 5000 毫秒时长；默认时长可通过 `finalLineDurationMs` 调整。推导行为通过 `inferred-line-ends` / `inferred-final-end` 返回。
- `[offset:]` 采用正值提前的补偿约定，统一从行与词时间中减去，导出后不再保留非零 offset，避免二次应用。负时间钳制到零并返回提示。
- 元数据通过 `urn:auralis:lyrics` 下的 `meta` 扩展保留；标题另外输出为标准 `ttm:title`。不会从 `[ar:]` 猜测每句的演唱者。
- 无时间的正文通过 `untimed-lines-ignored` 提示；畸形时间戳、倒序逐字时间和方括号交错式逐字扩展报错。逐字跨越下一行时，需要提供显式的结束标记。

## TTML → LRC

- 输出普通逐行 LRC，固定使用毫秒精度，按时间稳定排序，保留同时间多行。
- 默认 `timingMode: 'absolute'`，适用于 Apple/AMLL 歌词使用的歌曲绝对时间。标准 TTML 父级相对时间需显式选择 `'relative'`，不通过内容猜测模式。
- 支持 `hh:mm:ss.xxx`、`mm:ss.xxx` 和 `h/m/s/ms` 单位；处理 `begin/end/dur`、父级起止限制和缺省行时间。缺少所有可用行/词时间则报错。
- 正文拼接逐字 `span`；翻译、音译和背景人声转为独立的带时间行，头部通过歌词行 ID 关联的翻译也可展开。Ruby 注音不拼入主歌词。
- `warnings` 提示逐字时间、行结束时间、逐行演唱者分配、附加行角色及样式的损失。演唱者姓名可保留为 `[ar:]`，但无法还原原始分唱关系。转换结果不能作为原 TTML 的无损备份。
- 不支持帧/ tick 计时、非 media 时间基准及 `timeContainer="seq"`，遇到这些输入报错。

## 实现依据与验证

格式行为参考 [AMLL 格式文档](https://amll.dev/en/guides/lyric/formats)、[AMLL TTML 文档](https://amll.dev/en/guides/lyric/ttml)、[Apple 歌词规范](https://help.apple.com/itc/videoaudioassetguide/en.lproj/static.html)和 [W3C TTML1](https://www.w3.org/TR/ttml1/)。Auralis 的转换逻辑独立实现，未复制或移植 AMLL 编辑器、解析器源码。XML 的读取与生成复用已有的 MIT 依赖 `@xmldom/xmldom`。

输入与输出上限为 8 Mi 个 UTF-16 代码单元；展开项最多 100000，转换时 XML 嵌套深度最多 128。XML 入口共享既有 TTML 识别规则，拒绝 DTD、自定义实体声明和畸形 XML。

定向测试：

```powershell
npm.cmd run test:unit -- src/main/features/lyrics/lyricsConversion.test.ts src/main/features/metadata/classifyLyrics.test.ts src/main/features/metadata/resolveLyricsForFile.test.ts
```

## 对唱标记

入口为 `duetLyrics.ts`，直接编辑已有 TTML XML，不通过互转模型重建文档：

```ts
const view = readDuetLyrics(ttmlText)
const configured = configureDuetPerformers(ttmlText, {
  expectedRevision: view.revision,
  performer1Name: '歌手一',
  performer2Name: '歌手二',
  togetherName: '共同演唱', // 可选
})
const assigned = assignDuetLines(configured.text, {
  expectedRevision: configured.snapshot.revision,
  lineIds: ['line-0', 'line-2'],
  assignment: 'performer-1',
})
const renamed = renameDuetPerformer(assigned.text, {
  expectedRevision: assigned.snapshot.revision,
  performerId: assigned.snapshot.roles.performer1!,
  name: '新姓名',
})
```

- `readDuetLyrics` 返回演唱者定义、角色映射、歌词行、源文本的 SHA-256 `revision` 和兼容性问题。行 ID 按文档顺序生成，与时间和文本无关，整轮标记编辑保持不变。时间字段是原始 `begin/end/dur` 属性，不重算时间轴。
- 可写状态为 `unassigned`、`performer-1`、`performer-2`、`together`。未标记和共同演唱有独立语义。读入时还可能得到只读的 `mixed` 或 `unknown`。
- 头部定义顺序中的前两位 `person/other` 分别对应两位演唱者；唯一 `group` 对应共同演唱。配置时仅创建缺失定义，保留原 ID 和顺序，新增 ID 默认从 `v1/v2/v1000` 起并避开文档中所有 XML ID。`[ar:]` 不会自动转成逐句分配。
- 姓名最长 200 个 UTF-16 代码单元。重命名保留 ID、关联行和其他类型的姓名；配置共同演唱名称可省略，已有名称会保留，新组可不带姓名。
- 每次修改必须提交当前文本的 `expectedRevision`；过期快照返回 `stale-revision`，防止将旧选择应用到新文件。操作返回 `{ text, changed, snapshot }`，下一次操作使用返回的文本和新 revision。
- 批量分配先校验整批目标。未知行或句内混合分唱导致整批失败；重复选择去重，空批次和无实际变化的操作直接返回原字符串，保留 BOM、缩进和换行。
- 修改继承的段落标记时，只沿选中行的祖先路径下移角色引用，保留未选中兄弟节点的有效角色。混合分唱不自动覆盖；只有统一的逐字分配可以整句替换或清除。
- 超过两位个人演唱者或一个组、重复 XML ID、未知引用和不支持的定义结构会使文档只读，并返回 `issues`。有意义的段落外直接文本无法安全下移继承标记时，修改操作返回 `unsupported-inheritance`。
- 标记修改仅改变相关演唱者定义、引用和必要的命名空间声明。逐字时间、歌词、翻译、段落、注释及未知扩展保持；实际修改后的序列化可能调整属性顺序、字符转义或外层空白，不保证字节完全一致。
- 本阶段均为纯后端字符串接口，不暴露 DOM，不修改文件或曲库，不新增 IPC 和前端。失败抛出带 `code` 的 `DuetLyricsError`。

标记及互转回归：

```powershell
npm.cmd run test:unit -- src/main/features/lyrics/duetLyrics.test.ts src/main/features/lyrics/lyricsConversion.test.ts src/main/features/metadata/classifyLyrics.test.ts src/main/features/metadata/resolveLyricsForFile.test.ts
```

## 播放器接入：第一轮分唱标记 IPC

**初始接入为后端施工；后续 Renderer、时间与合唱能力见文末。** 旧验证结果不能替代新增能力的验收。

最初只开放演唱者 1、2 和清除标记；后续时间与同句合唱编辑接入见文末。仍不开放姓名、原文编辑、文件路径或 LRC 导出。

### 前端调用

共享类型：`src/shared/types/lyricsEditor.ts`；transport 契约：`src/shared/ipc/contracts.ts`；Preload 已显式暴露以下方法，前端通过现有 `auralis` client 使用：

```ts
import { auralis } from '@renderer/shared/ipc/client'

const opened = await auralis.lyrics.openEditor(trackId)
if (!opened.ok) {
  // 根据 opened.code 显示错误，不打开编辑区。
  return
}
let editor = opened.value

const assigned = await auralis.lyrics.assignEditorLines({
  sessionId: editor.sessionId,
  expectedRevision: editor.revision,
  lineIds: ['line-0', 'line-2'],
  assignment: 'performer-1', // 'performer-2' / 'unassigned'
})
if (assigned.ok) editor = assigned.value

const saved = await auralis.lyrics.saveEditor({
  sessionId: editor.sessionId,
  expectedRevision: editor.revision,
})
if (saved.ok) {
  // 保存成功即结束会话；关闭面板，不继续使用原 sessionId。
  // written=false：没有实际修改，没有写文件。
  // written=true、cacheUpdated=false：文件已经保存，缓存等待刷新，不应重试覆盖。
}

// 用户选择放弃修改，或无修改直接关闭时调用。可以重复调用。
await auralis.lyrics.closeEditor(editor.sessionId)
```

- 编辑接口统一返回 `{ ok: true, value }` 或 `{ ok: false, code, recoveryBackupPath? }`。不可信发送方或 payload 结构错误在统一 IPC 校验层直接拒绝，因此前端也需要捕获 invoke 异常。
- `editor` 包含 `sessionId`、固定 `trackId`、最新 `revision`、`dirty`、文档 `editable`、`issues` 和完整歌词行。行包含 `id`、正文、开始秒数、标记和 `editable`；没有演唱者姓名或 XML。`timeSeconds=null` 表示没有可显示的有效时间。
- `assignment` 的可写值为 `unassigned / performer-1 / performer-2 / together`。同句合唱使用独立 group；句内混合或未知分配映射为 `unsupported`，对应行只读。超过两位个人演唱者、多个组、重复 ID、未知引用等情况使整个文档只读。
- 保存姓名的旧纯函数不在生产接口开放。打开时补齐两个无姓名 `person` 定义；首次实际标记合唱时才创建缺失的无姓名 group，复用已有 group，不修改已有姓名。
- 每次标记使用上次返回的 revision，整批先校验，再修改；未知行、只读行使整批失败。重复 ID 去重，最多 10000 个 ID／次。更大选择需分批串行，并使用新 revision。
- 编辑会话绑定打开时的歌曲和调用窗口，独立于播放状态。自动切歌不会改变编辑对象，也不会暂停音频。前端应展示打开时的曲目信息，不能将面板标题随当前播放歌曲替换。
- 保存与修改请求应在前端串行；保存过程中禁用再次保存、标记和关闭。后台也拒绝会话内并发操作及同一歌曲的并发保存。
- `dirty` 指相对打开时准备好的草稿是否有变化；隐式 LRC→TTML 转换和补齐无姓名定义不单独计为修改。无实际修改时保存只关闭会话，不生成文件。清除标记也是一次草稿操作，需保存才写盘。
- 未保存关闭提示由前端实现：“保存／放弃修改／继续编辑”。“继续编辑”不调用 close；“保存”只在成功后关闭；“放弃”调用 close。保存失败保留草稿，不要自动切换目标或关闭。
- 会话空闲 30 分钟失效（标记和保存会续期），最多 8 个活动／正在打开的会话，草稿及初始文本合计预算 32 Mi 个 UTF-16 代码单元。窗口导航、崩溃或销毁会释放草稿。`session-expired` 需要重新打开，不能复用旧行 ID 自动套用到其他版本。
- `file-changed` / `stale-revision` 应提示重新载入，不进行自动覆盖；`recovery-required` 表示原文件已保留在返回的恢复备份路径，但目标路径被其他进程占用等原因导致无法安全恢复，应展示路径并停止重试。
- 浏览器预览 mock 不提供这些真实写入能力；本轮没有修改该前端 mock。前端在 browser-preview 模式应隐藏编辑入口或单独实现隔离模拟。

### 文件与缓存行为

1. 只接受曲库 `trackId`，路径由主进程仓库查询；校验音频扩展、普通文件、真实路径和当前曲库根目录，不接受 Renderer 路径或 XML。音乐文件只读，不修改嵌入标签。
2. 打开时读取真实 sidecar，必要时在音频读租约内解析当前嵌入歌词；不以过时的数据库原文代替当前文件。已有同名 TTML 即使无效也不静默回退 LRC 后覆盖它。没有定时歌词或只有纯文本时不能分唱标记。
3. 记录音频身份，以及所有同名 LRC/TTML 候选文件的存在状态、身份、时间和内容 SHA-256。保存前重新核对曲库归属、歌曲路径、音频与全部候选文件。原 LRC 始终保留。
4. 优先使用已有同名 TTML 路径，否则创建小写 `.ttml`。暂存文件使用排他创建并 flush；覆盖前把旧 TTML 移入同目录新建的唯一 `song.ttml.auralis-backup-*/song.ttml`，备份不会自动删除。
5. 发布使用同目录排他硬链接，目标若被外部进程抢先创建不会被覆盖。发生冲突则尝试以排他硬链接恢复备份；恢复不能覆盖新目标时，两份数据都保留并返回 `recovery-required`。
6. 这条发布路径要求文件系统支持硬链接（如本地 NTFS）。不支持的 FAT/exFAT 或共享盘在能力探测阶段返回 `save-failed`，不会移动已有 TTML；不降级为覆盖式写入。断电／强制终止发生在备份移走到发布之间，可能需从已保留备份恢复；本阶段不声称跨进程锁或断电事务。
7. 文件发布成功后，通过既有 `patchLyrics` 同步 `tracks` 和 `track_metadata` 的歌词字段／sidecar 指纹，并发送 `library:changed`，`reason='file-change'`，包含编辑歌曲 ID。缓存失败触发刷新尝试，并返回 `written=true, cacheUpdated=false`，不会把落盘成功误报成可重试的覆盖失败。

### 播放视图消费

`auralis.lyrics.getByTrackId(trackId)` 保留原有 `lyricsText / lyricsFormat`，TTML 额外返回：

```ts
result.ttmlPlayback = {
  error: null, // 或 'invalid-ttml' / 'unsupported-timing'
  lines: [
    {
      id: 'line-0:0',
      editorLineId: 'line-0',
      timeSeconds: 1,
      endTimeSeconds: 5,
      text: '歌词正文',
      performer: 1, // 1 / 2 / null
    },
  ],
}
```

- 主界面和全屏都应消费这个投影：1 左对齐，2 右对齐，`null` 沿用未标记歌词原有布局。不要把 XML 原文传给纯文本歌词组件。
- 投影复用后端 TTML 时间解析和正文抽取，保留所有独立的同时间／重叠歌词行，不先导出 LRC。按时间稳定排序，同一时间不能以时间戳作为唯一 key；多个显示行也可能关联同一个编辑段落 ID。
- `endTimeSeconds` 存在时按 `[start, end)` 判断活动行；同一时刻可以有多条活动行。缺省结束时间时可沿用下一组不同开始时间的规则。前端既有单 `activeIndex` 不能作为重叠行唯一高亮依据。
- 翻译／音译／背景人声不会混入主行正文，此投影仅返回主歌词，不提供辅助声部排版或逐字高亮。原 XML 中这些内容仍保留。
- 计时沿用 Apple/AMLL 歌曲绝对时间，不自动猜父级相对时间。遇到不支持的计时或畸形 XML返回 typed error，前端应提示而非显示 XML。
- 保存后沿用既有 `library.onChanged` 刷新对应曲目的歌词；当前播放别的歌曲时不要将旧编辑对象的结果塞进当前歌词。

### 待独立验收

新增 IPC、文件发布、备份恢复和库缓存更新需要审查者独立验收。以下为未执行的建议入口：

```powershell
npm.cmd run test:unit -- src/main/features/lyrics/lyricsEditorService.test.ts src/main/features/lyrics/ttmlPlayback.test.ts src/main/features/lyrics/duetLyrics.test.ts src/main/features/lyrics/lyricsConversion.test.ts src/main/ipc/ipcPayloadValidation.test.ts src/main/ipc/validatedIpcRegistrar.test.ts
npm.cmd run typecheck
```

新增配套用例使用临时目录模拟音频文件和 LRC，保留真实字符串转换、XML 编辑、指纹和文件写入；只注入音频元数据读取／缓存依赖。尚未运行这些用例、类型检查、构建、Electron IPC、数据库写入或播放器联调。审查需另检查实际来源／顶层 frame 拒绝、Preload 调用链、符号链接与根目录变化、并发保存／外部抢写、写入失败及恢复、硬链接能力、扫描／监听刷新并发和两个数据库歌词字段一致性；只能使用隔离曲库数据。

### TTML 分唱与时间联合编辑

页面保留统一 AppDialog 和内凹逐句列表。分唱／同句合唱工具、开始／结束时间输入和“更新／提前／延后”使用同一选择；播放控件沿用现有 playback。没有预览区或演唱者姓名。

- 单选时，开始时间输入支持 `MM:SS.mmm` 或 `HH:MM:SS.mmm`，失焦或 Enter 提交到草稿；Esc 恢复显示值。“更新”取当前播放位置，仅编辑对象仍是当前播放歌曲时可用。快捷键仍为 Ctrl/Cmd+Shift+Enter。
- “提前／延后”分别平移选中段落 ±100 ms；批量最多 10000 句，一次操作原子完成。开始和结束时间、所有子节点的绝对时间一起平移，`dur`、分唱、正文及其他 XML 内容保留。允许句间重叠，不自动改变邻句。
- 新增 `auralis.lyrics.retimeEditorLines({ sessionId, expectedRevision, lineIds, mode, valueMs })`：`mode=set` 仅接受单句的绝对开始毫秒数；`mode=shift` 接受选中句的有符号毫秒偏移。返回最新 `LyricsEditorState`，与分唱共用版本号、草稿、保存及释放逻辑。
- `lines[].timingEditable` 为时间编辑能力。当前限于自身具有明确 begin、上层无 begin/end/dur 约束、使用现有绝对计时且精度不超过毫秒的段落；不支持的行仍可按既有规则标注分唱。任何时间移为负数或越界，整批拒绝并保留原草稿，不逐项归零。
- 保存仍只发布同名 TTML，沿用备份、外部修改检查和缓存刷新。没有增加标签写回或任意路径能力。

实现完成，未测试。配套用例覆盖 XML／逐字时间保留、原子失败、版本衔接、输入解析、选择与播放切换禁用和 IPC 数值边界；审查者还需以隔离歌曲复验实际 Preload 调用、保存后重载、主题／窗口尺寸和键盘焦点。

### 同句合唱、结束时间与同时演唱分组

- 每句显示开始与结束时间；缺少有效结束时间显示 `—`。单选时可用同一毫秒格式输入结束时间，Enter／失焦提交，Esc 恢复。`retimeEditorLines` 新增 `mode=set-end`，仅允许单句；开始与逐字时间保持不动，已有段落 `dur` 与新边界同步。结束须晚于开始，不得截断有显式时间的子节点；失败保留草稿并返回 `invalid-end-time`。
- “合唱”对勾选行设置 `together`，代表两人同唱这一句。它仍是独立的一句，可再切换为演唱者 1／2 或清除标记；支持已有 group 行继续编辑，句内混合分配仍只读。
- “同时演唱”是面板的派生分组，不写入额外 XML 标记。按开始时间稳定排序，演唱者 1／2 的有效区间 `[start,end)` 重叠时连接成组；组内每句保留独立 ID、正文、区间和复选框，Shift／方向键沿显示顺序选择。首尾相接、同一演唱者、同句合唱或缺少结束时间的行不主动连接；仅同一演唱者的重叠不会把两个独立分组桥接。
- 本轮没有改变文件发布、备份、冲突检查或标签写入策略。单元与组件配套用例已补充但未执行，未运行类型检查、lint、构建或视觉验收；交接审查重点为合唱创建／保存重开、结束时间与逐字边界、分组增删后的选择和键盘焦点，以及窄窗口布局。
