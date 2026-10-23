import { readFileSync } from 'node:fs'
import { XMLSerializer, type Element, type Node } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import {
  assignDuetLines,
  configureDuetPerformers,
  DuetLyricsError,
  readDuetLyrics,
  renameDuetPerformer,
} from './duetLyrics'
import { convertLrcToTtml, convertTtmlToLrc } from './lyricsConversion'
import { parseTtmlDocument, TTML_METADATA_NAMESPACE, TTML_NAMESPACE } from './ttmlDocument'

const fixture = readFileSync(new URL('../metadata/__fixtures__/duet.ttml', import.meta.url), 'utf8')
const definitions =
  '<head><metadata><ttm:agent type="person" xml:id="A"><ttm:name type="full">Alice</ttm:name></ttm:agent><ttm:agent type="person" xml:id="B"><ttm:name type="full">Bob</ttm:name></ttm:agent><ttm:agent type="group" xml:id="AB"/></metadata></head>'
const wrap = (body: string, head = definitions) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">${head}<body>${body}</body></tt>`
const revision = (text: string) => readDuetLyrics(text).revision
const assign = (
  text: string,
  lineIds: string[],
  assignment: 'unassigned' | 'performer-1' | 'performer-2' | 'together',
) => assignDuetLines(text, { expectedRevision: revision(text), lineIds, assignment })

/** Content preservation oracle: ignore only performer-reference attributes and new namespace declarations. */
function withoutAssignments(raw: string): string {
  const doc = parseTtmlDocument(raw)
  function walk(node: Node): void {
    if (node.nodeType === node.ELEMENT_NODE) {
      const element = node as Element
      element.removeAttributeNS(TTML_METADATA_NAMESPACE, 'agent')
      for (const attribute of [...element.attributes]) {
        if (
          attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/' &&
          attribute.value === TTML_METADATA_NAMESPACE
        )
          element.removeAttributeNode(attribute)
      }
    }
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child)
  }
  walk(doc)
  return new XMLSerializer().serializeToString(doc)
}

function expectCode(action: () => unknown, code: DuetLyricsError['code']): void {
  try {
    action()
    expect.fail('Expected a duet edit error')
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

  it('gives simultaneous identical lines independent IDs and leaves LRC imports unassigned', () => {
    const ttml = convertLrcToTtml('[ar:Alice; Bob]\n[00:01]same\n[00:01]same\n[00:02]').text
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
    expectCode(() => assign(raw, ['line-0'], 'unassigned'), 'unsupported-document')
  })

  it('keeps documents with extra performers readable and rejects editing instead of merging identities', () => {
    const raw = wrap(
      '<div><p ttm:agent="C">third</p></div>',
      definitions.replace('</metadata>', '<ttm:agent type="person" xml:id="C"/></metadata>'),
    )
    const view = readDuetLyrics(raw)
    expect(view.performers).toHaveLength(4)
    expect(view.issues).toContainEqual({ code: 'unsupported-performers' })
    expect(view.lines[0].assignment).toBe('unknown')
    expectCode(
      () =>
        configureDuetPerformers(raw, {
          expectedRevision: view.revision,
          performer1Name: 'a',
          performer2Name: 'b',
        }),
      'unsupported-document',
    )
  })
})

describe('configure and rename performers', () => {
  it('creates two singers and a group from converted LRC without assigning any line', () => {
    const raw = convertLrcToTtml('[00:01]A\n[00:02]B').text
    const result = configureDuetPerformers(raw, {
      expectedRevision: revision(raw),
      performer1Name: 'Alice',
      performer2Name: 'Bob',
      togetherName: '共同演唱',
    })
    expect(result.changed).toBe(true)
    expect(result.snapshot.roles).toEqual({ performer1: 'v1', performer2: 'v2', together: 'v1000' })
    expect(result.snapshot.performers.map((p) => p.name)).toEqual(['Alice', 'Bob', '共同演唱'])
    expect(result.snapshot.lines.map((line) => line.assignment)).toEqual([
      'unassigned',
      'unassigned',
    ])
    expect(convertTtmlToLrc(result.text).text).toContain('[00:01.000]A\n[00:02.000]B\n')
  })

  it('allocates IDs without colliding with any XML element and handles an occupied ttm prefix', () => {
    const raw =
      '<t:tt xmlns:t="http://www.w3.org/ns/ttml" xmlns:ttm="urn:foreign"><t:body><t:div><t:p xml:id="v1" begin="1s"><t:span xml:id="v2">A</t:span></t:p><t:p xml:id="v1000" begin="2s">B</t:p></t:div></t:body></t:tt>'
    const result = configureDuetPerformers(raw, {
      expectedRevision: revision(raw),
      performer1Name: 'A & <一>',
      performer2Name: 'B',
    })
    expect(result.snapshot.roles).toEqual({
      performer1: 'v1-2',
      performer2: 'v2-2',
      together: 'v1000-2',
    })
    expect(parseTtmlDocument(result.text).documentElement!.getAttribute('xmlns:ttm')).toBe(
      'urn:foreign',
    )
    expect(result.snapshot.performers[0].name).toBe('A & <一>')
  })

  it('preserves an existing first singer when definitions span multiple metadata blocks', () => {
    const raw = wrap(
      '<div><p ttm:agent="existing">A</p></div>',
      '<head><metadata><ttm:title>Title</ttm:title></metadata><metadata><ttm:agent type="person" xml:id="existing"/></metadata></head>',
    )
    const result = configureDuetPerformers(raw, {
      expectedRevision: revision(raw),
      performer1Name: 'First',
      performer2Name: 'Second',
    })
    expect(result.snapshot.roles.performer1).toBe('existing')
    expect(result.snapshot.lines[0].assignment).toBe('performer-1')
    expect(result.snapshot.performers.map((p) => p.name)).toEqual(['First', 'Second', null])
  })

  it('renames one full name while retaining identity, references and alternative names', () => {
    const raw = wrap(
      '<div><p ttm:agent="A">A</p><p ttm:agent="B">B</p></div>',
      definitions.replace('</ttm:agent>', '<ttm:name type="family">Family</ttm:name></ttm:agent>'),
    )
    const result = renameDuetPerformer(raw, {
      expectedRevision: revision(raw),
      performerId: 'A',
      name: 'New Artist',
    })
    expect(result.snapshot.performers[0]).toEqual({ id: 'A', name: 'New Artist', type: 'person' })
    expect(result.snapshot.lines.map((line) => line.performerIds)).toEqual([['A'], ['B']])
    expect(result.text).toContain('<ttm:name type="family">Family</ttm:name>')
    expect(result.snapshot.performers[1].name).toBe('Bob')
  })

  it('adds a full name without replacing an existing typed family name', () => {
    const raw = wrap(
      '<div><p>A</p></div>',
      definitions.replace(
        '<ttm:name type="full">Alice</ttm:name>',
        '<ttm:name type="family">Family</ttm:name>',
      ),
    )
    const result = renameDuetPerformer(raw, {
      expectedRevision: revision(raw),
      performerId: 'A',
      name: 'Full Name',
    })
    expect(result.snapshot.performers[0].name).toBe('Full Name')
    expect(result.text).toContain('<ttm:name type="family">Family</ttm:name>')
  })

  it('returns the exact original text for unchanged names and role configuration', () => {
    const raw = `\uFEFF${wrap('<div><p>A</p></div>')}\r\n`
    expect(
      renameDuetPerformer(raw, {
        expectedRevision: revision(raw),
        performerId: 'A',
        name: 'Alice',
      }),
    ).toMatchObject({ text: raw, changed: false })
    expect(
      configureDuetPerformers(raw, {
        expectedRevision: revision(raw),
        performer1Name: 'Alice',
        performer2Name: 'Bob',
      }),
    ).toMatchObject({ text: raw, changed: false })
  })

  it.each(['', ' ', 'a'.repeat(201), 'bad\u0000', '\uD800'])(
    'rejects invalid names atomically',
    (name) => {
      const raw = wrap('<div><p>A</p></div>')
      const before = readDuetLyrics(raw)
      expectCode(
        () =>
          configureDuetPerformers(raw, {
            expectedRevision: before.revision,
            performer1Name: 'Changed',
            performer2Name: name,
          }),
        'invalid-request',
      )
      expect(readDuetLyrics(raw)).toEqual(before)
    },
  )
})

describe('batch line assignment', () => {
  it('assigns independent simultaneous lines and a common group without changing their IDs', () => {
    const raw = wrap('<div><p begin="1s">same</p><p begin="1s">same</p><p begin="2s"/></div>')
    const first = assign(raw, ['line-0'], 'performer-1')
    const second = assign(first.text, ['line-1'], 'performer-2')
    const together = assign(second.text, ['line-2'], 'together')
    expect(together.snapshot.lines.map((line) => [line.id, line.assignment])).toEqual([
      ['line-0', 'performer-1'],
      ['line-1', 'performer-2'],
      ['line-2', 'together'],
    ])
    expect(withoutAssignments(together.text)).toBe(withoutAssignments(raw))
  })

  it('clears inherited roles without changing siblings, word timings, translations or unknown extensions', () => {
    const raw = wrap(
      '<div ttm:agent="A" xmlns:x="urn:extra" x:flag="keep"><!--keep--><p begin="1s" end="3s"><span begin="1s" end="2s">A</span><span ttm:role="x-translation">甲</span><x:note value="keep"/></p><div><p begin="2s" ttm:agent="B">B</p><p begin="3s">inherited</p></div><x:extra>opaque</x:extra></div>',
    )
    const result = assign(raw, ['line-0'], 'unassigned')
    expect(result.snapshot.lines.map((line) => line.assignment)).toEqual([
      'unassigned',
      'performer-2',
      'performer-1',
    ])
    expect(withoutAssignments(result.text)).toBe(withoutAssignments(raw))
    expect(result.text).toContain('<!--keep-->')
    const x = parseTtmlDocument(result.text).getElementsByTagNameNS('urn:extra', 'extra')[0]
    expect(x.getAttributeNS(TTML_METADATA_NAMESPACE, 'agent')).toBe('A')
  })

  it('distributes nested overrides only on edited branches and preserves inherited mixed siblings', () => {
    const raw = wrap(
      '<div ttm:agent="A"><div ttm:agent="B"><p>target</p><p>other B</p></div><p><span ttm:agent="B">uniform B</span></p><p>A<span ttm:agent="B">B</span></p><div><p>other A</p></div></div>',
    )
    const before = readDuetLyrics(raw)
    const result = assign(raw, ['line-0'], 'together')
    expect(result.snapshot.lines[0].assignment).toBe('together')
    expect(result.snapshot.lines.slice(1)).toEqual(before.lines.slice(1))
    expect(withoutAssignments(result.text)).toBe(withoutAssignments(raw))
  })

  it('replaces uniform word-level references as a whole without removing word timing or role attributes', () => {
    const raw = wrap(
      '<div><p begin="1s"><span begin="1s" end="2s" ttm:agent="A">A</span><span begin="2s" ttm:agent="A">B</span></p></div>',
    )
    const result = assign(raw, ['line-0'], 'performer-2')
    expect(result.snapshot.lines[0].assignment).toBe('performer-2')
    expect(
      parseTtmlDocument(result.text)
        .getElementsByTagNameNS(TTML_NAMESPACE, 'span')[0]
        .hasAttributeNS(TTML_METADATA_NAMESPACE, 'agent'),
    ).toBe(false)
    expect(withoutAssignments(result.text)).toBe(withoutAssignments(raw))
  })

  it('handles metadata namespace aliases for imported definitions and inherited roles', () => {
    const raw = wrap('<div ttm:agent="A"><p>A</p><p>B</p></div>')
      .replaceAll('xmlns:ttm=', 'xmlns:m=')
      .replaceAll('ttm:', 'm:')
    const result = assign(raw, ['line-1'], 'performer-2')
    expect(result.snapshot.lines.map((line) => line.assignment)).toEqual([
      'performer-1',
      'performer-2',
    ])
    expect(withoutAssignments(result.text)).toBe(withoutAssignments(raw))
  })

  it('respects local namespace shadowing while keeping unrelated namespaced attributes', () => {
    const raw = wrap(
      '<div><p xmlns:ttm="urn:foreign" ttm:flag="keep"><span>target</span></p><p>other</p></div>',
    )
    const result = assign(raw, ['line-0'], 'performer-2')
    const paragraph = parseTtmlDocument(result.text).getElementsByTagNameNS(TTML_NAMESPACE, 'p')[0]
    expect(paragraph.getAttributeNS('urn:foreign', 'flag')).toBe('keep')
    expect(paragraph.getAttributeNS(TTML_METADATA_NAMESPACE, 'agent')).toBe('B')
    expect(withoutAssignments(result.text)).toBe(withoutAssignments(raw))
  })

  it('returns original bytes for an empty or unchanged batch and tolerates repeated selection IDs', () => {
    const raw = `\uFEFF${wrap('<div ttm:agent="A"><p>A</p></div>')}\r\n`
    expect(assign(raw, [], 'unassigned')).toMatchObject({ text: raw, changed: false })
    expect(assign(raw, ['line-0', 'line-0'], 'performer-1')).toMatchObject({
      text: raw,
      changed: false,
    })
  })

  it('rejects the entire batch when one target is mixed or missing', () => {
    const raw = wrap(
      '<div><p ttm:agent="A">normal</p><p ttm:agent="A">A<span ttm:agent="B">B</span></p></div>',
    )
    const before = readDuetLyrics(raw)
    expectCode(() => assign(raw, ['line-0', 'line-1'], 'together'), 'read-only-line')
    expectCode(() => assign(raw, ['line-0', 'not-present'], 'together'), 'unknown-line')
    expect(readDuetLyrics(raw)).toEqual(before)
  })

  it('rejects stale selections, unknown actors and unconfigured roles', () => {
    const raw = wrap('<div><p>A</p></div>')
    const updated = renameDuetPerformer(raw, {
      expectedRevision: revision(raw),
      performerId: 'A',
      name: 'New',
    })
    expectCode(
      () =>
        assignDuetLines(updated.text, {
          expectedRevision: revision(raw),
          lineIds: ['line-0'],
          assignment: 'together',
        }),
      'stale-revision',
    )
    expectCode(
      () =>
        renameDuetPerformer(raw, {
          expectedRevision: revision(raw),
          performerId: 'missing',
          name: 'Name',
        }),
      'unknown-performer',
    )
    const unconfigured = convertLrcToTtml('[00:01]A').text
    expectCode(() => assign(unconfigured, ['line-0'], 'performer-1'), 'unconfigured-role')
  })

  it('rejects invalid batch request shapes before applying edits', () => {
    const raw = wrap('<div><p>A</p></div>')
    const base = { expectedRevision: revision(raw), lineIds: ['line-0'], assignment: 'performer-1' }
    for (const request of [
      null,
      {},
      { ...base, lineIds: null },
      { ...base, lineIds: [1] },
      { ...base, assignment: 'guess' },
      { ...base, lineIds: Array(100001).fill('line-0') },
    ]) {
      expectCode(
        () => assignDuetLines(raw, request as Parameters<typeof assignDuetLines>[1]),
        'invalid-request',
      )
    }
    expect(readDuetLyrics(raw).lines[0].assignment).toBe('unassigned')
  })

  it('rejects unsupported inherited direct text rather than changing its meaning', () => {
    const raw = wrap('<div ttm:agent="A">outside paragraph<p>A</p></div>')
    expectCode(() => assign(raw, ['line-0'], 'unassigned'), 'unsupported-inheritance')
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
