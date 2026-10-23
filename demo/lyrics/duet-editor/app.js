/** @typedef {import('./contract').DemoRequest} DemoRequest */
/** @typedef {import('./contract').DemoResponse} DemoResponse */
const byId = (id) => document.getElementById(id)
const token = document.querySelector('meta[name="demo-token"]').content
const selected = new Set()
const history = []
const displayLimit = 300
const textLimit = 8 * 1024 * 1024
/** @type {DemoResponse | null} */
let current = null
let busy = false
let output = null

const warningLabels = {
  'inferred-line-ends': 'LRC 缺少行结束时间，已根据下一句推导。',
  'inferred-final-end': '末句结束时间已按歌曲时长或默认时长推导。',
  'negative-times-clamped': '应用 offset 后的负时间已调整为零。',
  'untimed-lines-ignored': '没有时间戳的正文未参与转换。',
  'word-timing-dropped': 'LRC 导出不保留逐字时间。',
  'line-ends-dropped': 'LRC 导出不保留行结束时间。',
  'performers-dropped': 'LRC 导出不保留逐句演唱者与合唱标记。',
  'annotations-flattened': '翻译、音译或背景人声已展开为独立歌词行。',
  'presentation-dropped': 'LRC 导出不保留样式与排版。',
  'metadata-dropped': '部分元数据无法保留在目标格式中。',
  'submillisecond-times-rounded': '时间已四舍五入到毫秒精度。',
}
const issueLabels = {
  'unsupported-performers': '演唱者超过两人或存在多个合唱组',
  'invalid-agent': '演唱者定义或引用格式无效',
  'duplicate-id': '存在重复 XML ID',
  'unknown-performer': '引用了未定义的演唱者',
  'unsupported-structure': '文档结构不支持编辑',
}
const errorLabels = {
  'invalid-request': '请求或姓名无效，请检查输入后重试。',
  'invalid-input': '歌词为空、过长或包含无效字符，请检查原文。',
  'invalid-lrc': 'LRC 时间戳或逐字标记无效，请检查原文。',
  'invalid-ttml': 'TTML 无法解析，请检查 XML 与时间结构。',
  'unsupported-timing': '此时间格式暂不支持转换。',
  'stale-revision': '文档已改变，请重新载入并选择歌词。',
  'unsupported-document': '这份 TTML 仅支持预览，请检查文档提示。',
  'read-only-line': '所选歌词存在混合分唱，暂不支持整句修改。',
  'unconfigured-role': '请先保存两位演唱者姓名。',
  'unsupported-inheritance': '文档继承结构无法安全修改，请使用其他歌词。',
  forbidden: '页面凭证失效，请刷新页面重试。',
  'too-large': '输入超过 demo 的大小限制。',
}

function status(message, error = false) {
  byId('status').textContent = message
  byId('status').classList.toggle('error', error)
}

/** @param {DemoRequest} payload @returns {Promise<DemoResponse>} */
async function api(payload) {
  const response = await fetch('/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Demo-Token': token },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(errorLabels[result.code] ?? `操作失败（${result.code}），请检查输入或终端。`)
  }
  return result
}

async function task(message, operation) {
  if (busy) return
  busy = true
  byId('workspace').disabled = true
  byId('reset').disabled = true
  byId('workspace').setAttribute('aria-busy', 'true')
  status(message)
  try {
    await operation()
  } catch (error) {
    status(
      error.name === 'TimeoutError'
        ? '操作超时，当前文档已保留；请检查终端后重试。'
        : error instanceof TypeError
          ? '无法连接 demo 服务，请检查终端是否仍在运行。'
          : error.message,
      true,
    )
  } finally {
    busy = false
    byId('workspace').disabled = false
    byId('reset').disabled = false
    byId('workspace').setAttribute('aria-busy', 'false')
    updateSelection()
  }
}

function showWarnings(warnings) {
  const list = byId('warnings')
  list.replaceChildren()
  for (const warning of warnings) {
    const item = document.createElement('li')
    item.textContent = warningLabels[warning] ?? warning
    list.append(item)
  }
}

function clearOutput() {
  output = null
  byId('output-text').value = ''
  byId('output-label').textContent = '导出结果'
  byId('download').disabled = true
  byId('output-note').textContent = 'TTML 保留分唱标记；LRC 保留每行开始时间。'
}

function pushHistory() {
  if (!current) return
  history.push(current)
  // Bound undo memory independently of the backend's per-document limit.
  let size = history.reduce((total, entry) => total + entry.text.length, 0)
  while (history.length > 20 || size > textLimit * 2) size -= history.shift().text.length
}

function commit(next, recordHistory = true) {
  if (recordHistory && current?.text !== next.text) pushHistory()
  current = next
  selected.clear()
  clearOutput()
  render()
  showWarnings(next.warnings)
}

function performerName(role, fallback) {
  const id = current?.snapshot.roles[role]
  return current?.snapshot.performers.find((person) => person.id === id)?.name ?? fallback
}

function assignmentLabel(assignment) {
  return (
    {
      'performer-1': `1 · ${performerName('performer1', '演唱者一')}`,
      'performer-2': `2 · ${performerName('performer2', '演唱者二')}`,
      together: '合唱',
      unassigned: '未分配',
      mixed: '句内混合 · 只读',
      unknown: '未知角色 · 只读',
    }[assignment] ?? assignment
  )
}

function visibleLines() {
  return current?.snapshot.lines.slice(0, displayLimit) ?? []
}

function selectableLines() {
  return current?.snapshot.editable ? visibleLines().filter((line) => line.editable) : []
}

function updateSelection() {
  const available = selectableLines()
  const enabled = !busy && Boolean(current?.snapshot.editable)
  byId('selection-count').textContent = `已选 ${selected.size} 句`
  const all = byId('select-all')
  all.disabled = !enabled || !available.length
  all.checked = available.length > 0 && available.every((line) => selected.has(line.id))
  all.indeterminate = selected.size > 0 && !all.checked
  for (const button of document.querySelectorAll('[data-assignment]')) {
    button.disabled = !enabled || !selected.size
  }
  byId('undo').disabled = busy || !history.length
  byId('names-form').querySelector('button').disabled = !enabled
  byId('name-one').disabled = !enabled
  byId('name-two').disabled = !enabled
  byId('export-ttml').disabled = !current || busy
  byId('export-lrc').disabled = !current || busy
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function render() {
  const snapshot = current.snapshot
  byId('name-one').value = performerName('performer1', '演唱者一')
  byId('name-two').value = performerName('performer2', '演唱者二')
  byId('legend-one').textContent = `${performerName('performer1', '演唱者一')} · 左`
  byId('legend-two').textContent = `${performerName('performer2', '演唱者二')} · 右`
  byId('line-count').textContent = `${snapshot.lines.length} 句`
  const list = document.createDocumentFragment()
  const preview = document.createDocumentFragment()
  for (const [index, line] of visibleLines().entries()) {
    const row = element('label', `lyric-row ${line.assignment}`)
    row.dataset.id = line.id
    const checkbox = element('input')
    checkbox.type = 'checkbox'
    checkbox.checked = selected.has(line.id)
    checkbox.disabled = !snapshot.editable || !line.editable
    checkbox.setAttribute('aria-label', `选择第 ${index + 1} 句：${line.text || '空行'}`)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selected.add(line.id)
      else selected.delete(line.id)
      row.classList.toggle('selected', checkbox.checked)
      updateSelection()
    })
    const timing = element('span', 'timestamp', line.timing.begin ?? '无行时间')
    timing.title = `begin: ${line.timing.begin ?? '—'} / end: ${line.timing.end ?? '—'} / dur: ${line.timing.duration ?? '—'}`
    const copy = element('span', 'lyric-copy')
    copy.append(element('span', 'lyric-text', line.text || '（空行）'))
    copy.append(element('span', `role-label ${line.assignment}`, assignmentLabel(line.assignment)))
    row.append(checkbox, timing, copy)
    list.append(row)
    const verse = element('div', `preview-verse ${line.assignment}`)
    verse.append(element('span', 'preview-role', assignmentLabel(line.assignment)))
    verse.append(element('p', '', line.text || '（空行）'))
    preview.append(verse)
  }
  if (!snapshot.lines.length) {
    list.append(element('p', 'empty', '这份 TTML 没有可显示的歌词行。'))
    preview.append(element('p', 'empty', '载入带歌词行的 LRC 或 TTML 后预览。'))
  }
  byId('line-list').replaceChildren(list)
  byId('preview-lines').replaceChildren(preview)
  const notes = []
  if (!snapshot.editable) {
    notes.push(
      `此文档只读：${[...new Set(snapshot.issues.map((issue) => issueLabels[issue.code] ?? issue.code))].join('；')}。`,
    )
  }
  if (snapshot.lines.length > displayLimit) {
    notes.push(`Demo 仅显示前 ${displayLimit} 句，全选只作用于可见行；导出仍包含完整文档。`)
  }
  if (snapshot.lines.some((line) => !line.editable))
    notes.push('句内混合分唱或未知角色的行不可选择。')
  byId('document-note').textContent =
    notes.join(' ') || '勾选一句或多句，再分配声音。同一时间的歌词也可以分别标记。'
  updateSelection()
}

async function openText(text, format) {
  if (!text.trim() || text.length > textLimit)
    throw new Error('请输入非空歌词，且不超过 8 Mi 个字符。')
  let next = await api({ action: 'open', text, format })
  const warnings = next.warnings
  const roles = next.snapshot.roles
  if (next.snapshot.editable && (!roles.performer1 || !roles.performer2 || !roles.together)) {
    const nameFor = (id, fallback) =>
      next.snapshot.performers.find((person) => person.id === id)?.name ?? fallback
    next = await api({
      action: 'configure',
      text: next.text,
      request: {
        expectedRevision: next.snapshot.revision,
        performer1Name: nameFor(roles.performer1, byId('name-one').value.trim() || '演唱者一'),
        performer2Name: nameFor(roles.performer2, byId('name-two').value.trim() || '演唱者二'),
      },
    })
  }
  commit({ ...next, warnings })
  status(
    next.snapshot.editable
      ? '歌词已载入。勾选歌词行，即可分配演唱者或合唱。'
      : '歌词已载入，只读原因见列表下方；可以导出或载入其他歌词。',
  )
}

async function loadSample() {
  const response = await fetch('/sample.lrc', { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error('模拟歌词加载失败，请检查 demo 文件后重试。')
  const text = await response.text()
  await openText(text, 'lrc')
  byId('source-format').value = 'lrc'
  byId('source-text').value = text
}

byId('reset').addEventListener('click', () => task('正在载入模拟 LRC…', loadSample))
byId('source-text').maxLength = textLimit
byId('open-source').addEventListener('click', () =>
  task('正在转换并载入歌词…', () =>
    openText(byId('source-text').value, byId('source-format').value),
  ),
)

byId('names-form').addEventListener('submit', (event) => {
  event.preventDefault()
  if (!current) return
  void task('正在保存演唱者姓名…', async () => {
    const next = await api({
      action: 'configure',
      text: current.text,
      request: {
        expectedRevision: current.snapshot.revision,
        performer1Name: byId('name-one').value.trim(),
        performer2Name: byId('name-two').value.trim(),
      },
    })
    commit(next)
    status('演唱者姓名已保存，已有逐句标记继续保留。')
  })
})

byId('select-all').addEventListener('change', (event) => {
  const checked = event.target.checked
  for (const line of selectableLines()) {
    if (checked) selected.add(line.id)
    else selected.delete(line.id)
  }
  for (const row of byId('line-list').children) {
    const checkbox = row.querySelector('input')
    if (!checkbox || checkbox.disabled) continue
    checkbox.checked = selected.has(row.dataset.id)
    row.classList.toggle('selected', checkbox.checked)
  }
  updateSelection()
})

for (const button of document.querySelectorAll('[data-assignment]')) {
  button.addEventListener('click', () =>
    task('正在更新所选歌词…', async () => {
      if (!current || !selected.size) return
      const count = selected.size
      const next = await api({
        action: 'assign',
        text: current.text,
        request: {
          expectedRevision: current.snapshot.revision,
          lineIds: [...selected],
          assignment: button.dataset.assignment,
        },
      })
      commit(next)
      status(`已更新 ${count} 句：${assignmentLabel(button.dataset.assignment)}。`)
    }),
  )
}

byId('undo').addEventListener('click', () => {
  if (busy || !history.length) return
  commit(history.pop(), false)
  status('已撤销上一次文档修改。')
})

for (const format of ['ttml', 'lrc']) {
  byId(`export-${format}`).addEventListener('click', () =>
    task(`正在生成 ${format.toUpperCase()}…`, async () => {
      if (!current) return
      const result = await api({ action: 'export', text: current.text, format })
      output = { text: result.text, format }
      byId('output-text').value = result.text
      byId('output-label').textContent = `${format.toUpperCase()} 导出结果`
      byId('download').disabled = false
      byId('output-note').textContent =
        format === 'lrc'
          ? '带逐行时间戳的 LRC；演唱者、合唱和逐字标记不会保留。编辑中的 TTML 仍保留。'
          : '保留当前 TTML 原文及分唱标记，可重新粘贴载入。'
      showWarnings(result.warnings)
      status(`${format.toUpperCase()} 已生成，可查看原文或下载。`)
    }),
  )
}

byId('download').addEventListener('click', () => {
  if (!output || busy) return
  const blob = new Blob([output.text], {
    type:
      output.format === 'ttml' ? 'application/ttml+xml;charset=utf-8' : 'text/plain;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = element('a')
  anchor.href = url
  anchor.download = `auralis-duet-demo.${output.format}`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  status('已将下载交给浏览器，请在下载列表中查看。')
})

void task('正在加载模拟 LRC…', loadSample)
