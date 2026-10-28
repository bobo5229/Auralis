import { T as UINT8, a4 as UINT16_LE, a2 as UINT32_LE, V as StringType, a0 as makeUnexpectedFileContentError, ad as INT32_LE, as as trimRightNull, $ as initDebug, al as UINT24_BE, S as UINT16_BE, a3 as UINT64_LE, a5 as getBit, aa as FourCcToken, a7 as BasicParser, X as EndOfStreamError, Z as Uint8ArrayType } from "./resolveLyricsForFile-COlnUOK3.js";
import "node:fs/promises";
import { V as VorbisStream, F as FlacParser, B as BlockHeader, a as BlockType, b as VorbisPictureToken, c as BlockStreamInfo } from "./FlacParser-CFg_YARL.js";
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
import "./AbstractID3Parser-DOFzBSyn.js";
import "./ID3v2Parser-pop5YU2I.js";
class OpusContentError extends makeUnexpectedFileContentError("Opus") {
}
class IdHeader {
  constructor(len) {
    if (len < 19) {
      throw new OpusContentError("ID-header-page 0 should be at least 19 bytes long");
    }
    this.len = len;
  }
  get(buf, off) {
    return {
      magicSignature: new StringType(8, "ascii").get(buf, off + 0),
      version: UINT8.get(buf, off + 8),
      channelCount: UINT8.get(buf, off + 9),
      preSkip: UINT16_LE.get(buf, off + 10),
      inputSampleRate: UINT32_LE.get(buf, off + 12),
      outputGain: UINT16_LE.get(buf, off + 16),
      channelMapping: UINT8.get(buf, off + 18)
    };
  }
}
class OpusStream extends VorbisStream {
  constructor(metadata, options, tokenizer) {
    super(metadata, options);
    this.idHeader = null;
    this.lastPos = -1;
    this.tokenizer = tokenizer;
    this.durationOnLastPage = true;
  }
  /**
   * Parse first Opus Ogg page
   * @param {IPageHeader} header
   * @param {Uint8Array} pageData
   */
  parseFirstPage(_header, pageData) {
    this.metadata.setFormat("codec", "Opus");
    this.idHeader = new IdHeader(pageData.length).get(pageData, 0);
    if (this.idHeader.magicSignature !== "OpusHead")
      throw new OpusContentError("Illegal ogg/Opus magic-signature");
    this.metadata.setFormat("sampleRate", this.idHeader.inputSampleRate);
    this.metadata.setFormat("numberOfChannels", this.idHeader.channelCount);
    this.metadata.setAudioOnly();
  }
  async parseFullPage(pageData) {
    const magicSignature = new StringType(8, "ascii").get(pageData, 0);
    switch (magicSignature) {
      case "OpusTags":
        await this.parseUserCommentList(pageData, 8);
        this.lastPos = this.tokenizer.position - pageData.length;
        break;
    }
  }
  calculateDuration(enfOfStream) {
    if (this.lastPageHeader && (enfOfStream || this.lastPageHeader.headerType.lastPage) && this.metadata.format.sampleRate && this.lastPageHeader.absoluteGranulePosition >= 0) {
      const pos_48bit = this.lastPageHeader.absoluteGranulePosition - this.idHeader.preSkip;
      this.metadata.setFormat("numberOfSamples", pos_48bit);
      this.metadata.setFormat("duration", pos_48bit / 48e3);
      if (this.lastPos !== -1 && this.tokenizer.fileInfo.size && this.metadata.format.duration) {
        const dataSize = this.tokenizer.fileInfo.size - this.lastPos;
        this.metadata.setFormat("bitrate", 8 * dataSize / this.metadata.format.duration);
      }
    }
  }
}
const Header = {
  len: 80,
  get: (buf, off) => {
    return {
      speex: new StringType(8, "ascii").get(buf, off + 0),
      version: trimRightNull(new StringType(20, "ascii").get(buf, off + 8)),
      version_id: INT32_LE.get(buf, off + 28),
      header_size: INT32_LE.get(buf, off + 32),
      rate: INT32_LE.get(buf, off + 36),
      mode: INT32_LE.get(buf, off + 40),
      mode_bitstream_version: INT32_LE.get(buf, off + 44),
      nb_channels: INT32_LE.get(buf, off + 48),
      bitrate: INT32_LE.get(buf, off + 52),
      frame_size: INT32_LE.get(buf, off + 56),
      vbr: INT32_LE.get(buf, off + 60),
      frames_per_packet: INT32_LE.get(buf, off + 64),
      extra_headers: INT32_LE.get(buf, off + 68),
      reserved1: INT32_LE.get(buf, off + 72),
      reserved2: INT32_LE.get(buf, off + 76)
    };
  }
};
const debug$3 = initDebug("music-metadata:parser:ogg:speex");
class SpeexStream extends VorbisStream {
  constructor(metadata, options, _tokenizer) {
    super(metadata, options);
  }
  /**
   * Parse first Speex Ogg page
   * @param {IPageHeader} header
   * @param {Uint8Array} pageData
   */
  parseFirstPage(_header, pageData) {
    debug$3("First Ogg/Speex page");
    const speexHeader = Header.get(pageData, 0);
    this.metadata.setFormat("codec", `Speex ${speexHeader.version}`);
    this.metadata.setFormat("numberOfChannels", speexHeader.nb_channels);
    this.metadata.setFormat("sampleRate", speexHeader.rate);
    if (speexHeader.bitrate !== -1) {
      this.metadata.setFormat("bitrate", speexHeader.bitrate);
    }
    this.metadata.setAudioOnly();
  }
}
const IdentificationHeader = {
  len: 42,
  get: (buf, off) => {
    return {
      id: new StringType(7, "ascii").get(buf, off),
      vmaj: UINT8.get(buf, off + 7),
      vmin: UINT8.get(buf, off + 8),
      vrev: UINT8.get(buf, off + 9),
      vmbw: UINT16_BE.get(buf, off + 10),
      vmbh: UINT16_BE.get(buf, off + 17),
      nombr: UINT24_BE.get(buf, off + 37),
      nqual: UINT8.get(buf, off + 40)
    };
  }
};
const debug$2 = initDebug("music-metadata:parser:ogg:theora");
class TheoraStream {
  constructor(metadata, _options, _tokenizer) {
    this.durationOnLastPage = false;
    this.metadata = metadata;
  }
  /**
   * Vorbis 1 parser
   * @param header Ogg Page Header
   * @param pageData Page data
   */
  async parsePage(header, pageData) {
    if (header.headerType.firstPage) {
      await this.parseFirstPage(header, pageData);
    }
  }
  calculateDuration() {
    debug$2("duration calculation not implemented");
  }
  /**
   * Parse first Theora Ogg page. the initial identification header packet
   */
  async parseFirstPage(_header, pageData) {
    debug$2("First Ogg/Theora page");
    this.metadata.setFormat("codec", "Theora");
    const idHeader = IdentificationHeader.get(pageData, 0);
    this.metadata.setFormat("bitrate", idHeader.nombr);
    this.metadata.setFormat("hasVideo", true);
  }
  flush() {
    return Promise.resolve();
  }
}
const PageHeader = {
  len: 27,
  get: (buf, off) => {
    return {
      capturePattern: new StringType(4, "latin1").get(buf, off),
      version: UINT8.get(buf, off + 4),
      headerType: {
        continued: getBit(buf, off + 5, 0),
        firstPage: getBit(buf, off + 5, 1),
        lastPage: getBit(buf, off + 5, 2)
      },
      // packet_flag: Token.UINT8.get(buf, off + 5),
      absoluteGranulePosition: Number(UINT64_LE.get(buf, off + 6)),
      streamSerialNumber: UINT32_LE.get(buf, off + 14),
      pageSequenceNo: UINT32_LE.get(buf, off + 18),
      pageChecksum: UINT32_LE.get(buf, off + 22),
      page_segments: UINT8.get(buf, off + 26)
    };
  }
};
class SegmentTable {
  static sum(buf, off, len) {
    const dv = new DataView(buf.buffer, 0);
    let s = 0;
    for (let i = off; i < off + len; ++i) {
      s += dv.getUint8(i);
    }
    return s;
  }
  constructor(header) {
    this.len = header.page_segments;
  }
  get(buf, off) {
    return {
      totalPageSize: SegmentTable.sum(buf, off, this.len)
    };
  }
}
const debug$1 = initDebug("music-metadata:parser:ogg:theora");
class FlacStream {
  constructor(metadata, options, tokenizer) {
    this.durationOnLastPage = false;
    this.metadata = metadata;
    this.options = options;
    this.tokenizer = tokenizer;
    this.flacParser = new FlacParser(this.metadata, this.tokenizer, options);
  }
  /**
   * Vorbis 1 parser
   * @param header Ogg Page Header
   * @param pageData Page data
   */
  async parsePage(header, pageData) {
    if (header.headerType.firstPage) {
      await this.parseFirstPage(header, pageData);
    }
  }
  calculateDuration() {
    debug$1("duration calculation not implemented");
  }
  /**
   * Parse first Theora Ogg page. the initial identification header packet
   */
  async parseFirstPage(_header, pageData) {
    debug$1("First Ogg/FLAC page");
    const fourCC = await FourCcToken.get(pageData, 9);
    if (fourCC.toString() !== "fLaC") {
      throw new Error("Invalid FLAC preamble");
    }
    const blockHeader = await BlockHeader.get(pageData, 13);
    await this.parseDataBlock(blockHeader, pageData.subarray(13 + BlockHeader.len));
  }
  async parseDataBlock(blockHeader, pageData) {
    debug$1(`blockHeader type=${blockHeader.type}, length=${blockHeader.length}`);
    switch (blockHeader.type) {
      case BlockType.STREAMINFO: {
        const streamInfo = BlockStreamInfo.get(pageData, 0);
        return this.flacParser.processsStreamInfo(streamInfo);
      }
      case BlockType.PADDING:
        break;
      case BlockType.APPLICATION:
        break;
      case BlockType.SEEKTABLE:
        break;
      case BlockType.VORBIS_COMMENT:
        return this.flacParser.parseComment(pageData);
      case BlockType.PICTURE:
        if (!this.options.skipCovers) {
          const picture = new VorbisPictureToken(pageData.length).get(pageData, 0);
          return this.flacParser.addPictureTag(picture);
        }
        break;
      default:
        this.metadata.addWarning(`Unknown block type: ${blockHeader.type}`);
    }
    return this.tokenizer.ignore(blockHeader.length).then();
  }
  flush() {
    return Promise.resolve();
  }
}
class OggContentError extends makeUnexpectedFileContentError("Ogg") {
}
const debug = initDebug("music-metadata:parser:ogg");
class OggStream {
  constructor(metadata, streamSerial, options) {
    this.pageNumber = 0;
    this.closed = false;
    this.metadata = metadata;
    this.streamSerial = streamSerial;
    this.options = options;
  }
  async parsePage(tokenizer, header) {
    this.pageNumber = header.pageSequenceNo;
    debug("serial=%s page#=%s, Ogg.id=%s", header.streamSerialNumber, header.pageSequenceNo, header.capturePattern);
    const segmentTable = await tokenizer.readToken(new SegmentTable(header));
    debug("totalPageSize=%s", segmentTable.totalPageSize);
    const pageData = await tokenizer.readToken(new Uint8ArrayType(segmentTable.totalPageSize));
    debug("firstPage=%s, lastPage=%s, continued=%s", header.headerType.firstPage, header.headerType.lastPage, header.headerType.continued);
    if (header.headerType.firstPage) {
      this.metadata.setFormat("container", "Ogg");
      const idData = pageData.subarray(0, 7);
      const asciiId = Array.from(idData).filter((b) => b >= 32 && b <= 126).map((b) => String.fromCharCode(b)).join("");
      switch (asciiId) {
        case "vorbis":
          debug(`Set Ogg stream serial ${header.streamSerialNumber}, codec=Vorbis`);
          this.pageConsumer = new VorbisStream(this.metadata, this.options);
          break;
        case "OpusHea":
          debug("Set page consumer to Ogg/Opus");
          this.pageConsumer = new OpusStream(this.metadata, this.options, tokenizer);
          break;
        case "Speex  ":
          debug("Set page consumer to Ogg/Speex");
          this.pageConsumer = new SpeexStream(this.metadata, this.options, tokenizer);
          break;
        case "fishead":
        case "theora":
          debug("Set page consumer to Ogg/Theora");
          this.pageConsumer = new TheoraStream(this.metadata, this.options, tokenizer);
          break;
        case "FLAC":
          debug("Set page consumer to Vorbis");
          this.pageConsumer = new FlacStream(this.metadata, this.options, tokenizer);
          break;
        default:
          throw new OggContentError(`Ogg codec not recognized (id=${asciiId}`);
      }
    }
    if (header.headerType.lastPage) {
      this.closed = true;
    }
    if (this.pageConsumer) {
      await this.pageConsumer.parsePage(header, pageData);
    } else
      throw new Error("pageConsumer should be initialized");
  }
}
class OggParser extends BasicParser {
  constructor() {
    super(...arguments);
    this.streams = /* @__PURE__ */ new Map();
  }
  /**
   * Parse page
   * @returns {Promise<void>}
   */
  async parse() {
    this.streams = /* @__PURE__ */ new Map();
    let enfOfStream = false;
    let header;
    try {
      do {
        header = await this.tokenizer.readToken(PageHeader);
        if (header.capturePattern !== "OggS")
          throw new OggContentError("Invalid Ogg capture pattern");
        let stream = this.streams.get(header.streamSerialNumber);
        if (!stream) {
          stream = new OggStream(this.metadata, header.streamSerialNumber, this.options);
          this.streams.set(header.streamSerialNumber, stream);
        }
        await stream.parsePage(this.tokenizer, header);
        if (stream.pageNumber > 12 && !(this.options.duration && [...this.streams.values()].find((stream2) => stream2.pageConsumer?.durationOnLastPage))) {
          debug("Stop processing Ogg stream");
          break;
        }
      } while (![...this.streams.values()].every((item) => item.closed));
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        debug("Reached end-of-stream");
        enfOfStream = true;
      } else if (err instanceof OggContentError) {
        this.metadata.addWarning(`Corrupt Ogg content at ${this.tokenizer.position}`);
      } else
        throw err;
    }
    for (const stream of this.streams.values()) {
      if (!stream.closed) {
        this.metadata.addWarning(`End-of-stream reached before reaching last page in Ogg stream serial=${stream.streamSerial}`);
        await stream.pageConsumer?.flush();
      }
      stream.pageConsumer?.calculateDuration(enfOfStream);
    }
  }
}
export {
  OggContentError,
  OggParser
};
