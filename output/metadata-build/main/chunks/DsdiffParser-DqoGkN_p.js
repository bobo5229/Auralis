import { a9 as INT64_BE, aa as FourCcToken, a7 as BasicParser, Z as Uint8ArrayType, ab as fromBuffer, a2 as UINT32_LE, S as UINT16_BE, T as UINT8, U as UINT32_BE, V as StringType, a0 as makeUnexpectedFileContentError, $ as initDebug } from "./resolveLyricsForFile-COlnUOK3.js";
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
const ChunkHeader64 = {
  len: 12,
  get: (buf, off) => {
    return {
      // Group-ID
      chunkID: FourCcToken.get(buf, off),
      // Size
      chunkSize: INT64_BE.get(buf, off + 4)
    };
  }
};
const debug = initDebug("music-metadata:parser:aiff");
class DsdiffContentParseError extends makeUnexpectedFileContentError("DSDIFF") {
}
class DsdiffParser extends BasicParser {
  async parse() {
    const header = await this.tokenizer.readToken(ChunkHeader64);
    if (header.chunkID !== "FRM8")
      throw new DsdiffContentParseError("Unexpected chunk-ID");
    this.metadata.setAudioOnly();
    const type = (await this.tokenizer.readToken(FourCcToken)).trim();
    switch (type) {
      case "DSD":
        this.metadata.setFormat("container", `DSDIFF/${type}`);
        this.metadata.setFormat("lossless", true);
        return this.readFmt8Chunks(header.chunkSize - BigInt(FourCcToken.len));
      default:
        throw new DsdiffContentParseError(`Unsupported DSDIFF type: ${type}`);
    }
  }
  async readFmt8Chunks(remainingSize) {
    while (remainingSize >= ChunkHeader64.len) {
      const chunkHeader = await this.tokenizer.readToken(ChunkHeader64);
      debug(`Chunk id=${chunkHeader.chunkID}`);
      await this.readData(chunkHeader);
      remainingSize -= BigInt(ChunkHeader64.len) + chunkHeader.chunkSize;
    }
  }
  async readData(header) {
    debug(`Reading data of chunk[ID=${header.chunkID}, size=${header.chunkSize}]`);
    const p0 = this.tokenizer.position;
    switch (header.chunkID.trim()) {
      case "FVER": {
        const version = await this.tokenizer.readToken(UINT32_LE);
        debug(`DSDIFF version=${version}`);
        break;
      }
      case "PROP": {
        const propType = await this.tokenizer.readToken(FourCcToken);
        if (propType !== "SND ")
          throw new DsdiffContentParseError("Unexpected PROP-chunk ID");
        await this.handleSoundPropertyChunks(header.chunkSize - BigInt(FourCcToken.len));
        break;
      }
      case "ID3": {
        const id3_data = await this.tokenizer.readToken(new Uint8ArrayType(Number(header.chunkSize)));
        const rst = fromBuffer(id3_data);
        await new ID3v2Parser().parse(this.metadata, rst, this.options);
        break;
      }
      case "DSD":
        if (this.metadata.format.numberOfChannels) {
          this.metadata.setFormat("numberOfSamples", Number(header.chunkSize * BigInt(8) / BigInt(this.metadata.format.numberOfChannels)));
        }
        if (this.metadata.format.numberOfSamples && this.metadata.format.sampleRate) {
          this.metadata.setFormat("duration", this.metadata.format.numberOfSamples / this.metadata.format.sampleRate);
        }
        break;
      default:
        debug(`Ignore chunk[ID=${header.chunkID}, size=${header.chunkSize}]`);
        break;
    }
    const remaining = header.chunkSize - BigInt(this.tokenizer.position - p0);
    if (remaining > 0) {
      debug(`After Parsing chunk, remaining ${remaining} bytes`);
      await this.tokenizer.ignore(Number(remaining));
    }
  }
  async handleSoundPropertyChunks(remainingSize) {
    debug(`Parsing sound-property-chunks, remainingSize=${remainingSize}`);
    while (remainingSize > 0) {
      const sndPropHeader = await this.tokenizer.readToken(ChunkHeader64);
      debug(`Sound-property-chunk[ID=${sndPropHeader.chunkID}, size=${sndPropHeader.chunkSize}]`);
      const p0 = this.tokenizer.position;
      switch (sndPropHeader.chunkID.trim()) {
        case "FS": {
          const sampleRate = await this.tokenizer.readToken(UINT32_BE);
          this.metadata.setFormat("sampleRate", sampleRate);
          break;
        }
        case "CHNL": {
          const numChannels = await this.tokenizer.readToken(UINT16_BE);
          this.metadata.setFormat("numberOfChannels", numChannels);
          await this.handleChannelChunks(sndPropHeader.chunkSize - BigInt(UINT16_BE.len));
          break;
        }
        case "CMPR": {
          const compressionIdCode = (await this.tokenizer.readToken(FourCcToken)).trim();
          const count = await this.tokenizer.readToken(UINT8);
          const compressionName = await this.tokenizer.readToken(new StringType(count, "ascii"));
          if (compressionIdCode === "DSD") {
            this.metadata.setFormat("lossless", true);
            this.metadata.setFormat("bitsPerSample", 1);
          }
          this.metadata.setFormat("codec", `${compressionIdCode} (${compressionName})`);
          break;
        }
        case "ABSS": {
          const hours = await this.tokenizer.readToken(UINT16_BE);
          const minutes = await this.tokenizer.readToken(UINT8);
          const seconds = await this.tokenizer.readToken(UINT8);
          const samples = await this.tokenizer.readToken(UINT32_BE);
          debug(`ABSS ${hours}:${minutes}:${seconds}.${samples}`);
          break;
        }
        case "LSCO": {
          const lsConfig = await this.tokenizer.readToken(UINT16_BE);
          debug(`LSCO lsConfig=${lsConfig}`);
          break;
        }
        default:
          debug(`Unknown sound-property-chunk[ID=${sndPropHeader.chunkID}, size=${sndPropHeader.chunkSize}]`);
          await this.tokenizer.ignore(Number(sndPropHeader.chunkSize));
      }
      const remaining = sndPropHeader.chunkSize - BigInt(this.tokenizer.position - p0);
      if (remaining > 0) {
        debug(`After Parsing sound-property-chunk ${sndPropHeader.chunkSize}, remaining ${remaining} bytes`);
        await this.tokenizer.ignore(Number(remaining));
      }
      remainingSize -= BigInt(ChunkHeader64.len) + sndPropHeader.chunkSize;
      debug(`Parsing sound-property-chunks, remainingSize=${remainingSize}`);
    }
    if (this.metadata.format.lossless && this.metadata.format.sampleRate && this.metadata.format.numberOfChannels && this.metadata.format.bitsPerSample) {
      const bitrate = this.metadata.format.sampleRate * this.metadata.format.numberOfChannels * this.metadata.format.bitsPerSample;
      this.metadata.setFormat("bitrate", bitrate);
    }
  }
  async handleChannelChunks(remainingSize) {
    debug(`Parsing channel-chunks, remainingSize=${remainingSize}`);
    const channels = [];
    while (remainingSize >= FourCcToken.len) {
      const channelId = await this.tokenizer.readToken(FourCcToken);
      debug(`Channel[ID=${channelId}]`);
      channels.push(channelId);
      remainingSize -= BigInt(FourCcToken.len);
    }
    debug(`Channels: ${channels.join(", ")}`);
    return channels;
  }
}
export {
  DsdiffContentParseError,
  DsdiffParser
};
