# custom.2 源码与验证

整理日期：2026-10-14。目标版本：0.4.0-custom.2；分支：release/custom-2。

## 对齐依据

原开发状态完整保留在 b438f5d1c1bec736d26f1710837a4a9cdf1cd9d6。本次按既有 custom.2 免安装包的 resources/app 恢复 150 个运行文件，不改变其功能或媒体；浏览器脚本也逐字节一致。

scripts/custom2-baseline.json 保存这些文件的 SHA-256。npm run check:baseline 校验源码、素材集合和浏览器脚本。打包时对输出 resources/app 再执行严格文件集合校验，package.json 的开发字段不进入运行包。

.gitattributes 对基线文本禁用自动换行转换，保留文本差异显示；已检查 51 个运行 / 浏览器源文件通过 Git clean 过滤后字节不变，避免下载源码时出现换行导致的哈希失败。

## 测试范围

24 组本地测试已通过。包括 8 种条件组合各 30 轮等权抽取、跨页面条件隔离、共享概率 / 冷却、复制排队、睡眠 300 秒 / 自然醒 120 秒、旧中文设置迁移、媒体引用、窗口动作和界面关闭清理。

本次重新构建的免安装包实机报告 passed=true，errors=[]：解压文件哈希、无 Node.js PATH 的 EXE 启动、角色图像、64 个音频解码、日语播放、中文配置迁移、标签服务、文本面板、菜单网站入口、无登场字幕、纯视频播放与关闭、进程正常退出均通过。报告保存在本地 .local/portable-test-1791914224880/result.json，不提交临时配置与日志。

后续版本特有的自动坐姿、触摸恢复和置顶恢复测试及未被本版引用的 topmost 模块从本分支移除，原件仍在备份提交。字幕空闲重复 hide 的性能优化不属于本版，测试只确认隐藏状态及退出后不复活，不宣称此性能问题已修复。

Node.js 24.16.0，Electron 32.2.0，Windows x64。构建使用当前已安装依赖；没有另行在干净联网环境运行 npm ci。完整测试脚本建议 Node.js 22.4+。

## 验证命令

~~~powershell
npm run check
npm test
npm run build:browser
npm run check:baseline
npm run build:portable
npm run test:portable
~~~

打包测试读取 release/latest-build.json，在 .local/ 的独立目录解压、校验每个文件，再启动测试 EXE。使用临时用户配置与本地调试端口，不读取个人配对码；测试以静音状态检查媒体解码和播放。最终需核对 result.json 中 passed 为 true。

## 尚未覆盖

当前在线网页 DOM、真实远程翻译 API、多小时稳定性、干净电脑安装、代码签名、运行时安全升级、全部历史提交的敏感内容及素材许可。不能将本次结果表述为这些项目已通过。

尚未替用户提交、推送、发布 Release 或公开仓库。当前素材仍为个人整合版；公开版本需另行确认分发内容和授权。
