const express = require("express");
const bodyParser = require("body-parser");
const simpleGit = require("simple-git");
const path = require("path");
const { exec } = require("child_process");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const app = express();
let port = 3000;

// 增加请求体大小限制
app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.static("public"));

// 创建临时文件夹用于存储下载的HTML文件
const downloadsDir = path.join(__dirname, "downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// 获取分支列表接口
app.get("/api/branches", async (req, res) => {
  try {
    const folderPath = req.query.folderPath;
    console.log("Received request for branches. Folder path:", folderPath);

    if (!folderPath) {
      console.error("No folder path provided");
      return res.status(400).json({ error: "Folder path is required" });
    }

    const git = simpleGit(folderPath);

    // Check if it's a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.error("Not a git repository:", folderPath);
      return res.status(400).json({ error: "Not a git repository" });
    }

    // 先更新远程信息
    console.log("Fetching remote branches for:", folderPath);
    await git.fetch(["--prune", "--prune-tags", "--force"]);

    // 获取所有分支信息
    console.log("Getting branch information...");
    const branchInfo = await git.branch(["-a", "--no-color"]);

    console.log("Current branch:", branchInfo.current);
    console.log("All branches:", branchInfo.all);

    // 当前分支
    const currentBranch = branchInfo.current;

    // 解析所有分支
    const branches = {
      current: currentBranch,
      local: [],
      remote: [],
    };

    // 处理所有分支
    branchInfo.all.forEach((branch) => {
      console.log("Processing branch:", branch);

      // 跳过当前分支
      if (branch === currentBranch) {
        return;
      }

      // 处理远程分支
      if (branch.startsWith("remotes/")) {
        // 提取远程分支名称
        const remoteBranch = branch.replace("remotes/origin/", "");
        // 跳过 HEAD 引用
        if (remoteBranch === "HEAD") {
          return;
        }
        // 修改：不再检查本地是否有同名分支，直接添加到远程分支列表
        branches.remote.push(remoteBranch);
      }
      // 处理本地分支
      else if (!branch.includes("/")) {
        // 确保不包含斜杠，避免处理其他远程引用
        branches.local.push(branch);
      }
    });

    // 按字母顺序排序
    branches.local.sort((a, b) => a.localeCompare(b));
    branches.remote.sort((a, b) => a.localeCompare(b));
    res.json(branches);
  } catch (error) {
    console.error("Error getting branches:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// 切换分支接口
app.post("/api/switch-branch", async (req, res) => {
  try {
    console.log("Received switch branch request:", req.body);
    const { folderPath, branch } = req.body;

    if (!folderPath || !branch) {
      console.error("Missing required fields:", { folderPath, branch });
      return res
        .status(400)
        .json({ error: "Folder path and branch name are required" });
    }

    console.log("Switching to branch:", branch, "in repository:", folderPath);
    const git = simpleGit(folderPath);

    // Check if it's a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.error("Not a git repository:", folderPath);
      return res.status(400).json({ error: "Not a git repository" });
    }

    // Fetch latest changes
    console.log("Fetching latest changes...");
    await git.fetch(["--prune", "--prune-tags"]);

    // Check if branch exists
    const branchInfo = await git.branch(["-a", "--no-color"]);
    const allBranches = branchInfo.all.map((b) =>
      b.replace("remotes/origin/", "")
    );

    console.log("Available branches:", allBranches);
    if (!allBranches.includes(branch)) {
      console.error("Branch not found:", branch);
      return res.status(400).json({ error: `Branch '${branch}' not found` });
    }

    // Attempt to switch branch
    console.log("Switching branch...");
    await git.checkout(branch);

    console.log("Successfully switched to branch:", branch);
    res.json({ success: true, message: `Switched to branch: ${branch}` });
  } catch (error) {
    console.error("Error switching branch:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/git-info", async (req, res) => {
  try {
    const folderPath = req.body.folderPath;

    if (!folderPath) {
      return res.status(400).json({ error: "Folder path is required" });
    }

    const git = simpleGit(folderPath);

    // 检查是否是 git 仓库
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return res.status(400).json({ error: "Not a git repository" });
    }

    // 检查是否有未提交的更改
    const status = await git.status();
    if (status.files.length > 0) {
      return res.status(400).json({
        error:
          "There are uncommitted changes in the repository. Please commit or stash your changes first.",
        files: status.files,
      });
    }

    // 拉取最新代码
    try {
      // 获取当前分支名
      const currentBranch = await git.branch();
      // 使用 rebase 方式拉取最新代码
      await git.pull(["--rebase"], "origin", currentBranch.current);
    } catch (error) {
      return res.status(500).json({
        error:
          "Failed to pull latest changes with rebase. Please resolve any conflicts and try again.",
        details: error.message,
      });
    }

    // 获取最新的 commit
    const log = await git.log({ maxCount: 1 });
    const latestCommit = log.latest;

    // 获取 tag 名称，如果前端未传入则使用默认格式
    const tagName = req.body.tagName || "";

    // 验证 tag 名称格式
    if (!tagName.match(/^[trv]/)) {
      return res.status(400).json({
        error: "Tag name must start with 't', 'r', or 'v'.",
      });
    }

    // 如果是 v 开头的 tag，检查当前分支
    if (tagName.startsWith("v")) {
      const currentBranch = await git.branch();
      if (!["main", "master"].includes(currentBranch.current)) {
        return res.status(400).json({
          error:
            "Version tags (starting with 'v') can only be created from 'main' or 'master' branch.",
          currentBranch: currentBranch.current,
        });
      }
    }

    // 检查 tag 是否已存在
    const tags = await git.tags();
    if (tags.all.includes(tagName)) {
      return res.status(400).json({
        error: "Tag name already exists. Please choose a different name.",
      });
    }

    // 创建并推送 tag
    await git.addTag(tagName);
    await git.pushTags("origin");

    res.json({
      success: true,
      commit: {
        hash: latestCommit.hash,
        message: latestCommit.message,
        author: latestCommit.author_name,
        date: latestCommit.date,
      },
      tagName: tagName,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 网页爬虫接口
app.post("/api/crawl", async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    const urlObj = new URL(url);
    const shouldCrawlEntireSite = urlObj.pathname === '/' || urlObj.pathname === '';

    const urlHost = urlObj.host;
    const urlHostArr = urlHost.split(".");
    let domain = urlHostArr.slice(-2);
    domain = domain.join(".");

    // 验证URL格式
    let baseUrl;
    try {
      baseUrl = urlObj.origin;
    } catch (error) {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    console.log("Starting crawl from:", url);
    console.log("Crawl mode:", shouldCrawlEntireSite ? "Entire site" : "Single page");

    // 规范化URL，移除多余的斜杠、锚点和查询参数
    function normalizeUrl(url) {
      try {
        const urlObj = new URL(url);
        // 移除末尾斜杠
        let path = urlObj.pathname.replace(/\/+$/, "");
        // 如果路径为空，添加单个斜杠
        if (!path) {
          path = "/";
        }
        // 返回规范化的URL，不包含锚点和查询参数
        return `${urlObj.protocol}//${urlObj.host}${path}`;
      } catch (e) {
        return url;
      }
    }

    // 存储已访问的URL和找到的链接
    const visitedUrls = new Set();
    const results = new Map(); // URL -> { links: [], linkStatus: Map }
    const urlsToVisit = [url];
    const crawlErrors = new Map(); // URL -> Error Message
    const resourceErrors = new Map(); // Resource URL -> { type: string, pageUrl: string, error: string }
    let totalPages = 0;

    // 检查资源是否可访问
    async function checkResource(resourceUrl, type, pageUrl) {
      try {
        const response = await axios({
          method: "head",
          url: resourceUrl,
          timeout: 5000,
          maxRedirects: 5,
          validateStatus: function (status) {
            return status < 400;
          },
        });
        return true;
      } catch (error) {
        const errorMessage = `${error.message} (from page: ${pageUrl})`;
        resourceErrors.set(resourceUrl, { type, pageUrl, error: errorMessage });
        return false;
      }
    }

    // 检查链接是否可访问
    async function checkLink(href) {
      try {
        const response = await axios({
          method: "head",
          url: href,
          timeout: 5000,
          maxRedirects: 5,
          validateStatus: function (status) {
            return status < 400;
          },
        });
        return true;
      } catch (error) {
        return false;
      }
    }

    // 递归爬取函数
    async function crawlPage(pageUrl) {
      // 规范化URL
      const normalizedUrl = normalizeUrl(pageUrl);

      // Skip URLs containing 'blog'
      if (normalizedUrl.toLowerCase().includes("blog")) {
        return;
      }

      // 检查规范化后的URL是否已访问
      if (visitedUrls.has(normalizedUrl)) {
        console.log(`Skipping duplicate page: ${pageUrl} (normalized: ${normalizedUrl})`);
        return;
      }

      // 如果不是整站爬取模式，且不是初始URL，则跳过
      if (!shouldCrawlEntireSite && normalizedUrl !== normalizeUrl(url)) {
        console.log(`Skipping page: ${pageUrl} (not in single-page mode)`);
        return;
      }

      console.log("Crawling:", normalizedUrl);

      try {
        const response = await axios({
          method: "get",
          url: pageUrl,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          },
          responseType: "text",
          timeout: 10000,
          maxRedirects: 0, // Prevent automatic redirects
          validateStatus: (status) => status < 400 // Accept 3xx status codes
        });

        // Skip pages with 301 or 302 redirects
        if (response.status === 301 || response.status === 302) {
          console.log(`Skipping redirected page: ${pageUrl} (${response.status})`);
          return;
        }

        visitedUrls.add(normalizedUrl);
        totalPages++;

        const $ = cheerio.load(response.data);

        const links = [];
        const linkStatus = new Map();
        const resources = new Set();

        // 检查所有资源链接
        const resourceSelectors = {
          css: 'link[rel="stylesheet"]',
          script: "script[src]",
          image: "img[src]",
          video: "video source[src]",
          audio: "audio source[src]",
          favicon: 'link[rel="icon"], link[rel="shortcut icon"]',
          font: 'link[rel="preload"][as="font"]',
        };

        // 收集所有资源URL
        for (const [type, selector] of Object.entries(resourceSelectors)) {
          $(selector).each((i, el) => {
            const src = $(el).attr("src") || $(el).attr("href");
            if (src) {
              try {
                const absoluteUrl = new URL(src, pageUrl).href;
                resources.add({ url: absoluteUrl, type });
              } catch (e) {
                // 忽略无效的URL
              }
            }
          });
        }

        // 检查link标签
        const linkElements = $("link").filter((i, el) => {
          const $link = $(el);
          return (
            ($link.attr("rel") && $link.attr("hreflang")) ||
            ($link.attr("rel") || "").trim() === "canonical"
          );
        });

        await Promise.all([
          // 检查link标签
          ...linkElements.map(async (i, element) => {
            const $link = $(element);
            const linkHtml = $.html(element).trim();
            const href = $link.attr("href");

            links.push(linkHtml);
            linkStatus.set(linkHtml, await checkLink(href));
          }),
          // 检查资源
          ...[...resources].map(async ({ url, type }) => {
            await checkResource(url, type, pageUrl);
          }),
        ]);

        if (links.length > 0) {
          results.set(pageUrl, { links, linkStatus });
        }

        const internalLinks = new Set();
        $("a[href]").each((index, element) => {
          const href = $(element).attr("href");
          try {
            const absoluteUrl = new URL(href, pageUrl).href;
            if (
              absoluteUrl.startsWith(baseUrl) &&
              !visitedUrls.has(absoluteUrl)
            ) {
              internalLinks.add(absoluteUrl);
            }
          } catch (e) {
            // 忽略无效的URL
          }
        });

        for (const link of internalLinks) {
          if (!visitedUrls.has(link)) {
            urlsToVisit.push(link);
          }
        }
      } catch (error) {
        crawlErrors.set(pageUrl, error.message);
      }
    }

    // 开始爬取过程
    const maxPages = 1000;
    while (urlsToVisit.length > 0 && totalPages < maxPages) {
      const nextUrl = urlsToVisit.shift();
      await crawlPage(nextUrl);
    }

    // 生成结果文件
    const timestamp = new Date().getTime();
    const fileName = `crawl_results_${timestamp}.txt`;
    const filePath = path.join(downloadsDir, fileName);

    // 生成文本内容
    let textContent = `爬虫结果报告\n`;
    textContent += `开始URL: ${url}\n`;
    textContent += `爬取时间: ${new Date().toLocaleString()}\n`;
    textContent += `总计爬取页面: ${totalPages}\n`;
    textContent += `找到结果的页面数: ${results.size}\n`;
    textContent += `爬取失败的页面数: ${crawlErrors.size}\n`;
    textContent += `资源错误数: ${resourceErrors.size}\n\n`;

    // 添加错误信息部分
    if (crawlErrors.size > 0) {
      textContent += `\n页面爬取错误:\n`;
      textContent += `-`.repeat(80) + `\n`;
      for (const [errorUrl, errorMsg] of crawlErrors) {
        textContent += `页面: ${errorUrl}\n`;
        textContent += `错误: ${errorMsg}\n`;
        textContent += `-`.repeat(80) + `\n`;
      }
    }

    // 添加资源错误信息
    if (resourceErrors.size > 0) {
      textContent += `\n资源错误信息:\n`;
      textContent += `-`.repeat(80) + `\n`;

      // 按资源类型分组显示
      const groupedErrors = new Map();
      for (const [resourceUrl, { type, pageUrl, error }] of resourceErrors) {
        if (!groupedErrors.has(type)) {
          groupedErrors.set(type, []);
        }
        groupedErrors.get(type).push({ resourceUrl, pageUrl, error });
      }

      for (const [type, errors] of groupedErrors) {
        textContent += `\n${type.toUpperCase()} 资源错误 (${
          errors.length
        } 个):\n`;
        errors.forEach(({ resourceUrl, pageUrl, error }) => {
          textContent += `资源URL: ${resourceUrl}\n`;
          textContent += `所在页面: ${pageUrl}\n`;
          textContent += `错误信息: ${error}\n`;
          textContent += `-`.repeat(40) + `\n`;
        });
      }
    }

    // 添加成功爬取的结果
    for (const [pageUrl, { links, linkStatus }] of results) {
      textContent += `\n页面: ${pageUrl}\n`;
      textContent += `找到 ${links.length} 个标签:\n`;
      links.forEach((link) => {
        textContent += link;
        if (!linkStatus.get(link) || !link?.includes(domain)) {
          textContent += "  [链接异常]";
        }
        textContent += "\n";
      });
      textContent += "\n" + "-".repeat(80) + "\n";
    }

    // 保存文本文件
    fs.writeFileSync(filePath, textContent);

    // 返回结果
    res.json({
      url: url,
      totalPages: totalPages,
      resultsPages: results.size,
      errorPages: crawlErrors.size,
      resourceErrors: {
        total: resourceErrors.size,
        details: Object.fromEntries(resourceErrors),
      },
      errors: Object.fromEntries(crawlErrors),
      results: Object.fromEntries(
        Array.from(results.entries()).map(([url, { links, linkStatus }]) => [
          url,
          {
            links: links.map((link) => ({
              html: link,
              isValid: linkStatus.get(link),
            })),
          },
        ])
      ),
      fileName: fileName,
    });
  } catch (error) {
    console.error("Error crawling website:", error);
    res.status(500).json({
      error: "Failed to crawl website",
      details: error.message,
    });
  }
});

// 下载HTML文件接口
app.get("/api/download/:fileName", (req, res) => {
  try {
    const fileName = req.params.fileName;
    const filePath = path.join(downloadsDir, fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Error downloading file:", err);
      } else {
        // 下载完成后删除文件
        fs.unlink(filePath, (err) => {
          if (err) console.error("Error deleting file:", err);
        });
      }
    });
  } catch (error) {
    console.error("Error handling download:", error);
    res.status(500).json({ error: "Failed to download file" });
  }
});

app.post("/api/open-vscode", (req, res) => {
  try {
    const { path } = req.body;

    if (!path) {
      return res.status(400).json({ error: "Project path is required" });
    }

    // Execute the VS Code command
    exec(`code "${path}"`, (error) => {
      if (error) {
        console.error("Error opening VS Code:", error);
        return res.status(500).json({ error: "Failed to open VS Code" });
      }
      res.json({ success: true });
    });
  } catch (error) {
    console.error("Error in open-vscode endpoint:", error);
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
function startServer(port) {
  const server = app.listen(port)
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        server.close();
        startServer(port + 1);
      } else {
        console.error('Error starting server:', err);
      }
    })
    .on('listening', () => {
      console.log(`Server running at http://localhost:${port}`);
    });
}

startServer(port);
