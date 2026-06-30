// Recommended Papers Window Logic

/**
 * 获取文献在浏览器中打开的 URL（优先摘要页）
 * arXiv: https://arxiv.org/abs/{id}，否则使用 pdfUrl 或 url
 */
function getPaperPageUrl(paper) {
  if (paper.id && (paper.categories || paper.title || /arxiv/i.test(paper.publicationTitle || ''))) {
    return 'https://arxiv.org/abs/' + String(paper.id);
  }
  if (paper.pdfUrl) return paper.pdfUrl;
  if (paper.pdf_url) return paper.pdf_url;
  if (paper.url) return paper.url;
  return null;
}

/**
 * 在系统默认浏览器中打开 URL
 */
function openPaperInBrowser(url) {
  if (!url) return;
  try {
    if (window.opener && window.opener.Zotero && typeof window.opener.Zotero.launchURL === 'function') {
      window.opener.Zotero.launchURL(url);
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    window.open(url, '_blank');
  }
}

/**
 * 渲染推荐文献列表
 */
function displayRecommendedPapers() {
  const papersContainer = document.getElementById('papers-container');
  const papers = window.recommendedPapers || [];

  if (papers.length === 0) {
    papersContainer.innerHTML = '<p class="papers-empty">暂无推荐文献。</p>';
    papersContainer.className = 'papers-list';
    return;
  }

  papersContainer.innerHTML = '';
  papersContainer.className = 'papers-list';

  papers.forEach(function (paper, index) {
    const paperItem = document.createElement('div');
    paperItem.className = 'paper-item';

    const titleEl = document.createElement('div');
    titleEl.className = 'paper-title';
    titleEl.textContent = (index + 1) + '. ' + (paper.title || 'Untitled');
    paperItem.appendChild(titleEl);

    const authors = paper.authors && paper.authors.length ? paper.authors.join(', ') : 'Unknown';
    const authorsEl = document.createElement('div');
    authorsEl.className = 'paper-meta paper-authors';
    authorsEl.textContent = 'Authors: ' + authors;
    paperItem.appendChild(authorsEl);

    const sourceText = paper.published
      ? 'Source: arXiv · ' + new Date(paper.published).toLocaleDateString()
      : 'Source: arXiv';
    const sourceEl = document.createElement('div');
    sourceEl.className = 'paper-source';
    sourceEl.textContent = sourceText;
    paperItem.appendChild(sourceEl);

    const actionsBox = document.createElement('div');
    actionsBox.className = 'paper-actions';

    const pageUrl = getPaperPageUrl(paper);
    if (pageUrl) {
      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn-open';
      openBtn.textContent = '在浏览器中打开';
      openBtn.addEventListener('click', function () {
        openPaperInBrowser(pageUrl);
      });
      actionsBox.appendChild(openBtn);
    }

    paperItem.appendChild(actionsBox);
    papersContainer.appendChild(paperItem);
  });
}

// 页面加载时渲染
window.addEventListener('load', function () {
  displayRecommendedPapers();
});

// 暴露供外部调用
window.displayRecommendedPapers = displayRecommendedPapers;
window.openPaperInBrowser = openPaperInBrowser;
window.getPaperPageUrl = getPaperPageUrl;
