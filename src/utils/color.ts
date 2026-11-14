/** 颜色工具：品牌色生成、前景色自适应、主题色派生 */

export type Rgb = [number, number, number];

/** 由字符串生成稳定色相（0-360） */
export function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360;
  }
  return hash;
}

/** 没有指定 color 时，按名称生成一个稳定的品牌色 */
export function brandColor(name: string, color?: string): string {
  return color || `hsl(${hashHue(name)} 62% 46%)`;
}

/** 根据底色亮度决定文字用黑还是白，保证图标上的首字母始终可读 */
export function readableText(color: string): string {
  const rgb = parseHex(color);
  if (!rgb) return '#ffffff';
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.68 ? '#16202f' : '#ffffff';
}

/* ---------------- 主题色派生 ---------------- */

/** 解析 #rrggbb / #rgb，失败返回 null */
export function parseHex(hex: string): Rgb | null {
  const text = String(hex || '').trim().replace('#', '');
  const full = text.length === 3 ? text.replace(/(.)/g, '$1$1') : text;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16)
  ];
}

export function toHex([r, g, b]: Rgb): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

/** 线性混合：t=0 返回 a，t=1 返回 b */
export function mix(a: string, b: string, t: number): string {
  const from = parseHex(a);
  const to = parseHex(b);
  if (!from || !to) return a;
  return toHex([
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
    from[2] + (to[2] - from[2]) * t
  ]);
}

/** 转成 rgba(...) 字符串 */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** 色相旋转，用于派生背景光晕的邻近色 */
export function rotateHue(hex: string, degree: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;

  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;

  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  const hue = (((h * 360 + degree) % 360) + 360) % 360;
  return hslToHex(hue, s, l);
}

export function hslToHex(hue: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;

  const table: Record<number, Rgb> = {
    0: [c, x, 0],
    1: [x, c, 0],
    2: [0, c, x],
    3: [0, x, c],
    4: [x, 0, c],
    5: [c, 0, x]
  };
  const [r, g, b] = table[Math.floor(hp) % 6] ?? [c, x, 0];
  return toHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}
