/** 全局类型定义 */

export type Theme = 'light' | 'dark';

/** 圆角风格：紧凑 / 标准 / 圆润 */
export type RadiusStyle = 'compact' | 'default' | 'round';

/** 分类（数据库记录） */
export interface CategoryRecord {
  id: string;
  name: string;
  icon: string;
  position: number;
}

/** 站点（数据库记录） */
export interface SiteRecord {
  id: number;
  name: string;
  url: string;
  desc: string;
  categoryId: string;
  /** 图标底色，缺省时按名称生成色相 */
  color?: string;
  /** 自定义图标地址，缺省时自动抓取 favicon */
  icon?: string;
  /** 出厂推荐站点，用于「恢复默认收藏」 */
  hot: boolean;
  position: number;
}

/** 运行期站点：附加分类名，便于筛选 */
export interface SiteItem extends SiteRecord {
  categoryName: string;
}

/** 搜索引擎，url 中的 {q} 会被替换为关键词 */
export interface SearchEngine {
  id: string;
  name: string;
  url: string;
  position: number;
}

/** 外观配置 */
export interface Appearance {
  /** 主题色 #rrggbb */
  palette: string;
  radius: RadiusStyle;
}

/** 用户偏好 */
export interface Preferences extends Appearance {
  engine: string;
  theme: Theme;
  seeded?: string;
}

/** 首屏接口返回的完整数据 */
export interface BootstrapPayload {
  categories: CategoryRecord[];
  sites: SiteRecord[];
  engines: SearchEngine[];
  pins: string[];
  preferences: Preferences;
}

/** 站点新增 / 修改的请求体 */
export interface SiteInput {
  name: string;
  url: string;
  desc: string;
  categoryId: string;
  color?: string;
  icon?: string;
  /** 仅新增时生效：是否一并加入「常用」 */
  hot?: boolean;
}

export interface CategoryInput {
  name: string;
  icon: string;
}

export interface EngineInput {
  name: string;
  url: string;
}

/** 分类视图（含筛选结果） */
export interface SectionView {
  id: string;
  name: string;
  icon: string;
  items: SiteItem[];
  total: number;
}
