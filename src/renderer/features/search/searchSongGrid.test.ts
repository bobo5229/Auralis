import { expect, it } from 'vitest'
import { searchSongGrid } from './searchSongGrid'

it('adapts to narrow, medium and wide content panes', () => {
  expect(searchSongGrid(300, 700).columns).toBe(1)
  expect(searchSongGrid(620, 700).columns).toBe(2)
  expect(searchSongGrid(1000, 700).columns).toBe(3)
})
it('uses complete rows for previews and progressive disclosure', () => {
  for (const width of [260, 360, 720, 1000, 1600]) {
    const grid = searchSongGrid(width, 800)
    expect(grid.previewLimit % grid.columns).toBe(0)
    expect(grid.pageSize % grid.columns).toBe(0)
    expect(grid.previewLimit).toBeLessThanOrEqual(grid.columns * 2)
    expect(grid.pageSize).toBeGreaterThan(grid.previewLimit)
  }
})
it('shows fewer initial rows when the available height shrinks', () => {
  const short = searchSongGrid(720, 250)
  const tall = searchSongGrid(720, 1000)
  expect(short.columns).toBe(tall.columns)
  expect(short.previewLimit).toBeLessThan(tall.previewLimit)
  expect(short.pageSize).toBeLessThan(tall.pageSize)
})
