import { dirname, resolve } from 'node:path';

/**
 * Kiểm relative target trong Markdown. Anchor/external URL không thuộc filesystem check này;
 * semantic/heading drift vẫn là review tay theo docs/14.
 */
export function findBrokenMarkdownLinks(filePath, content, targetExists) {
  const violations = [];
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
    const href = match[1].trim();
    const target = href.split('#', 1)[0];
    if (
      !target ||
      /^[a-z][a-z\d+.-]*:/iu.test(target) ||
      target.startsWith('/')
    ) {
      continue;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      violations.push(`Markdown link encode không hợp lệ: ${href}`);
      continue;
    }
    const absolute = resolve(dirname(filePath), decoded);
    if (!targetExists(absolute)) {
      const line = content.slice(0, match.index).split('\n').length;
      violations.push(`Markdown link hỏng dòng ${line}: ${href}`);
    }
  }
  return violations;
}
