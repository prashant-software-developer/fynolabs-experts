// A small, safe Markdown renderer for job descriptions on the public site. Everything is escaped
// first; only this subset becomes HTML: # / ## / ### headings, paragraphs, "-" / "*" and "1." lists,
// **bold**, *italic*, `code`, and [links](https://...) (http, https and mailto only).

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function inline(raw: string): string {
  let s = escapeHtml(raw);
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(`<code>${c}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
    const h = href.replace(/&amp;/g, "&");
    if (!/^(https?:\/\/|mailto:)/i.test(h)) return text;
    return `<a href="${escapeHtml(h)}" rel="nofollow noopener" target="_blank">${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
  return s;
}

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.kind}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.kind}>`);
    list = null;
  };
  for (const line of lines) {
    const l = line.trim();
    if (!l) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length + 1; // # -> h2 (the page title is the h1)
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    const ul = /^[-*•]\s+(.*)$/.exec(l);
    const ol = /^\d+[.)]\s+(.*)$/.exec(l);
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (list && list.kind !== kind) flushList();
      if (!list) list = { kind, items: [] };
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flushList();
    para.push(l);
  }
  flushPara();
  flushList();
  return out.join("\n");
}

/** Plain text (for meta descriptions): Markdown marks removed, whitespace collapsed. */
export function markdownToText(md: string | null | undefined, max = 300): string {
  if (!md) return "";
  const s = md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*`>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}
