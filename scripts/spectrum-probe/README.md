# 低频振动与实时频谱验证

## 碟片法线振动对照

正式唱片室的振动图标为布尔开关：左键切换开启／关闭；关闭时右键开启并保留原模式，开启时右键在柔和起伏与弹性回落间切换，保持开启。Tooltip 显示当前模式和右键提示，选择继续保存在原有本地设置中。原文字模式选项已移除。

运行 `node scripts/spectrum-probe/run.mjs --normal-motion` 打开柔和起伏与弹性回落的对照试听窗口，并从 RUDE! 的 30 秒处开始播放。点击另一首曲目可切换，进度条可选择片段。两张碟片共享一次低频分析订阅，盘面、金属环、波浪外缘和弧形文字通过局部 `translateZ` 一起运动；外层保持相同倾斜和透视。

低频增强时向观看者抬起，减弱时回落，持续低频保持对应位置。柔和起伏直接跟随平滑包络；弹性回落通过有阻尼的弹簧产生惯性，反弹最多越过原位 12% 的位移上限。统一强度滑块为 1–14 px，默认 6 px，表示沿法线的三维位移上限。正式唱片室已接入两种效果，默认柔和起伏，并记住选择。虚线轮廓仅在 demo 中保留。

共享的 `BassEnvelope` 使用最近 512 个不同音频帧的 90% 分位估计歌曲内较强低频，每 12 帧更新估计。参考值上升采用 0.15 秒时间常数，下降采用 10 秒，按音频时钟更新，避免渲染延迟放大增益。固定 0.08 RMS 下限防止弱段被放大；平滑映射 `1 - exp(-0.95 * ratio^1.6)` 提高中等强度的位移并留出强度余量，参考强度使用约 61% 位移，弱段可接近静止。起落平滑沿用 Butterchurn 的系数。最多 32 首歌的校准在当前页面会话内保留，暂停和跳转只清理运动，切回歌曲沿用它的参考范围。没有随机幅度、周期性载波或起音检测。

运行 `node scripts/spectrum-probe/run.mjs --normal-motion --verify` 检查两首真实曲目的两种位移及强度变化、暂停、跳转、开关、减少动效及窄窗口布局，结果和截图保存到 `.electron-home/normal-motion-probe/`，包含幅度范围和接近上限的采样占比。该模式使用空音频输出；正常试听使用独立配置和实际音频输出。HTML 依赖构建及 Electron 音频桥接，应使用启动命令打开。

## 方块与频谱

运行 `node scripts/spectrum-probe/run.mjs` 打开方块振动与柱条试听页。默认使用用户提供的 RUDE! 和 LEMONADE；也可在命令后提供两个音乐文件的路径。

点击曲目开始播放，使用暂停、进度条、振动和频谱开关比较声音与效果。方块复用唱片室的振动模块，40–150 Hz 低频强度控制向上抬起的幅度，上限为 6 CSS px；它展示包络响应，正式碟片沿自身法线运动。沿用生产播放器、分析服务、IPC 校验器和 Preload，在独立 Electron 配置目录中运行，不访问真实曲库数据库或记录播放统计。

试听与自动验证分别使用 `listening-profile`、`verification-profile`，自动验证的静音音量及播放后端设置不会影响试听。

运行 `node scripts/spectrum-probe/run.mjs --verify` 使用 mpv 空音频输出自动检查真实曲目、跳转、暂停、切歌与关闭订阅，并生成 `.electron-home/spectrum-probe/results.json`、频谱帧和截图。它验证数据响应，不构成人工听感验收。

播放器内的临时柱条预览通过唱片室路由查询参数 `spectrum=1` 开启。聚焦状态下，低频振动或临时预览开启时才订阅分析；两者共享一次订阅。暂停、离开聚焦、页面隐藏或减少动效时停止分析。第 4 种圆环尚未接入。

唱片室左下角的振动按钮默认关闭，并保存开关状态。开启时卸载歌词组件，关闭后恢复；暂停、静音和减少动效不会改变这个歌词显示规则。开启后可在按钮右侧选择柔和起伏或弹性回落。舞台根据当前盘面姿态计算法线的屏幕投影，补偿碟片缩放，并在原有位置变换后追加整组的位移和轻微透视缩放；盘面、盘心、外圈、侧壁和阴影一起运动。

低频强度是从同一次 FFT 提取并校正 Hann 窗功率的线性频段 RMS。平滑与时间补偿改编自 Butterchurn `AudioLevels`，增益受限，静音归零，跳转或换曲后重置。来源版本和 MIT 声明见 `THIRD_PARTY_NOTICES.md`。这是低频幅值响应，持续贝斯也会驱动振动。

分析采用项目已有 FFmpeg，只读解码少量未来音频，使用播放器时间选取对应的 FFT 帧。FFT 计算复用固定版本的 [fft.js 4.0.4](https://github.com/indutny/fft.js)，原有自研 FFT 已移除；输入和输出缓冲区复用。32 个对数频段，24 kHz 双声道、2048 点窗口、1024 点步长。左右声道分别分析，避免相反相位在混合为单声道时抵消。没有 BPM 或起音检测。快速撑开、缓慢回落只用于线条显示。

选择 fft.js 的原因是它可直接分析当前 FFmpeg 输出的 PCM，无运行时依赖，并采用 MIT 许可证。Meyda 提供更多音频特征，但当前频谱需求无需引入整套特征提取；audioMotion-analyzer 的公开输入是 Web Audio 音源，接入当前 mpv 链路需要额外桥接。分频、幅度显示、动效和播放同步仍由本项目管理，替换范围是 FFT 内核。许可证随现有音频资源目录分发，见 `resources/audio/FFTJS-LICENSE.txt`。

本次替换验证：45 个合成采样窗口与两首曲目 30–35 秒片段的 464 个双声道窗口，对比替换前后的频谱最大差异约 3.5×10⁻¹³，RMS 完全一致。另有独立 O(N²) 傅里叶求和测试验证全部显示频段。Node v24.13.0 下，各预热 2000 次后，交替执行 7 轮、每轮 4000 次完整分析，单声道每次分析中位耗时从约 0.040 ms 降至 0.018 ms（约 2.2 倍）；这不是整个播放器的速度提升。

振动定向验证入口为 `npx.cmd vitest run src/shared/audio/spectrumAnalysis.test.ts src/shared/audio/bassEnvelope.test.ts src/main/features/audio/playbackSpectrumService.test.ts src/renderer/features/playback/composables/usePlaybackSpectrum.test.ts src/renderer/features/albums/utils/cdVibrationMotion.test.ts src/renderer/features/albums/utils/cdStageController.test.ts`。合成输入验证低频幅值、静音、高频抑制、相反相位和不同帧率响应，生命周期测试验证位移上限、陈旧帧、暂停、跳转和停止。真实曲目脚本使用生产分析器验证 mpv、HTMLAudio、暂停、跳转、切歌、关闭订阅、减少动效与方块位移；具体采样结果见隔离目录中的 `results.json`。隐藏验证窗口关闭后台刷新节流；试听窗口沿用正常后台策略。

这是原始音频的频谱，不包含播放器音量、均衡器或其他输出 DSP 的处理结果；未作整曲长期负载或人工听感验收。上述耗时为本机片段采样，不代表所有音频格式和机器的上限。

参考：[FFmpeg 精确寻址说明](https://ffmpeg.org/ffmpeg.html)、[mpv 音频及时间属性说明](https://mpv.io/manual/stable/)。
