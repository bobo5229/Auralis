import { expect, it } from 'vitest'
import { formatTtmlEditorTime, parseTtmlEditorTime } from './ttmlTimeEditing'

it('retains milliseconds and accepts minute or hour clock input', () => {
  expect(formatTtmlEditorTime(61.125)).toBe('01:01.125')
  expect(parseTtmlEditorTime('01:01.125')).toBe(61125)
  expect(parseTtmlEditorTime('01:02:03.4')).toBe(3723400)
  expect(parseTtmlEditorTime('00:00')).toBe(0)
  expect(parseTtmlEditorTime('120:00.001')).toBe(7200001)
})

it.each(['-00:01', '00:60', '01:60:00', '00:01.0001', '', 'NaN', '1s', '999999999999999999:00'])(
  'rejects invalid time %s',
  (input) => {
    expect(parseTtmlEditorTime(input)).toBeNull()
  },
)
