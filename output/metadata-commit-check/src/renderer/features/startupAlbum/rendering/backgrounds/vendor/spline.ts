/*!
 * Adapted from georgedoescode/generative-utils src/spline.js
 * https://github.com/georgedoescode/generative-utils/blob/c26bbcfaecefd4f8302326c71fd18bfd8f413866/src/spline.js
 * TypeScript point tuples and SVG-path output only; callback support omitted.
 *
 * MIT License
 * Copyright (c) 2021 George Francis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export type Point = [number, number]

export function spline(input: Point[], tension = 1, close = false): string {
  const points = [...input]
  if (close) {
    points.unshift(input[input.length - 2], input[input.length - 1])
    points.push(input[0], input[1])
  }
  const flat = points.flat()
  const last = flat.length - 4
  const start = close ? 2 : 0
  let path = `M${flat[start]},${flat[start + 1]}`
  for (let i = start; i < (close ? last : flat.length - 2); i += 2) {
    const x0 = i ? flat[i - 2] : flat[0]
    const y0 = i ? flat[i - 1] : flat[1]
    const x1 = flat[i],
      y1 = flat[i + 1]
    const x2 = flat[i + 2],
      y2 = flat[i + 3]
    const x3 = i !== last ? flat[i + 4] : x2
    const y3 = i !== last ? flat[i + 5] : y2
    path += `C${x1 + ((x2 - x0) / 6) * tension},${y1 + ((y2 - y0) / 6) * tension},${x2 - ((x3 - x1) / 6) * tension},${y2 - ((y3 - y1) / 6) * tension},${x2},${y2}`
  }
  return path
}
