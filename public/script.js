// 添加单选按钮的选中效果
document.querySelectorAll(".radio-option").forEach((option) => {
  option.addEventListener("click", function () {
    // 移除所有选中效果
    document.querySelectorAll(".radio-option").forEach((opt) => {
      opt.classList.remove("selected");
    });
    // 添加当前选中效果
    this.classList.add("selected");
    // 选中单选按钮
    const radio = this.querySelector('input[type="radio"]');
    radio.checked = true;
  });
});

// Function to fetch and display current branch for a repository
async function fetchCurrentBranch(repoPath) {
  try {
    console.log('Fetching branch for:', repoPath);
    const response = await fetch(
      `/api/branches?folderPath=${encodeURIComponent(repoPath)}`
    );
    const data = await response.json();
    console.log('Response for', repoPath, ':', data);

    if (response.ok && data.current) {
      // Escape backslashes in the selector
      const escapedPath = repoPath.replace(/\\/g, '\\\\');
      const branchLabel = document.querySelector(
        `.current-branch-label[data-repo="${escapedPath}"]`
      );
      if (branchLabel) {
        console.log('Setting branch label for', repoPath, 'to:', data.current);
        branchLabel.textContent = data.current;
        branchLabel.title = `Current branch: ${data.current}`;
      } else {
        console.error('Branch label element not found for:', repoPath);
        console.log('Escaped path used in selector:', escapedPath);
        // Log all current-branch-label elements for debugging
        console.log('Available data-repo attributes:', 
          Array.from(document.querySelectorAll('.current-branch-label'))
            .map(el => el.getAttribute('data-repo'))
        );
      }
    } else {
      console.error('Invalid response for', repoPath, ':', data);
      const escapedPath = repoPath.replace(/\\/g, '\\\\');
      const branchLabel = document.querySelector(
        `.current-branch-label[data-repo="${escapedPath}"]`
      );
      if (branchLabel) {
        branchLabel.textContent = data.error || 'Error';
        branchLabel.title = data.error || 'Failed to get current branch';
        branchLabel.style.color = '#ef4444';
      }
    }
  } catch (error) {
    console.error(`Error fetching branch for ${repoPath}:`, error);
    const escapedPath = repoPath.replace(/\\/g, '\\\\');
    const branchLabel = document.querySelector(
      `.current-branch-label[data-repo="${escapedPath}"]`
    );
    if (branchLabel) {
      branchLabel.textContent = 'Error';
      branchLabel.title = error.message;
      branchLabel.style.color = '#ef4444';
    }
  }
}

// Initialize current branch display for all repositories
function initializeCurrentBranches() {
  console.log('Initializing current branches');
  const labels = document.querySelectorAll('.current-branch-label');
  console.log('Found branch labels:', labels.length);
  
  labels.forEach(label => {
    const repoPath = label.getAttribute('data-repo');
    if (repoPath) {
      console.log('Found repo path:', repoPath);
      fetchCurrentBranch(repoPath);
    } else {
      console.error('Label without repo path:', label);
    }
  });
}

// Call initialization when the page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded, initializing branches');
  initializeCurrentBranches();
});

async function createTag() {
  const button = document.getElementById("createTagBtn");
  const selectedPath = document.querySelector(
    'input[name="folderPath"]:checked'
  );
  const tagNameInput = document.getElementById("tagName");
  const errorDiv = document.getElementById("error");
  const resultDiv = document.getElementById("result");
  const folderPathError = document.getElementById("folderPathError");
  const tagNameError = document.getElementById("tagNameError");

  // 验证必填项
  if (!selectedPath) {
    folderPathError.textContent = "Please select a Git repository path.";
    folderPathError.style.display = "block";
    return;
  } else {
    folderPathError.style.display = "none";
  }

  if (!tagNameInput.value.trim()) {
    tagNameError.textContent = "Please enter a tag name.";
    tagNameError.style.display = "block";
    return;
  } else {
    tagNameError.style.display = "none";
  }

  // 禁用按钮并添加 loading 效果
  button.disabled = true;
  button.classList.add("loading");

  errorDiv.style.display = "none";
  resultDiv.style.display = "none";

  try {
    const response = await fetch("/api/git-info", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folderPath: selectedPath.value,
        tagName: tagNameInput.value.trim(),
      }),
    });

    const data = await response.json();

    if (response.ok) {
      document.getElementById("commitHash").textContent = data.commit.hash;
      document.getElementById("commitMessage").textContent =
        data.commit.message;
      document.getElementById("commitAuthor").textContent =
        data.commit.author;
      document.getElementById("commitDate").textContent = data.commit.date;
      document.getElementById("tagName").textContent = data.tagName;
      resultDiv.style.display = "block";
    } else {
      errorDiv.textContent = data.error;
      errorDiv.style.display = "block";
    }
  } catch (error) {
    errorDiv.textContent = "An error occurred while processing your request.";
    errorDiv.style.display = "block";
  } finally {
    // 移除 loading 效果并启用按钮
    button.disabled = false;
    button.classList.remove("loading");
  }
}

// 存储当前选中的仓库路径和分支
let currentRepoPath = "";
let selectedBranch = "";

// 显示分支切换模态框
async function showBranchModal(event, repoPath) {
  event.preventDefault();
  event.stopPropagation();

  currentRepoPath = repoPath;
  selectedBranch = "";
  const modal = document.getElementById("branchModal");
  modal.style.display = "flex";
  // 触发重绘以启动动画
  setTimeout(() => {
    modal.classList.add("show");
  }, 10);

  // 禁用确认按钮
  document.getElementById("confirmBranchBtn").disabled = true;

  try {
    const response = await fetch(
      `/api/branches?folderPath=${encodeURIComponent(repoPath)}`
    );
    const data = await response.json();

    if (response.ok) {
      // 显示当前分支
      document.getElementById("currentBranch").textContent = data.current;

      // 显示本地分支
      const localBranchesDiv = document.getElementById("localBranches");
      localBranchesDiv.innerHTML = "";
      if (data.local.length > 0) {
        data.local.forEach((branch) => {
          if (branch !== data.current) {
            const div = createBranchItem(branch);
            localBranchesDiv.appendChild(div);
          }
        });
      } else {
        localBranchesDiv.innerHTML =
          '<div class="branch-empty">No local branches</div>';
      }

      // 显示远程分支
      const remoteBranchesDiv = document.getElementById("remoteBranches");
      remoteBranchesDiv.innerHTML = "";
      if (data.remote.length > 0) {
        data.remote.forEach((branch) => {
          const div = createBranchItem(branch);
          remoteBranchesDiv.appendChild(div);
        });
      } else {
        remoteBranchesDiv.innerHTML =
          '<div class="branch-empty">No remote branches available</div>';
      }
    } else {
      showToast(data.error, "error");
      closeBranchModal();
    }
  } catch (error) {
    showToast("Failed to fetch branches", "error");
    closeBranchModal();
  }
}

// 创建分支项
function createBranchItem(branch) {
  const div = document.createElement("div");
  div.className = "branch-item";
  div.textContent = branch;
  div.onclick = () => selectBranch(div, branch);
  return div;
}

// 选中分支
function selectBranch(element, branch) {
  // 移除其他分支的选中状态
  document.querySelectorAll(".branch-item").forEach((item) => {
    if (item !== document.getElementById("currentBranch")) {
      item.classList.remove("selected");
    }
  });

  // 添加选中状态
  element.classList.add("selected");
  selectedBranch = branch;

  // 启用确认按钮
  document.getElementById("confirmBranchBtn").disabled = false;
}

// 确认切换分支
async function confirmSwitchBranch() {
  if (!selectedBranch) return;

  const confirmBtn = document.getElementById("confirmBranchBtn");
  confirmBtn.disabled = true;
  confirmBtn.classList.add("loading-btn");
  confirmBtn.style.paddingRight = "36px"; // 为 loading 图标留出空间

  try {
    console.log('Switching to branch:', selectedBranch);
    console.log('Repository path:', currentRepoPath);
    
    const requestBody = {
      folderPath: currentRepoPath,
      branch: selectedBranch,
    };
    console.log('Request body:', requestBody);

    const response = await fetch("/api/switch-branch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);

    if (response.ok) {
      // 更新当前分支显示
      document.getElementById("currentBranch").textContent = selectedBranch;
      // 保存当前选中的分支名称
      const switchedBranch = selectedBranch;
      // 关闭模态框
      closeBranchModal();
      // 显示成功提示
      showToast(
        `Successfully switched to branch: ${switchedBranch}`,
        "success"
      );
    } else {
      showToast(data.error, "error");
    }
  } catch (error) {
    showToast("Failed to switch branch", "error");
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.classList.remove("loading-btn");
    confirmBtn.style.paddingRight = "16px";
  }
}

// 关闭模态框
function closeBranchModal() {
  const modal = document.getElementById("branchModal");
  modal.classList.remove("show");
  setTimeout(() => {
    modal.style.display = "none";
    // 清空所有分支信息
    document.getElementById("currentBranch").textContent = "";
    document.getElementById("localBranches").innerHTML = "";
    document.getElementById("remoteBranches").innerHTML = "";
    // 重置分支列表为折叠状态
    document.getElementById("localBranchSection").classList.add("collapsed");
    document.getElementById("remoteBranchSection").classList.add("collapsed");
  }, 300);
  selectedBranch = "";
}

// 切换分支列表的展开/收起
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  section.classList.toggle('collapsed');
}

// 显示 Toast 提示
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = `toast ${type}`;

  // 触发重绘以启动动画
  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  // 3秒后隐藏
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// Function to open project in VS Code
async function openInVSCode(event, path) {
  event.preventDefault();
  try {
    const response = await fetch('/api/open-vscode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to open VS Code');
    }
    
    showToast('Opening in VS Code...', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}
