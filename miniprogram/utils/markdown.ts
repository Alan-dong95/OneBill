/**
 * 简易 markdown → HTML
 * 覆盖：#~### 标题、**加粗**、短横线/星号列表、换行段落
 * 不做表格/代码块（与后端 prompt / 协议文案约定一致）
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 行内：转义后处理 **加粗** */
function inlineMd(line: string): string {
  return escapeHtml(line).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * 把 markdown 文本转成 mp-html 可渲染的 HTML。
 * 解析失败时降级为转义后的纯文本段落。
 */
export function mdToHtml(src: string): string {
  if (!src) return '';
  try {
    const text = String(src).replace(/\r\n/g, '\n').trim();
    if (!text) return '';

    const lines = text.split('\n');
    const out: string[] = [];
    let inList = false;

    for (const raw of lines) {
      const line = raw.trimEnd();
      const listMatch = line.match(/^\s*[-*·]\s+(.+)$/);
      if (listMatch) {
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push(`<li>${inlineMd(listMatch[1].trim())}</li>`);
        continue;
      }

      if (inList) {
        out.push('</ul>');
        inList = false;
      }

      const trimmed = line.trim();
      if (!trimmed) continue;

      // 协议页等需要 # / ## 标题
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        out.push(`<h${level}>${inlineMd(headingMatch[2].trim())}</h${level}>`);
        continue;
      }

      out.push(`<p>${inlineMd(trimmed)}</p>`);
    }

    if (inList) out.push('</ul>');
    return out.join('') || `<p>${escapeHtml(text)}</p>`;
  } catch (e) {
    return `<p>${escapeHtml(String(src))}</p>`;
  }
}
