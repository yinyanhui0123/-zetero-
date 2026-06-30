import { ArxivCrawler } from './modules/arxivCrawler';

async function testArxivCrawler() {
  const zotero = (globalThis as any).Zotero;
  const crawler = new ArxivCrawler(zotero);

  console.log('Testing arXiv Crawler...');

  try {
    console.log('\n1. Testing search by keyword "machine learning"...');
    const papers = await crawler.searchPapers({
      query: 'all:machine learning',
      maxResults: 5
    });

    console.log(`Found ${papers.length} papers:`);
    papers.forEach((paper, index) => {
      console.log(`\nPaper ${index + 1}:`);
      console.log(`  Title: ${paper.title}`);
      console.log(`  Authors: ${paper.authors.join(', ')}`);
      console.log(`  ID: ${paper.id}`);
      console.log(`  Categories: ${paper.categories.join(', ')}`);
      console.log(`  Published: ${paper.published}`);
      console.log(`  Abstract: ${paper.abstract.substring(0, 100)}...`);
    });

    console.log('\n2. Testing search by category "cs.AI"...');
    const aiPapers = await crawler.searchByCategory('cs.AI', { maxResults: 3 });
    console.log(`Found ${aiPapers.length} AI papers:`);
    aiPapers.forEach((paper, index) => {
      console.log(`\nAI Paper ${index + 1}:`);
      console.log(`  Title: ${paper.title}`);
      console.log(`  ID: ${paper.id}`);
    });

    console.log('\n3. Testing get recent papers (last 7 days)...');
    const recentPapers = await crawler.getRecentPapers('cs.AI', 7);
    console.log(`Found ${recentPapers.length} recent papers:`);
    recentPapers.forEach((paper, index) => {
      console.log(`\nRecent Paper ${index + 1}:`);
      console.log(`  Title: ${paper.title}`);
      console.log(`  Published: ${paper.published}`);
    });

    console.log('\n✓ All tests passed!');
  } catch (error) {
    console.error('✗ Test failed:', error);
  }
}

export { testArxivCrawler };
