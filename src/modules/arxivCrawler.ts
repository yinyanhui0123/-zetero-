export interface ArxivPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  published: string;
  updated: string;
  categories: string[];
  pdfUrl: string;
  doi?: string;
  journalRef?: string;
}

export interface ArxivSearchOptions {
  query: string;
  maxResults?: number;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
  start?: number;
}

/**
 * 文献检索仅使用本地 Python 服务 (localhost:5000)，不使用默认/第三方 API
 */
export class ArxivCrawler {
  private readonly PYTHON_API_URL = 'http://localhost:5000';

  constructor(private zotero: any) {}

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      this.zotero.debug(`Python API error: ${response.status} ${url}`);
      throw new Error(`文献服务请求失败: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async searchPapers(options: ArxivSearchOptions): Promise<ArxivPaper[]> {
    const {
      query,
      maxResults = 20,
      sortBy = 'relevance',
      sortOrder = 'descending',
      start = 0,
    } = options;

    const url = `${this.PYTHON_API_URL}/search?query=${encodeURIComponent(query)}&maxResults=${maxResults}&sortBy=${sortBy}&sortOrder=${sortOrder}&start=${start}`;
    const papers = await this.request<ArxivPaper[]>(url);
    this.zotero.debug(`Fetched ${papers.length} papers from Python API`);
    return papers;
  }

  async getPaperById(arxivId: string): Promise<ArxivPaper | null> {
    const url = `${this.PYTHON_API_URL}/paper/${encodeURIComponent(arxivId)}`;
    try {
      const paper = await this.request<ArxivPaper>(url);
      return paper;
    } catch {
      return null;
    }
  }

  async searchByCategory(
    category: string,
    options?: Partial<ArxivSearchOptions>
  ): Promise<ArxivPaper[]> {
    const {
      maxResults = 20,
      sortBy = 'relevance',
      sortOrder = 'descending',
      start = 0,
    } = options || {};

    const url = `${this.PYTHON_API_URL}/search/category?category=${encodeURIComponent(category)}&maxResults=${maxResults}&sortBy=${sortBy}&sortOrder=${sortOrder}&start=${start}`;
    const papers = await this.request<ArxivPaper[]>(url);
    this.zotero.debug(`Fetched ${papers.length} papers from category ${category}`);
    return papers;
  }

  async searchByAuthor(author: string, options?: Partial<ArxivSearchOptions>): Promise<ArxivPaper[]> {
    const {
      maxResults = 20,
      sortBy = 'relevance',
      sortOrder = 'descending',
      start = 0,
    } = options || {};

    const url = `${this.PYTHON_API_URL}/search/author?author=${encodeURIComponent(author)}&maxResults=${maxResults}&sortBy=${sortBy}&sortOrder=${sortOrder}&start=${start}`;
    const papers = await this.request<ArxivPaper[]>(url);
    this.zotero.debug(`Fetched ${papers.length} papers by author ${author}`);
    return papers;
  }

  async searchByKeyword(keyword: string, options?: Partial<ArxivSearchOptions>): Promise<ArxivPaper[]> {
    const {
      maxResults = 20,
      sortBy = 'relevance',
      sortOrder = 'descending',
      start = 0,
    } = options || {};

    const url = `${this.PYTHON_API_URL}/search/keyword?keyword=${encodeURIComponent(keyword)}&maxResults=${maxResults}&sortBy=${sortBy}&sortOrder=${sortOrder}&start=${start}`;
    const papers = await this.request<ArxivPaper[]>(url);
    this.zotero.debug(`Fetched ${papers.length} papers by keyword ${keyword}`);
    return papers;
  }

  async getRecentPapers(category: string, days: number = 7, maxResults: number = 100): Promise<ArxivPaper[]> {
    const url = `${this.PYTHON_API_URL}/recent?category=${encodeURIComponent(category)}&days=${days}&maxResults=${maxResults}`;
    const papers = await this.request<ArxivPaper[]>(url);
    this.zotero.debug(`Fetched ${papers.length} recent papers for ${category}`);
    return papers;
  }
}
