import "./chunk-PZ5AY32C.js";

// node_modules/opencc-js/dist/esm-lib/core.js
var Trie = class {
  // 使用 Map 實作 Trie 樹
  // Trie 的每個節點為一個 Map 物件
  // key 為 code point，value 為子節點（也是一個 Map）。
  // 如果 Map 物件有 trie_val 屬性，則該屬性為值字串，代表替換的字詞。
  constructor() {
    this.map = /* @__PURE__ */ new Map();
  }
  /**
   * 將一項資料加入字典樹
   * @param {string} s 要匹配的字串
   * @param {string} v 若匹配成功，則替換為此字串
   */
  addWord(s, v) {
    let { map } = this;
    for (const c of s) {
      const cp = c.codePointAt(0);
      const nextMap = map.get(cp);
      if (nextMap == null) {
        const tmp = /* @__PURE__ */ new Map();
        map.set(cp, tmp);
        map = tmp;
      } else {
        map = nextMap;
      }
    }
    map.trie_val = v;
  }
  /**
     * 讀取字典資料
     * @param {DictLike} d 字典
     */
  loadDict(d) {
    if (typeof d === "string") {
      d = d.split("|");
      for (const line of d) {
        const [l, r] = line.split(" ");
        if (typeof r !== "string") {
          throw new TypeError('Invalid dictionary entry: expected string entries to use "source replacement" format.');
        }
        this.addWord(l, r);
      }
    } else {
      for (const arr of d) {
        if (!Array.isArray(arr) || typeof arr[0] !== "string" || typeof arr[1] !== "string") {
          throw new TypeError(
            "Invalid dictionary entry: expected [source, replacement] pairs. If you are passing locale dictionaries to ConverterFactory, spread them, for example: ConverterFactory(...Locale.from.cn, ...Locale.to.hk)."
          );
        }
        const [l, r] = arr;
        this.addWord(l, r);
      }
    }
  }
  /**
   * 讀取多個字典資料
   * @param {DictLike[]} arr 字典
   */
  loadDictGroup(arr) {
    arr.slice().reverse().forEach((d) => {
      this.loadDict(d);
    });
  }
  matchPrefix(s, i) {
    const n = s.length;
    let t_curr = this.map, k = 0, v;
    for (let j = i; j < n; ) {
      const x = s.codePointAt(j);
      j += x > 65535 ? 2 : 1;
      const t_next = t_curr.get(x);
      if (typeof t_next === "undefined") {
        break;
      }
      t_curr = t_next;
      const v_curr = t_curr.trie_val;
      if (typeof v_curr !== "undefined") {
        k = j;
        v = v_curr;
      }
    }
    if (k > 0) {
      return { end: k, value: v };
    }
    return null;
  }
  segment(s) {
    const n = s.length, segments = [];
    let orig_i = null;
    for (let i = 0; i < n; ) {
      const matched = this.matchPrefix(s, i);
      if (matched) {
        if (orig_i !== null) {
          segments.push(s.slice(orig_i, i));
          orig_i = null;
        }
        segments.push(s.slice(i, matched.end));
        i = matched.end;
      } else {
        if (orig_i === null) {
          orig_i = i;
        }
        i += getUnmatchedLength(s, i);
      }
    }
    if (orig_i !== null) {
      segments.push(s.slice(orig_i, n));
    }
    return segments;
  }
  /**
   * 根據字典樹中的資料轉換字串。
   * @param {string} s 要轉換的字串
   */
  convert(s) {
    const n = s.length, arr = [];
    let orig_i = null;
    for (let i = 0; i < n; ) {
      const matched = this.matchPrefix(s, i);
      if (matched) {
        if (orig_i !== null) {
          arr.push(s.slice(orig_i, i));
          orig_i = null;
        }
        arr.push(matched.value);
        i = matched.end;
      } else {
        if (orig_i === null) {
          orig_i = i;
        }
        i += getUnmatchedLength(s, i);
      }
    }
    if (orig_i !== null) {
      arr.push(s.slice(orig_i, n));
    }
    return arr.join("");
  }
};
function getCodePointLength(s, i) {
  return s.codePointAt(i) > 65535 ? 2 : 1;
}
function getIdeographicDescriptionArity(cp) {
  if (cp >= 12272 && cp <= 12273) return 2;
  if (cp >= 12274 && cp <= 12275) return 3;
  if (cp >= 12276 && cp <= 12287) return 2;
  return 0;
}
function getIdeographicDescriptionSequenceEnd(s, i) {
  const cp = s.codePointAt(i);
  const arity = getIdeographicDescriptionArity(cp);
  if (arity === 0) {
    return 0;
  }
  let end = i + getCodePointLength(s, i);
  for (let n = 0; n < arity; n += 1) {
    if (end >= s.length) {
      return 0;
    }
    const childEnd = getIdeographicDescriptionSequenceEnd(s, end);
    end = childEnd || end + getCodePointLength(s, end);
  }
  return end;
}
function getUnmatchedLength(s, i) {
  const idsEnd = getIdeographicDescriptionSequenceEnd(s, i);
  if (idsEnd > i) {
    return idsEnd - i;
  }
  return getCodePointLength(s, i);
}
function ConverterFactory(...dictGroups) {
  const trieArr = normalizeConverterFactoryDictGroups(dictGroups).map((grp) => {
    const t = new Trie();
    t.loadDictGroup(grp);
    return t;
  });
  function convert(s) {
    return trieArr.reduce((res, t) => {
      return t.convert(res);
    }, s);
  }
  return convert;
}
function isDictPair(entry) {
  return Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "string";
}
function isSerializedDict(dict) {
  return typeof dict === "string" && (dict === "" || dict.includes(" "));
}
function isDictLike(dict) {
  return typeof dict === "string" || Array.isArray(dict) && dict.every(isDictPair);
}
function isDictGroup(dictGroup) {
  return Array.isArray(dictGroup) && dictGroup.every((dict) => {
    return isSerializedDict(dict) || Array.isArray(dict) && dict.every(isDictPair);
  });
}
function isDictGroupCollection(dictGroups) {
  return Array.isArray(dictGroups) && dictGroups.every(isDictGroup);
}
function normalizeConverterFactoryDictGroups(dictGroups) {
  return dictGroups.flatMap((dictGroup) => {
    if (isDictGroupCollection(dictGroup)) {
      return dictGroup;
    }
    if (isDictGroup(dictGroup)) {
      return [dictGroup];
    }
    if (!Array.isArray(dictGroup)) {
      throw new TypeError("Invalid ConverterFactory argument: expected a dictionary group or locale dictionary collection.");
    }
    const groups = [];
    let i = 0;
    while (i < dictGroup.length && isDictGroup(dictGroup[i])) {
      groups.push(dictGroup[i].slice());
      i += 1;
    }
    const appendedDicts = dictGroup.slice(i);
    if (groups.length > 0 && appendedDicts.length > 0 && appendedDicts.every(isDictLike)) {
      groups[groups.length - 1].push(...appendedDicts);
      return groups;
    }
    return [dictGroup];
  });
}
function ConverterFactoryWithSegmentation(segmentationDict, ...dictGroups) {
  let segmentation = null;
  if (segmentationDict) {
    segmentation = new Trie();
    if (Array.isArray(segmentationDict) && segmentationDict.every((dict) => typeof dict === "string")) {
      segmentation.loadDictGroup(segmentationDict);
    } else {
      segmentation.loadDict(segmentationDict);
    }
  }
  const trieArr = dictGroups.map((grp) => {
    const t = new Trie();
    t.loadDictGroup(grp);
    return t;
  });
  return function convert(s) {
    const segments = segmentation ? segmentation.segment(s) : [s];
    return trieArr.reduce((segments2, t) => segments2.map((segment) => t.convert(segment)), segments).join("");
  };
}
function ConverterBuilder(localePreset) {
  function getConfigName(from, to) {
    if (from === "cn") {
      return `s2${to}`;
    }
    if (to === "cn") {
      if (from === "hkp") {
        return "hk2sp";
      }
      return from === "twp" ? "tw2sp" : `${from}2s`;
    }
    return `${from}2${to}`;
  }
  function normalizeDictGroups(dictGroup) {
    if (Array.isArray(dictGroup) && Array.isArray(dictGroup[0])) {
      return dictGroup;
    }
    return [dictGroup];
  }
  return function Converter(options) {
    ["from", "to"].forEach((type) => {
      if (!options || typeof options[type] !== "string") {
        throw new Error("Please provide the `" + type + "` option");
      }
      if (options[type] !== "t" && !localePreset[type][options[type]]) {
        throw new Error("Unknown `" + type + "` locale: " + options[type]);
      }
    });
    if (localePreset.configs) {
      const config = localePreset.configs[getConfigName(options.from, options.to)];
      if (config) {
        const converter = ConverterFactoryWithSegmentation(config.segmentation, ...config.conversionChain);
        if (!config.normalizationChain) {
          return converter;
        }
        const normalize = ConverterFactory(...config.normalizationChain);
        return function convert(s) {
          return converter(normalize(s));
        };
      }
    }
    let dictGroups = [];
    ["from", "to"].forEach((type) => {
      if (options[type] !== "t") {
        dictGroups.push(...normalizeDictGroups(localePreset[type][options[type]]));
      }
    });
    return ConverterFactory.apply(null, dictGroups);
  };
}
function CustomConverter(dict) {
  return ConverterFactory([dict]);
}
function HTMLConverter(converter, rootNode, fromLangTag, toLangTag) {
  function convert() {
    function inner(currentNode, langMatched) {
      if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.classList.contains("ignore-opencc")) return;
      if (currentNode.lang === fromLangTag) {
        langMatched = true;
        currentNode.shouldChangeLang = true;
        currentNode.lang = toLangTag;
      } else if (currentNode.lang && currentNode.lang.length) {
        langMatched = false;
      }
      if (langMatched) {
        if (currentNode.tagName === "SCRIPT") return;
        if (currentNode.tagName === "STYLE") return;
        if (currentNode.tagName === "META" && currentNode.name === "description") {
          if (currentNode.originalContent == null) {
            currentNode.originalContent = currentNode.content;
          }
          currentNode.content = converter(currentNode.originalContent);
        } else if (currentNode.tagName === "META" && currentNode.name === "keywords") {
          if (currentNode.originalContent == null) {
            currentNode.originalContent = currentNode.content;
          }
          currentNode.content = converter(currentNode.originalContent);
        } else if (currentNode.tagName === "IMG") {
          if (currentNode.originalAlt == null) {
            currentNode.originalAlt = currentNode.alt;
          }
          currentNode.alt = converter(currentNode.originalAlt);
        } else if (currentNode.tagName === "INPUT" && currentNode.type === "button") {
          if (currentNode.originalValue == null) {
            currentNode.originalValue = currentNode.value;
          }
          currentNode.value = converter(currentNode.originalValue);
        }
        if (currentNode.nodeType === Node.ELEMENT_NODE) {
          if (currentNode.hasAttribute("placeholder")) {
            if (currentNode.originalPlaceholder == null) {
              currentNode.originalPlaceholder = currentNode.getAttribute("placeholder");
            }
            currentNode.setAttribute("placeholder", converter(currentNode.originalPlaceholder));
          }
          if (currentNode.hasAttribute("aria-label")) {
            if (currentNode.originalAriaLabel == null) {
              currentNode.originalAriaLabel = currentNode.getAttribute("aria-label");
            }
            currentNode.setAttribute("aria-label", converter(currentNode.originalAriaLabel));
          }
        }
      }
      for (const node of currentNode.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && langMatched) {
          if (node.originalString == null) {
            node.originalString = node.nodeValue;
          }
          node.nodeValue = converter(node.originalString);
        } else {
          inner(node, langMatched);
        }
      }
    }
    inner(rootNode, false);
  }
  function restore() {
    function inner(currentNode) {
      if (currentNode.nodeType === Node.ELEMENT_NODE && currentNode.classList.contains("ignore-opencc")) return;
      if (currentNode.shouldChangeLang) {
        currentNode.lang = fromLangTag;
      }
      if (currentNode.originalString !== void 0) {
        currentNode.nodeValue = currentNode.originalString;
      }
      if (currentNode.tagName === "META" && currentNode.name === "description") {
        if (currentNode.originalContent !== void 0) {
          currentNode.content = currentNode.originalContent;
        }
      } else if (currentNode.tagName === "META" && currentNode.name === "keywords") {
        if (currentNode.originalContent !== void 0) {
          currentNode.content = currentNode.originalContent;
        }
      } else if (currentNode.tagName === "IMG") {
        if (currentNode.originalAlt !== void 0) {
          currentNode.alt = currentNode.originalAlt;
        }
      } else if (currentNode.tagName === "INPUT" && currentNode.type === "button") {
        if (currentNode.originalValue !== void 0) {
          currentNode.value = currentNode.originalValue;
        }
      }
      if (currentNode.originalPlaceholder !== void 0) {
        currentNode.setAttribute("placeholder", currentNode.originalPlaceholder);
      }
      if (currentNode.originalAriaLabel !== void 0) {
        currentNode.setAttribute("aria-label", currentNode.originalAriaLabel);
      }
      for (const node of currentNode.childNodes) {
        inner(node);
      }
    }
    inner(rootNode);
  }
  return { convert, restore };
}
export {
  ConverterBuilder,
  ConverterFactory,
  CustomConverter,
  HTMLConverter,
  Trie
};
//# sourceMappingURL=opencc-js_core.js.map
