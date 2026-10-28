import { expect, it } from 'vitest'
import { playCountIntensity } from './playCountIntensity'

it.each([
  [0, 0],
  [1, 1],
  [4, 1],
  [5, 2],
  [9, 2],
  [10, 3],
  [19, 3],
  [20, 4],
  [1000, 4],
])('maps %i daily plays to intensity %i', (plays, level) => {
  expect(playCountIntensity(plays)).toBe(level)
})
