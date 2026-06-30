import { config } from "../package.json";
import { DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import { createZToolkit } from "./utils/ztoolkit";
import { LiteratureReader } from "./modules/literatureReader";
import { VectorStore } from "./modules/vectorStore";
import { VectorGenerator } from "./modules/vectorGenerator";
import { LiteratureTrackingService } from "./modules/literatureTrackingService";
import { UserProfileManager } from "./modules/userProfile";

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
    };
    dialog?: DialogHelper;
    literatureReader?: LiteratureReader;
    vectorStore?: VectorStore;
    vectorGenerator?: VectorGenerator;
    literatureTrackingService?: LiteratureTrackingService;
    userProfileManager?: UserProfileManager;
    shortcutKey?: string;
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: object;

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {};
  }

  /**
   * 初始化插件
   */
  public async initialize(): Promise<void> {
    try {
      ztoolkit.log("Initializing Literature Tracker plugin...");

      // 初始化文献读取器
      try {
        this.data.literatureReader = new LiteratureReader();
        ztoolkit.log("Literature reader initialized");
      } catch (error) {
        ztoolkit.log(`Error initializing literature reader: ${error}`);
      }

      // 初始化向量存储
      try {
        const zotero = this.data.ztoolkit.getGlobal("Zotero");
        const dbPath = (zotero as any).ProfD + "/literature-tracker.sqlite";
        this.data.vectorStore = new VectorStore(dbPath);
        await this.data.vectorStore.initialize();
        ztoolkit.log("Vector store initialized");
      } catch (error) {
        ztoolkit.log(`Error initializing vector store: ${error}`);
      }

      // 初始化向量生成器（支持 OpenAI Embeddings 与 DeepSeek 对话 API 生成向量）
      try {
        const zotero = this.data.ztoolkit.getGlobal("Zotero");
        const apiKey = zotero.Prefs.get("extensions.zotero.literature-tracker.apiKey", true) as string | null;
        const apiProvider = String(zotero.Prefs.get("extensions.zotero.literature-tracker.apiProvider", true) || "deepseek").toLowerCase() as "openai" | "deepseek";
        this.data.vectorGenerator = new VectorGenerator(apiKey);
        this.data.vectorGenerator.setApiConfig(apiKey ?? null, undefined, undefined, {
          apiProvider: apiProvider === "openai" ? "openai" : "deepseek",
          chatApiUrl: apiProvider === "deepseek" ? "https://api.deepseek.com/v1/chat/completions" : undefined,
          chatModel: apiProvider === "deepseek" ? "deepseek-chat" : undefined,
        });
        ztoolkit.log("Vector generator initialized (provider: " + apiProvider + ")");
      } catch (error) {
        ztoolkit.log(`Error initializing vector generator: ${error}`);
      }

      // 初始化文献追踪服务
      try {
        const zotero = this.data.ztoolkit.getGlobal("Zotero");
        this.data.literatureTrackingService = new LiteratureTrackingService(zotero as any);
        ztoolkit.log("Literature tracking service initialized");
      } catch (error) {
        ztoolkit.log(`Error initializing literature tracking service: ${error}`);
      }

      // 初始化用户画像管理器
      try {
        if (this.data.vectorStore && this.data.vectorGenerator) {
          this.data.userProfileManager = new UserProfileManager(this.data.vectorStore, this.data.vectorGenerator);
          ztoolkit.log("User profile manager initialized");
        } else {
          ztoolkit.log("Cannot initialize user profile manager: vector store or vector generator not initialized");
        }
      } catch (error) {
        ztoolkit.log(`Error initializing user profile manager: ${error}`);
      }

      // 加载快捷键设置
      try {
        this.loadShortcutKey();
        ztoolkit.log("Shortcut key loaded");
      } catch (error) {
        ztoolkit.log(`Error loading shortcut key: ${error}`);
      }

      // 注册快捷键
      try {
        this.registerShortcut();
        ztoolkit.log("Shortcut key registered");
      } catch (error) {
        ztoolkit.log(`Error registering shortcut key: ${error}`);
      }

      // 检查今日是否已推送
      try {
        const zotero = this.data.ztoolkit.getGlobal("Zotero");
        const enableDailyPush = (zotero as any).Prefs.get("extensions.zotero.literature-tracker.enableDailyPush", true) !== false;
        if (enableDailyPush) {
          await this.checkAndPushTodayPapers();
          ztoolkit.log("Push check completed");
        } else {
          ztoolkit.log("Daily paper push disabled by preference");
        }
      } catch (error) {
        ztoolkit.log(`Error checking push status: ${error}`);
      }

      // 检查是否所有必要组件都已初始化
      const allComponentsInitialized = !!(this.data.literatureReader &&
        this.data.vectorStore &&
        this.data.vectorGenerator &&
        this.data.literatureTrackingService &&
        this.data.userProfileManager);

      this.data.initialized = allComponentsInitialized;

      if (allComponentsInitialized) {
        ztoolkit.log("Literature Tracker plugin initialized successfully!");
      } else {
        ztoolkit.log("Literature Tracker plugin initialized with some components missing");
      }
    } catch (error) {
      ztoolkit.log(`Error initializing plugin: ${error}`);
      this.data.initialized = false;
    }
  }

  /**
   * 加载快捷键设置
   */
  private loadShortcutKey(): void {
    const shortcutKey = this.data.ztoolkit.getGlobal("Zotero").Prefs.get("extensions.zotero.literature-tracker.shortcutKey", true) || " ";
    this.data.shortcutKey = shortcutKey as string;
  }



  /**
   * 构建用户画像
   */
  public async buildUserProfile(): Promise<void> {
    try {
      ztoolkit.log("Building user profile...");

      // 检查必要的组件是否初始化
      if (!this.data.literatureReader || !this.data.userProfileManager) {
        ztoolkit.log("Required components not initialized");
        return;
      }

      // 获取所有文献
      const allLiterature = await this.data.literatureReader.getAllLiterature();

      if (allLiterature.length === 0) {
        ztoolkit.log("No literature found in library");
        return;
      }

      ztoolkit.log(`Building profile based on ${allLiterature.length} literature items`);

      const userID = "default";
      const zotero = this.data.ztoolkit.getGlobal("Zotero");
      const profileMode = String((zotero as any).Prefs.get("extensions.zotero.literature-tracker.profileMode", true) || "keyword").toLowerCase();
      const profile =
        profileMode === "vector"
          ? await this.data.userProfileManager.buildUserProfile(userID, allLiterature)
          : await this.data.userProfileManager.buildUserProfileKeywordOnly(userID, allLiterature);

      ztoolkit.log(`Successfully built user profile (${profileMode}): ${profile.keywords.length} keywords`);

      // 显示通知
      new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: true,
        closeTime: -1,
      })
      .createLine({
        text: profile.interestVector.length ? `已构建画像：${profile.coreThemes.length} 主题，${profile.keywords.length} 关键词` : `已构建画像（关键词模式）：${profile.keywords.length} 关键词`,
        type: "default",
        progress: 100,
      })
      .show()
      .startCloseTimer(3000);

    } catch (error) {
      ztoolkit.log(`Error building user profile: ${error}`);
    }
  }

  /**
   * 获取用户画像
   */
  public async getUserProfile(): Promise<any> {
    try {
      ztoolkit.log("Getting user profile...");

      // 检查必要的组件是否初始化
      if (!this.data.userProfileManager) {
        ztoolkit.log("User profile manager not initialized");
        return null;
      }

      // 获取用户画像
      const userID = "default"; // 默认为默认用户
      const profile = await this.data.userProfileManager.getUserProfile(userID);

      if (profile) {
        ztoolkit.log(`Retrieved user profile with ${profile.coreThemes?.length ?? 0} core themes, ${profile.keywords?.length ?? 0} keywords`);
      } else {
        ztoolkit.log("No user profile found");
      }

      return profile;
    } catch (error) {
      ztoolkit.log(`Error getting user profile: ${error}`);
      return null;
    }
  }

  /**
   * 显示当前用户画像摘要，用于验证画像是否已构建并被使用
   */
  public async showUserProfileSummary(): Promise<void> {
    try {
      const profile = await this.getUserProfile();
      if (!profile) {
        new ztoolkit.ProgressWindow(this.data.config.addonName, { closeOnClick: true, closeTime: -1 })
          .createLine({
            text: "尚未构建用户画像。请先执行「构建用户画像」",
            type: "default",
            progress: 100,
          })
          .show()
          .startCloseTimer(5000);
        return;
      }
      const mode = profile.interestVector?.length ? "向量" : "关键词";
      const kwCount = profile.keywords?.length ?? 0;
      const topKw = (profile.keywords || []).slice(0, 10).map((k: any) => k.keyword).join("、");
      const updated = profile.lastUpdated ? new Date(profile.lastUpdated).toLocaleString() : "—";
      const msg = `模式: ${mode} | 关键词数: ${kwCount} | 更新: ${updated}\n前 10 个关键词: ${topKw || "—"}`;
      new ztoolkit.ProgressWindow(this.data.config.addonName, { closeOnClick: true, closeTime: -1 })
        .createLine({
          text: `用户画像已就绪（${mode}，${kwCount} 个关键词）。推荐文献时将按此画像筛选与排序。`,
          type: "default",
          progress: 100,
        })
        .show()
        .startCloseTimer(6000);
      ztoolkit.log(`[Profile Summary] ${msg}`);
    } catch (e) {
      ztoolkit.log(`showUserProfileSummary error: ${e}`);
    }
  }

  /**
   * 检查今日是否已推送并执行推送
   */
  public async checkAndPushTodayPapers(): Promise<void> {
    try {
      // 检查所有必要的组件是否初始化
      if (!this.data.literatureTrackingService || !this.data.vectorStore || !this.data.userProfileManager || !this.data.vectorGenerator || !this.data.literatureReader) {
        ztoolkit.log("Required components not initialized, skipping push check");
        return;
      }

      const lastPushDate = await this.data.vectorStore.getLastPushDate();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 检查是否今日已推送
      if (!lastPushDate || lastPushDate < today) {
        ztoolkit.log("Today's papers not pushed yet, starting push process...");
        await this.fetchAndPushTodayPapers();
      } else {
        ztoolkit.log("Today's papers already pushed, skipping...");
      }
    } catch (error) {
      ztoolkit.log(`Error checking push status: ${error}`);
    }
  }

  /**
   * 获取并推送今日文献
   */
  public async fetchAndPushTodayPapers(): Promise<number> {
    try {
      ztoolkit.log("Fetching and pushing today's papers...");

      // 检查必要的组件是否初始化
      const uninitializedComponents: string[] = [];
      if (!this.data.literatureTrackingService) uninitializedComponents.push("Literature Tracking Service");
      if (!this.data.vectorStore) uninitializedComponents.push("Vector Store");
      if (!this.data.userProfileManager) uninitializedComponents.push("User Profile Manager");
      if (!this.data.vectorGenerator) uninitializedComponents.push("Vector Generator");
      if (!this.data.literatureReader) uninitializedComponents.push("Literature Reader");

      if (uninitializedComponents.length > 0) {
        const errorMessage = `插件组件未初始化: ${uninitializedComponents.join(", ")}，请重启Zotero`;
        ztoolkit.log(`Required components not initialized: ${uninitializedComponents.join(", ")}`);
        new ztoolkit.ProgressWindow(this.data.config.addonName, {
          closeOnClick: true,
          closeTime: -1,
        })
          .createLine({ text: errorMessage, type: "error", progress: 100 })
          .show()
          .startCloseTimer(5000);
        return 0;
      }

      const serverOk = await this.ensurePythonServer();
      if (!serverOk) {
        ztoolkit.log("Python literature server not running");
        new ztoolkit.ProgressWindow(this.data.config.addonName, { closeOnClick: true, closeTime: -1 })
          .createLine({
            text: "文献服务未启动。请在设置中配置自动启动脚本路径，或手动运行 start-server.bat",
            type: "error",
            progress: 100,
          })
          .show()
          .startCloseTimer(8000);
        return 0;
      }

      // 1. 获取今日新增文献
      const papers = await this.data.literatureTrackingService.fetchTodayPapers();
      if (papers.length === 0) {
        ztoolkit.log("No new papers found today");
        // 显示通知
        new ztoolkit.ProgressWindow(this.data.config.addonName, {
          closeOnClick: true,
          closeTime: -1,
        })
          .createLine({
            text: "今日没有发现新文献",
            type: "default",
            progress: 100,
          })
          .show()
          .startCloseTimer(5000);
        // 更新推送状态
        await this.data.vectorStore.setLastPushDate(new Date());
        return 0;
      }

      // 2. 基于关键词初步筛选；若无匹配则用全部文献排序，保证有推荐
      let candidatePapers = await this.filterPapersByKeywords(papers);
      if (candidatePapers.length === 0) {
        ztoolkit.log("No papers matched keywords, using all papers for ranking");
        candidatePapers = papers;
      }

      // 3. 计算相关度
      const relevanceResults = await this.calculateRelevance(candidatePapers);

      // 4. 筛选相关文献
      const { papers: relevantPapers, relaxedLabel } = await this.filterRelevantPapers(relevanceResults);

      // 5. 推送文献
      await this.pushPapers(relevantPapers, relaxedLabel);

      // 6. 更新推送状态
      await this.data.vectorStore.setLastPushDate(new Date());

      ztoolkit.log(`Successfully pushed ${relevantPapers.length} relevant papers`);
      return relevantPapers.length;
    } catch (error) {
      ztoolkit.log(`Error fetching and pushing papers: ${error}`);
      // 显示错误通知
      new ztoolkit.ProgressWindow(this.data.config.addonName, {
        closeOnClick: true,
        closeTime: -1,
      })
        .createLine({
          text: `推送失败: ${error}`,
          type: "error",
          progress: 100,
        })
        .show()
        .startCloseTimer(5000);
      return 0;
    }
  }

  /**
   * 基于关键词筛选文献
   */
  private async filterPapersByKeywords(papers: any[]): Promise<any[]> {
    // 获取用户画像
    const userProfile = await this.data.userProfileManager?.getUserProfile("default");
    if (!userProfile) {
      ztoolkit.log("User profile not found, skipping keyword filtering");
      return papers;
    }

    // 提取高频关键词（权重>=1 即可，小库也能产生关键词；取前 15 个）
    const keywords = userProfile.keywords
      .filter((item: any) => item.weight >= 1)
      .map((item: any) => item.keyword)
      .slice(0, 15);

    if (keywords.length === 0) {
      ztoolkit.log("No keywords found in user profile, skipping keyword filtering");
      return papers;
    }

    // 筛选包含关键词的文献（arXiv 等接口返回 abstract，兼容 summary）
    const filteredPapers = papers.filter((paper: any) => {
      const text = `${paper.title || ""} ${paper.abstract || paper.summary || ""}`.toLowerCase();
      return keywords.some((keyword: string) => text.includes(keyword.toLowerCase()));
    });

    ztoolkit.log(`Filtered papers by keywords: ${filteredPapers.length} out of ${papers.length}`);
    return filteredPapers;
  }

  /**
   * 基于关键词重叠度打分（无 API，用于 profileMode=keyword）
   * relevance = 匹配到的关键词权重和 / 总权重，归一化到 [0,1]
   */
  private async calculateRelevanceKeywordOnly(papers: any[]): Promise<Array<{ paper: any; relevance: number }>> {
    const userProfile = await this.data.userProfileManager?.getUserProfile("default");
    if (!userProfile || !userProfile.keywords.length) {
      return papers.map(paper => ({ paper, relevance: 0.5 }));
    }
    const keywordSet = new Map(userProfile.keywords.map((k: any) => [k.keyword.toLowerCase(), k.weight]));
    const totalWeight = userProfile.keywords.reduce((s: number, k: any) => s + k.weight, 0) || 1;
    const results: Array<{ paper: any; relevance: number }> = [];
    for (const paper of papers) {
      const text = `${paper.title || ""} ${paper.abstract || paper.summary || ""}`.toLowerCase();
      let score = 0;
      for (const [kw, w] of keywordSet) {
        if (text.includes(kw)) score += w;
      }
      const relevance = Math.min(1, score / Math.max(1, totalWeight * 0.3)); // 归一化到约 [0,1]
      results.push({ paper, relevance });
    }
    results.sort((a, b) => b.relevance - a.relevance);
    return results;
  }

  /**
   * 计算文献与用户兴趣的相关度（向量模式，会调 API）
   */
  private async calculateRelevance(papers: any[]): Promise<Array<{ paper: any; relevance: number }>> {
    const userProfile = await this.data.userProfileManager?.getUserProfile("default");
    if (!userProfile) {
      ztoolkit.log("User profile not found, assigning default relevance");
      return papers.map(paper => ({ paper, relevance: 0.5 }));
    }
    if (!userProfile.interestVector || userProfile.interestVector.length === 0) {
      return this.calculateRelevanceKeywordOnly(papers);
    }

    const results: Array<{ paper: any; relevance: number }> = [];

    // 批量生成向量（arXiv 返回 abstract，兼容 summary，摘要参与向量更准）
    const literatureItems = papers.map((paper: any) => ({
      id: paper.id,
      title: paper.title,
      abstract: paper.abstract || paper.summary || "",
      authors: paper.authors,
      publicationTitle: "arXiv",
      date: paper.published,
      doi: paper.doi,
      url: paper.pdf_url || paper.pdfUrl,
      tags: []
    }));

    const vectors = await this.data.vectorGenerator?.generateVectors(literatureItems);
    if (!vectors) {
      ztoolkit.log("Failed to generate vectors, assigning default relevance");
      // 当向量生成失败时，为所有文献分配默认相关度
      return papers.map(paper => ({
        paper,
        relevance: 0.5 // 默认相关度
      }));
    }

    // 计算相关度
    for (let i = 0; i < papers.length; i++) {
      const vector = vectors[i].vector;
      const relevance = this.cosineSimilarity(userProfile.interestVector, vector);
      results.push({ paper: papers[i], relevance });
    }

    // 按相关度排序
    results.sort((a, b) => b.relevance - a.relevance);

    return results;
  }

  /** 规范化 DOI 用于比对（小写、去前后缀） */
  private normalizeDoi(doi: string | null | undefined): string {
    if (doi == null || typeof doi !== "string") return "";
    const s = doi.trim().toLowerCase().replace(/^https?:\/\/doi\.org\/?/i, "");
    return s || "";
  }

  /** 从 URL 或 id 提取 arXiv ID（如 2401.12345） */
  private extractArxivId(urlOrId: string | null | undefined): string {
    if (urlOrId == null || typeof urlOrId !== "string") return "";
    const m = urlOrId.match(/arxiv\.org\/abs\/(\d+\.\d+)/i) || urlOrId.match(/^(\d+\.\d+)$/);
    return m ? m[1] : "";
  }

  /**
   * 筛选相关文献，始终排除已在库文献（按 DOI 与 arXiv ID）；若无结果则放宽相关度阈值
   */
  private async filterRelevantPapers(relevanceResults: Array<{ paper: any; relevance: number }>): Promise<{ papers: any[]; relaxedLabel?: string }> {
    const zotero = this.data.ztoolkit.getGlobal("Zotero");
    const rawThreshold = (zotero as any).Prefs.get("extensions.zotero.literature-tracker.relevanceThreshold", true);
    const threshold = typeof rawThreshold === "number" ? rawThreshold : (typeof rawThreshold === "string" ? parseFloat(rawThreshold) : 0.5);
    const thresholdNum = Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.5;
    const maxPapers = 15;

    const existingDois = new Set<string>();
    const existingArxivIds = new Set<string>();
    if (this.data.literatureReader) {
      const existingLiterature = await this.data.literatureReader.getAllLiterature();
      for (const item of existingLiterature) {
        const d = this.normalizeDoi(item.doi);
        if (d) existingDois.add(d);
        const a = this.extractArxivId(item.url) || this.extractArxivId((item as any).extra);
        if (a) existingArxivIds.add(a);
      }
    }

    const isInLibrary = (paper: any): boolean => {
      const doi = this.normalizeDoi(paper.doi);
      if (doi && existingDois.has(doi)) return true;
      const arxivId = this.extractArxivId(paper.id) || this.extractArxivId(paper.pdfUrl) || this.extractArxivId(paper.pdf_url);
      if (arxivId && existingArxivIds.has(arxivId)) return true;
      return false;
    };

    let filtered = relevanceResults
      .filter(item => item.relevance >= thresholdNum)
      .slice(0, maxPapers * 2)
      .map(item => item.paper)
      .filter((p: any) => !isInLibrary(p))
      .slice(0, maxPapers);

    let finalPapers = filtered;
    let relaxedLabel: string | undefined;

    if (finalPapers.length === 0 && relevanceResults.length > 0) {
      ztoolkit.log("No papers above threshold or all in library, relaxing: taking top by relevance (excluding in-library)");
      const relaxed = relevanceResults
        .map(item => item.paper)
        .filter((p: any) => !isInLibrary(p))
        .slice(0, maxPapers);
      if (relaxed.length > 0) {
        finalPapers = relaxed;
        relaxedLabel = "未达到相关度阈值的文献较多，以下为按相关度排序的推荐（已排除已在库文献）";
      }
    }

    return { papers: finalPapers, relaxedLabel };
  }

  /**
   * 推送文献
   */
  private async pushPapers(papers: any[], relaxedLabel?: string) {
    if (papers.length === 0) {
      new ztoolkit.ProgressWindow(this.data.config.addonName, {
        closeOnClick: true,
        closeTime: -1,
      })
        .createLine({
          text: "没有找到可推送的新文献（已排除库内已有文献）",
          type: "default",
          progress: 100,
        })
        .show()
        .startCloseTimer(5000);
      return;
    }
    this.showRecommendedPapersWindow(papers, { relaxedLabel });
  }

  /**
   * 清理 API Key：去除首尾空白、BOM、零宽字符，并限制为 ASCII（避免请求头报错）
   */
  private sanitizeApiKey(s: string): string {
    let t = String(s)
      .replace(/^\uFEFF/, "")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim();
    return t.replace(/[\u0100-\uFFFF]/g, "");
  }

  /** Python 文献服务健康检查 URL */
  private readonly PYTHON_SERVER_HEALTH_URL = "http://localhost:5000/health";

  /**
   * 检查 Python 文献服务是否已启动；若未启动且已配置自动启动命令则尝试启动后重试
   * @returns true 表示服务可用，false 表示不可用
   */
  public async ensurePythonServer(): Promise<boolean> {
    const check = (): Promise<boolean> =>
      new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", this.PYTHON_SERVER_HEALTH_URL, true);
        xhr.timeout = 3000;
        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const json = JSON.parse(xhr.responseText || "{}");
              resolve(json.status === "ok");
            } catch {
              resolve(false);
            }
          } else resolve(false);
        };
        xhr.onerror = () => resolve(false);
        xhr.ontimeout = () => resolve(false);
        xhr.send();
      });

    if (await check()) return true;

    const zotero = this.data.ztoolkit.getGlobal("Zotero");
    const startCommand = (zotero as any).Prefs.get("extensions.zotero.literature-tracker.pythonServerStartCommand", true);
    const cmd = typeof startCommand === "string" ? startCommand.trim() : "";
    const tryStart = (zotero as any).LiteratureTrackerTryStartPythonServer;
    if (cmd && typeof tryStart === "function") {
      tryStart(cmd);
      await new Promise((r) => setTimeout(r, 4500));
      if (await check()) return true;
    }

    return false;
  }

  /**
   * 根据 Prefs 中的 apiProvider 返回对话 API 的 URL 和模型名
   */
  private getChatApiConfig(): { url: string; model: string } {
    const zotero = this.data.ztoolkit.getGlobal("Zotero");
    const provider = String((zotero as any).Prefs.get("extensions.zotero.literature-tracker.apiProvider", true) || "deepseek").toLowerCase();
    if (provider === "openai") {
      return { url: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" };
    }
    return { url: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" };
  }

  /**
   * 使用 XMLHttpRequest 调用对话 API（支持 OpenAI / DeepSeek，在 Zotero 中比 fetch 更稳定）
   */
  private openApiPost(apiKey: string, body: object, apiUrl?: string): Promise<{ status: number; responseText: string }> {
    const url = apiUrl || this.getChatApiConfig().url;
    const bodyWithModel = { ...body, model: (body as any).model || this.getChatApiConfig().model };
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", "Bearer " + apiKey);
      xhr.responseType = "text";
      xhr.timeout = 30000;
      xhr.onload = () => resolve({ status: xhr.status, responseText: xhr.responseText || "" });
      xhr.onerror = () => reject(new Error("NetworkError when attempting to fetch resource"));
      xhr.ontimeout = () => reject(new Error("请求超时，请检查网络或代理。"));
      try {
        xhr.send(JSON.stringify(bodyWithModel));
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * 验证大模型 API Key 是否有效（供设置页调用）
   * @param apiKey 可选，不传则从 Prefs 读取
   * @returns { ok: true } 或 { ok: false, message: string }
   */
  public async verifyApiKey(apiKey?: string): Promise<{ ok: boolean; message: string }> {
    try {
      const zotero = this.data.ztoolkit.getGlobal("Zotero");
      const keyRaw = (apiKey !== undefined && apiKey !== null ? apiKey : (zotero as any).Prefs.get("extensions.zotero.literature-tracker.apiKey", true)) as string | null;
      if (!keyRaw || !String(keyRaw).trim()) {
        return { ok: false, message: "未配置 API Key，请先在设置中填写并保存。" };
      }
      const key = this.sanitizeApiKey(String(keyRaw));
      if (!key) {
        return { ok: false, message: "API Key 只能包含英文、数字和常用符号，请检查是否误粘贴了其他字符。" };
      }
      const { model } = this.getChatApiConfig();
      const { status, responseText } = await this.openApiPost(key, {
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 5,
      });
      if (status !== 200) {
        let msg = `API 返回 ${status}`;
        try {
          const errJson = JSON.parse(responseText);
          if (errJson.error && errJson.error.message) msg = errJson.error.message;
          else if (responseText) msg = responseText.slice(0, 200);
        } catch (_) {
          if (responseText) msg = responseText.slice(0, 200);
        }
        const isAuthError = status === 401 || /invalid|authentication|api key|unauthorized/i.test(msg);
        if (isAuthError) {
          msg += "\n\n请到 DeepSeek 开放平台 (platform.deepseek.com) 登录后重新复制 API Key，确保完整粘贴、无多余空格或换行。";
        }
        ztoolkit.log(`verifyApiKey failed: ${status} ${msg}`);
        return { ok: false, message: msg };
      }
      return { ok: true, message: "API Key 有效。" };
    } catch (e: any) {
      const msg = (e && e.message) ? e.message : String(e);
      ztoolkit.log(`verifyApiKey error: ${msg}`);
      return { ok: false, message: "网络或请求异常: " + msg + "。若需代理访问 OpenAI，请在系统或 Zotero 中配置代理。" };
    }
  }

  /**
   * 使用大模型生成文献内容概括（供推荐文献窗口调用）
   * @param paper 至少包含 title，可选 abstract/summary
   * @returns 概括文本，未配置 API Key 或失败时返回 null
   */
  public async getPaperSummary(paper: { title?: string; abstract?: string; summary?: string }): Promise<string | null> {
    try {
      const zotero = this.data.ztoolkit.getGlobal("Zotero");
      const apiKeyRaw = (zotero as any).Prefs.get("extensions.zotero.literature-tracker.apiKey", true) as string | null;
      if (!apiKeyRaw || !apiKeyRaw.trim()) {
        ztoolkit.log("getPaperSummary: 未读取到 API Key（请确认已在设置中保存）");
        return null;
      }
      const apiKey = this.sanitizeApiKey(apiKeyRaw);
      if (!apiKey) {
        ztoolkit.log("getPaperSummary: API Key 含非 ASCII 字符，已忽略");
        return null;
      }
      const title = paper.title || "";
      const abstract = paper.abstract || paper.summary || "";
      const text = [title, abstract].filter(Boolean).join("\n\n");
      if (!text.trim()) return null;

      const { model } = this.getChatApiConfig();
      const { status, responseText } = await this.openApiPost(apiKey, {
        model,
        messages: [
          {
            role: "system",
            content: "你是一个学术助手。请用简洁的中文概括下面这篇文献的核心内容，2-3句话即可，不要列点。",
          },
          { role: "user", content: text.slice(0, 6000) },
        ],
        max_tokens: 300,
      });

      if (status !== 200) {
        ztoolkit.log(`getPaperSummary API error: ${status} ${responseText.slice(0, 300)}`);
        return null;
      }

      const data = JSON.parse(responseText) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content?.trim();
      return content || null;
    } catch (e) {
      ztoolkit.log(`getPaperSummary error: ${e}`);
      return null;
    }
  }

  /**
   * 显示推荐文献窗口
   */
  public showRecommendedPapersWindow(papers: any[], options?: { relaxedLabel?: string }) {
    try {
      const zotero = this.data.ztoolkit.getGlobal("Zotero");
      const win = zotero.getMainWindow().open(
        "chrome://literature-tracker/content/recommended-papers.xhtml",
        "literature-tracker-recommended-papers",
        "chrome,centerscreen,width=800,height=600,resizable=yes"
      );

      if (win) {
        const addonRef = this;
        win.recommendedPapers = papers;
        win.recommendedPapersRelaxedLabel = options?.relaxedLabel || "";
        win.getPaperSummary = (paper: { title?: string; abstract?: string; summary?: string }) => addonRef.getPaperSummary(paper);
        if ((win as any).document?.readyState === "complete" && typeof (win as any).displayRecommendedPapers === "function") {
          (win as any).displayRecommendedPapers();
        }
        ztoolkit.log("Recommended papers window opened successfully");
      } else {
        ztoolkit.log("Failed to open recommended papers window");
      }
    } catch (error) {
      ztoolkit.log(`Error opening recommended papers window: ${error}`);
    }
  }

  /**
   * 注册快捷键
   */
  private registerShortcut(): void {
    if (!this.data.shortcutKey) return;

    const zotero = this.data.ztoolkit.getGlobal("Zotero");
    const overlayManager = (zotero as any).OverlayManager;

    if (overlayManager) {
      // 注册主快捷键
      overlayManager.add({
        "": [{
          tag: "key",
          attributes: {
            id: "literature-tracker-shortcut",
            key: this.data.shortcutKey,
            oncommand: "Zotero.LiteratureTracker.hooks.onShortcutKey()"
          }
        },
        // 注册9快捷键用于显示推荐文献窗口
        {
          tag: "key",
          attributes: {
            id: "literature-tracker-recommended-papers-key",
            key: "9",
            oncommand: "Zotero.LiteratureTracker.hooks.showRecommendedPapers()"
          }
        }]
      });
    }
  }

  /**
   * 显示推荐文献
   */
  public async showRecommendedPapers() {
    try {
      ztoolkit.log("Showing recommended papers...");

      // 检查必要的组件是否初始化
      if (!this.data.literatureTrackingService || !this.data.vectorStore || !this.data.userProfileManager || !this.data.vectorGenerator || !this.data.literatureReader) {
        ztoolkit.log("Required components not initialized");
        return;
      }

      const serverOk = await this.ensurePythonServer();
      if (!serverOk) {
        ztoolkit.log("Python literature server not running");
        new ztoolkit.ProgressWindow(this.data.config.addonName, { closeOnClick: true, closeTime: -1 })
          .createLine({
            text: "文献服务未启动。请在设置中配置自动启动脚本路径，或手动运行 start-server.bat",
            type: "error",
            progress: 100,
          })
          .show()
          .startCloseTimer(8000);
        return;
      }

      // 获取今日文献
      const papers = await this.data.literatureTrackingService.fetchTodayPapers();
      if (papers.length === 0) {
        ztoolkit.log("No papers found");
        return;
      }

      // 基于关键词初步筛选；若无匹配则用全部文献排序，保证有推荐
      let candidatePapers = await this.filterPapersByKeywords(papers);
      if (candidatePapers.length === 0) {
        ztoolkit.log("No papers matched keywords, using all papers for ranking");
        candidatePapers = papers;
      }

      const relevanceResults = await this.calculateRelevance(candidatePapers);
      const { papers: relevantPapers, relaxedLabel } = await this.filterRelevantPapers(relevanceResults);

      if (relevantPapers.length > 0) {
        this.showRecommendedPapersWindow(relevantPapers, { relaxedLabel });
      } else {
        new ztoolkit.ProgressWindow(this.data.config.addonName, { closeOnClick: true, closeTime: -1 })
          .createLine({
            text: "没有找到可推荐的新文献（已排除库内已有文献）",
            type: "default",
            progress: 100,
          })
          .show()
          .startCloseTimer(5000);
      }
    } catch (error) {
      ztoolkit.log(`Error showing recommended papers: ${error}`);
    }
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * 卸载插件
   */
  public async unload(): Promise<void> {
    try {
      ztoolkit.log("Unloading Literature Tracker plugin...");

      this.data.alive = false;
      ztoolkit.log("Literature Tracker plugin unloaded successfully!");
    } catch (error) {
      ztoolkit.log(`Error unloading plugin: ${error}`);
    }
  }
}

export default Addon;
