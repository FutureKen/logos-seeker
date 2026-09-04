/**
 * A tolerant XHTML tokenizer + tiny document tree. The EPUB parts are
 * calibre-produced XHTML — well-formed in practice — but a real parser is not
 * worth a dependency, and a forgiving one survives the occasional stray tag.
 *
 *   const doc = parse(html);
 *   for (const p of findAll(doc, (el) => hasClass(el, "verse"))) …
 *   innerText(p);              // entity-decoded text, tags dropped
 *
 * Nodes: `{type:"el", name, attrs, children}` and `{type:"text", text}`.
 * Text is entity-decoded once, at parse time.
 */

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const NAMED = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ensp: " ", emsp: " ", thinsp: " ", shy: "­",
  ndash: "–", mdash: "—", hellip: "…", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  sbquo: "‚", bdquo: "„", dagger: "†", Dagger: "‡",
  bull: "•", prime: "′", Prime: "″", copy: "©",
  reg: "®", trade: "™", deg: "°", sect: "§",
  para: "¶", laquo: "«", raquo: "»", times: "×",
  divide: "÷", plusmn: "±", frac12: "½", frac14: "¼",
  frac34: "¾", eacute: "é", egrave: "è", agrave: "à",
  ccedil: "ç", uuml: "ü", ouml: "ö", auml: "ä",
  iuml: "ï", ntilde: "ñ", aelig: "æ", oslash: "ø",
  szlig: "ß", Amp: "&",
};

/** Decode the XML/HTML entities that occur in these files (plus numerics). */
export function decodeEntities(s) {
  const str = String(s ?? "");
  if (!str.includes("&")) return str;
  return str.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m;
  });
}

const ATTR_RE = /([:\w-]+)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'>`]+))?/g;

function parseAttrs(src) {
  const attrs = {};
  if (!src) return attrs;
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(src))) {
    let v = m[2] ?? "";
    if (v && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
    attrs[m[1].toLowerCase()] = decodeEntities(v);
  }
  return attrs;
}

/**
 * Stream tokens: `{type:"text", text}`, `{type:"open", name, attrs, selfClose}`,
 * `{type:"close", name}`, `{type:"comment"|"decl", text}`.
 */
export function* tokenize(html) {
  const s = String(html ?? "");
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) {
      yield { type: "text", text: decodeEntities(s.slice(i)) };
      return;
    }
    if (lt > i) yield { type: "text", text: decodeEntities(s.slice(i, lt)) };

    if (s.startsWith("<!--", lt)) {
      const end = s.indexOf("-->", lt + 4);
      const stop = end < 0 ? s.length : end + 3;
      yield { type: "comment", text: s.slice(lt + 4, end < 0 ? s.length : end) };
      i = stop;
      continue;
    }
    if (s.startsWith("<!", lt) || s.startsWith("<?", lt)) {
      const end = s.indexOf(">", lt);
      const stop = end < 0 ? s.length : end + 1;
      yield { type: "decl", text: s.slice(lt, stop) };
      i = stop;
      continue;
    }
    const gt = s.indexOf(">", lt);
    if (gt < 0) {
      yield { type: "text", text: decodeEntities(s.slice(lt)) };
      return;
    }
    let inner = s.slice(lt + 1, gt);
    if (inner.startsWith("/")) {
      yield { type: "close", name: inner.slice(1).trim().toLowerCase() };
      i = gt + 1;
      continue;
    }
    let selfClose = false;
    if (inner.endsWith("/")) {
      selfClose = true;
      inner = inner.slice(0, -1);
    }
    const sp = inner.search(/[\s/]/);
    const name = (sp < 0 ? inner : inner.slice(0, sp)).toLowerCase();
    const attrs = parseAttrs(sp < 0 ? "" : inner.slice(sp));
    yield { type: "open", name, attrs, selfClose: selfClose || VOID.has(name) };
    i = gt + 1;
  }
}

/** Parse a document (or fragment) into a tree rooted at a synthetic element. */
export function parse(html) {
  const root = { type: "el", name: "#root", attrs: {}, children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];

  for (const t of tokenize(html)) {
    if (t.type === "text") {
      if (t.text) top().children.push({ type: "text", text: t.text });
    } else if (t.type === "open") {
      const el = { type: "el", name: t.name, attrs: t.attrs, children: [] };
      top().children.push(el);
      if (!t.selfClose) stack.push(el);
    } else if (t.type === "close") {
      // Pop to the nearest matching ancestor; ignore a close tag that matches
      // nothing (calibre never emits one, but a stray tag must not derail us).
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === t.name) {
          stack.length = i;
          break;
        }
      }
    }
  }
  return root;
}

export const isEl = (n) => n && n.type === "el";
export const attr = (n, name) => (isEl(n) ? (n.attrs[name] ?? null) : null);

export function hasClass(n, cls) {
  const c = attr(n, "class");
  return !!c && c.split(/\s+/).includes(cls);
}

/** Depth-first walk over element nodes. */
export function* walk(node) {
  for (const child of node.children ?? []) {
    if (child.type === "el") {
      yield child;
      yield* walk(child);
    }
  }
}

/** Every element matching `pred`, in document order. */
export function findAll(node, pred) {
  const out = [];
  for (const el of walk(node)) if (pred(el)) out.push(el);
  return out;
}

export function find(node, pred) {
  for (const el of walk(node)) if (pred(el)) return el;
  return null;
}

/** Concatenated text of a subtree; `<br>` becomes "\n". */
export function innerText(node, { br = "\n" } = {}) {
  let out = "";
  const rec = (n) => {
    if (n.type === "text") {
      out += n.text;
      return;
    }
    if (n.type !== "el") return;
    if (n.name === "br") {
      out += br;
      return;
    }
    for (const c of n.children ?? []) rec(c);
  };
  if (node.type === "text") return node.text;
  for (const c of node.children ?? []) rec(c);
  return out;
}

/** The fragment identifier of an `href`, or null. */
export function hrefAnchor(href) {
  if (!href) return null;
  const i = href.indexOf("#");
  return i < 0 ? null : href.slice(i + 1);
}
