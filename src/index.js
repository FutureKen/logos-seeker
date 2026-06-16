/**
 * logos-seeker — public package entry point.
 *
 * Bilingual (English / Chinese) Recovery Version scripture search. Import the
 * search engine and the query parser from here:
 *
 *   import { BibleSearch, COL, parseQuery } from "logos-seeker";
 *
 * The verse data ships in the package under `logos-seeker/data/`. In the
 * browser, serve those JSON files statically and point `BibleSearch#load()` at
 * their base path; in Node or a bundler, read/import them and pass the parsed
 * arrays to `BibleSearch#setData()`.
 */

export { BibleSearch, COL } from "./search.js";
export {
  parseQuery,
  parseReference,
  buildAliasIndex,
  hasCJK,
} from "./parseQuery.js";
