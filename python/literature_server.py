from flask import Flask, request, jsonify
import arxiv
import urllib3
import json
import time

# 禁用SSL警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

# 配置
app.config['JSON_SORT_KEYS'] = False

# 生成5-10秒的随机延迟
async def delay():
    delay_ms = 2000  # 减少延迟，提高响应速度
    time.sleep(delay_ms / 1000)

# 搜索文献
@app.route('/search', methods=['GET'])
def search_papers():
    try:
        # 获取参数
        query = request.args.get('query', '')
        max_results = int(request.args.get('maxResults', 20))
        sort_by = request.args.get('sortBy', 'relevance')
        sort_order = request.args.get('sortOrder', 'descending')
        start = int(request.args.get('start', 0))
        
        # 映射排序参数
        sort_criterion = arxiv.SortCriterion.Relevance
        if sort_by == 'lastUpdatedDate':
            sort_criterion = arxiv.SortCriterion.LastUpdatedDate
        elif sort_by == 'submittedDate':
            sort_criterion = arxiv.SortCriterion.SubmittedDate
        
        # 执行搜索
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=sort_criterion,
            sort_order=arxiv.SortOrder.Descending if sort_order == 'descending' else arxiv.SortOrder.Ascending
        )
        
        # 获取结果
        results = list(search.results())
        papers = []
        
        # 转换为插件需要的格式
        for result in results:
            paper = {
                'id': result.entry_id.split('/')[-1],
                'title': result.title,
                'authors': [author.name for author in result.authors],
                'abstract': result.summary,
                'published': result.published.isoformat(),
                'updated': result.updated.isoformat(),
                'categories': result.categories,
                'pdfUrl': result.pdf_url,
                'doi': getattr(result, 'doi', None),
                'journalRef': getattr(result, 'journal_ref', None)
            }
            papers.append(paper)
        
        # 添加延迟
        time.sleep(1)  # 减少延迟
        
        return jsonify(papers)
    except Exception as e:
        app.logger.error(f"Error searching papers: {e}")
        return jsonify({'error': str(e)}), 500

# 根据ID获取文献
@app.route('/paper/<arxiv_id>', methods=['GET'])
def get_paper_by_id(arxiv_id):
    try:
        # 构建查询
        search = arxiv.Search(
            query=f'id:{arxiv_id}',
            max_results=1
        )
        
        # 获取结果
        results = list(search.results())
        if not results:
            return jsonify(None)
        
        result = results[0]
        paper = {
            'id': result.entry_id.split('/')[-1],
            'title': result.title,
            'authors': [author.name for author in result.authors],
            'abstract': result.summary,
            'published': result.published.isoformat(),
            'updated': result.updated.isoformat(),
            'categories': result.categories,
            'pdfUrl': result.pdf_url,
            'doi': getattr(result, 'doi', None),
            'journalRef': getattr(result, 'journal_ref', None)
        }
        
        return jsonify(paper)
    except Exception as e:
        app.logger.error(f"Error getting paper by ID: {e}")
        return jsonify({'error': str(e)}), 500

# 按分类搜索
@app.route('/search/category', methods=['GET'])
def search_by_category():
    try:
        category = request.args.get('category', '')
        max_results = int(request.args.get('maxResults', 20))
        sort_by = request.args.get('sortBy', 'relevance')
        sort_order = request.args.get('sortOrder', 'descending')
        start = int(request.args.get('start', 0))
        
        # 映射排序参数
        sort_criterion = arxiv.SortCriterion.Relevance
        if sort_by == 'lastUpdatedDate':
            sort_criterion = arxiv.SortCriterion.LastUpdatedDate
        elif sort_by == 'submittedDate':
            sort_criterion = arxiv.SortCriterion.SubmittedDate
        
        # 执行搜索
        search = arxiv.Search(
            query=f'cat:{category}',
            max_results=max_results,
            sort_by=sort_criterion,
            sort_order=arxiv.SortOrder.Descending if sort_order == 'descending' else arxiv.SortOrder.Ascending
        )
        
        # 获取结果
        results = list(search.results())
        papers = []
        
        # 转换为插件需要的格式
        for result in results:
            paper = {
                'id': result.entry_id.split('/')[-1],
                'title': result.title,
                'authors': [author.name for author in result.authors],
                'abstract': result.summary,
                'published': result.published.isoformat(),
                'updated': result.updated.isoformat(),
                'categories': result.categories,
                'pdfUrl': result.pdf_url,
                'doi': getattr(result, 'doi', None),
                'journalRef': getattr(result, 'journal_ref', None)
            }
            papers.append(paper)
        
        return jsonify(papers)
    except Exception as e:
        app.logger.error(f"Error searching by category: {e}")
        return jsonify({'error': str(e)}), 500

# 按作者搜索
@app.route('/search/author', methods=['GET'])
def search_by_author():
    try:
        author = request.args.get('author', '')
        max_results = int(request.args.get('maxResults', 20))
        sort_by = request.args.get('sortBy', 'relevance')
        sort_order = request.args.get('sortOrder', 'descending')
        start = int(request.args.get('start', 0))
        
        # 映射排序参数
        sort_criterion = arxiv.SortCriterion.Relevance
        if sort_by == 'lastUpdatedDate':
            sort_criterion = arxiv.SortCriterion.LastUpdatedDate
        elif sort_by == 'submittedDate':
            sort_criterion = arxiv.SortCriterion.SubmittedDate
        
        # 执行搜索
        search = arxiv.Search(
            query=f'au:{author}',
            max_results=max_results,
            sort_by=sort_criterion,
            sort_order=arxiv.SortOrder.Descending if sort_order == 'descending' else arxiv.SortOrder.Ascending
        )
        
        # 获取结果
        results = list(search.results())
        papers = []
        
        # 转换为插件需要的格式
        for result in results:
            paper = {
                'id': result.entry_id.split('/')[-1],
                'title': result.title,
                'authors': [author.name for author in result.authors],
                'abstract': result.summary,
                'published': result.published.isoformat(),
                'updated': result.updated.isoformat(),
                'categories': result.categories,
                'pdfUrl': result.pdf_url,
                'doi': getattr(result, 'doi', None),
                'journalRef': getattr(result, 'journal_ref', None)
            }
            papers.append(paper)
        
        return jsonify(papers)
    except Exception as e:
        app.logger.error(f"Error searching by author: {e}")
        return jsonify({'error': str(e)}), 500

# 按关键词搜索
@app.route('/search/keyword', methods=['GET'])
def search_by_keyword():
    try:
        keyword = request.args.get('keyword', '')
        max_results = int(request.args.get('maxResults', 20))
        sort_by = request.args.get('sortBy', 'relevance')
        sort_order = request.args.get('sortOrder', 'descending')
        start = int(request.args.get('start', 0))
        
        # 映射排序参数
        sort_criterion = arxiv.SortCriterion.Relevance
        if sort_by == 'lastUpdatedDate':
            sort_criterion = arxiv.SortCriterion.LastUpdatedDate
        elif sort_by == 'submittedDate':
            sort_criterion = arxiv.SortCriterion.SubmittedDate
        
        # 执行搜索
        search = arxiv.Search(
            query=f'all:{keyword}',
            max_results=max_results,
            sort_by=sort_criterion,
            sort_order=arxiv.SortOrder.Descending if sort_order == 'descending' else arxiv.SortOrder.Ascending
        )
        
        # 获取结果
        results = list(search.results())
        papers = []
        
        # 转换为插件需要的格式
        for result in results:
            paper = {
                'id': result.entry_id.split('/')[-1],
                'title': result.title,
                'authors': [author.name for author in result.authors],
                'abstract': result.summary,
                'published': result.published.isoformat(),
                'updated': result.updated.isoformat(),
                'categories': result.categories,
                'pdfUrl': result.pdf_url,
                'doi': getattr(result, 'doi', None),
                'journalRef': getattr(result, 'journal_ref', None)
            }
            papers.append(paper)
        
        return jsonify(papers)
    except Exception as e:
        app.logger.error(f"Error searching by keyword: {e}")
        return jsonify({'error': str(e)}), 500

# 获取最近文献
@app.route('/recent', methods=['GET'])
def get_recent_papers():
    try:
        category = request.args.get('category', '')
        days = int(request.args.get('days', 7))
        max_results = int(request.args.get('maxResults', 100))
        
        # 计算日期
        import datetime
        date = datetime.datetime.now() - datetime.timedelta(days=days)
        date_str = date.strftime('%Y-%m-%d')
        
        # 执行搜索（简化查询，避免复杂的日期范围）
        search_query = f'cat:{category}'
        search = arxiv.Search(
            query=search_query,
            max_results=max(1, min(200, max_results)),
            sort_by=arxiv.SortCriterion.LastUpdatedDate,
            sort_order=arxiv.SortOrder.Descending
        )
        
        # 获取结果
        results = list(search.results())
        papers = []
        
        # 过滤最近的文献
        # 转换为带时区的datetime
        import datetime
        import pytz
        
        # 获取当前时间（带时区）
        now = datetime.datetime.now(pytz.UTC)
        cutoff_date = now - datetime.timedelta(days=days)
        
        app.logger.info(f"Current time (UTC): {now}")
        app.logger.info(f"Cutoff date (UTC): {cutoff_date}")
        app.logger.info(f"Found {len(results)} papers in total")
        
        for result in results:
            # 检查发布日期和更新日期
            app.logger.info(f"Paper {result.title} published on {result.published}, updated on {result.updated}")
            if result.published >= cutoff_date or result.updated >= cutoff_date:
                app.logger.info(f"Paper {result.title} is recent, adding to results")
                paper = {
                    'id': result.entry_id.split('/')[-1],
                    'title': result.title,
                    'authors': [author.name for author in result.authors],
                    'abstract': result.summary,
                    'published': result.published.isoformat(),
                    'updated': result.updated.isoformat(),
                    'categories': result.categories,
                    'pdfUrl': result.pdf_url,
                    'doi': getattr(result, 'doi', None),
                    'journalRef': getattr(result, 'journal_ref', None)
                }
                papers.append(paper)
        
        app.logger.info(f"Filtered to {len(papers)} recent papers")
        
        return jsonify(papers)
    except Exception as e:
        app.logger.error(f"Error getting recent papers: {e}")
        return jsonify({'error': str(e)}), 500

# 健康检查
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    app.run(host='localhost', port=5000, debug=False)
