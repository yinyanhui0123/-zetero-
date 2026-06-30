import { LiteratureItem } from './literatureReader';

/**
 * OpenAI API 响应类型
 */
interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
  }>;
}

/** 向量生成配置：支持 OpenAI Embeddings 或 DeepSeek 对话 API 生成语义向量 */
export interface VectorGeneratorConfig {
  apiKey: string | null;
  apiProvider?: 'openai' | 'deepseek';
  apiEndpoint?: string;
  model?: string;
  chatApiUrl?: string;
  chatModel?: string;
}

const EMBED_DIM = 1536;
const DEEPSEEK_EMBED_DIM = 256; // 对话 API 输出 256 维，再填充到 1536 以统一存储

/**
 * 向量生成模块
 * 支持：OpenAI Embeddings API / DeepSeek 对话 API（无专用 embedding 时用对话生成向量）
 */
export class VectorGenerator {
  private apiKey: string | null = null;
  private apiEndpoint: string = 'https://api.openai.com/v1/embeddings';
  private model: string = 'text-embedding-3-small';
  private apiProvider: 'openai' | 'deepseek' = 'openai';
  private chatApiUrl: string = 'https://api.deepseek.com/v1/chat/completions';
  private chatModel: string = 'deepseek-chat';

  constructor(apiKey: string | null = null) {
    this.apiKey = apiKey;
  }

  /**
   * 设置 API 配置（OpenAI 用 embeddings；DeepSeek 用对话 API 生成向量）
   */
  public setApiConfig(
    apiKey: string | null,
    apiEndpoint?: string,
    model?: string,
    options?: { apiProvider?: 'openai' | 'deepseek'; chatApiUrl?: string; chatModel?: string }
  ) {
    this.apiKey = apiKey;
    if (apiEndpoint != null) this.apiEndpoint = apiEndpoint;
    if (model != null) this.model = model;
    if (options?.apiProvider != null) this.apiProvider = options.apiProvider;
    if (options?.chatApiUrl != null) this.chatApiUrl = options.chatApiUrl;
    if (options?.chatModel != null) this.chatModel = options.chatModel;
  }

  /**
   * 生成文献向量（根据 apiProvider 走 OpenAI Embeddings 或 DeepSeek 对话）
   */
  public async generateVector(literature: LiteratureItem): Promise<number[]> {
    try {
      const text = this.buildVectorText(literature);
      const truncated = text.slice(0, 6000);

      if (!this.apiKey || !this.apiKey.trim()) {
        return this.generateDummyVector(truncated);
      }
      if (this.apiProvider === 'deepseek') {
        return this.generateVectorViaChat(truncated);
      }
      return this.generateVectorWithApi(truncated);
    } catch (error) {
      ztoolkit.log(`Error generating vector: ${error}`);
      return this.generateDummyVector('');
    }
  }

  /**
   * 批量生成文献向量
   * @param literatures 文献对象数组
   * @returns 向量数组
   */
  public async generateVectors(literatures: LiteratureItem[]): Promise<Array<{ literature: LiteratureItem; vector: number[] }>> {
    const results: Array<{ literature: LiteratureItem; vector: number[] }> = [];

    for (const literature of literatures) {
      try {
        const vector = await this.generateVector(literature);
        results.push({ literature, vector });
      } catch (error) {
        ztoolkit.log(`Error generating vector for literature ${literature.id}: ${error}`);
        // 为失败的文献生成一个空向量
        results.push({ literature, vector: this.generateDummyVector('') });
      }
    }

    return results;
  }

  /**
   * 构建用于生成向量的文本
   * @param literature 文献对象
   * @returns 组合文本
   */
  private buildVectorText(literature: LiteratureItem): string {
    let text = `${literature.title}\n`;
    if (literature.abstract) {
      text += `${literature.abstract}\n`;
    }
    if (literature.authors && literature.authors.length > 0) {
      text += `Authors: ${literature.authors.join(', ')}\n`;
    }
    if (literature.publicationTitle) {
      text += `Publication: ${literature.publicationTitle}\n`;
    }
    if (literature.tags && literature.tags.length > 0) {
      text += `Tags: ${literature.tags.join(', ')}\n`;
    }
    return text;
  }

  /**
   * 使用 OpenAI Embeddings API 生成向量
   */
  private async generateVectorWithApi(text: string): Promise<number[]> {
    if (!this.apiKey) throw new Error('API key not set');

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);
    const data = (await response.json()) as unknown as EmbeddingResponse;
    return data.data[0].embedding;
  }

  /**
   * 使用 DeepSeek（或兼容的）对话 API 生成语义向量：让模型输出固定维度的数字表示
   * 输出 256 维再填充到 1536，与 OpenAI 向量同维便于存储与比较
   */
  private generateVectorViaChat(text: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const prompt = `You are an embedding model. For the following text, output exactly ${DEEPSEEK_EMBED_DIM} numbers in the range [-1, 1], comma-separated on one line. No other text or explanation. Only the numbers.\n\nText:\n${text}`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.chatApiUrl, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + this.apiKey);
      xhr.responseType = 'text';
      xhr.timeout = 60000;

      xhr.onload = () => {
        if (xhr.status !== 200) {
          ztoolkit.log(`VectorGenerator chat API error: ${xhr.status} ${xhr.responseText?.slice(0, 200)}`);
          resolve(this.generateDummyVector(text));
          return;
        }
        try {
          const json = JSON.parse(xhr.responseText || '{}');
          const content = json.choices?.[0]?.message?.content?.trim() || '';
          const parts = content.replace(/\s+/g, '').split(',');
          const nums: number[] = [];
          for (let i = 0; i < DEEPSEEK_EMBED_DIM && i < parts.length; i++) {
            const v = parseFloat(parts[i]);
            nums.push(Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);
          }
          while (nums.length < DEEPSEEK_EMBED_DIM) nums.push(0);
          const padded = this.padToDimension(nums.slice(0, DEEPSEEK_EMBED_DIM), EMBED_DIM);
          resolve(padded);
        } catch (e) {
          ztoolkit.log(`VectorGenerator parse chat response error: ${e}`);
          resolve(this.generateDummyVector(text));
        }
      };
      xhr.onerror = () => {
        ztoolkit.log('VectorGenerator chat API network error');
        resolve(this.generateDummyVector(text));
      };
      xhr.ontimeout = () => {
        ztoolkit.log('VectorGenerator chat API timeout');
        resolve(this.generateDummyVector(text));
      };
      try {
        xhr.send(
          JSON.stringify({
            model: this.chatModel,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
          })
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  private padToDimension(vec: number[], targetDim: number): number[] {
    if (vec.length >= targetDim) return vec.slice(0, targetDim);
    const out = [...vec];
    while (out.length < targetDim) {
      for (let i = 0; i < vec.length && out.length < targetDim; i++) out.push(vec[i]);
    }
    return out.slice(0, targetDim);
  }

  /**
   * 本地伪向量（无 API 或失败时回退）
   */
  private generateDummyVector(text: string): number[] {
    const vector: number[] = [];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    for (let i = 0; i < EMBED_DIM; i++) {
      vector.push(Math.sin(i + hash) * 0.5 + 0.5);
    }
    return vector;
  }
}
