// 文献类型定义
export interface LiteratureItem {
  id: number;
  title: string;
  abstract: string;
  authors: string[];
  publicationTitle: string;
  date: string;
  doi: string;
  url: string;
  tags: string[];
}

/**
 * Zotero文献读取模块
 * 用于从用户文献库获取数据
 */
export class LiteratureReader {
  /**
   * 获取所有文献
   * @returns 文献列表
   */
  public async getAllLiterature(): Promise<LiteratureItem[]> {
    const Zotero = ztoolkit.getGlobal("Zotero");

    // 获取所有项目
    const items = await Zotero.Items.getAll(1); // 使用默认库ID
    const literatureItems: LiteratureItem[] = [];

    for (const item of items) {
      // 只处理期刊文章、会议论文、预印本等文献类型
      if (this.isLiteratureItem(item)) {
        const literatureItem = this.convertToLiteratureItem(item);
        if (literatureItem) {
          literatureItems.push(literatureItem);
        }
      }
    }

    return literatureItems;
  }

  /**
   * 获取指定集合中的文献
   * @param collectionId 集合ID
   * @returns 文献列表
   */
  public async getLiteratureByCollection(collectionId: number): Promise<LiteratureItem[]> {
    const Zotero = ztoolkit.getGlobal("Zotero");
    const collection = await Zotero.Collections.get(collectionId);
    if (!collection) {
      return [];
    }

    const items = await collection.getChildItems();
    const literatureItems: LiteratureItem[] = [];

    for (const item of items) {
      if (this.isLiteratureItem(item)) {
        const literatureItem = this.convertToLiteratureItem(item);
        if (literatureItem) {
          literatureItems.push(literatureItem);
        }
      }
    }

    return literatureItems;
  }

  /**
   * 检查项目是否为文献类型
   * @param item Zotero项目
   * @returns 是否为文献类型
   */
  private isLiteratureItem(item: any): boolean {
    const literatureTypes = [
      "journalArticle",
      "conferencePaper",
      "preprint",
      "book",
      "bookSection",
      "thesis",
      "report"
    ];

    return (
      item.isRegularItem &&
      literatureTypes.includes(item.itemType)
    );
  }

  /**
   * 将Zotero项目转换为文献对象
   * @param item Zotero项目
   * @returns 文献对象
   */
  private convertToLiteratureItem(item: any): LiteratureItem | null {
    try {
      const title = item.getField("title") || "";
      const abstract = item.getField("abstractNote") || "";
      const publicationTitle = item.getField("publicationTitle") || "";
      const date = item.getField("date") || "";
      const doi = item.getField("DOI") || "";
      const url = item.getField("url") || "";

      // 获取作者
      const creators = item.getCreators();
      const authors = creators
        .filter((creator: any) => creator.creatorType === "author")
        .map((creator: any) => {
          if (creator.firstName && creator.lastName) {
            return `${creator.firstName} ${creator.lastName}`;
          } else if (creator.lastName) {
            return creator.lastName;
          }
          return creator.firstName || "";
        })
        .filter((name: string) => name);

      // 获取标签
      const tags = item.getTags().map((tag: any) => tag.tag);

      return {
        id: item.id,
        title,
        abstract,
        authors,
        publicationTitle,
        date,
        doi,
        url,
        tags
      };
    } catch (error) {
      ztoolkit.log(`Error converting item ${item.id} to literature item: ${error}`);
      return null;
    }
  }

  /**
   * 搜索文献
   * @param query 搜索关键词
   * @returns 匹配的文献列表
   */
  public async searchLiterature(query: string): Promise<LiteratureItem[]> {
    const Zotero = ztoolkit.getGlobal("Zotero");

    // 创建搜索实例
    const search = new Zotero.Search();

    // 设置搜索参数
    search.addCondition("title", "contains", query);
    search.addCondition("abstract", "contains", query);
    search.addCondition("creator", "contains", query);
    search.addCondition("tag", "contains", query);

    const itemIds = await search.search();
    const literatureItems: LiteratureItem[] = [];

    for (const itemId of itemIds) {
      const item = await Zotero.Items.get(itemId);
      if (this.isLiteratureItem(item)) {
        const literatureItem = this.convertToLiteratureItem(item);
        if (literatureItem) {
          literatureItems.push(literatureItem);
        }
      }
    }

    return literatureItems;
  }

  /**
   * 获取最近添加的文献
   * @param days 天数
   * @returns 最近添加的文献列表
   */
  public async getRecentlyAddedLiterature(days: number = 30): Promise<LiteratureItem[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const allLiterature = await this.getAllLiterature();
    return allLiterature.filter(item => {
      if (!item.date) return false;
      try {
        const itemDate = new Date(item.date);
        return itemDate >= cutoffDate;
      } catch {
        return false;
      }
    });
  }

}
