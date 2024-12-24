// Web Crawler Modal Functions
const crawlerModal = document.getElementById("crawlerModal");
const showCrawlerBtn = document.getElementById("showCrawlerBtn");
const crawlerUrl = document.getElementById("crawlerUrl");
const crawlerError = document.getElementById("crawlerError");
const crawlerResult = document.getElementById("crawlerResult");

// Show crawler modal
showCrawlerBtn.addEventListener("click", () => {
  crawlerModal.style.display = "flex";
  crawlerModal.classList.add("show");
  crawlerUrl.value = "";
  crawlerError.style.display = "none";
  crawlerResult.innerHTML = "";
});

// Close crawler modal
function closeCrawlerModal() {
  crawlerModal.classList.remove("show");
  setTimeout(() => {
    crawlerModal.style.display = "none";
  }, 300);
}

// Close modal when clicking outside
// window.addEventListener("click", (event) => {
//   if (event.target === crawlerModal) {
//     closeCrawlerModal();
//   }
// });

// Download text file
function downloadText(fileName) {
  window.location.href = `/api/download/${fileName}`;
}

// Start crawling function
async function startCrawling() {
  const url = crawlerUrl.value.trim();

  // Validate URL
  if (!url) {
    crawlerError.textContent = "请输入有效的网址";
    crawlerError.style.display = "block";
    return;
  }

  try {
    // Show loading state
    crawlerResult.innerHTML =
      '<div class="loading-text">正在爬取网站并检查链接，这可能需要几分钟...</div>';

    const response = await fetch("/api/crawl", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      throw new Error("爬取失败");
    }
    const data = await response.json();
    crawlerResult.innerHTML = `
            <div class="crawler-info">
                <h3>爬取成功！</h3>
                <p><strong>起始网址：</strong>${data.url}</p>
                <p><strong>总计爬取页面：</strong>${data.totalPages} 个</p>
                <p><strong>找到结果的页面：</strong>${data.resultsPages} 个</p>
            </div>
            <button onclick="downloadText('${data.fileName}')" class="download-btn">
                下载完整报告
            </button>
        `;
  } catch (error) {
    crawlerError.textContent = `错误：${error.message}`;
    crawlerError.style.display = "block";
    crawlerResult.innerHTML = "";
  }
}
