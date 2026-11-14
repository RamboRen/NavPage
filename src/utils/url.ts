/** URL 相关纯函数，组件和 hook 共用 */

/** 取域名（去掉 www.），失败返回空串 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** 取协议 + 域名，如 https://github.com */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

/** 用户输入补全协议：juejin.cn -> https://juejin.cn */
export function normalizeUrl(raw: string): string {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text.replace(/^\/+/, '')}`;
}

/** 用搜索引擎模板拼接关键词 */
export function buildSearchUrl(template: string, keyword: string): string {
  return template.replace('{q}', encodeURIComponent(keyword.trim()));
}
