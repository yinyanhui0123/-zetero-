import { LiteratureItem } from './literatureReader';
import { VectorStore } from './vectorStore';
import { VectorGenerator } from './vectorGenerator';

export interface UserProfile {
  id: string;
  interestVector: number[];
  coreThemes: Array<{
    theme: string;
    weight: number;
  }>;
  keywords: Array<{
    keyword: string;
    weight: number;
  }>;
  interestDistribution: Record<string, number>;
  lastUpdated: number;
  literatureItems?: LiteratureItem[];
}

export interface ThemeVector {
  theme: string;
  vector: number[];
}

export class UserProfileManager {
  private vectorStore: VectorStore;
  private vectorGenerator: VectorGenerator;
  private themeVectors: ThemeVector[];

  constructor(vectorStore: VectorStore, vectorGenerator: VectorGenerator) {
    this.vectorStore = vectorStore;
    this.vectorGenerator = vectorGenerator;
    this.themeVectors = this.initializeThemeVectors();
  }

  /**
   * 初始化主题向量库
   */
  private initializeThemeVectors(): ThemeVector[] {
    // 预定义的学科/主题向量
    // 实际应用中可以从外部加载或动态生成
    return [
      { theme: 'Artificial Intelligence', vector: this.generateDummyVector('Artificial Intelligence, Machine Learning, Deep Learning') },
      { theme: 'Computer Vision', vector: this.generateDummyVector('Computer Vision, Image Processing, Object Detection') },
      { theme: 'Natural Language Processing', vector: this.generateDummyVector('Natural Language Processing, NLP, Text Mining') },
      { theme: 'Data Science', vector: this.generateDummyVector('Data Science, Big Data, Analytics') },
      { theme: 'Robotics', vector: this.generateDummyVector('Robotics, Autonomous Systems, Control') },
      { theme: 'Computer Networks', vector: this.generateDummyVector('Computer Networks, Networking, Internet') },
      { theme: 'Security', vector: this.generateDummyVector('Security, Cybersecurity, Privacy') },
      { theme: 'Database Systems', vector: this.generateDummyVector('Database Systems, SQL, NoSQL') },
    ];
  }

  /**
   * 生成本地伪向量
   */
  private generateDummyVector(text: string): number[] {
    const vector: number[] = [];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = text.charCodeAt(i) + ((hash << 5) - hash);
    }
    for (let i = 0; i < 1536; i++) {
      vector.push(((hash >> (i % 32)) & 1) * 2 - 1);
    }
    return vector;
  }

  /**
   * 计算向量的余弦相似度
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
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
    return norm1 * norm2 === 0 ? 0 : dotProduct / (norm1 * norm2);
  }

  /**
   * 计算向量的加权平均
   */
  private calculateWeightedAverage(vectors: number[][], weights?: number[]): number[] {
    if (vectors.length === 0) {
      return [];
    }
    const dimension = vectors[0].length;
    const result: number[] = new Array(dimension).fill(0);
    const totalWeight = weights ? weights.reduce((sum, w) => sum + w, 0) : vectors.length;
    for (let i = 0; i < vectors.length; i++) {
      const weight = weights ? weights[i] / totalWeight : 1 / vectors.length;
      for (let j = 0; j < dimension; j++) {
        result[j] += vectors[i][j] * weight;
      }
    }
    return result;
  }

  /**
   * 提取文献的关键词
   */
  private extractKeywords(literature: LiteratureItem): string[] {
    // 简单的关键词提取逻辑
    // 实际应用中可以使用更复杂的NLP方法
    const text = `${literature.title} ${literature.abstract || ''}`;
    const words = text.toLowerCase().split(/\W+/).filter(word => word.length > 3);
    const wordCount: Record<string, number> = {};
    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * 构建用户画像
   */
  async buildUserProfile(userID: string, literatureItems: LiteratureItem[]): Promise<UserProfile> {
    try {
      // 获取所有文献的向量
      const vectors: number[][] = [];
      const weights: number[] = [];
      const allKeywords: Record<string, number> = {};

      for (const literature of literatureItems) {
        try {
          // 检查向量是否已存在
          let vectorData = await this.vectorStore.getVectorByLiteratureId(literature.id);
          let vector;
          if (!vectorData) {
            // 生成新向量
            vector = await this.vectorGenerator.generateVector(literature);
            // 存储向量
            await this.vectorStore.insertVector(literature, vector);
          } else {
            vector = vectorData.vector;
          }
          vectors.push(vector);
          weights.push(1); // 默认权重为1

          // 提取关键词
          const keywords = this.extractKeywords(literature);
          for (const keyword of keywords) {
            allKeywords[keyword] = (allKeywords[keyword] || 0) + 1;
          }
        } catch (error) {
          ztoolkit.log(`Error processing literature ${literature.id}: ${error}`);
          // 继续处理其他文献
        }
      }

      // 计算兴趣中心向量
      let interestVector: number[];
      if (vectors.length === 0) {
        ztoolkit.log('No literature vectors found, creating default profile');
        // 当没有文献向量时，创建默认的用户画像
        interestVector = this.generateDummyVector('Default User Profile');
      } else {
        interestVector = this.calculateWeightedAverage(vectors, weights);
      }

      // 识别核心兴趣主题：按相似度排序取 top-k，避免与预定义主题向量空间不一致时得到 0 个
      const themeScores: Array<{ theme: string; weight: number }> = [];
      for (const themeVector of this.themeVectors) {
        if (interestVector.length !== themeVector.vector.length) continue;
        const similarity = this.cosineSimilarity(interestVector, themeVector.vector);
        themeScores.push({ theme: themeVector.theme, weight: similarity });
      }
      themeScores.sort((a, b) => b.weight - a.weight);
      let coreThemes = themeScores
        .slice(0, 5)
        .filter(t => t.weight > 0.05)
        .map(t => ({ theme: t.theme, weight: t.weight }));
      if (coreThemes.length === 0 && themeScores.length > 0) {
        coreThemes = [{ theme: themeScores[0].theme, weight: themeScores[0].weight }];
      }

      // 提取高频关键词
      const keywords: Array<{ keyword: string; weight: number }> = Object.entries(allKeywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([keyword, count]) => ({ keyword, weight: count }));

      // 构建兴趣分布
      const interestDistribution: Record<string, number> = {};
      coreThemes.forEach(theme => {
        interestDistribution[theme.theme] = theme.weight;
      });

      const profile: UserProfile = {
        id: userID,
        interestVector,
        coreThemes,
        keywords,
        interestDistribution,
        lastUpdated: Date.now(),
        literatureItems // 存储文献列表
      };

      // 存储用户画像
      await this.vectorStore.insertUserProfile(profile);

      return profile;
    } catch (error) {
      ztoolkit.log(`Error building user profile: ${error}`);
      // 当出现错误时，返回默认的用户画像
      const defaultProfile: UserProfile = {
        id: userID,
        interestVector: this.generateDummyVector('Default User Profile'),
        coreThemes: [],
        keywords: [],
        interestDistribution: {},
        lastUpdated: Date.now(),
        literatureItems: []
      };
      await this.vectorStore.insertUserProfile(defaultProfile);
      return defaultProfile;
    }
  }

  /**
   * 获取用户画像
   */
  async getUserProfile(userID: string): Promise<UserProfile | null> {
    try {
      return await this.vectorStore.getUserProfile(userID);
    } catch (error) {
      ztoolkit.log(`Error getting user profile: ${error}`);
      return null;
    }
  }

  /**
   * 定期重建用户画像
   */
  async rebuildUserProfile(userID: string, literatureItems: LiteratureItem[]): Promise<UserProfile> {
    return this.buildUserProfile(userID, literatureItems);
  }

  /**
   * 仅基于关键词构建用户画像（无任何 API 调用，秒级完成）
   * 推荐时将用关键词匹配 + 重叠度排序，不再使用向量
   */
  async buildUserProfileKeywordOnly(userID: string, literatureItems: LiteratureItem[]): Promise<UserProfile> {
    const allKeywords: Record<string, number> = {};
    for (const literature of literatureItems) {
      const keywords = this.extractKeywords(literature);
      for (const keyword of keywords) {
        allKeywords[keyword] = (allKeywords[keyword] || 0) + 1;
      }
    }
    const keywords = Object.entries(allKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([keyword, count]) => ({ keyword, weight: count }));

    const profile: UserProfile = {
      id: userID,
      interestVector: [], // 空表示纯关键词模式，推荐时用关键词打分
      coreThemes: [],
      keywords,
      interestDistribution: {},
      lastUpdated: Date.now(),
      literatureItems,
    };
    await this.vectorStore.insertUserProfile(profile);
    return profile;
  }

  /** 重建仅关键词画像（同上，无向量） */
  async rebuildUserProfileKeywordOnly(userID: string, literatureItems: LiteratureItem[]): Promise<UserProfile> {
    return this.buildUserProfileKeywordOnly(userID, literatureItems);
  }
}
