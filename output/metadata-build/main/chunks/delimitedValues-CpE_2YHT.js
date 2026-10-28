function scanFileFingerprint(file) {
  const { size, mtimeMs, ctimeMs, dev, ino } = file;
  return { size, mtimeMs, ctimeMs, dev, ino };
}
function hasSameScanFileFingerprint(file, expected) {
  return file.size === expected.size && file.mtimeMs === expected.mtimeMs && file.ctimeMs === expected.ctimeMs && file.dev === expected.dev && file.ino === expected.ino;
}
function encodeScanFileFingerprint(file) {
  if (!file) return null;
  const values = [file.size, file.mtimeMs, file.ctimeMs, file.dev, file.ino];
  return values.every((value) => Number.isFinite(value)) ? JSON.stringify(values) : null;
}
function decodeScanFileFingerprint(value) {
  if (!value) return null;
  try {
    const values = JSON.parse(value);
    if (!Array.isArray(values) || values.length !== 5 || !values.every((v) => typeof v === "number" && Number.isFinite(v)))
      return null;
    const [size, mtimeMs, ctimeMs, dev, ino] = values;
    return { size, mtimeMs, ctimeMs, dev, ino };
  } catch {
    return null;
  }
}
function splitDelimitedValues(value) {
  if (!value) return [];
  return value.split("; ").map((part) => part.trim()).filter(Boolean);
}
function normalizeDelimitedValue(value) {
  return value.trim().toLocaleLowerCase();
}
function joinDelimitedValues(values) {
  const cleaned = values.map((val) => val?.trim()).filter((val) => Boolean(val));
  return cleaned.length > 0 ? cleaned.join("; ") : null;
}
function cleanDelimitedValues(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const raw of values) {
    for (const part of splitDelimitedValues(raw)) {
      const key = normalizeDelimitedValue(part);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(part);
    }
  }
  return result;
}
function canonicalizeDelimitedValues(value) {
  return joinDelimitedValues(cleanDelimitedValues([value]));
}
export {
  splitDelimitedValues as a,
  cleanDelimitedValues as b,
  canonicalizeDelimitedValues as c,
  decodeScanFileFingerprint as d,
  encodeScanFileFingerprint as e,
  hasSameScanFileFingerprint as h,
  joinDelimitedValues as j,
  normalizeDelimitedValue as n,
  scanFileFingerprint as s
};
