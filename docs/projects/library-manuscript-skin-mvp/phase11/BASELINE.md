# Phase 11 基线

**日期**：2026-08-13
**分支**：`script-skin-dev`

## 1. 开始状态

- Phase 9、Phase 10 和文字对比度修复仍位于未提交工作树，必须完整保留。
- 全部歌曲页通过 `library:get-tracks` 一次接收全部 `TrackListItem`。
- `TrackRepository.getAll()` 先按 id 查询，再用主进程 `Intl.Collator` 进行拼音排序。
- Renderer 的 flat DOM 已虚拟化，但数据、搜索索引和专辑分组仍是完整数组。
- 双击曲目直接把 `tracks.value` 交给播放器作为完整队列。
- 普通/智能歌单拥有独立详情接口，本阶段不迁移。

## 2. 必须保持的行为

- 排序继续为 albumArtist → releaseDate → discNo → trackNo → id。
- 拼音比较继续使用 `zh-Hans-u-co-pinyin`、base sensitivity 和 numeric。
- 搜索仍按完整曲库计算 total、position 和 wrapped。
- cover 视图仍按完整有序数组分组。
- 双击曲目和右键播放仍获得完整曲库队列。
- 专辑播放仍只播放该专辑；插播和菜单 scope 不变。
- Phase 10 的 foreground/background/metadata generation 仲裁不变。
- flat/cover 虚拟几何和 manuscript scope 不变。

## 3. 性能基线指标

真实曲库人工记录以下值：

| 数据量 | Snapshot build | Page count | Page slice | Renderer load | 首次播放响应 |
| ------ | -------------- | ---------- | ---------- | ------------- | ------------ |
| 10k    | 待人工记录     | 约 10      | 待人工记录 | 待人工记录    | 待人工确认   |
| 50k    | 待人工记录     | 约 50      | 待人工记录 | 待人工记录    | 待人工确认   |

自动化不设置毫秒硬阈值，只验证 50,005 首的完整性和稳定性。

## 4. 冻结边界

- 不新增数据库 migration。
- 不改 `TrackRepository.getAll()` 排序实现。
- 不移除旧 `library:get-tracks` contract。
- 不改播放 composable 内部 queue 状态机。
- 不把分页作用于歌单。
