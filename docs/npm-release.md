# GitHub 检查与 npm 发布

## 0.8.2 发布候选（2026-10-21）

用户授权随 fn 新架构一并发行。内容为 `6411f64` 的百度/ DuckDuckGo 验证页面识别修复，保留 SDK/CLI/MCP 公共结构；验证码返回引擎错误，不再伪装成成功零结果。版本 0.8.2，先完成本地与 CI 归档验收，再由既有 OIDC 工作流发行；公开包证据待补。

## 0.8.1 结构化抓取发行（2026-10-16）

`v0.8.1` 固定 `150275a6da3b7eac4777259da8b4a80370f7f749`，新增 webFetchResult/FetchResponse、缓存元数据与流式 10 MiB 响应限制，取消和超时覆盖 DNS 等待、重定向及正文。旧 webFetch 字符串、CLI/MCP 返回结构保持兼容。

- [三平台 CI 38822757505](https://github.com/semicoder-dev/agent-webtool/actions/runs/38822757505)、[候选归档 38822756040](https://github.com/semicoder-dev/agent-webtool/actions/runs/38822756040)、[真实 OIDC 38822896341](https://github.com/semicoder-dev/agent-webtool/actions/runs/38822896341) 成功；本地 check、108 项测试、build/npm:pack 通过。
- 公开归档、候选和正式发布归档逐字节一致，SHA-256 `e623cbac66fc9f43c4d6a8e4d80f77b73ee75d07fb7060fda733a15f0705107f`。SLSA provenance 的仓库、标签、提交和包 SHA-512 一致；全新缓存 registry 安装在 Node 20.18.1 / 24.22.0 通过 ESM/CJS、TypeScript、CLI 与六协议 MCP 消费。
- 仅追加 npm 环境精确 v0.8.1 许可，保留其他保护。npm 处理期间曾返回 404，等待索引完成后验收通过，没有重复发布或移动标签。本机 Bun 1.4.3 产物不替代 CI Bun 1.4.2 的正式归档。
- fn 将消费精确 0.8.1；官网 SDK、安装和版本说明按公开产物同步，部署结果由 workspace 本次跨项目发行记录独立维护。

## 0.8.0 MCP v2 发行（2026-10-15）

用户在本地适配验收后追加“发布”授权。`v0.8.0` 固定 `1b13f494008b68d527dbe07e7368201e3757bb67`，MCP server/client 依赖锁定 2.3.1（声明 `^2.3.1`），`serveStdio` 同时服务 2026-07-28 与五个旧协议版本。新增结构化结果、严格参数校验、取消透传和连接级来源上下文；SDK 返回类型、普通 CLI 输出及 Node 最低版本保持不变。

升级注意：未知输入字段返回工具校验错误；未知或被筛除的工具返回 JSON-RPC `-32602`。原有单个文本内容块保留，成功结果另有 `structuredContent`；搜索部分失败、全部失败和无结果仍按原有引擎状态返回。

- [三平台 CI 38757514787](https://github.com/semicoder-dev/agent-webtool/actions/runs/38757514787)、[手动归档验收 38757513695](https://github.com/semicoder-dev/agent-webtool/actions/runs/38757513695) 和 [正式 OIDC 38758509941](https://github.com/semicoder-dev/agent-webtool/actions/runs/38758509941) 均成功。源码 `check`、103 项离线测试 / 607 断言、构建及 ESM/CJS/TypeScript 验证通过。
- npm latest 为 0.8.0，公开 tarball、手动验收归档及正式发布归档逐字节一致，SHA-256 `910cfefc92a2ac8106146afaae49973da4f016622b6997bc493e579a65b020b4`。公开 provenance 的包摘要、仓库、标签、提交与工作流匹配。
- 全新缓存和独立目录从 registry 安装，在 Node 20.18.1 / 24.22.0 上通过 SDK ESM/CJS、TypeScript、两个 CLI 及六协议 MCP 发现/初始化、schema、筛选、错误和 EOF 检查。离线源码测试另覆盖自动协商、成功结构化结果、并发、来源隔离、取消与 SIGINT/SIGTERM。
- GitHub npm 环境仅增加本次精确 `v0.8.0` tag 许可，保留其他保护和既有 Trusted Publisher。npm 接受后公开索引延迟数分钟，等待同步后消费通过，未重发或移动标签。
- 官网介绍、安装、SDK、CLI、MCP 指南在公开包验收后同步 0.8.0；官网质量与两环境部署单独验收，完整结果见 workspace `docs/agent/sessions/2026-10-15-agent-webtool-mcp-v2.md`。真实搜索引擎与具体桌面 MCP 客户端本轮未重新验证。

本机 Bun 1.4.3 开发归档与 GitHub Bun 1.4.2 的 CLI 构建字节不同，正式发行只使用上述 GitHub 验收产物。适配阶段同名 0.7.1 开发归档不属于已公开的 0.7.1；下方历史证据仍指原始公开版本。

## 0.7.1 组织首次发行（2026-10-11）

`v0.7.1` 固定 `19455496011284608f7742c45ae7a6361ec3d323`，[真实 OIDC 发布](https://github.com/semicoder-dev/agent-webtool/actions/runs/38116631403) 成功。公开 tarball 与 Actions 归档逐字节一致，SHA-256 `b23caa32610e41ba767740df348c577b88004d1d82413135a51401c9f5f2d8c0`，npm provenance 指向组织仓库。新缓存独立 registry 安装后的 ESM/CJS、TypeScript、两个 CLI 入口及 MCP 初始化/工具筛选/错误返回通过。包名与公共契约不变；官网版本入口随本次跨项目迁移统一部署。

包：`agent-webtool`；仓库：`semicoder-dev/agent-webtool`。本流程参考 FIA 和 fn 的“先验收归档、后发布同一归档”，以及 Semicoder 的独立质量检查。agent-webtool 是 npm 工具包，不部署网站服务；官网由独立 Semicoder 仓库发布。

## 工作流

| 入口                              | 行为                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `ci.yml`：PR、main push、手动运行 | lint、格式、TypeScript、版本元数据、离线测试、构建及独立归档消费；不发布                     |
| `publish-npm.yml`：手动运行       | 同样验收并上传 `.tgz` 与 SHA-256，保留 14 天；始终跳过发布                                   |
| `publish-npm.yml`：`v*` tag push  | 标签必须精确等于 `v<package.version>`；验收后独立 job 下载同一归档、校验哈希，通过 OIDC 发布 |

CI 使用 Bun 1.4.2，覆盖 Linux Node 20.18.1 / 24 和 macOS Node 24；发布 job 使用 GitHub 托管 Linux runner、Node 24、npm 11.19.0。Action 使用提交 SHA 固定。正式版本发布到 `latest`，预发布到 `next`；暂不接受 SemVer build metadata。PR 没有 npm 发布权限，只有发布 job 获得 `id-token: write`。

## 组织迁移配置

旧 Trusted Publisher 身份字段不可修改；在最终归档就绪后删除旧连接，并创建组织连接，明确允许 `npm publish`。新连接必须在两天内首次成功发布。环境继续使用精确版本标签许可，不添加长期 npm token。

## 首次配置

1. 经审阅将工作流推送到仓库默认分支；手动入口需要它已存在于默认分支。
2. 在 GitHub Settings → Environments 创建 `npm` 环境；按维护者的保护策略允许本次版本标签，保留已有审核要求。
3. 在 npm 的 `agent-webtool` Settings → Trusted Publisher 配置：组织 `semicoder-dev`，仓库 `agent-webtool`，工作流文件名 `publish-npm.yml`，环境 `npm`，允许直接 `npm publish`。
4. 手动运行 **Publish agent-webtool**，先验证 GitHub runner 上的构建和归档消费；实际 OIDC 发布权限仍需下一次获授权的新版本发布验证。

不需要 `NPM_TOKEN` 或 `NODE_AUTH_TOKEN` secret。npm 官方要求支持 OIDC 的 npm / Node 版本与 GitHub 托管 runner，参见 [Trusted publishing](https://docs.npmjs.com/trusted-publishers/)。包的 `repository.url`、workflow 仓库限制和 npm 发布者配置必须对应同一仓库；迁移时一起更新。

## 本地验收与版本准备

在项目根目录执行：

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun test test/
bun run npm:pack
```

`npm:pack` 先构建，再用 `npm pack --ignore-scripts` 生成 `artifacts/npm/agent-webtool-<version>.tgz`。它检查归档文件范围，在 workspace 外安装归档及其运行依赖，验证 ESM/CJS 导出、TypeScript 消费、两个 CLI 的版本与 MCP 初始化、工具列表、参数过滤和错误返回，最后生成 SHA-256。临时消费者会删除，归档留在被 Git 忽略的 artifacts 目录。该步骤需要访问公开 npm；不会调用真实搜索引擎或发布包。

准备下一版本（示例 `0.8.0`，执行前核实尚未发布）：

```sh
npm view agent-webtool versions --json --registry=https://registry.npmjs.org
npm version 0.8.0 --no-git-tag-version --ignore-scripts --package-lock=false
# 同步 README 的版本范围、官网指南，然后重新执行上述验收。
# 版本提交合入 main 且获得发布授权后：
git tag -a v0.8.0 -m "agent-webtool 0.8.0"
git push origin v0.8.0
```

当前 Bun 锁文件的根 workspace 不含版本字段；没有依赖变化时无需重建锁文件。不要在 CI 中临时修改版本。新 API 本地源码完成不等于已在 npm 可用；`0.6.0` 已公开，不能覆盖或重推同版本标签尝试发布新内容。

## 官网同步与故障处理

每次版本发布必须同步 Semicoder 的 `content/projects/agent-webtool/`，包括介绍、安装、SDK 来源生命周期、CLI/MCP 和兼容说明；公开产物验证后更新网站 `docs/project-sources.md`。网站内容、推送、部署与 npm 发布分别验收，普通开发不自动执行这些远端动作。

- 标签/包版本、仓库或 registry 不符时验收失败，发布 job 不执行。
- 测试、类型、格式、独立归档消费失败时先修复；不跳过检查或换用未经验证的归档。
- OIDC 失败时核对发布者字段、环境保护与直接发布权限；本地构建、dry-run 和 `npm whoami` 不能证明 OIDC 可用。
- 若 npm 已接受版本而后续步骤失败，先核对 registry，不覆盖旧版本；后续修复使用更高版本。

## 本次状态（2026-10-06）

0.7.0 已正式发布，tag 源码 `ec6a2afcea8a651d58ea9a4cec513a12089a27b3`。三平台 CI [37424449550](https://github.com/potato47/agent-webtool/actions/runs/37424449550)、手动只验收 [37424738211](https://github.com/potato47/agent-webtool/actions/runs/37424738211) 和正式 OIDC [37424883345](https://github.com/potato47/agent-webtool/actions/runs/37424883345) 均成功；npm latest 为 0.7.0，公开包带有 provenance。

公开归档与正式 GitHub 验收归档逐字节一致，SHA-256 `5d51d108d64121172f213e83821eea7daa06cff7c0a2994303165bc354d46d52`，SHA-1 `a411bcd8a50e252af53175dc30316c4230bb58ac`。全新目录/缓存按 npm 版本安装后，ESM/CJS、TypeScript、两个 CLI、MCP 及来源上下文隔离/缓存登记/恢复/取消通过；真实搜索引擎未重新验收。

Trusted Publisher 为 `potato47/agent-webtool` / `publish-npm.yml` / `npm`，允许 `npm publish`，未授予独立 dist-tag 管理。GitHub `npm` 环境仅允许本次精确 `v0.7.0` 标签；未来获授权的版本先增加对应精确 tag 规则，不自动放宽为所有标签。未添加长期 npm token，也未修改既有 npm 双因素保护。

发布后 npm 曾提示处理需要几分钟，出现版本元数据但安装索引仍短暂返回 ETARGET；等待同步后全新缓存安装通过。若再次出现此情况，先等待并核对公开 registry，不重发或移动旧标签。

官网已同步 0.7.0 指南，其部署结果由 Semicoder 工作流单独验收。旧公开 0.6.0 不包含 SourceContext，历史 Anychat 集成见 [来源隔离记录](anychat-integration-feedback.md)。
