const express = require("express");
const bodyParser = require("body-parser");
const simpleGit = require("simple-git");
const path = require("path");
const { exec } = require('child_process');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

// 获取分支列表接口
app.get("/api/branches", async (req, res) => {
  try {
    const folderPath = req.query.folderPath;
    console.log('Received request for branches. Folder path:', folderPath);

    if (!folderPath) {
      console.error('No folder path provided');
      return res.status(400).json({ error: "Folder path is required" });
    }

    const git = simpleGit(folderPath);

    // Check if it's a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.error('Not a git repository:', folderPath);
      return res.status(400).json({ error: "Not a git repository" });
    }

    // 先更新远程信息
    console.log('Fetching remote branches for:', folderPath);
    await git.fetch(['--prune', '--prune-tags', '--force']);
    
    // 获取所有分支信息
    console.log('Getting branch information...');
    const branchInfo = await git.branch(['-a', '--no-color']);
    
    console.log('Current branch:', branchInfo.current);
    console.log('All branches:', branchInfo.all);
    
    // 当前分支
    const currentBranch = branchInfo.current;
    
    // 解析所有分支
    const branches = {
      current: currentBranch,
      local: [],
      remote: []
    };

    // 处理所有分支
    branchInfo.all.forEach(branch => {
      console.log('Processing branch:', branch);
      
      // 跳过当前分支
      if (branch === currentBranch) {
        return;
      }

      // 处理远程分支
      if (branch.startsWith('remotes/')) {
        // 提取远程分支名称
        const remoteBranch = branch.replace('remotes/origin/', '');
        // 跳过 HEAD 引用
        if (remoteBranch === 'HEAD') {
          return;
        }
        // 修改：不再检查本地是否有同名分支，直接添加到远程分支列表
        branches.remote.push(remoteBranch);
      }
      // 处理本地分支
      else if (!branch.includes('/')) {  // 确保不包含斜杠，避免处理其他远程引用
        branches.local.push(branch);
      }
    });

    // 按字母顺序排序
    branches.local.sort((a, b) => a.localeCompare(b));
    branches.remote.sort((a, b) => a.localeCompare(b));

    console.log('Final branches:', branches);
    res.json(branches);
  } catch (error) {
    console.error('Error getting branches:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 切换分支接口
app.post("/api/switch-branch", async (req, res) => {
  try {
    console.log('Received switch branch request:', req.body);
    const { folderPath, branch } = req.body;
    
    if (!folderPath || !branch) {
      console.error('Missing required fields:', { folderPath, branch });
      return res.status(400).json({ error: "Folder path and branch name are required" });
    }

    console.log('Switching to branch:', branch, 'in repository:', folderPath);
    const git = simpleGit(folderPath);
    
    // Check if it's a git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      console.error('Not a git repository:', folderPath);
      return res.status(400).json({ error: "Not a git repository" });
    }

    // Fetch latest changes
    console.log('Fetching latest changes...');
    await git.fetch(['--prune', '--prune-tags']);

    // Check if branch exists
    const branchInfo = await git.branch(['-a', '--no-color']);
    const allBranches = branchInfo.all.map(b => b.replace('remotes/origin/', ''));
    
    console.log('Available branches:', allBranches);
    if (!allBranches.includes(branch)) {
      console.error('Branch not found:', branch);
      return res.status(400).json({ error: `Branch '${branch}' not found` });
    }

    // Attempt to switch branch
    console.log('Switching branch...');
    await git.checkout(branch);
    
    console.log('Successfully switched to branch:', branch);
    res.json({ success: true, message: `Switched to branch: ${branch}` });
  } catch (error) {
    console.error('Error switching branch:', error);
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

app.post("/api/open-vscode", (req, res) => {
  try {
    const { path } = req.body;
    
    if (!path) {
      return res.status(400).json({ error: "Project path is required" });
    }

    // Execute the VS Code command
    exec(`code "${path}"`, (error) => {
      if (error) {
        console.error('Error opening VS Code:', error);
        return res.status(500).json({ error: "Failed to open VS Code" });
      }
      res.json({ success: true });
    });
  } catch (error) {
    console.error('Error in open-vscode endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
