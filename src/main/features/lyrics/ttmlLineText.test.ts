import { expect, it } from 'vitest'
import { readDuetDocument } from './duetDocument'
import { readDuetLyrics } from './duetLyrics'
import { plainParagraphText, replaceTtmlLineText } from './ttmlLineText'
import { readTtmlPlayback } from './ttmlPlayback'
import { MAX_TTML_LINE_CHARACTERS } from '@shared/types/lyricsEditor'

const wrap = (body: string) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata"><head><metadata><ttm:agent xml:id="both" type="group"><ttm:name>Both</ttm:name></ttm:agent></metadata></head><body><div>${body}</div></body></tt>`
const request = (source: string, text: string) => ({
  sessionId: 'draft',
  expectedRevision: readDuetLyrics(source).revision,
  lineId: 'line-0',
  text,
})

it('edits escaped text while retaining timing, chorus, IDs, metadata, comments and neighbouring lines', () => {
  const source = wrap(
    '<p xml:id="verse" xml:space="preserve" begin="1s" end="3s" dur="2s" ttm:agent="both">Old<!-- keep --> text</p><p begin="4s" end="5s">Other</p>',
  )
  const value = '新歌词 & <span begin="0s">literal</span>'
  const edited = replaceTtmlLineText(source, request(source, value))
  const document = readDuetDocument(edited)
  const paragraph = document.lines.get('line-0')!
  expect(plainParagraphText(paragraph)).toBe(value)
  expect(paragraph.getAttribute('xml:id')).toBe('verse')
  expect(paragraph.getAttribute('begin')).toBe('1s')
  expect(paragraph.getAttribute('end')).toBe('3s')
  expect(paragraph.getAttribute('dur')).toBe('2s')
  expect(paragraph.getElementsByTagName('span').length).toBe(0)
  expect(edited).toContain('<!-- keep -->')
  expect(document.snapshot.lines[0].assignment).toBe('together')
  expect(document.snapshot.performers[0].name).toBe('Both')
  expect(document.snapshot.lines[1].text).toBe('Other')
  expect(readTtmlPlayback(edited).lines[0]).toMatchObject({
    text: value,
    timeSeconds: 1,
    endTimeSeconds: 3,
  })
})

it('keeps an unchanged source byte-for-byte and supports an empty paragraph without deleting it', () => {
  const source = wrap(
    '<p begin="1s" end="3s" xml:space="preserve"><![CDATA[  Exact & text  ]]></p>',
  )
  expect(replaceTtmlLineText(source, request(source, '  Exact & text  '))).toBe(source)
  const empty = replaceTtmlLineText(source, request(source, ''))
  expect(readDuetLyrics(empty).lines).toHaveLength(1)
  expect(readTtmlPlayback(empty).lines[0]).toMatchObject({
    text: '',
    timeSeconds: 1,
    endTimeSeconds: 3,
  })
  expect(plainParagraphText(readDuetDocument(empty).lines.get('line-0')!)).toBe('')
})

it.each([
  '<span begin="1s" end="2s">Word</span>',
  'Main<span ttm:role="x-translation">翻译</span>',
  'First<br/>Second',
  '<span>Styled</span>',
])('does not flatten structured content: %s', (body) => {
  const source = wrap(`<p begin="1s" end="3s">${body}</p>`)
  expect(plainParagraphText(readDuetDocument(source).lines.get('line-0')!)).toBeNull()
  expect(() => replaceTtmlLineText(source, request(source, 'Replacement'))).toThrow(
    'read-only-line',
  )
})

it.each([
  'Line\nnext',
  'Line\rnext',
  '\u0000',
  '\ud800',
  '\udfff',
  '\ufffe',
  '\u2028',
  'x'.repeat(MAX_TTML_LINE_CHARACTERS + 1),
])('rejects invalid text without returning a replacement (%#)', (value) => {
  const source = wrap('<p begin="1s" end="3s">Old</p>')
  expect(() => replaceTtmlLineText(source, request(source, value))).toThrow('invalid-line-text')
})

it('rejects stale revisions and missing identities', () => {
  const source = wrap('<p begin="1s" end="3s">Old</p>')
  expect(() =>
    replaceTtmlLineText(source, { ...request(source, 'New'), expectedRevision: 'stale' }),
  ).toThrow('stale-revision')
  expect(() =>
    replaceTtmlLineText(source, { ...request(source, 'New'), lineId: 'missing' }),
  ).toThrow('unknown-line')
})
