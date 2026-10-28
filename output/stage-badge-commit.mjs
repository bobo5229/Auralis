import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
const index = `${process.cwd().replaceAll('\\','/')}/output/badge-commit.index`
const env = { ...process.env, GIT_INDEX_FILE: index }
const git = (...args) => execFileSync('git', args, { env, encoding: 'utf8', maxBuffer: 20e6 })
git('read-tree','HEAD')
const parent = git('rev-parse','HEAD').trim()
const whole = [
 'docs/topics/archive/TECHDOC-badge-achievements.md',
 'src/shared/types/badgeAchievements.ts',
 'src/main/database/badgeAchievementMigration.ts',
 'src/main/features/archive/listeningEvidence.ts',
 'src/main/features/archive/listeningEvidence.test.ts',
 'src/main/repositories/badgeAchievementRepository.ts',
 'src/main/repositories/badgeAchievementRepository.native.test.ts',
 'src/main/ipc/registerBadgeAchievementIpcHandlers.ts',
 'src/main/ipc/registerBadgeAchievementIpcHandlers.test.ts',
 'src/main/ipc/registerIpcHandlers.ts',
 'src/main/ipc/registerPlaybackArchiveIpcHandlers.test.ts',
 'src/main/repositories/playStatsRepository.ts',
 'src/renderer/features/archive/components/ArchiveMilestoneCase.vue',
 'src/renderer/features/archive/components/ArchiveMilestoneGallery.vue',
 'src/renderer/features/archive/composables/useBadgeInspection.ts',
 'src/renderer/features/archive/composables/useBadgeInspection.test.ts',
 'src/renderer/features/archive/composables/useBadgeAchievements.ts',
 'src/renderer/features/archive/utils/badgeAchievementStatus.ts',
 'src/renderer/features/archive/constants/milestoneBadges.ts',
 'src/renderer/features/archive/styles/badgeGallery.css',
 'src/renderer/features/playback/core/listeningProgressTracker.ts',
 'src/renderer/features/playback/core/listeningProgressTracker.test.ts',
 'src/renderer/features/playback/runtime/playbackController.ts',
 'src/renderer/features/playback/runtime/playbackDependencies.ts',
]
const staged = new Map(whole.map(p => [p, readFileSync(p, 'utf8').replace(/\r\n/g, '\n')]))
function partial(path, select, transform = x => x) {
 const base = git('show', `HEAD:${path}`)
 const diff = git('diff', 'HEAD', '--no-ext-diff', '--no-color', '--', path)
 const hunks = [...diff.matchAll(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@[^\n]*\n([\s\S]*?)(?=^@@ |$(?![\s\S]))/gm)]
 let lines = base.split('\n')
 let count = 0
 for (const h of hunks.reverse()) {
  if (!select(h[0])) continue
  const data = h[2].split('\n').filter(x => x && !x.startsWith('\\'))
  const old = data.filter(x => !x.startsWith('+')).map(x => x.slice(1))
  const next = data.filter(x => !x.startsWith('-')).map(x => x.slice(1))
  const start = Number(h[1]) - 1
  if (lines.slice(start, start + old.length).join('\n') !== old.join('\n')) throw new Error(`Mismatch ${path}`)
  lines.splice(start, old.length, ...next)
  count++
 }
 if (!count) throw new Error(`No hunks selected: ${path}`)
 staged.set(path, transform(lines.join('\n')))
}
const badge = h => /BadgeAchievements|badgeAchievements|recordListeningProgress|record-listening-progress|getBadgeAchievements|get-badge-achievements/.test(h)
for (const p of ['src/shared/ipc/api.ts','src/shared/ipc/channels.ts','src/shared/ipc/contracts.ts','src/preload/index.ts','src/renderer/shared/ipc/browserPreviewApi.ts','src/renderer/features/playback/composables/usePlayback.test.ts','src/main/ipc/ipcPayloadValidation.ts','src/main/ipc/ipcPayloadValidation.compatibility.fixture.ts']) partial(p, badge)
partial('src/main/ipc/ipcPayloadValidation.test.ts', h => /actualChannels\)\.toHaveLength/.test(h), x => {
 const base = git('show','HEAD:src/main/ipc/ipcPayloadValidation.test.ts')
 const channels = Number(base.match(/actualChannels\)\.toHaveLength\((\d+)\)/)[1]) + 2
 const required = Number(base.match(/kinds\)\.toEqual\(\{ void: \d+, optional: \d+, required: (\d+)/)[1]) + 1
 return x.replace(/actualChannels\)\.toHaveLength\(\d+\)/, `actualChannels).toHaveLength(${channels})`).replace(/required: \d+/, `required: ${required}`)
})
for (const p of ['src/renderer/locales/en.json','src/renderer/locales/zh-Hans.json']) partial(p, h => /inspectBadge|achievementsError|albums1.*Complete album|albums1.*完整专辑/.test(h))
partial('src/main/database/schema.native.test.ts', h => /migrationIds|badge_listening_epoch|schema_migrations.*pluck/.test(h))
staged.set('src/main/database/schemaMigrations.ts', "import { badgeAchievementMigration } from './badgeAchievementMigration'\n\n" + git('show','HEAD:src/main/database/schemaMigrations.ts').replace(/\n\] as const\s*$/, '\n  badgeAchievementMigration,\n] as const\n'))
for (const [path, content] of staged) {
 const hash = execFileSync('git',['hash-object','-w','--stdin'],{input:content,encoding:'utf8'}).trim()
 git('update-index','--add','--cacheinfo',`100644,${hash},${path}`)
}
const tree = git('write-tree').trim()
const target = `output/badge-commit-snapshot-${Date.now()}`
mkdirSync(target,{recursive:true})
git('checkout-index','--all',`--prefix=${process.cwd().replaceAll('\\','/')}/${target}/`)
writeFileSync('output/badge-commit-state.json', JSON.stringify({parent,index,tree,target,paths:[...staged.keys()]},null,2))
console.log(JSON.stringify({tree,target,files:staged.size}))
