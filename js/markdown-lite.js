/* ==================================================
   TOURING BUDDIEZ — MARKDOWN-LITE PARSER
   A small, dependency-free parser for the simplified
   formatting admins use when writing blog posts:
     ## Heading
     **bold**
     - list item
     [link text](/url)
   Blank lines separate paragraphs. Anything not matching
   one of these patterns is escaped and rendered as plain
   text, so admin-entered content can never inject markup.
   ================================================== */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdownLite(text) {
  let out = escapeHtml(text);
  // Bold: **text**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Links: [text](/url) — only allow relative paths or http(s) links, never javascript: etc.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
    const safe = /^(https?:\/\/|\/)/i.test(url) ? url : '#';
    return `<a href="${escapeHtml(safe)}">${label}</a>`;
  });
  return out;
}

function parseMarkdownLite(source) {
  if (!source) return '';
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const html = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('## ')) {
      return `<h2>${inlineMarkdownLite(trimmed.slice(3).trim())}</h2>`;
    }

    const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
    const isList = lines.length > 0 && lines.every(l => l.startsWith('- '));
    if (isList) {
      const items = lines.map(l => `<li>${inlineMarkdownLite(l.slice(2).trim())}</li>`).join('');
      return `<ul>${items}</ul>`;
    }

    // Regular paragraph — join wrapped lines with a space.
    return `<p>${inlineMarkdownLite(lines.join(' '))}</p>`;
  }).filter(Boolean);

  return html.join('\n');
}

if (typeof window !== 'undefined') window.parseMarkdownLite = parseMarkdownLite;
