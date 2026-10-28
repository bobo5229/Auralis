import { a0 as makeUnexpectedFileContentError, S as UINT16_BE, U as UINT32_BE, aa as FourCcToken, T as UINT8, V as StringType, a7 as BasicParser, X as EndOfStreamError, Z as Uint8ArrayType, ab as fromBuffer, $ as initDebug } from "./resolveLyricsForFile-COlnUOK3.js";
import "node:fs/promises";
import { I as ID3v2Parser } from "./ID3v2Parser-pop5YU2I.js";
import "node:fs";
import "node:path";
import "sharp";
import "pino";
import "./logSanitizer-BxKsoqIP.js";
import "node:crypto";
import "./delimitedValues-CpE_2YHT.js";
import "node:zlib";
import "tty";
import "util";
import "os";
const compressionTypes = {
  NONE: "not compressed	PCM	Apple Computer",
  sowt: "PCM (byte swapped)",
  fl32: "32-bit floating point IEEE 32-bit float",
  fl64: "64-bit floating point IEEE 64-bit float	Apple Computer",
  alaw: "ALaw 2:1	8-bit ITU-T G.711 A-law",
  ulaw: "µLaw 2:1	8-bit ITU-T G.711 µ-law	Apple Computer",
  ULAW: "CCITT G.711 u-law 8-bit ITU-T G.711 µ-law",
  ALAW: "CCITT G.711 A-law 8-bit ITU-T G.711 A-law",
  FL32: "Float 32	IEEE 32-bit float "
};
class AiffContentError extends makeUnexpectedFileContentError("AIFF") {
}
class Common {
  constructor(header, isAifc) {
    this.isAifc = isAifc;
    const minimumChunkSize = isAifc ? 22 : 18;
    if (header.chunkSize < minimumChunkSize)
      throw new AiffContentError(`COMMON CHUNK size should always be at least ${minimumChunkSize}`);
    this.len = header.chunkSize;
  }
  get(buf, off) {
    const shift = UINT16_BE.get(buf, off + 8) - 16398;
    const baseSampleRate = UINT16_BE.get(buf, off + 8 + 2);
    const res = {
      numChannels: UINT16_BE.get(buf, off),
      numSampleFrames: UINT32_BE.get(buf, off + 2),
      sampleSize: UINT16_BE.get(buf, off + 6),
      sampleRate: shift < 0 ? baseSampleRate >> Math.abs(shift) : baseSampleRate << shift
    };
    if (this.isAifc) {
      res.compressionType = FourCcToken.get(buf, off + 18);
      if (this.len > 22) {
        const strLen = UINT8.get(buf, off + 22);
        if (strLen > 0) {
          const padding = (strLen + 1) % 2;
          if (23 + strLen + padding === this.len) {
            res.compressionName = new StringType(strLen, "latin1").get(buf, off + 23);
          } else {
            throw new AiffContentError("Illegal pstring length");
          }
        } else {
          res.compressionName = void 0;
        }
      }
    } else {
      res.compressionName = "PCM";
    }
    return res;
  }
}
const Header = {
  len: 8,
  get: (buf, off) => {
    return {
      // Chunk type ID
      chunkID: FourCcToken.get(buf, off),
      // Chunk size
      chunkSize: Number(BigInt(UINT32_BE.get(buf, off + 4)))
    };
  }
};
const debug = initDebug("music-metadata:parser:aiff");
class AIFFParser extends BasicParser {
  constructor() {
    super(...arguments);
    this.isCompressed = null;
  }
  async parse() {
    const header = await this.tokenizer.readToken(Header);
    if (header.chunkID !== "FORM")
      throw new AiffContentError("Invalid Chunk-ID, expected 'FORM'");
    const type = await this.tokenizer.readToken(FourCcToken);
    switch (type) {
      case "AIFF":
        this.metadata.setFormat("container", type);
        this.isCompressed = false;
        break;
      case "AIFC":
        this.metadata.setFormat("container", "AIFF-C");
        this.isCompressed = true;
        break;
      default:
        throw new AiffContentError(`Unsupported AIFF type: ${type}`);
    }
    this.metadata.setFormat("lossless", !this.isCompressed);
    this.metadata.setAudioOnly();
    try {
      while (!this.tokenizer.fileInfo.size || this.tokenizer.fileInfo.size - this.tokenizer.position >= Header.len) {
        debug(`Reading AIFF chunk at offset=${this.tokenizer.position}`);
        const chunkHeader = await this.tokenizer.readToken(Header);
        const nextChunk = 2 * Math.round(chunkHeader.chunkSize / 2);
        const bytesRead = await this.readData(chunkHeader);
        await this.tokenizer.ignore(nextChunk - bytesRead);
      }
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        debug("End-of-stream");
      } else {
        throw err;
      }
    }
  }
  async readData(header) {
    switch (header.chunkID) {
      case "COMM": {
        if (this.isCompressed === null) {
          throw new AiffContentError("Failed to parse AIFF.COMM chunk when compression type is unknown");
        }
        const common = await this.tokenizer.readToken(new Common(header, this.isCompressed));
        this.metadata.setFormat("bitsPerSample", common.sampleSize);
        this.metadata.setFormat("sampleRate", common.sampleRate);
        this.metadata.setFormat("numberOfChannels", common.numChannels);
        this.metadata.setFormat("numberOfSamples", common.numSampleFrames);
        this.metadata.setFormat("duration", common.numSampleFrames / common.sampleRate);
        if (common.compressionName || common.compressionType) {
          this.metadata.setFormat("codec", common.compressionName ?? compressionTypes[common.compressionType]);
        }
        return header.chunkSize;
      }
      case "ID3 ": {
        const id3_data = await this.tokenizer.readToken(new Uint8ArrayType(header.chunkSize));
        const rst = fromBuffer(id3_data);
        await new ID3v2Parser().parse(this.metadata, rst, this.options);
        return header.chunkSize;
      }
      case "SSND":
        if (this.metadata.format.duration) {
          this.metadata.setFormat("bitrate", 8 * header.chunkSize / this.metadata.format.duration);
        }
        return 0;
      case "NAME":
      // Sample name chunk
      case "AUTH":
      // Author chunk
      case "(c) ":
      // Copyright chunk
      case "ANNO":
        return this.readTextChunk(header);
      default:
        debug(`Ignore chunk id=${header.chunkID}, size=${header.chunkSize}`);
        return 0;
    }
  }
  async readTextChunk(header) {
    const value = await this.tokenizer.readToken(new StringType(header.chunkSize, "ascii"));
    const values = value.split("\0").map((v) => v.trim()).filter((v) => v?.length);
    await Promise.all(values.map((v) => this.metadata.addTag("AIFF", header.chunkID, v)));
    return header.chunkSize;
  }
}
export {
  AIFFParser
};
