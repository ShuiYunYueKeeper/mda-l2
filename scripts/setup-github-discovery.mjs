#!/usr/bin/env node
/**
 * Configure GitHub repository discovery metadata: description, homepage, topics.
 *
 * GitHub 搜索与主题页只读这些字段，README 改得再好也不会自动进 topics。
 * 该脚本先打印当前状态，加 --apply 才写入；不写 token、不落盘。
 *
 *   GITHUB_TOKEN=ghp_xxx node scripts/setup-github-discovery.mjs
 *   GITHUB_TOKEN=ghp_xxx node scripts/setup-github-discovery.mjs --apply
 *
 * Token 需要 classic PAT 的 `repo` 权限，或 fine-grained 的
 * "Administration: Read and write"（只改仓库元数据，不需要 contents 写权限）。
 */

const REPO = "ShuiYunYueKeeper/mda-l2";
const API = `https://api.github.com/repos/${REPO}`;

const DESCRIPTION =
  "本地优先的 Markdown 工作台：预览内直接编辑、把结构化批注写进 .md（渲染不可见、可进 git）、导出 Word/PDF/公众号，附 CLI 与 MCP。Local-first Markdown workbench with in-file comments, WYSIWYG preview, export, CLI & MCP. MIT.";

const HOMEPAGE = "https://shuiyunyuekeeper.github.io/mda-l2/";

// GitHub 最多 20 个 topic，全部小写、用连字符。前 5 个决定「相关主题」推荐位。
const TOPICS = [
  "markdown",
  "markdown-editor",
  "markdown-viewer",
  "markdown-preview",
  "markdown-annotation",
  "annotation",
  "comments",
  "document-review",
  "electron",
  "desktop-app",
  "typescript",
  "cli",
  "mcp",
  "model-context-protocol",
  "commonmark",
  "mermaid",
  "katex",
  "local-first",
  "pdf",
  "docx",
];

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const apply = process.argv.includes("--apply");

if (!token) {
  console.error(
    [
      "缺少 GITHUB_TOKEN（或 GH_TOKEN）。",
      "",
      "创建 classic PAT 并勾选 repo 后：",
      "  PowerShell:  $env:GITHUB_TOKEN=\"ghp_xxx\"; node scripts/setup-github-discovery.mjs --apply",
      "  bash:        GITHUB_TOKEN=ghp_xxx node scripts/setup-github-discovery.mjs --apply",
      "",
      "不传 --apply 时只读，不会修改仓库。",
    ].join("\n"),
  );
  process.exit(1);
}

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "mda-discovery-setup",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message = body && typeof body === "object" ? body.message : String(body);
    throw new Error(`${init.method || "GET"} ${path} -> ${res.status}: ${message}`);
  }
  return body;
}

function printState(label, repo) {
  console.log(`\n${label}`);
  console.log(`  description : ${repo.description || "(空)"}`);
  console.log(`  homepage    : ${repo.homepage || "(空)"}`);
  console.log(`  topics      : ${(repo.topics || []).join(", ") || "(空)"}`);
}

async function main() {
  const before = await api("");
  printState("当前仓库元数据", before);

  const missing = [];
  if (before.description !== DESCRIPTION) missing.push("description");
  if (before.homepage !== HOMEPAGE) missing.push("homepage");
  const beforeTopics = new Set(before.topics || []);
  const topicsDiffer =
    TOPICS.length !== beforeTopics.size || TOPICS.some((t) => !beforeTopics.has(t));
  if (topicsDiffer) missing.push("topics");

  if (missing.length === 0) {
    console.log("\n已是最新，无需修改。");
    return;
  }

  console.log(`\n待更新: ${missing.join(", ")}`);
  console.log(`  description -> ${DESCRIPTION}`);
  console.log(`  homepage    -> ${HOMEPAGE}`);
  console.log(`  topics      -> ${TOPICS.join(", ")}`);

  if (!apply) {
    console.log("\n[dry-run] 加 --apply 才会写入。");
    return;
  }

  const patched = await api("", {
    method: "PATCH",
    body: JSON.stringify({ description: DESCRIPTION, homepage: HOMEPAGE }),
  });
  printState("PATCH 后", patched);

  const topics = await api("/topics", {
    method: "PUT",
    body: JSON.stringify({ names: TOPICS }),
  });
  console.log(`\nTopics 已写入 (${(topics.names || []).length}): ${(topics.names || []).join(", ")}`);

  // Pages 是「搜索入口」的前置条件：站点没启用时，homepage 会 404。
  try {
    const pages = await api("/pages");
    console.log(`\nGitHub Pages: ${pages.status} — ${pages.html_url}`);
  } catch (err) {
    if (String(err.message).includes("404")) {
      console.log(
        "\nGitHub Pages 尚未启用：仓库 Settings → Pages → Build and deployment → Source 选 \"GitHub Actions\"，" +
          "再手动跑一次 Deploy site 工作流。",
      );
    } else {
      console.log(`\n查询 Pages 状态失败（不影响元数据）：${err.message}`);
    }
  }

  console.log("\n完成。社交预览图需在 Settings → General → Social preview 手动上传 site/assets/og.png。");
}

main().catch((err) => {
  console.error(`\n失败：${err.message}`);
  if (/401/.test(err.message)) console.error("Token 无效或已过期。");
  if (/403/.test(err.message)) console.error("Token 权限不足，需要 repo（classic）或 Administration 读写（fine-grained）。");
  if (/404/.test(err.message)) console.error("仓库不存在或 token 无权访问该仓库。");
  process.exit(1);
});
