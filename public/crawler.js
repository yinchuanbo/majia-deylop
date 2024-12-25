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
async function downloadText(fileNames) {
  if (typeof fileNames === "string") {
    window.location.href = `/api/download/${fileNames}`;
    return;
  }

  // Download multiple files
  for (const fileName of fileNames) {
    if (fileName) {
      const link = document.createElement("a");
      link.href = `/api/download/${fileName}`;
      link.click();
      // Small delay between downloads to prevent browser blocking
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function crawlWebsite(url) {
  const response = await fetch("/api/crawl", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    return null;
  }
  return await response.json();
}

// Start crawling function
async function startCrawling() {
  let url = crawlerUrl.value.trim();

  // Validate URL
  if (!url) {
    crawlerError.textContent = "请输入有效的网址";
    crawlerError.style.display = "block";
    return;
  }

  url += ",";

  try {
    // Show loading state
    crawlerResult.innerHTML =
      '<div class="loading-spinner"></div><p>正在爬取中，请稍候...</p>';
    crawlerError.style.display = "none";

    let results = null;
    let fileNames = [];
    let totalPages = 0;
    let resultsPages = 0;

    if (url?.includes(",")) {
      const urls = url.split(",").filter(Boolean);
      console.log("urls", urls);
      results = await Promise.allSettled(urls.map((url) => crawlWebsite(url)));

      // Process results
      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          totalPages += result.value.totalPages || 0;
          resultsPages += result.value.resultsPages || 0;
          if (result.value.fileName) {
            fileNames.push(result.value.fileName);
          }
        }
      });
    } else {
      const result = await crawlWebsite(url.replace(",", ""));
      if (result) {
        totalPages = result.totalPages;
        resultsPages = result.resultsPages;
        fileNames = [result.fileName];
      }
    }

    if (fileNames.length === 0) {
      throw new Error("爬取失败：未能获取任何结果");
    }

    crawlerResult.innerHTML = `
      <div class="crawler-info">
        <h3>爬取成功！</h3>
        <p><strong>总计爬取网站：</strong>${results ? results.length : 1} 个</p>
        <p><strong>总计爬取页面：</strong>${totalPages} 个</p>
        <p><strong>找到结果的页面：</strong>${resultsPages} 个</p>
      </div>
      <button onclick='downloadText(${JSON.stringify(
        fileNames
      )})' class="download-btn">下载完整报告</button>
    `;
  } catch (error) {
    console.error("Crawling error:", error);
    crawlerError.textContent = error.message || "爬取过程中发生错误";
    crawlerError.style.display = "block";
    crawlerResult.innerHTML = "";
  }
}
