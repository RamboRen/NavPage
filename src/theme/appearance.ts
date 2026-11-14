/**
 * 外观（主题色 / 圆角）预设与运行时注入
 * ------------------------------------------------------------------
 * 页面里的「外观」设置会即时写到这里：把 CSS 变量挂到 <html> 上，
 * 组件样式全部读变量，因此换肤不需要改任何 .module.css。
 */
import type { Appearance, RadiusStyle, Theme } from '../types';
import { mix, rotateHue, withAlpha } from '../utils/color';

export const PALETTES: { name: string; color: string }[] = [
  { name: '靛蓝', color: '#4f6bf5' },
  { name: '紫罗兰', color: '#8b5cf6' },
  { name: '玫瑰', color: '#f43f5e' },
  { name: '珊瑚', color: '#fb7185' },
  { name: '琥珀', color: '#f59e0b' },
  { name: '翡翠', color: '#10b981' },
  { name: '天青', color: '#06b6d4' },
  { name: '石墨', color: '#475569' }
];

export const RADIUS_OPTIONS: { id: RadiusStyle; name: string; value: [string, string, string] }[] = [
  { id: 'compact', name: '紧凑', value: ['7px', '10px', '14px'] },
  { id: 'default', name: '标准', value: ['10px', '14px', '20px'] },
  { id: 'round', name: '圆润', value: ['14px', '20px', '28px'] }
];

export const DEFAULT_APPEARANCE: Appearance = { palette: '#4f6bf5', radius: 'default' };

const radiusOf = (style: RadiusStyle) =>
  RADIUS_OPTIONS.find((item) => item.id === style) ?? RADIUS_OPTIONS[1];

/** 把外观写到根元素上；theme 决定深色下的提亮幅度 */
export function applyAppearance(appearance: Appearance, theme: Theme): void {
  const root = document.documentElement;
  const dark = theme === 'dark';
  const base = appearance.palette || DEFAULT_APPEARANCE.palette;

  root.dataset.theme = theme;

  // 主色：深色背景上整体提亮，保证对比度
  const accent = dark ? mix(base, '#ffffff', 0.24) : base;
  const hover = dark ? mix(base, '#ffffff', 0.38) : mix(base, '#000000', 0.14);

  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-hover', hover);
  root.style.setProperty('--accent-soft', withAlpha(base, dark ? 0.18 : 0.1));
  root.style.setProperty(
    '--accent-gradient',
    `linear-gradient(140deg, ${mix(base, '#ffffff', 0.28)}, ${base} 55%, ${mix(base, '#000000', 0.18)})`
  );

  // 背景光晕：主色的三组邻近色，深色下更淡
  root.style.setProperty('--bg-blob-1', withAlpha(base, dark ? 0.26 : 0.24));
  root.style.setProperty('--bg-blob-2', withAlpha(rotateHue(base, 128), dark ? 0.14 : 0.18));
  root.style.setProperty('--bg-blob-3', withAlpha(rotateHue(base, -118), dark ? 0.14 : 0.18));

  // 圆角：三档，所有卡片 / 弹窗 / 面板统一跟随
  const [sm, base_, lg] = radiusOf(appearance.radius).value;
  root.style.setProperty('--radius-sm', sm);
  root.style.setProperty('--radius', base_);
  root.style.setProperty('--radius-lg', lg);
}
