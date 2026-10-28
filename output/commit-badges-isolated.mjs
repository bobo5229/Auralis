import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, openSync, closeSync, renameSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
const state = JSON.parse(readFileSync('output/badge-commit-state.json','utf8'))
const merge = JSON.parse(readFileSync('output/badge-commit-merge-state.json','utf8'))
const git = (args, env=process.env) => execFileSync('git',args,{env,encoding:'utf8',maxBuffer:20e6})
const env = {...process.env,GIT_INDEX_FILE:state.index}
const combinedEnv = {...process.env,GIT_INDEX_FILE:merge.mergedIndex}
if (git(['write-tree'],env).trim() !== state.tree) throw new Error('Badge tree changed')
const changed = git(['diff','--cached',merge.beforeTree,'--name-only'],combinedEnv).trim().split('\n')
if (changed.length !== state.paths.length || changed.some(p=>!state.paths.includes(p))) throw new Error('Combined index scope mismatch')
if (git(['ls-files','-u'],combinedEnv).trim()) throw new Error('Unresolved combined index')
const lockPath = `${merge.actualIndex}.lock`
const lock = openSync(lockPath,'wx')
let moved = false
try {
 const currentHash = createHash('sha256').update(readFileSync(merge.actualIndex)).digest('hex')
 if (currentHash !== merge.initialIndexHash) throw new Error('Parallel index changed; prepare merge again')
 if (git(['rev-parse','HEAD']).trim() !== state.parent) throw new Error('Parallel HEAD changed; rebuild snapshot')
 writeFileSync(lock,readFileSync(merge.mergedIndex))
 writeFileSync('output/badge-commit-message.txt', 'feat(archive): 接入真实徽章成就并完善检视体验\n\n按实际聆听时间、自然日与曲目覆盖率逐枚判定点亮状态，首次快照旧历史并在清除历史时失效旧写入。现场专辑依据全部曲目的流派包含 Live 判定。\n\n补充检视名称、条件和进度，适配小窗口，并统一入场 easeInOutCubic 缓动。\n\n验证：隔离提交快照 334 项单测、26 项原生测试、两端类型检查、Lint、语言键与格式检查通过；复用此前真实 Electron 验收和独立缺陷复验。\n')
 console.log(git(['commit','--file','output/badge-commit-message.txt'],env))
 closeSync(lock)
 renameSync(lockPath,merge.actualIndex)
 moved = true
 console.log(git(['log','-1','--format=%h %s']))
 console.log('Preserved parallel staged changes; no temporary output included.')
} finally {
 if (!moved) { try {closeSync(lock)} catch{}; try {unlinkSync(lockPath)} catch{} }
}
