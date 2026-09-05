# TECHDOC：`usePlayback` 播放编排拆分

- **日期**：2026-08-30
- **状态**：工程完成；运行验收待确认
- **覆盖对象**：`src/renderer/features/playback/composables/usePlayback.ts`
- **风险等级**：实施属于 C 级共享播放逻辑；本文本身属于 A 级文档修改

## 1. 结论

`usePlayback.ts` 应当拆分，但不能拆成多个并列播放器 store，也不能仅按函数数量搬文件。

目标是保留 `usePlayback()` 的调用方式、返回字段和共享对象身份，把内部职责收敛为：

```text
usePlayback 单例门面
        ↓
PlaybackController（唯一编排者、唯一 Vue 播放状态写入者）
        ├── PlaybackAudioRuntime（HTMLAudio + GaplessAudioEngine）
        ├── PlaybackNavigationSession（队列上下文、历史与模式导航）
        ├── playbackTransitionPlanner（既有纯规则）
        └── EffectivePlayTracker（既有有效播放统计）
```

本轮是保持行为的结构重构。实施前先补齐模式与触发来源的特征测试，再逐层抽取；不得在拆分过程中顺手调整播放规则。

## 2. 当前基线

截至本文编写时，`usePlayback.ts` 共 1033 行，模块加载时立即创建以下全局资源：

- 一个 `Audio` 实例；
- 一个 `GaplessAudioEngine`；
- 一个 `EffectivePlayTracker`；
- 一个 Vue `reactive<PlaybackState>`；
- 播放请求 gate、gapless generation、队列历史及随机播放上下文；
- 一个 `library.onChanged` 订阅和一个 `beforeunload` 监听。

`usePlayback()` 向外暴露 3 个状态入口和 15 个 action。源码中有 19 个包含调用的文件，其中包括页面、PlayerBar、Miniplayer、Fullscreen、歌词、系统媒体集成和设置。因此公开契约与共享对象身份必须保持稳定。

### 2.1 当前职责混合

| 职责                               | 当前实现位置                                            |
| ---------------------------------- | ------------------------------------------------------- |
| Vue 播放状态及公开 action          | `usePlayback.ts`                                        |
| HTMLAudio 创建、事件绑定、错误解释 | `usePlayback.ts`                                        |
| Web Audio / gapless 执行           | `gaplessAudioEngine.ts`，由 `usePlayback.ts` 编排       |
| 前台播放请求竞态                   | `playbackRequestGate.ts` + `playbackRequestId`          |
| gapless 预取竞态                   | `transitionGeneration` + `scheduledPlan`                |
| 队列插入与历史                     | `playbackQueueState.ts` + `usePlayback.ts` 中的上下文   |
| 播放模式决策                       | `playbackTransitionPlanner.ts` 与 `usePlayback.ts` 两处 |
| 随机/专辑随机数据读取              | `usePlayback.ts` 直接调用 typed IPC client              |
| 有效播放次数                       | `effectivePlayTracker.ts`，由 `usePlayback.ts` 接线     |
| 音量与 gapless 偏好                | `usePlayback.ts` 直接读写 `localStorage`                |
| 曲目失效清理与生命周期             | `usePlayback.ts`                                        |

### 2.2 主要架构风险

1. **播放模式规则存在双入口。** gapless 预取使用 `resolvePlaybackTransition()`；手动下一曲和自然结束仍使用 `playNextInQueue()`、`playRandomTrack()`、`playNextAlbumShuffleTrack()` 等命令式分支。两套规则以后可能漂移。
2. **双音频后端判断散落。** `play/pause/seek/volume/currentTime/duration` 多处重复判断 `gaplessEngine.isActive`，调用者需要理解具体后端。
3. **模块导入即产生副作用。** 测试必须重置模块并伪造 `window`、`Audio`、`localStorage` 和完整 `AuralisApi`，使局部行为难以隔离。
4. **竞态变量缺少所有权边界。** `playbackRequestId`、request gate、`transitionGeneration`、`scheduledPlan` 和 `audioSourceTrackId` 分散在同一作用域，正确性依赖调用顺序。
5. **现有集成测试覆盖面偏窄。** `usePlayback.test.ts` 主要覆盖前台 pending 与过期请求，尚未冻结完整播放模式矩阵、双后端回退及队列失效行为。

## 3. 目标与非目标

### 3.1 目标

1. `usePlayback()` 保持唯一共享播放状态来源，所有调用者无需迁移到新 store。
2. 只有 `PlaybackController` 可以写入 `PlaybackState`。
3. 音频后端的选择、事件和资源清理由 `PlaybackAudioRuntime` 统一拥有。
4. 下一曲决策只由一个纯规划入口产生；手动、自然结束和预取通过显式 trigger 区分。
5. 队列历史、待播下一曲、shuffle pool 与 album-shuffle context 由一个导航会话拥有。
6. 通过依赖注入测试控制器，不再依赖整模块重载来构造每个用例。
7. 每个实施 Step 都能单独回退，并保持可运行状态。

### 3.2 非目标

| 不做                                             | 原因                             |
| ------------------------------------------------ | -------------------------------- |
| 修改播放模式的产品语义                           | 本轮只做结构重构                 |
| 新增播放恢复、跨启动队列持久化                   | 属于新能力，需要独立需求         |
| 修改 typed IPC contract、主进程服务或数据库      | 当前接口足够，扩大范围没有必要   |
| 重写 `GaplessAudioEngine` 内部解码与静音裁剪算法 | 它已经是独立音频模块             |
| 建立 Pinia 或第二套 player store                 | 会破坏唯一状态源约束             |
| 同时拆 PlayerBar、Miniplayer 或 Fullscreen       | UI 复杂度另行处理                |
| 趁机修复未被测试冻结的旧行为                     | 结构调整与行为修复必须分开评审   |
| 强制把公开 `state` 改为深只读                    | 会改变既有类型契约，留待后续评估 |

## 4. 必须冻结的行为

### 4.1 单例与公开 API

- 任意次数调用 `usePlayback()` 都返回同一份 `state`、`gaplessPlaybackEnabled` 和 `isPlaybackPending`。
- 不得因调用者数量创建多个 `Audio`、`GaplessAudioEngine`、曲库订阅或 `beforeunload` 监听。
- 保持以下 action 名称和基本签名：
  `selectTrack`、`playTrackFromQueue`、`insertTrackAfterCurrent`、
  `insertTracksAfterCurrent`、`setPlaybackMode`、`setGaplessPlaybackEnabled`、
  `togglePlayPause`、`play`、`pause`、`playPrevious`、`playNext`、
  `seekByRatio`、`seekTo`、`setVolume`、`toggleMute`。
- Renderer 继续只通过 typed IPC client 获取音频 URL、随机曲目和专辑曲目。

### 4.2 下一曲触发语义

规划器必须接收显式触发来源：

```ts
export type PlaybackAdvanceTrigger = 'manual-next' | 'natural-ended' | 'gapless-prefetch'
```

当前行为冻结如下：

| 模式            | 手动下一曲                           | 自然结束 / gapless 预取              |
| --------------- | ------------------------------------ | ------------------------------------ |
| `sequential`    | 播放队列下一首；末尾不动作           | 播放下一首；末尾停止并把显示时间归零 |
| `repeat-all`    | 播放下一首，末尾回到首曲             | 同左                                 |
| `repeat-one`    | 按普通顺序前进，不循环当前曲         | 重播当前曲                           |
| `shuffle`       | 从 shuffle pool 或曲库选随机曲       | 同左                                 |
| `album-shuffle` | 当前专辑内顺序前进，结束后换随机专辑 | 同左                                 |

“插入为下一首”的曲目具有以下优先级：

- 手动下一曲：所有模式都优先消费 `queuedNextTrackId`；
- 自然结束和 gapless 预取：除 `repeat-one` 外优先消费；
- 消费后必须清空 `queuedNextTrackId`；无效 id 不得跳到错误曲目。

规划结果不应只用 `null` 表达所有情况，建议显式区分：

```ts
export type PlaybackAdvanceDecision =
  | { kind: 'play'; plan: PlaybackTransitionPlan }
  | { kind: 'stop'; resetTime: boolean }
  | { kind: 'noop' }
```

这样 sequential 末尾的“手动无动作”和“自然结束后停止”不会被错误合并。

### 4.3 播放请求与后端回退

- 每次切换曲目都使旧前台请求失效；旧 URL 或旧 `play()` Promise 不得覆盖新曲状态。
- `isPlaybackPending` 只表示用户触发的前台启动，不包含 gapless 后台预取。
- gapless 启动失败时仍回退到 HTMLAudio；预取失败只取消无缝衔接，不提前暴露播放错误。
- HTMLAudio 事件只有在其 `trackId` 与 `state.currentTrackId` 一致时才能写状态。
- `togglePlayPause()` 与 `play()` 保持现有 guard，不允许并发 pending 重入。
- 切歌、当前曲失效和 dispose 必须同时失效前台请求与 gapless 预取。

### 4.4 队列、历史与曲目失效

- shuffle / album-shuffle 的上一曲优先使用 `PlaybackHistory`，并恢复当时的 queue、shuffle pool 与 album context。
- 普通上一曲在 `repeat-all` 下允许首尾回绕；其他模式在队首保持当前曲并回到起点。
- 插入单曲或多曲后，当前曲身份和下标保持正确；gapless 活跃时重新规划预取。
- 非当前失效曲目从 queue、shuffle pool、album context、history 和 queued-next 中同步移除。
- 当前曲失效时取消所有音频、清空当前身份并保留现有错误文案。
- 当前实现中“gapless 活跃且位于队首时执行上一曲”的实际音频 seek 语义不够明确。实施前用特征测试记录现状；如确认是缺陷，另开行为修复，不在机械拆分中静默改变。

### 4.5 有效播放统计和生命周期

- 切曲前结束旧统计 session，新曲成功成为当前曲后启动新 session。
- seeking、buffering、playing/canplay 事件继续正确驱动 `EffectivePlayTracker`。
- controller 的 `dispose()` 必须幂等：失效请求、取消预取、结束统计、清除音频源、销毁 gapless 并解除曲库订阅。composition root 的 `beforeunload` 监听只注册一次，并以 `{ once: true }` 在触发后自动解除。
- 诊断仍通过 `rendererDiagnostics` 输出，不把本地音频 URL 或路径泄露到日志上下文。

## 5. 目标目录和依赖方向

```text
src/renderer/features/playback/
  composables/
    usePlayback.ts                    # 单例 composition root + 稳定公开门面
  runtime/
    playbackController.ts             # Vue 状态与跨模块编排
    playbackController.test.ts
    playbackDependencies.ts           # 最小依赖接口及浏览器生产接线
  audio/
    gaplessAudioEngine.ts             # 已有，不改内部算法
    playbackAudioRuntime.ts            # 双后端、媒体事件与资源生命周期
    playbackAudioRuntime.test.ts
  core/
    playbackNavigationSession.ts       # 导航上下文、历史、队列变更
    playbackNavigationSession.test.ts
    playbackTransitionPlanner.ts       # 已有，扩展 trigger/decision
    playbackTransitionPlanner.test.ts
    playbackQueueState.ts              # 已有纯队列与历史能力
    effectivePlayTracker.ts            # 已有
```

依赖只允许向下：

```text
Vue components
      ↓
usePlayback.ts
      ↓
playbackController.ts
   ┌───────────────┬──────────────────────────┐
   ↓               ↓                          ↓
audio runtime   navigation session     effective play tracker
                       ↓
            transition planner / queue state
```

约束：

- `core/**` 不得导入 Vue、DOM、`auralis` client 或 `localStorage`。
- `audio/playbackAudioRuntime.ts` 可以使用浏览器音频 API，但不得理解 queue、shuffle 或 Vue state。
- `PlaybackNavigationSession` 不得播放音频，只返回决策和更新后的导航上下文。
- `PlaybackController` 是唯一可以把音频事件和导航决策提交到 `PlaybackState` 的模块。
- `usePlayback.ts` 不保留业务分支，只创建一次生产 controller、注册一次卸载并返回稳定 API。

## 6. 核心接口草案

接口名称可以在实现时微调，但职责边界不得倒退。

### 6.1 公开门面

```ts
export interface PlaybackPublicApi {
  state: PlaybackState
  gaplessPlaybackEnabled: Readonly<Ref<boolean>>
  isPlaybackPending: Readonly<Ref<boolean>>
  // 现有 15 个 action，签名保持兼容
}

const controller = createPlaybackController(createBrowserPlaybackDependencies())

export function usePlayback(): PlaybackPublicApi {
  return controller.api
}
```

不要在 `usePlayback()` 函数体内创建 controller。

### 6.2 控制器

```ts
export interface PlaybackController {
  readonly api: PlaybackPublicApi
  dispose(): void
}

export function createPlaybackController(dependencies: PlaybackDependencies): PlaybackController
```

`PlaybackDependencies` 只注入控制器真正使用的最小接口：音频运行时工厂、播放数据 source、曲库变化订阅、偏好存储、诊断和有效播放记录函数。测试不得再伪造完整 `AuralisApi`。

### 6.3 音频运行时

```ts
export interface PlaybackAudioSnapshot {
  kind: 'html-audio' | 'gapless' | 'idle'
  trackId: number | null
  currentTime: number
  duration: number
  isPlaying: boolean
  hasCurrentData: boolean
}

export interface PlaybackAudioRuntime {
  start(trackId: number, url: string, options: { preferGapless: boolean }): Promise<void>
  resume(): Promise<void>
  pause(): void
  seek(time: number): Promise<void>
  setVolume(volume: number, muted: boolean): void
  scheduleNext(
    trackId: number,
    url: string,
    options: { trimBoundarySilence: boolean },
  ): Promise<boolean>
  cancelScheduledNext(): void
  clear(): void
  getSnapshot(): PlaybackAudioSnapshot
  dispose(): void
}
```

运行时通过构造回调上报 `time`、`duration`、`playing`、`buffering`、`ended` 和结构化 media error。它不直接写 Vue state，也不决定结束后播放哪首曲。

### 6.4 导航会话

导航会话拥有但不向 UI 暴露：

- `queuedNextTrackId`；
- `albumShuffleContext`；
- `shuffleTrackPool`；
- `PlaybackHistory`。

它提供 `resolveAdvance(trigger)`、`resolvePrevious()`、`applyPlan()`、`insertAfterCurrent()`、`removeMissingTracks()`、`setMode()` 和只读 snapshot。异步曲目来源通过 `PlaybackTransitionSource` 注入；核心层不直接访问 IPC。

## 7. 分步实施

### Step 0 — 特征测试冻结

生产代码不动，先补测试：

1. 五种模式 × `manual-next` / `natural-ended` / `gapless-prefetch`。
2. queued-next 在 repeat-one 下的触发差异。
3. shuffle / album-shuffle 上一曲历史恢复。
4. gapless 启动失败回退 HTMLAudio，预取失败不污染 pending/error。
5. HTMLAudio 旧事件和旧 Promise 不得覆盖新曲。
6. 当前/非当前曲目失效清理。
7. dispose 幂等及监听解除。
8. 队首上一曲在 HTMLAudio 与 gapless 下的现状测试，并把歧义明确标注。

已有 `usePlayback.test.ts` 中的 pending 测试必须保留。测试补齐前不开始搬运模式分支。

### Step 1 — 建立可注入控制器和稳定门面

1. 新建 `runtime/playbackDependencies.ts`，定义最小端口并提供生产接线。
2. 把现有实现机械迁入 `createPlaybackController()`；这一小步不改函数逻辑。
3. `usePlayback.ts` 只创建一个 controller 并返回 `controller.api`。
4. 把 `beforeunload` 注册放在 composition root，确保只注册一次；controller 的 `dispose()` 不依赖全局 window。
5. 将现有集成测试逐步改为直接构造 controller；保留一个门面单例测试。

这一步允许暂时存在一个较大的 `playbackController.ts`。它是迁移中间态，不是最终交付状态。

### Step 2 — 收敛导航规则

1. 扩展 `playbackTransitionPlanner.ts`，加入 trigger 和显式 decision。
2. 先让 gapless 预取继续使用新规划器，验证无行为变化。
3. 再将 `handleTrackEnded()` 和 `playNext()` 切到同一规划入口。
4. 删除控制器中的重复模式函数：`playNextInQueue`、`playQueuedNextTrack`、`playRandomTrack`、`playNextFromAlbumShuffleContext`、`adoptCurrentAlbumShuffleContext`、`playNextAlbumShuffleTrack`。
5. 引入 `PlaybackNavigationSession`，迁移历史、queued-next、shuffle pool 和 album context 的所有权。

每迁移一个入口都先跑 planner/session 测试和 controller 对应集成测试；不要一次删除全部旧路径后再调试。

### Step 3 — 抽取双后端音频运行时

1. 将 `Audio` 创建、source identity、media event 绑定和错误描述移入 `PlaybackAudioRuntime`。
2. 将 gapless start/fallback、resume、pause、seek、volume、snapshot、schedule/cancel/clear/destroy 封装到运行时。
3. 控制器改为响应运行时事件，不再直接读取 `audio.paused/currentTime/duration/readyState`。
4. `EffectivePlayTracker.isPlaybackCountable` 和 duration provider 改读统一 snapshot。
5. 删除控制器中所有 `gaplessEngine.isActive ? ... : ...` 分支；gapless plan 元数据仍留在控制器/导航层。

音频运行时测试使用轻量 `AudioLike` 和 gapless factory fake，不访问真实声卡，也不启动 Electron。

### Step 4 — 收敛控制器内部重复 action

在前面边界稳定后，再做小范围去重：

- `play()` 与 `togglePlayPause()` 共用私有 `resumeCurrentTrack()`；
- `seekByRatio()` 与 `seekTo()` 共用 `seekToClampedTime()`；
- 当前曲提交统一通过一个 `commitCurrentTrack(plan)`；
- 当前曲失效和 dispose 共用资源取消原语，但保留不同的状态结果。

不得为了追求行数把每个三行 helper 单独建文件。

### Step 5 — 清理与文档同步

1. 删除已经无调用的旧 helper、mock 和注释分区。
2. 更新 `docs/ARCHITECTURE.md` 的播放状态说明，记录 controller/audio/navigation 的真实边界。
3. 检查所有 `usePlayback()` 调用者仍使用原门面，无新状态源。
4. 只有所有定向测试和类型检查通过后，才将本文状态更新为“工程完成；运行验收待确认”或对应真实状态。

## 8. 验收策略

### 8.1 每个 Step 的最低验证

| Step | 最低验证                                                                       |
| ---- | ------------------------------------------------------------------------------ |
| 0    | 新增的 planner/session/controller 特征测试                                     |
| 1    | `usePlayback.test.ts` + 门面单例测试 + 定向 lint；接口接线完成后运行 typecheck |
| 2    | transition planner、queue state、navigation session、controller 定向测试       |
| 3    | audio runtime、effective play tracker、controller 定向测试                     |
| 4–5  | playback feature 测试集合 + 全仓 typecheck                                     |

实施是 C 级共享逻辑：最终应运行 playback 相关测试和 `npm.cmd run typecheck`。不要求每个小 Step 都运行全量 `npm.cmd test` 或 Electron 打包。

### 8.2 最终行为冒烟

在可用 Electron 环境中只覆盖播放器相关路径：

1. 顺序、列表循环、单曲循环、随机、专辑随机各执行一次手动下一曲和自然结束。
2. 插入“下一首播放”后确认优先级。
3. 开关 gapless 后切歌、暂停、恢复和拖动进度。
4. 播放中移除非当前曲与当前曲。
5. PlayerBar、Fullscreen、Miniplayer 和系统媒体按键读取同一播放状态。

没有 GUI 时如实记录运行冒烟未验证；不得用单元测试替代视觉或真实音频结论。

### 8.3 完成标准

- `usePlayback.ts` 只承担单例接线和公开门面，建议不超过约 80 行。
- `PlaybackController` 不再直接操作 `Audio` 或 `GaplessAudioEngine`。
- 模式决策不存在第二套 switch/随机专辑导航实现。
- `core/**` 不含 Vue、DOM、IPC 或存储依赖。
- 19 个现有调用文件不需要改为新的 store/API。
- 所有冻结行为测试、playback 定向测试和 typecheck 通过。
- 不以总行数作为唯一完成标准；任何新文件超过约 500 行时必须说明其单一职责为何仍成立。

实现说明：当前 `playbackController.ts` 约 800 行，超过上述建议阈值。它保留为一个模块，是因为其
单一职责是把公开播放命令与音频运行时回调编排为原子的 `PlaybackState` 状态转换，并作为唯一状态
写入边界；音频后端、导航策略、依赖实现和有效播放统计已经分别下沉。此时继续机械拆分会产生多个
状态写入者或只转发参数的碎片模块。若后续出现可独立描述、无需直接写播放状态的新职责，再从控制器
提取，而不是按行数拆分。

## 9. 风险与回滚点

| 风险                           | 控制方式                                          | 回滚点                    |
| ------------------------------ | ------------------------------------------------- | ------------------------- |
| 手动下一曲与自然结束语义被合并 | trigger + decision 特征测试                       | Step 2 每个入口独立提交   |
| gapless 预取污染前台 pending   | 分离 foreground request 与 prefetch generation    | Step 3 音频运行时接入前   |
| 多次调用 composable 创建多实例 | 模块级 composition root + 单例测试                | Step 1 门面提交           |
| 音频旧事件写入新曲             | runtime 保留 track identity 并测试过期事件        | Step 3 事件迁移提交       |
| 有效播放统计漏记/重复          | tracker 继续独立，统一 snapshot 后跑其测试        | Step 3 tracker 接线提交   |
| 曲目失效后残留历史或预取       | navigation session 集中清理 + controller 集成测试 | Step 2/3 各自提交         |
| 文件变小但跳转变多             | 只按所有权抽四层，不为微型 helper 建目录          | Review 阶段合并无价值抽象 |

如果某一步无法在保持特征测试的前提下完成，应停止在上一个可运行边界，不继续扩大重写。
