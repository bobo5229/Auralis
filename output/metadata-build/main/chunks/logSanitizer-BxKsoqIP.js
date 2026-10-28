const MAX_NAME_LENGTH = 120;
const MAX_CODE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 1024;
const MAX_STACK_LENGTH = 6e3;
const WINDOWS_PATH_PATTERN = /(?:file:\/{3})?[a-z]:[\\/][^)\]}>,;"'\r\n]+/gi;
const UNC_PATH_PATTERN = /\\\\[^\\/\r\n]+[\\/][^)\]}>,;"'\r\n]+/g;
const COMMON_POSIX_PATH_PATTERN = /(?:file:\/{2})?\/(?:Users|home|private|tmp|var|opt|workspace)\/[^)\]}>,;"'\r\n]+/g;
const URL_PATTERN = /[a-z][a-z0-9+.-]*:\/\/[^\s)\]}>,;"']+/gi;
function truncate(value, maximumLength) {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, maximumLength - 1)}…`;
}
function sanitizeDiagnosticText(value, maximumLength) {
  const sanitized = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(URL_PATTERN, "<redacted-url>").replace(WINDOWS_PATH_PATTERN, "<redacted-path>").replace(UNC_PATH_PATTERN, "<redacted-path>").replace(COMMON_POSIX_PATH_PATTERN, "<redacted-path>");
  return truncate(sanitized, maximumLength);
}
function readStringProperty(value, key, maximumLength) {
  try {
    const property = Reflect.get(value, key);
    if (typeof property === "string" && property.length > 0) {
      return sanitizeDiagnosticText(property, maximumLength);
    }
    if (typeof property === "number" || typeof property === "bigint") {
      return truncate(String(property), maximumLength);
    }
  } catch {
  }
  return void 0;
}
function normalizeDiagnosticError(value) {
  if (typeof value === "string") {
    return {
      name: "Error",
      message: sanitizeDiagnosticText(value, MAX_MESSAGE_LENGTH)
    };
  }
  if (value === null || value === void 0) {
    return {
      name: "Error",
      message: String(value)
    };
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return {
      name: "Error",
      message: truncate(String(value), MAX_MESSAGE_LENGTH)
    };
  }
  const name = readStringProperty(value, "name", MAX_NAME_LENGTH) ?? "Error";
  const message = readStringProperty(value, "message", MAX_MESSAGE_LENGTH) ?? "Unknown object rejection";
  const code = readStringProperty(value, "code", MAX_CODE_LENGTH);
  const stack = readStringProperty(value, "stack", MAX_STACK_LENGTH);
  return {
    name,
    message,
    ...code ? { code } : {},
    ...stack ? { stack } : {}
  };
}
const MAX_LOG_STRING_LENGTH = 8192;
const MAX_COLLECTION_ITEMS = 128;
const MAX_OBJECT_DEPTH = 12;
const REDACTED_VALUE = "<redacted>";
const sensitiveKeyPattern = /(?:^|[_-])(authorization|cookie|credential|password|passwd|secret|session|token|api[_-]?key)(?:$|[_-])/i;
function isSensitiveKey(key) {
  const compactKey = key.replace(/[_-]/g, "").toLowerCase();
  return sensitiveKeyPattern.test(key) || /^(authorization|cookie|credentials?|password|passwd|secret|sessionid)$/.test(compactKey) || compactKey.endsWith("token") || compactKey.endsWith("apikey");
}
function sanitizeInternal(value, depth, seen) {
  if (typeof value === "string") {
    return sanitizeDiagnosticText(value, MAX_LOG_STRING_LENGTH);
  }
  if (value === null || value === void 0 || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "symbol" || typeof value === "function") return void 0;
  if (value instanceof Error) return normalizeDiagnosticError(value);
  if (depth >= MAX_OBJECT_DEPTH) return "<truncated-depth>";
  if (seen.has(value)) return "<circular>";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitizeInternal(item, depth + 1, seen));
      if (value.length > MAX_COLLECTION_ITEMS) items.push("<truncated-items>");
      return items;
    }
    const output = {};
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const entries = Object.entries(descriptors).slice(0, MAX_COLLECTION_ITEMS);
    for (const [key, descriptor] of entries) {
      if (!("value" in descriptor)) continue;
      output[key] = isSensitiveKey(key) ? REDACTED_VALUE : sanitizeInternal(descriptor.value, depth + 1, seen);
    }
    if (Object.keys(descriptors).length > MAX_COLLECTION_ITEMS) {
      output.truncatedFields = true;
    }
    return output;
  } catch {
    return "<unavailable>";
  } finally {
    seen.delete(value);
  }
}
function sanitizeLogValue(value) {
  return sanitizeInternal(value, 0, /* @__PURE__ */ new WeakSet());
}
function sanitizeSerializedLogLine(value, maximumLength = 65536) {
  if (value.length <= maximumLength * 2) {
    try {
      return sanitizeDiagnosticText(
        JSON.stringify(sanitizeLogValue(JSON.parse(value))),
        maximumLength
      );
    } catch {
    }
  }
  return sanitizeDiagnosticText(value, maximumLength);
}
export {
  sanitizeDiagnosticText as a,
  sanitizeLogValue as b,
  normalizeDiagnosticError as n,
  sanitizeSerializedLogLine as s
};
