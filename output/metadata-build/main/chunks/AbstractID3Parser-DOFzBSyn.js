import "node:fs/promises";
import { a7 as BasicParser, at as ID3v2Header, X as EndOfStreamError, au as ID3v1Parser, $ as initDebug } from "./resolveLyricsForFile-COlnUOK3.js";
import { I as ID3v2Parser } from "./ID3v2Parser-pop5YU2I.js";
const debug = initDebug("music-metadata:parser:ID3");
class AbstractID3Parser extends BasicParser {
  constructor() {
    super(...arguments);
    this.id3parser = new ID3v2Parser();
  }
  static async startsWithID3v2Header(tokenizer) {
    return (await tokenizer.peekToken(ID3v2Header)).fileIdentifier === "ID3";
  }
  async parse() {
    try {
      await this.parseID3v2();
    } catch (err) {
      if (err instanceof EndOfStreamError) {
        debug("End-of-stream");
      } else {
        throw err;
      }
    }
  }
  finalize() {
    return;
  }
  async parseID3v2() {
    await this.tryReadId3v2Headers();
    debug("End of ID3v2 header, go to MPEG-parser: pos=%s", this.tokenizer.position);
    await this.postId3v2Parse();
    if (this.options.skipPostHeaders && this.metadata.hasAny()) {
      this.finalize();
    } else {
      const id3v1parser = new ID3v1Parser(this.metadata, this.tokenizer, this.options);
      await id3v1parser.parse();
      this.finalize();
    }
  }
  async tryReadId3v2Headers() {
    const id3Header = await this.tokenizer.peekToken(ID3v2Header);
    if (id3Header.fileIdentifier === "ID3") {
      debug("Found ID3v2 header, pos=%s", this.tokenizer.position);
      await this.id3parser.parse(this.metadata, this.tokenizer, this.options);
      return this.tryReadId3v2Headers();
    }
  }
}
export {
  AbstractID3Parser as A
};
