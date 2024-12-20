const express = require("express");
const bodyParser = require("body-parser");
const simpleGit = require("simple-git");
const path = require("path");

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
