import { LiteratureItem } from './literatureReader';

// 向量类型定义
export interface VectorData {
  id: number;
  literatureId: number;
  vector: number[];
  metadata: any;
  createdAt: Date;
}

// 用户画像类型定义
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

/**
 * 向量存储模块
 * 使用Zotero内置的SQLite实现向量的存储和查询
 */
export class VectorStore {
  private dbPath: string;
  private db: any = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * 初始化数据库
   * 向量/文献表使用 Zotero.DB；用户画像改用 JSON 文件存储（bootstrap 读写），避免 SQLite 兼容问题
   */
  public async initialize(): Promise<void> {
    try {
      const zotero = ztoolkit.getGlobal("Zotero");
      this.db = (zotero as any).DB ?? null;
      await this.createTables();
    } catch (error) {
      ztoolkit.log(`Error initializing vector store: ${error}`);
      throw error;
    }
  }

  /** 用户画像 JSON 文件路径（与 dbPath 同目录，避免依赖 SQLite） */
  private getProfileFilePath(): string {
    return this.dbPath.replace(/literature-tracker\.sqlite$/i, "literature-tracker-profile.json");
  }

  /**
   * 执行SQL语句
   */
  private async executeSQL(sql: string, params?: any[]): Promise<void> {
    try {
      // 尝试不同的数据库执行方法
      if (this.db) {
        if (this.db.execute) {
          // 使用execute方法
          await this.db.execute(sql, params);
        } else if (this.db.executeQuery) {
          // 使用executeQuery方法
          this.db.executeQuery(sql, params);
        } else if (this.db.executeTransaction) {
          // 使用executeTransaction方法
          await this.db.executeTransaction(async (connection: any) => {
            if (connection.execute) {
              await connection.execute(sql, params);
            } else if (connection.executeQuery) {
              connection.executeQuery(sql, params);
            } else {
              // 尝试直接使用Zotero的SQLite方法
              const zotero = ztoolkit.getGlobal("Zotero");
              if (zotero.SQLite) {
                const dbPath = this.dbPath;
                await new Promise<void>((resolve, reject) => {
                  zotero.SQLite.DB.execute(dbPath, sql, params || [], (success: boolean) => {
                    if (success) {
                      resolve();
                    } else {
                      reject(new Error('SQL execution failed'));
                    }
                  });
                });
              } else {
                throw new Error('No suitable database execution method found');
              }
            }
          });
        } else {
          // 尝试直接使用Zotero的SQLite方法
          const zotero = ztoolkit.getGlobal("Zotero");
          if (zotero.SQLite) {
            const dbPath = this.dbPath;
            await new Promise<void>((resolve, reject) => {
              zotero.SQLite.DB.execute(dbPath, sql, params || [], (success: boolean) => {
                if (success) {
                  resolve();
                } else {
                  reject(new Error('SQL execution failed'));
                }
              });
            });
          } else {
            throw new Error('No suitable database execution method found');
          }
        }
      } else {
        // 直接使用Zotero的SQLite方法
        const zotero = ztoolkit.getGlobal("Zotero");
        if (zotero.SQLite) {
          const dbPath = this.dbPath;
          await new Promise<void>((resolve, reject) => {
            zotero.SQLite.DB.execute(dbPath, sql, params || [], (success: boolean) => {
              if (success) {
                resolve();
              } else {
                reject(new Error('SQL execution failed'));
              }
            });
          });
        } else {
          throw new Error('No suitable database execution method found');
        }
      }
    } catch (error) {
      ztoolkit.log(`Error executing SQL: ${sql}\nError: ${error}`);
      throw error;
    }
  }

  /**
   * 执行查询SQL语句
   */
  private async querySQL(sql: string, params?: any[]): Promise<any[]> {
    try {
      // 尝试不同的数据库查询方法
      if (this.db) {
        if (this.db.queryAsync) {
          // 使用queryAsync方法
          return await this.db.queryAsync(sql, params);
        } else if (this.db.query) {
          // 使用query方法
          return this.db.query(sql, params);
        } else if (this.db.executeTransaction) {
          // 使用executeTransaction方法
          return await this.db.executeTransaction(async (connection: any) => {
            if (connection.queryAsync) {
              return await connection.queryAsync(sql, params);
            } else if (connection.query) {
              return connection.query(sql, params);
            } else {
              // 尝试直接使用Zotero的SQLite方法
              const zotero = ztoolkit.getGlobal("Zotero");
              if (zotero.SQLite) {
                const dbPath = this.dbPath;
                return await new Promise<any[]>((resolve, reject) => {
                  zotero.SQLite.DB.query(dbPath, sql, params || [], (rows: any[]) => {
                    resolve(rows);
                  }, (error: any) => {
                    reject(error);
                  });
                });
              } else {
                throw new Error('No suitable database query method found');
              }
            }
          });
        } else {
          // 尝试直接使用Zotero的SQLite方法
          const zotero = ztoolkit.getGlobal("Zotero");
          if (zotero.SQLite) {
            const dbPath = this.dbPath;
            return await new Promise<any[]>((resolve, reject) => {
              zotero.SQLite.DB.query(dbPath, sql, params || [], (rows: any[]) => {
                resolve(rows);
              }, (error: any) => {
                reject(error);
              });
            });
          } else {
            throw new Error('No suitable database query method found');
          }
        }
      } else {
        // 直接使用Zotero的SQLite方法
        const zotero = ztoolkit.getGlobal("Zotero");
        if (zotero.SQLite) {
          const dbPath = this.dbPath;
          return await new Promise<any[]>((resolve, reject) => {
            zotero.SQLite.DB.query(dbPath, sql, params || [], (rows: any[]) => {
              resolve(rows);
            }, (error: any) => {
              reject(error);
            });
          });
        } else {
          throw new Error('No suitable database query method found');
        }
      }
    } catch (error) {
      ztoolkit.log(`Error querying SQL: ${sql}\nError: ${error}`);
      throw error;
    }
  }

  /**
   * 创建设表结构
   */
  private async createTables(): Promise<void> {
    if (!this.db) return;
    // 创建文献表
    await this.executeSQL(`
      CREATE TABLE IF NOT EXISTS literature_tracker_literatures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        literature_id INTEGER UNIQUE,
        title TEXT,
        abstract TEXT,
        authors TEXT,
        publication_title TEXT,
        date TEXT,
        doi TEXT,
        url TEXT,
        tags TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 创建向量表
    await this.executeSQL(`
      CREATE TABLE IF NOT EXISTS literature_tracker_vectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        literature_id INTEGER UNIQUE,
        vector TEXT,  -- 向量以JSON字符串形式存储
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 创建配置表
    await this.executeSQL(`
      CREATE TABLE IF NOT EXISTS literature_tracker_config (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 创建用户画像表
    await this.executeSQL(`
      CREATE TABLE IF NOT EXISTS literature_tracker_user_profiles (
        id TEXT PRIMARY KEY,
        interest_vector TEXT,  -- 兴趣中心向量以JSON字符串形式存储
        core_themes TEXT,      -- 核心主题以JSON字符串形式存储
        keywords TEXT,         -- 关键词以JSON字符串形式存储
        interest_distribution TEXT,  -- 兴趣分布以JSON字符串形式存储
        last_updated INTEGER,  -- 最后更新时间戳
        literature_items TEXT, -- 文献项以JSON字符串形式存储（可选）
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 创建索引
    await this.executeSQL(`
      CREATE INDEX IF NOT EXISTS idx_literatures_literature_id ON literature_tracker_literatures(literature_id);
      CREATE INDEX IF NOT EXISTS idx_vectors_literature_id ON literature_tracker_vectors(literature_id);
      CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON literature_tracker_user_profiles(id);
    `);
  }

  /**
   * 插入文献向量
   * @param literature 文献对象
   * @param vector 向量数据
   */
  public async insertVector(literature: LiteratureItem, vector: number[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const metadata = JSON.stringify({
      authors: literature.authors,
      publicationTitle: literature.publicationTitle,
      date: literature.date,
      doi: literature.doi,
      tags: literature.tags
    });

    // 插入文献数据
    await this.executeSQL(
      `
      INSERT OR REPLACE INTO literature_tracker_literatures (
        literature_id, title, abstract, authors, publication_title, date, doi, url, tags, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        literature.id,
        literature.title,
        literature.abstract,
        JSON.stringify(literature.authors),
        literature.publicationTitle,
        literature.date,
        literature.doi,
        literature.url,
        JSON.stringify(literature.tags),
        metadata
      ]
    );

    // 插入向量数据
    await this.executeSQL(
      `
      INSERT OR REPLACE INTO literature_tracker_vectors (literature_id, vector, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      `,
      [literature.id, JSON.stringify(vector)]
    );
  }

  /**
   * 批量插入文献向量
   * @param items 文献和向量的数组
   */
  public async batchInsertVectors(items: Array<{
    literature: LiteratureItem;
    vector: number[];
  }>): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // 开始事务
    await this.executeSQL('BEGIN TRANSACTION');

    try {
      for (const item of items) {
        await this.insertVector(item.literature, item.vector);
      }
      await this.executeSQL('COMMIT');
    } catch (error) {
      await this.executeSQL('ROLLBACK');
      throw error;
    }
  }

  /**
   * 搜索相似向量
   * @param queryVector 查询向量
   * @param limit 返回数量限制
   * @param threshold 相似度阈值
   */
  public async searchSimilarVectors(
    queryVector: number[],
    limit: number = 10,
    threshold: number = 0.7
  ): Promise<Array<{
    literatureId: number;
    similarity: number;
    metadata: any;
  }>> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // 获取所有向量
    const vectors = await this.querySQL(
      `
      SELECT 
        v.literature_id,
        v.vector,
        l.metadata
      FROM literature_tracker_vectors v
      JOIN literature_tracker_literatures l ON v.literature_id = l.literature_id
      `
    );

    // 计算相似度
    const results: Array<{
      literatureId: number;
      similarity: number;
      metadata: any;
    }> = [];

    for (const row of vectors) {
      try {
        const vector = JSON.parse(row.vector);
        const similarity = this.cosineSimilarity(queryVector, vector);

        if (similarity >= threshold) {
          results.push({
            literatureId: row.literature_id,
            similarity,
            metadata: JSON.parse(row.metadata)
          });
        }
      } catch (error) {
        ztoolkit.log(`Error processing vector: ${error}`);
      }
    }

    // 按相似度排序并限制返回数量
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * 计算余弦相似度
   * @param vec1 向量1
   * @param vec2 向量2
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

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * 根据文献ID获取向量
   * @param literatureId 文献ID
   */
  public async getVectorByLiteratureId(literatureId: number): Promise<VectorData | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const row = await this.querySQL(
      `
      SELECT 
        v.id,
        v.literature_id,
        v.vector,
        l.metadata,
        v.created_at
      FROM literature_tracker_vectors v
      JOIN literature_tracker_literatures l ON v.literature_id = l.literature_id
      WHERE v.literature_id = ?
      `,
      [literatureId]
    );

    if (!row || row.length === 0) {
      return null;
    }

    const data = row[0];

    return {
      id: data.id,
      literatureId: data.literature_id,
      vector: JSON.parse(data.vector),
      metadata: JSON.parse(data.metadata),
      createdAt: new Date(data.created_at)
    };
  }

  /**
   * 删除文献向量
   * @param literatureId 文献ID
   */
  public async deleteVector(literatureId: number): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    await this.executeSQL(
      'DELETE FROM literature_tracker_vectors WHERE literature_id = ?',
      [literatureId]
    );

    await this.executeSQL(
      'DELETE FROM literature_tracker_literatures WHERE literature_id = ?',
      [literatureId]
    );
  }

  /**
   * 清空向量存储
   */
  public async clear(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    await this.executeSQL('DELETE FROM literature_tracker_vectors');
    await this.executeSQL('DELETE FROM literature_tracker_literatures');
  }

  /**
   * 获取向量存储的统计信息
   */
  public async getStats(): Promise<{
    totalVectors: number;
    totalLiteratures: number;
  }> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const vectorCount = await this.querySQL(
      'SELECT COUNT(*) as count FROM literature_tracker_vectors'
    );

    const literatureCount = await this.querySQL(
      'SELECT COUNT(*) as count FROM literature_tracker_literatures'
    );

    return {
      totalVectors: vectorCount[0].count,
      totalLiteratures: literatureCount[0].count
    };
  }

  /**
   * 设置配置项
   * @param key 配置键
   * @param value 配置值
   */
  public async setConfig(key: string, value: any): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    await this.executeSQL(
      `
      INSERT OR REPLACE INTO literature_tracker_config (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      `,
      [key, JSON.stringify(value)]
    );
  }

  /**
   * 获取配置项
   * @param key 配置键
   * @param defaultValue 默认值
   */
  public async getConfig(key: string, defaultValue: any = null): Promise<any> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const row = await this.querySQL(
      'SELECT value FROM literature_tracker_config WHERE key = ?',
      [key]
    );

    if (!row || row.length === 0) {
      return defaultValue;
    }

    try {
      return JSON.parse(row[0].value);
    } catch {
      return defaultValue;
    }
  }

  /**
   * 插入用户画像（优先写入 JSON 文件，由 bootstrap 读写，避免 Zotero 环境 SQLite 不可用）
   */
  public async insertUserProfile(profile: UserProfile): Promise<void> {
    const zotero = ztoolkit.getGlobal("Zotero") as any;
    const writeFile = zotero?.LiteratureTrackerWriteTextFile;
    const path = this.getProfileFilePath();
    if (typeof writeFile === "function") {
      const ok = writeFile(path, JSON.stringify(profile));
      if (ok) return;
    }
    if (!this.db) throw new Error("Database not initialized");
    await this.executeSQL(
      `INSERT OR REPLACE INTO literature_tracker_user_profiles (
        id, interest_vector, core_themes, keywords, interest_distribution, last_updated, literature_items
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        JSON.stringify(profile.interestVector),
        JSON.stringify(profile.coreThemes),
        JSON.stringify(profile.keywords),
        JSON.stringify(profile.interestDistribution),
        profile.lastUpdated,
        JSON.stringify(profile.literatureItems || []),
      ]
    );
  }

  /**
   * 获取用户画像（优先从 JSON 文件读取）
   */
  public async getUserProfile(userId: string): Promise<UserProfile | null> {
    const zotero = ztoolkit.getGlobal("Zotero") as any;
    const readFile = zotero?.LiteratureTrackerReadTextFile;
    const path = this.getProfileFilePath();
    if (typeof readFile === "function") {
      const raw = readFile(path);
      if (raw != null && raw !== "") {
        try {
          const profile = JSON.parse(raw) as UserProfile;
          if (profile && profile.id != null) return profile;
        } catch (_) {
          ztoolkit.log("getUserProfile: failed to parse profile JSON");
        }
      }
    }
    if (!this.db) return null;
    const row = await this.querySQL(
      `SELECT id, interest_vector, core_themes, keywords, interest_distribution, last_updated, literature_items
       FROM literature_tracker_user_profiles WHERE id = ?`,
      [userId]
    );
    if (!row || row.length === 0) return null;
    const data = row[0];
    return {
      id: data.id,
      interestVector: JSON.parse(data.interest_vector),
      coreThemes: JSON.parse(data.core_themes),
      keywords: JSON.parse(data.keywords),
      interestDistribution: JSON.parse(data.interest_distribution),
      lastUpdated: data.last_updated,
      literatureItems: data.literature_items ? JSON.parse(data.literature_items) : undefined,
    };
  }

  /**
   * 删除用户画像
   * @param userId 用户ID
   */
  public async deleteUserProfile(userId: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    await this.executeSQL(
      'DELETE FROM literature_tracker_user_profiles WHERE id = ?',
      [userId]
    );
  }

  /**
   * 清空用户画像
   */
  public async clearUserProfiles(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    await this.executeSQL('DELETE FROM literature_tracker_user_profiles');
  }

  /**
   * 获取所有用户画像
   */
  public async getAllUserProfiles(): Promise<UserProfile[]> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const rows = await this.querySQL(
      `
      SELECT 
        id, 
        interest_vector, 
        core_themes, 
        keywords, 
        interest_distribution, 
        last_updated, 
        literature_items
      FROM literature_tracker_user_profiles
      `
    );

    return rows.map((row: any) => ({
      id: row.id,
      interestVector: JSON.parse(row.interest_vector),
      coreThemes: JSON.parse(row.core_themes),
      keywords: JSON.parse(row.keywords),
      interestDistribution: JSON.parse(row.interest_distribution),
      lastUpdated: row.last_updated,
      literatureItems: row.literature_items ? JSON.parse(row.literature_items) : undefined
    }));
  }

  /**
   * 获取最后推送日期
   */
  public async getLastPushDate(): Promise<Date | null> {
    const lastPush = await this.getConfig("lastPushDate", null);
    return lastPush ? new Date(lastPush) : null;
  }

  /**
   * 设置最后推送日期
   */
  public async setLastPushDate(date: Date): Promise<void> {
    await this.setConfig("lastPushDate", date.toISOString());
  }

  /**
   * 关闭数据库连接
   */
  public async close(): Promise<void> {
    // Zotero内置的数据库连接不需要手动关闭
    // 这里可以添加其他清理逻辑
  }
}
