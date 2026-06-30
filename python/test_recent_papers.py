import requests
import json
import datetime

# 测试获取最近文献的详细信息
def test_recent_papers_detail():
    print("测试获取最近文献的详细信息...")
    print(f"当前时间: {datetime.datetime.now()}")
    
    # 测试不同的分类和天数
    test_cases = [
        ("cs.AI", 1),    # 今天
        ("cs.LG", 1),    # 今天
        ("cs.AI", 7),    # 最近7天
        ("cs.LG", 7),    # 最近7天
    ]
    
    for category, days in test_cases:
        print(f"\n测试分类: {category}, 天数: {days}")
        print("-" * 80)
        
        try:
            response = requests.get("http://localhost:5000/recent", params={
                "category": category,
                "days": days
            })
            
            print(f"状态码: {response.status_code}")
            
            if response.status_code == 200:
                papers = response.json()
                print(f"返回的文献数量: {len(papers)}")
                
                if papers:
                    print("前3篇文献:")
                    for i, paper in enumerate(papers[:3], 1):
                        print(f"[{i}] 标题: {paper['title']}")
                        print(f"  发布日期: {paper['published']}")
                        print(f"  分类: {', '.join(paper['categories'])}")
                else:
                    print("没有找到符合条件的文献")
            else:
                print(f"请求失败: {response.status_code}")
                print(f"响应内容: {response.text}")
                
        except Exception as e:
            print(f"测试失败: {e}")

if __name__ == "__main__":
    test_recent_papers_detail()
