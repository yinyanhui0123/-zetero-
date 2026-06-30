import { ArxivCrawler, ArxivPaper } from './arxivCrawler';

export interface TrackingConfig {
  categories: string[];
  keywords: string[];
  authors: string[];
  maxResults: number;
  relevanceThreshold: number;
}

export class LiteratureTrackingService {
  private arxivCrawler: ArxivCrawler;
  private trackingConfig: TrackingConfig;

  constructor(private zotero: any) {
    this.arxivCrawler = new ArxivCrawler(zotero);
    this.trackingConfig = this.loadTrackingConfig();
  }

  private parseListPref(value: unknown, fallback: string[] = []): string[] {
    if (Array.isArray(value)) {
      return value.map(String).map(item => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
    return fallback;
  }

  private parseNumberPref(value: unknown, fallback: number, min: number, max: number): number {
    const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  }

  private loadTrackingConfig(): TrackingConfig {
    try {
      const prefs = this.zotero.Prefs;
      const categoriesVal = prefs.get('extensions.zotero.literature-tracker.categories', true) as unknown;
      const keywordsVal = prefs.get('extensions.zotero.literature-tracker.keywords', true) as unknown;
      const authorsVal = prefs.get('extensions.zotero.literature-tracker.authors', true) as unknown;
      const maxResultsVal = prefs.get('extensions.zotero.literature-tracker.maxResults', true) as unknown;
      const relevanceThresholdVal = prefs.get('extensions.zotero.literature-tracker.relevanceThreshold', true) as unknown;

      const categories = this.parseListPref(categoriesVal, ['cs.AI', 'cs.LG']);
      const keywords = this.parseListPref(keywordsVal);
      const authors = this.parseListPref(authorsVal);
      const maxResults = this.parseNumberPref(maxResultsVal, 50, 1, 200);
      const relevanceThreshold = this.parseNumberPref(relevanceThresholdVal, 0.7, 0, 1);

      return {
        categories: categories.length > 0 ? categories : ['cs.AI', 'cs.LG'],
        keywords,
        authors,
        maxResults,
        relevanceThreshold
      };
    } catch (error) {
      this.zotero.debug(`Error loading tracking config: ${error}`);
      return {
        categories: ['cs.AI', 'cs.LG'],
        keywords: [],
        authors: [],
        maxResults: 50,
        relevanceThreshold: 0.7
      };
    }
  }

  private saveTrackingConfig(config: TrackingConfig): void {
    try {
      const prefs = this.zotero.Prefs;
      prefs.set('extensions.zotero.literature-tracker.categories', config.categories.join(', '), true);
      prefs.set('extensions.zotero.literature-tracker.keywords', config.keywords.join(', '), true);
      prefs.set('extensions.zotero.literature-tracker.authors', config.authors.join(', '), true);
      prefs.set('extensions.zotero.literature-tracker.maxResults', config.maxResults, true);
      prefs.set('extensions.zotero.literature-tracker.relevanceThreshold', config.relevanceThreshold, true);
    } catch (error) {
      this.zotero.debug(`Error saving tracking config: ${error}`);
    }
  }

  async fetchRecentPapers(days: number = 7): Promise<ArxivPaper[]> {
    const allPapers: ArxivPaper[] = [];

    for (const category of this.trackingConfig.categories) {
      try {
        this.zotero.debug(`Fetching papers from category: ${category}`);
        const papers = await this.arxivCrawler.getRecentPapers(category, days, this.trackingConfig.maxResults);
        allPapers.push(...papers);
      } catch (error) {
        this.zotero.debug(`Error fetching papers from ${category}: ${error}`);
      }
    }

    for (const keyword of this.trackingConfig.keywords) {
      try {
        this.zotero.debug(`Searching papers by keyword: ${keyword}`);
        const papers = await this.arxivCrawler.searchByKeyword(keyword, {
          maxResults: this.trackingConfig.maxResults,
          sortBy: 'lastUpdatedDate',
          sortOrder: 'descending'
        });
        allPapers.push(...papers);
      } catch (error) {
        this.zotero.debug(`Error searching papers by keyword ${keyword}: ${error}`);
      }
    }

    for (const author of this.trackingConfig.authors) {
      try {
        this.zotero.debug(`Searching papers by author: ${author}`);
        const papers = await this.arxivCrawler.searchByAuthor(author, {
          maxResults: this.trackingConfig.maxResults,
          sortBy: 'lastUpdatedDate',
          sortOrder: 'descending'
        });
        allPapers.push(...papers);
      } catch (error) {
        this.zotero.debug(`Error searching papers by author ${author}: ${error}`);
      }
    }

    return this.deduplicatePapers(allPapers);
  }

  private deduplicatePapers(papers: ArxivPaper[]): ArxivPaper[] {
    const seen = new Set<string>();
    const uniquePapers: ArxivPaper[] = [];

    for (const paper of papers) {
      if (!seen.has(paper.id)) {
        seen.add(paper.id);
        uniquePapers.push(paper);
      }
    }

    return uniquePapers;
  }

  async searchPapers(query: string, maxResults: number = 20): Promise<ArxivPaper[]> {
    return this.arxivCrawler.searchPapers({
      query,
      maxResults,
      sortBy: 'relevance',
      sortOrder: 'descending'
    });
  }

  getPaperById(arxivId: string): Promise<ArxivPaper | null> {
    return this.arxivCrawler.getPaperById(arxivId);
  }

  async fetchTodayPapers(): Promise<ArxivPaper[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 获取最近7天的文献（增加范围，确保能获取到文献）
    const papers = await this.fetchRecentPapers(7);

    // 过滤出今天及最近的文献
    const recentPapers = papers.filter(paper => {
      const paperDate = new Date(paper.published);
      return paperDate >= today;
    });

    // 如果今天没有文献，返回最近7天的文献
    if (recentPapers.length === 0) {
      this.zotero.debug(`No papers published today, returning recent papers`);
      return papers.slice(0, 50); // 返回前50篇最近的文献
    }

    this.zotero.debug(`Found ${recentPapers.length} papers published today`);
    return recentPapers;
  }

  updateConfig(config: Partial<TrackingConfig>): void {
    this.trackingConfig = { ...this.trackingConfig, ...config };
    this.saveTrackingConfig(this.trackingConfig);
  }

  getConfig(): TrackingConfig {
    return { ...this.trackingConfig };
  }

  async addCategory(category: string): Promise<void> {
    if (!this.trackingConfig.categories.includes(category)) {
      this.trackingConfig.categories.push(category);
      this.saveTrackingConfig(this.trackingConfig);
    }
  }

  async removeCategory(category: string): Promise<void> {
    this.trackingConfig.categories = this.trackingConfig.categories.filter(c => c !== category);
    this.saveTrackingConfig(this.trackingConfig);
  }

  async addKeyword(keyword: string): Promise<void> {
    if (!this.trackingConfig.keywords.includes(keyword)) {
      this.trackingConfig.keywords.push(keyword);
      this.saveTrackingConfig(this.trackingConfig);
    }
  }

  async removeKeyword(keyword: string): Promise<void> {
    this.trackingConfig.keywords = this.trackingConfig.keywords.filter(k => k !== keyword);
    this.saveTrackingConfig(this.trackingConfig);
  }

  async addAuthor(author: string): Promise<void> {
    if (!this.trackingConfig.authors.includes(author)) {
      this.trackingConfig.authors.push(author);
      this.saveTrackingConfig(this.trackingConfig);
    }
  }

  async removeAuthor(author: string): Promise<void> {
    this.trackingConfig.authors = this.trackingConfig.authors.filter(a => a !== author);
    this.saveTrackingConfig(this.trackingConfig);
  }
}
