import requests
import json

# 测试健康检查
def test_health():
    print("测试健康检查...")
    try:
        response = requests.get("http://localhost:5000/health")
        print(f"健康检查状态码: {response.status_code}")
        print(f"健康检查响应: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"健康检查失败: {e}")
        return False

# 测试搜索功能
def test_search():
    print("\n测试搜索功能...")
    try:
        response = requests.get("http://localhost:5000/search", params={
            "query": "machine learning",
            "maxResults": 3
        })
        print(f"搜索状态码: {response.status_code}")
        if response.status_code == 200:
            papers = response.json()
            print(f"找到 {len(papers)} 篇文献")
            for i, paper in enumerate(papers, 1):
                print(f"[{i}] 标题: {paper['title']}")
                print(f"作者: {', '.join(paper['authors'])}")
                print(f"发布日期: {paper['published']}")
                print("-" * 80)
        return response.status_code == 200
    except Exception as e:
        print(f"搜索失败: {e}")
        return False

# 测试按分类搜索
def test_search_by_category():
    print("\n测试按分类搜索...")
    try:
        response = requests.get("http://localhost:5000/search/category", params={
            "category": "cs.AI",
            "maxResults": 2
        })
        print(f"按分类搜索状态码: {response.status_code}")
        if response.status_code == 200:
            papers = response.json()
            print(f"找到 {len(papers)} 篇文献")
            for i, paper in enumerate(papers, 1):
                print(f"[{i}] 标题: {paper['title']}")
                print(f"分类: {', '.join(paper['categories'])}")
                print("-" * 80)
        return response.status_code == 200
    except Exception as e:
        print(f"按分类搜索失败: {e}")
        return False

# 测试获取最近文献
def test_get_recent_papers():
    print("\n测试获取最近文献...")
    try:
        response = requests.get("http://localhost:5000/recent", params={
            "category": "cs.LG",
            "days": 1
        })
        print(f"获取最近文献状态码: {response.status_code}")
        if response.status_code == 200:
            papers = response.json()
            print(f"找到 {len(papers)} 篇最近文献")
            for i, paper in enumerate(papers[:2], 1):  # 只显示前2篇
                print(f"[{i}] 标题: {paper['title']}")
                print(f"发布日期: {paper['published']}")
                print("-" * 80)
        return response.status_code == 200
    except Exception as e:
        print(f"获取最近文献失败: {e}")
        return False

if __name__ == "__main__":
    print("开始测试Python文献服务器...")
    print("=" * 80)
    
    # 运行所有测试
    tests = [
        test_health,
        test_search,
        test_search_by_category,
        test_get_recent_papers
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
    
    print("=" * 80)
    print(f"测试完成: {passed}/{total} 测试通过")
    if passed == total:
        print("所有测试通过！Python服务器运行正常。")
    else:
        print("部分测试失败，请检查服务器配置。")
