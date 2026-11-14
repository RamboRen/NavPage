/**
 * 站点数据源
 * ------------------------------------------------------------------
 * 想增删网站，只需要改这个文件，不需要动其它代码。
 * 字段说明：
 *   name  - 站点名称
 *   url   - 站点地址（必须带协议）
 *   desc  - 一句话说明，鼠标悬停时显示
 *   color - 图标底色（图标加载失败时用首字母色块，仍然好看）
 *   hot   - 可选，标记为常用站点，首次访问会出现在顶部「常用」区
 */
const SITE_DATA = [
  {
    id: 'search',
    name: '搜索引擎',
    icon: '🔍',
    sites: [
      { name: '百度', url: 'https://www.baidu.com', desc: '中文搜索，覆盖面最广', color: '#2932e1' },
      { name: '必应', url: 'https://cn.bing.com', desc: '广告相对克制，结果干净', color: '#008373', hot: true },
      { name: 'Google', url: 'https://www.google.com', desc: '技术问题首选', color: '#4285f4' },
      { name: '知乎', url: 'https://www.zhihu.com/search?q=', desc: '中文经验类问题', color: '#0084ff', hot: true },
      { name: '搜狗', url: 'https://www.sogou.com', desc: '可搜微信文章', color: '#fb6022' },
      { name: '夸克', url: 'https://quark.sm.cn', desc: '移动端搜索体验好', color: '#4d6bfe' },
      { name: '秘塔 AI 搜索', url: 'https://metaso.cn', desc: '无广告，直接给答案', color: '#1a1a2e', hot: true },
      { name: 'Yandex', url: 'https://yandex.com', desc: '俄语区与图片搜索', color: '#fc3f1d' }
    ]
  },
  {
    id: 'dev',
    name: '开发工具',
    icon: '💻',
    sites: [
      { name: 'GitHub', url: 'https://github.com', desc: '全球最大代码托管平台', color: '#24292f', hot: true },
      { name: 'Gitee', url: 'https://gitee.com', desc: '国内代码托管，访问快', color: '#c71d23' },
      { name: 'MDN', url: 'https://developer.mozilla.org/zh-CN/', desc: 'Web 开发权威文档', color: '#000000', hot: true },
      { name: 'Stack Overflow', url: 'https://stackoverflow.com', desc: '报错信息的最佳去处', color: '#f48024' },
      { name: '掘金', url: 'https://juejin.cn', desc: '国内前端技术社区', color: '#1e80ff' },
      { name: 'npm', url: 'https://www.npmjs.com', desc: 'JS 包管理与检索', color: '#cb3837' },
      { name: 'Can I use', url: 'https://caniuse.com', desc: '浏览器兼容性查询', color: '#1f7f3f' },
      { name: 'Docker Hub', url: 'https://hub.docker.com', desc: '镜像仓库', color: '#2496ed' },
      { name: 'Regex101', url: 'https://regex101.com', desc: '正则在线调试', color: '#2d3949' },
      { name: 'Crunes', url: 'https://crunes.com', desc: 'JSON 格式化等小工具', color: '#0f766e' }
    ]
  },
  {
    id: 'ai',
    name: 'AI 工具',
    icon: '🤖',
    sites: [
      { name: 'Claude', url: 'https://claude.ai', desc: '长文本与代码理解强', color: '#d97757', hot: true },
      { name: 'ChatGPT', url: 'https://chatgpt.com', desc: '通用对话与推理', color: '#10a37f' },
      { name: 'DeepSeek', url: 'https://chat.deepseek.com', desc: '国产模型，推理与代码', color: '#4d6bfe', hot: true },
      { name: 'Kimi', url: 'https://kimi.moonshot.cn', desc: '超长文档阅读', color: '#1f1f1f' },
      { name: '通义千问', url: 'https://tongyi.aliyun.com', desc: '阿里系全能助手', color: '#615ced' },
      { name: '豆包', url: 'https://www.doubao.com', desc: '字节系对话助手', color: '#1664ff' },
      { name: '即梦 AI', url: 'https://jimeng.jianying.com', desc: '文生图 / 文生视频', color: '#0b0b0f' },
      { name: 'Hugging Face', url: 'https://huggingface.co', desc: '开源模型与数据集', color: '#ffd21e' }
    ]
  },
  {
    id: 'design',
    name: '设计灵感',
    icon: '🎨',
    sites: [
      { name: 'Figma', url: 'https://www.figma.com', desc: '在线协作设计', color: '#f24e1e', hot: true },
      { name: 'Dribbble', url: 'https://dribbble.com', desc: 'UI 灵感瀑布流', color: '#ea4c89' },
      { name: 'Behance', url: 'https://www.behance.net', desc: '完整项目案例', color: '#1769ff' },
      { name: '站酷', url: 'https://www.zcool.com.cn', desc: '国内设计师社区', color: '#e60012' },
      { name: 'Iconfont', url: 'https://www.iconfont.cn', desc: '阿里图标库', color: '#ff6a00' },
      { name: 'unDraw', url: 'https://undraw.co/illustrations', desc: '免费可商用插画', color: '#6c63ff' },
      { name: 'Unsplash', url: 'https://unsplash.com', desc: '高清免费图片', color: '#111111' },
      { name: 'Coolors', url: 'https://coolors.co', desc: '配色方案生成', color: '#0066ff' }
    ]
  },
  {
    id: 'learn',
    name: '学习成长',
    icon: '📚',
    sites: [
      { name: 'B 站', url: 'https://www.bilibili.com', desc: '教程与公开课聚集地', color: '#fb7299', hot: true },
      { name: 'LeetCode', url: 'https://leetcode.cn', desc: '算法刷题', color: '#ffa116' },
      { name: '菜鸟教程', url: 'https://www.runoob.com', desc: '入门速查', color: '#3c8dbc' },
      { name: '阮一峰的网络日志', url: 'https://www.ruanyifeng.com/blog/', desc: '技术随笔与周刊', color: '#2c3e50' },
      { name: 'Coursera', url: 'https://www.coursera.org', desc: '海外名校课程', color: '#0056d2' },
      { name: '中国大学 MOOC', url: 'https://www.icourse163.org', desc: '国内高校课程', color: '#0e8f5e' },
      { name: 'InfoQ', url: 'https://www.infoq.cn', desc: '架构与工程实践', color: '#0b7fab' },
      { name: 'Kaggle', url: 'https://www.kaggle.com', desc: '数据科学实战', color: '#20beff' }
    ]
  },
  {
    id: 'office',
    name: '效率工具',
    icon: '⚡',
    sites: [
      { name: '语雀', url: 'https://www.yuque.com', desc: '知识库与文档', color: '#00b96b', hot: true },
      { name: 'Notion', url: 'https://www.notion.so', desc: '全能笔记与项目管理', color: '#191919' },
      { name: '飞书', url: 'https://www.feishu.cn', desc: '协作办公套件', color: '#3370ff' },
      { name: '腾讯文档', url: 'https://docs.qq.com', desc: '在线表格与文档', color: '#2b7cf0' },
      { name: 'ProcessOn', url: 'https://www.processon.com', desc: '流程图 / 思维导图', color: '#2b6aef' },
      { name: '草料二维码', url: 'https://cli.im', desc: '二维码生成管理', color: '#3c9cff' },
      { name: 'TinyPNG', url: 'https://tinypng.com', desc: '图片无损压缩', color: '#0f9d58' },
      { name: 'PDF24', url: 'https://tools.pdf24.org/zh/', desc: 'PDF 工具箱', color: '#f5a623' }
    ]
  },
  {
    id: 'info',
    name: '资讯社区',
    icon: '📰',
    sites: [
      { name: 'V2EX', url: 'https://www.v2ex.com', desc: '程序员聚集地', color: '#1a1a1a' },
      { name: '少数派', url: 'https://sspai.com', desc: '效率与数字生活', color: '#d7090f' },
      { name: '36 氪', url: 'https://36kr.com', desc: '科技商业资讯', color: '#0066ff' },
      { name: 'Hacker News', url: 'https://news.ycombinator.com', desc: '海外技术热点', color: '#ff6600' },
      { name: '微博', url: 'https://weibo.com', desc: '实时热点', color: '#e6162d' },
      { name: 'Reddit', url: 'https://www.reddit.com', desc: '兴趣版块讨论', color: '#ff4500' },
      { name: '今日热榜', url: 'https://tophub.today', desc: '各平台热榜聚合', color: '#ff5722' },
      { name: '小黑盒', url: 'https://www.xiaoheihe.cn', desc: '游戏资讯社区', color: '#22272e' }
    ]
  },
  {
    id: 'life',
    name: '生活购物',
    icon: '🛍️',
    sites: [
      { name: '淘宝', url: 'https://www.taobao.com', desc: '综合电商', color: '#ff5000', hot: true },
      { name: '京东', url: 'https://www.jd.com', desc: '自营物流快', color: '#e1251b' },
      { name: '拼多多', url: 'https://www.pinduoduo.com', desc: '低价日用品', color: '#e02e24' },
      { name: '什么值得买', url: 'https://www.smzdm.com', desc: '优惠与选购攻略', color: '#ff6f00' },
      { name: '美团', url: 'https://www.meituan.com', desc: '外卖与本地生活', color: '#ffc300' },
      { name: '12306', url: 'https://www.12306.cn', desc: '火车票官方购票', color: '#1f5fbf' },
      { name: '携程', url: 'https://www.ctrip.com', desc: '机票酒店预订', color: '#2577e3' },
      { name: '高德地图', url: 'https://www.amap.com', desc: '路线与打车', color: '#0a84ff' }
    ]
  },
  {
    id: 'play',
    name: '影音娱乐',
    icon: '🎬',
    sites: [
      { name: '哔哩哔哩', url: 'https://www.bilibili.com', desc: '视频与直播', color: '#fb7299' },
      { name: '网易云音乐', url: 'https://music.163.com', desc: '歌单与推荐', color: '#c20c0c' },
      { name: '腾讯视频', url: 'https://v.qq.com', desc: '影视剧综艺', color: '#ff7a00' },
      { name: '爱奇艺', url: 'https://www.iqiyi.com', desc: '影视与动漫', color: '#00be06' },
      { name: 'YouTube', url: 'https://www.youtube.com', desc: '海外视频平台', color: '#ff0000' },
      { name: '豆瓣电影', url: 'https://movie.douban.com', desc: '评分与影评', color: '#2e963b' },
      { name: '网易云游戏', url: 'https://cg.163.com', desc: '免下载云游戏', color: '#d33a31' },
      { name: 'Steam', url: 'https://store.steampowered.com', desc: 'PC 游戏商店', color: '#1b2838' }
    ]
  },
  {
    id: 'cloud',
    name: '云服务',
    icon: '⚙️',
    sites: [
      { name: '阿里云', url: 'https://www.aliyun.com', desc: '云服务器与数据库', color: '#ff6a00' },
      { name: '腾讯云', url: 'https://cloud.tencent.com', desc: '国内云厂商', color: '#006eff' },
      { name: 'Cloudflare', url: 'https://dash.cloudflare.com', desc: 'CDN / DNS / 防护', color: '#f38020' },
      { name: 'Vercel', url: 'https://vercel.com', desc: '前端一键部署', color: '#000000', hot: true },
      { name: 'Netlify', url: 'https://www.netlify.com', desc: '静态站点托管', color: '#00c7b7' },
      { name: '宝塔面板', url: 'https://www.bt.cn', desc: '服务器可视化管理', color: '#20a53a' },
      { name: '七牛云', url: 'https://www.qiniu.com', desc: '对象存储与 CDN', color: '#00a4e4' },
      { name: 'Supabase', url: 'https://supabase.com', desc: '开源后端服务', color: '#3ecf8e' }
    ]
  }
];

/** 可选搜索引擎，{q} 会替换为关键词 */
const ENGINES = [
  { id: 'bing', name: '必应', url: 'https://cn.bing.com/search?q={q}' },
  { id: 'baidu', name: '百度', url: 'https://www.baidu.com/s?wd={q}' },
  { id: 'google', name: 'Google', url: 'https://www.google.com/search?q={q}' },
  { id: 'zhihu', name: '知乎', url: 'https://www.zhihu.com/search?type=content&q={q}' },
  { id: 'bilibili', name: 'B 站', url: 'https://search.bilibili.com/all?keyword={q}' },
  { id: 'github', name: 'GitHub', url: 'https://github.com/search?q={q}' }
];
