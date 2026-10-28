# 歌词编辑与播放

歌词编辑仅支持 LRC 和纯文本。主界面歌词右键「编辑歌词」进入应用级 `TrackEditorDialog.vue` 的歌词页；曲库的元数据入口默认进入同一面板的歌曲信息页。`LyricsEditPage.vue` 提供原文编辑、当前行时间戳插入/更新、0.1 秒微调、撤销、重做和从本行播放。两个页面固定编辑打开请求中的歌曲；切歌后禁用依赖播放的操作，仍可保存原歌曲。

保存菜单只有「保存到歌曲标签」和「保存为 LRC 文件」。歌词页 Ctrl+S 打开菜单，歌曲信息页 Ctrl+S 保存元数据。切页保留各自草稿和编辑位置；保存仅作用于当前页并保留面板。关闭时汇总未保存页面，可继续逐页保存或放弃全部修改。未修改的歌词也可保存为 LRC 文件；标签写入要求草稿有修改且音频格式受支持。

任一页面写入及刷新对方编辑凭据期间，宿主锁定编辑、切页和关闭。刷新只更新磁盘内容仍与原基线匹配的凭据，保留草稿、撤销历史和光标；外部内容不匹配时保留草稿并阻止保存。旁置 LRC 未成为活动来源时仍按实际解析来源核对，不将未生效的旁置内容当作源基线。未解决编辑面板前，请求全屏会返回普通视图并先处理关闭流程。

## 编辑接口与文件保护

显式 Preload/IPC 提供 `lyrics.openLrcEditor(trackId)`、`saveLrcEditor({ sessionId, expectedRevision, text, target: 'tag' | 'file' })` 和 `closeLrcEditor(sessionId)`。仅支持 LRC 或纯文本歌词，不提供 TTML 编辑或保存接口。

会话绑定窗口，最多 8 个、30 分钟空闲过期，文本上限为 128 Ki 个 UTF-16 代码单元。目标路径由数据库和曲库根目录决定；Renderer 不传文件路径。保存前核对会话版本、音频身份及全部 LRC 候选文件，拒绝外部修改和重复提交。

LRC 文件保存至歌曲同目录同主文件名 `.lrc`，沿用排他发布、旧文件备份和恢复路径，要求文件系统支持硬链接。标签写入支持 MP3/FLAC/M4A/OGG/Opus，复用元数据写协调器及临时副本验证；若音频内嵌 TTML，禁用标签保存并提示另存 LRC，写入边界也会再次检查原始标签；AAC/WAV 只支持 LRC 文件保存。文本保存不排序、不合并、不删除空行，文本区将 CRLF/CR 规范为 LF。

保存后重新读取实际歌词来源、更新歌词缓存并广播库变更，再建立新会话。已完成写入后的缓存或播放恢复失败返回警告，不允许重复提交旧会话。验证只使用隔离数据。

## 歌词来源

播放按内嵌 LRC、同名外部 LRC、内嵌纯文本的顺序选择歌词，不查找或显示 TTML。旧 TTML 缓存在后台按曲目重新解析；读取失败的记录保留并重试，不修改音频或歌词文件。

## 增强型 LRC

带行首方括号时间的 LRC 可在正文中使用 `<mm:ss.xxx>` 标记绝对片段时间。普通歌词面板与全屏共用片段渲染，到开始边界逐段点亮，保留文本分段、空格与标点；唱片室继续展示去除有效时间标签的原语言整行正文。末尾空标签作为结束边界，不推测缺少的演唱时长，不进行片段内平滑扫色。

普通与增强行可混排。多行首时间与增强标记并用、倒退或无效时间逐行退回整行展示，不重写原文；行内方括号逐词方言不在支持范围。繁简逐片段转换与现有整行词组转换不一致时，显示正确整行并取消该行片段高亮。每行 1024、全篇 16384 个文本片段为增强对象上限，超限正文仍完整展示。

增强行的更新和 0.1 秒微调同步移动行首、行内及结束时间，保持毫秒精度，作为一次撤销操作。负时间、溢出或歧义行不自动改写，仍可编辑和保存原文。播放继续使用共享 `usePlayback` 时间；HTML Audio 由原音频运行模块最多约 20 Hz 采样真实媒体位置，暂停、缓冲、切换和释放时停止采样。

格式、降级与验收规则见[增强型 LRC 首期技术方案](../../../../docs/topics/playback/TECHDOC-enhanced-lrc-support-2026-10-28.md)。

## 定向验证

```powershell
npm.cmd run test:unit -- src/main/features/lyrics src/renderer/features/lyrics src/main/features/metadata/classifyLyrics.test.ts src/main/features/metadata/resolveLyricsForFile.test.ts src/main/ipc/ipcPayloadValidation.test.ts src/main/ipc/validatedIpcRegistrar.test.ts
npm.cmd run typecheck
npm.cmd run locales:check
```
