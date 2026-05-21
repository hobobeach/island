const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

// Matches http(s)://… URLs. The trailing-punctuation strip below catches the
// common case of a URL ending a sentence (period, comma, parens).
const URL_RE = /https?:\/\/[^\s<]+[^\s<.,;:!?)\]]/g;

function linkify(escapedHtml: string): string {
  return escapedHtml.replace(URL_RE, (match) => {
    return `<a href="${match}" rel="noopener noreferrer" target="_blank">${match}</a>`;
  });
}

/**
 * Renders user-supplied plain text as safe HTML:
 *   1. HTML-escapes every character (XSS defense).
 *   2. Splits on blank lines → `<p>` blocks.
 *   3. Single newlines inside a paragraph become `<br>`.
 *   4. Auto-links http(s) URLs.
 *
 * Output is trusted and must be rendered with triple-brace `{{{bodyHtml}}}`.
 */
export function formatBody(plainText: string): string {
  const trimmed = plainText.replace(/\r\n/g, '\n').trim();
  if (!trimmed) return '';

  const paragraphs = trimmed.split(/\n\s*\n/);
  return paragraphs
    .map((para) => {
      const escaped = escapeHtml(para).replace(/\n/g, '<br>');
      return `<p>${linkify(escaped)}</p>`;
    })
    .join('');
}

/**
 * Extract a display domain from a URL, e.g. "https://news.ycombinator.com/x?y" → "news.ycombinator.com".
 * Returns null for unparseable input.
 */
export function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
