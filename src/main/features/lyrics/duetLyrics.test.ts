import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DuetLyricsError, readDuetLyrics } from './duetLyrics'

const fixture = readFileSync(new URL('../metadata/__fixtures__/duet.ttml', import.meta.url), 'utf8')
const definitions =
  '<head><metadata><ttm:agent type="person" xml:id="A"><ttm:name type="full">Alice</ttm:name></ttm:agent><ttm:agent type="person" xml:id="B"><ttm:name type="full">Bob</ttm:name></ttm:agent><ttm:agent type="group" xml:id="AB"/></metadata></head>'
const wrap = (body: string, head = definitions) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">${head}<body>${body}</body></tt>`
function expectCode(action: () => unknown, code: DuetLyricsError['code']): void {
  try {
    action()
    expect.fail('Expected a duet parse error')
  } catch (error) {
    expect(error).toBeInstanceOf(DuetLyricsError)
    expect((error as DuetLyricsError).code).toBe(code)
  }
}

describe('read duet annotations', () => {
  it('reads original performer IDs, names and groups without rewriting the source', () => {
    const view = readDuetLyrics(fixture)
    expect(view.editable).toBe(true)
    expect(view.roles).toEqual({ performer1: 'v1', performer2: 'v2', together: 'v1000' })
    expect(view.performers.map((p) => [p.id, p.name, p.type])).toEqual([
      ['v1', '演唱者一', 'person'],
      ['v2', '演唱者二', 'person'],
      ['v1000', null, 'group'],
    ])
    expect(view.lines.map((line) => [line.id, line.text, line.assignment])).toEqual([
      ['line-0', '你好', 'performer-1'],
      ['line-1', 'Hello & goodbye', 'performer-2'],
      ['line-2', '共同演唱', 'together'],
    ])
    expect(view.lines[0].timing).toEqual({ begin: '00:01.000', end: '00:04.000', duration: null })
    expect(view.revision).toMatch(/^[a-f\d]{64}$/)
    expect(readDuetLyrics(fixture)).toEqual(view)
  })

  it('gives simultaneous identical lines independent IDs without inventing performers', () => {
    const ttml = wrap('<div><p begin="1s">same</p><p begin="1s">same</p><p begin="2s"/></div>', '')
    const view = readDuetLyrics(ttml)
    expect(view.performers).toEqual([])
    expect(view.lines.map((line) => [line.id, line.assignment])).toEqual([
      ['line-0', 'unassigned'],
      ['line-1', 'unassigned'],
      ['line-2', 'unassigned'],
    ])
  })

  it('resolves inherited and uniform word assignments, keeping mixed and partial rows read-only', () => {
    const raw = wrap(
      '<div ttm:agent="A"><p begin="1s">parent</p><p><span ttm:agent="B">B</span></p><p>A<span ttm:agent="B">B</span></p><p ttm:agent="A B">both references</p></div>',
    )
    const view = readDuetLyrics(raw)
    expect(view.editable).toBe(true)
    expect(view.lines.map((line) => [line.assignment, line.editable])).toEqual([
      ['performer-1', true],
      ['performer-2', true],
      ['mixed', false],
      ['mixed', false],
    ])
    const partial = readDuetLyrics(
      wrap('<div><p>unassigned<span ttm:agent="A">assigned</span></p></div>'),
    )
    expect(partial.lines[0].assignment).toBe('mixed')
  })

  it.each([
    [wrap('<div><p ttm:agent="missing">A</p></div>'), 'unknown-performer'],
    [wrap('<div><p xml:id="A">duplicate</p></div>'), 'duplicate-id'],
    [wrap('<div><p ttm:agent=" ">empty</p></div>'), 'invalid-agent'],
    [
      wrap(
        '<div><p>A</p></div>',
        definitions.replace('type="person" xml:id="A"', 'type="unrecognized" xml:id="A"'),
      ),
      'invalid-agent',
    ],
  ])('reports invalid references/definitions without losing the source', (raw, issue) => {
    const view = readDuetLyrics(raw)
    expect(view.editable).toBe(false)
    expect(view.issues.some((entry) => entry.code === issue)).toBe(true)
  })

  it('keeps documents with extra performers readable without merging identities', () => {
    const raw = wrap(
      '<div><p ttm:agent="C">third</p></div>',
      definitions.replace('</metadata>', '<ttm:agent type="person" xml:id="C"/></metadata>'),
    )
    const view = readDuetLyrics(raw)
    expect(view.performers).toHaveLength(4)
    expect(view.issues).toContainEqual({ code: 'unsupported-performers' })
    expect(view.lines[0].assignment).toBe('unknown')
  })
})

describe('duet input boundaries', () => {
  it.each([
    '',
    '<tt broken',
    '<!DOCTYPE tt><tt xmlns="http://www.w3.org/ns/ttml"><body/></tt>',
    wrap('<div><p>&#0;</p></div>'),
  ])('rejects malformed XML', (raw) => {
    expectCode(() => readDuetLyrics(raw), 'invalid-ttml')
  })

  it('rejects excessive nesting before recursive annotation processing', () => {
    expectCode(
      () => readDuetLyrics(wrap(`${'<div>'.repeat(130)}<p>A</p>${'</div>'.repeat(130)}`)),
      'invalid-ttml',
    )
  })
})
