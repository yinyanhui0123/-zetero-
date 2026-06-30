// 大模型 API Key（用于向量生成等）
pref("extensions.zotero.literature-tracker.apiKey", "");
// API 提供商：openai | deepseek（DeepSeek 使用 api.deepseek.com，国内更易访问）
pref("extensions.zotero.literature-tracker.apiProvider", "deepseek");

// Website Tracking
pref("extensions.zotero.literature-tracker.trackArxiv", true);
pref("extensions.zotero.literature-tracker.trackPubmed", true);

// 用户画像模式：keyword=仅关键词（快，无 API）；vector=向量（准，需 API）
pref("extensions.zotero.literature-tracker.profileMode", "keyword");
// Python 文献服务未运行时自动启动：填 start-server.bat 的完整路径（留空则不自动启动）
pref("extensions.zotero.literature-tracker.pythonServerStartCommand", "");
// 启动 Zotero 后每天自动检查并推送一次
pref("extensions.zotero.literature-tracker.enableDailyPush", true);

// 推送范围配置
pref("extensions.zotero.literature-tracker.categories", "cs.AI, cs.LG");
pref("extensions.zotero.literature-tracker.keywords", "");
pref("extensions.zotero.literature-tracker.authors", "");
pref("extensions.zotero.literature-tracker.maxResults", 50);
// Relevance Settings
pref("extensions.zotero.literature-tracker.relevanceThreshold", 0.7);

// Keyboard Shortcut
pref("extensions.zotero.literature-tracker.shortcutKey", " ");
