import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const state = JSON.parse(readFileSync('output/badge-commit-state.json','utf8'))
const git = (args, options={}) => execFileSync('git',args,{encoding:'utf8',maxBuffer:20e6,...options})
const parent = git(['rev-parse','HEAD']).trim()
if (parent !== state.parent) throw new Error('HEAD changed; rebuild snapshot against latest HEAD')
const actualIndex = git(['rev-parse','--path-format=absolute','--git-path','index']).trim()
const mergedIndex = `${process.cwd().replaceAll('\\','/')}/output/badge-combined.index`
const initialIndex = readFileSync(actualIndex)
const initialIndexHash = createHash('sha256').update(initialIndex).digest('hex')
copyFileSync(actualIndex, mergedIndex)
const env = {...process.env,GIT_INDEX_FILE:mergedIndex}
const beforeTree = git(['write-tree'],{env}).trim()
const patch = git(['diff','--binary',state.parent,state.tree])
try {git(['apply','--cached','--3way','-'],{env,input:patch})} catch (e) { console.log(String(e.stderr)) }
const conflicts = git(['diff','--name-only','--diff-filter=U'],{env}).trim().split('\n').filter(Boolean)
writeFileSync('output/badge-commit-merge-state.json', JSON.stringify({parent,actualIndex,mergedIndex,initialIndexHash,beforeTree,conflicts},null,2))
console.log(JSON.stringify({conflicts,beforeTree}))
