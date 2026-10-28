# 歌词编辑与播放

歌词编辑仅支持 LRC 和纯文本。主界面歌词右键「编辑歌词」打开 `LyricsEditPanel.vue`，提供原文编辑、当前行时间戳插入/更新、0.1 秒微调、撤销和重做。编辑对象固定为打开时的歌曲；切歌后禁用播放打点和进度控制，仍可保存原歌曲。

保存菜单只有「保存到歌曲标签」和「保存为 LRC 文件」。Ctrl+S 打开菜单，关闭未保存草稿时可保存、放弃或继续编辑。未修改的歌词也可保存为 LRC 文件；标签写入要求草稿有修改且音频格式受支持。

## 编辑接口与文件保护

显式 Preload/IPC 提供 `lyrics.openLrcEditor(trackId)`、`saveLrcEditor({ sessionId, expectedRevision, text, target: 'tag' | 'file' })` 和 `closeLrcEditor(sessionId)`。仅支持 LRC 或纯文本歌词，不提供 TTML 编辑或保存接口。

会话绑定窗口，最多 8 个、30 分钟空闲过期，文本上限为 128 Ki 个 UTF-16 代码单元。目标路径由数据库和曲库根目录决定；Renderer 不传文件路径。保存前核对会话版本、音频身份及全部 LRC 候选文件，拒绝外部修改和重复提交。

LRC 文件保存至歌曲同目录同主文件名 `.lrc`，沿用排他发布、旧文件备份和恢复路径，要求文件系统支持硬链接。标签写入支持 MP3/FLAC/M4A/OGG/Opus，复用元数据写协调器及临时副本验证；若音频内嵌 TTML，禁用标签保存并提示另存 LRC，写入边界也会再次检查原始标签；AAC/WAV 只支持 LRC 文件保存。文本保存不排序、不合并、不删除空行，文本区将 CRLF/CR 规范为 LF。

保存后重新读取实际歌词来源、更新歌词缓存并广播库变更，再建立新会话。已完成写入后的缓存或播放恢复失败返回警告，不允许重复提交旧会话。验证只使用隔离数据。

## 歌词来源

播放按内嵌 LRC、同名外部 LRC、内嵌纯文本的顺序选择歌词，不查找或显示 TTML。旧 TTML 缓存在后台按曲目重新解析；读取失败的记录保留并重试，不修改音频或歌词文件。

## 定向验证

```powershell
npm.cmd run test:unit -- src/main/features/lyrics src/renderer/features/lyrics src/main/features/metadata/classifyLyrics.test.ts src/main/features/metadata/resolveLyricsForFile.test.ts src/main/ipc/ipcPayloadValidation.test.ts src/main/ipc/validatedIpcRegistrar.test.ts
npm.cmd run typecheck
npm.cmd run locales:check
```
