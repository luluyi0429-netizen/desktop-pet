# GitHub 发布检查清单

本次只整理本地文件，没有创建远程仓库或上传内容。

## 上传内容

保留源码、assets、browser、docs、scripts、tests、README、启动脚本、package.json、package-lock.json、.gitignore 和 .gitattributes。

不要上传 node_modules、.local、work、outputs、原稿、整理备份、安装压缩包、个人 AppData、配对码、缓存或截图。.gitignore 已配置，但无法自动清除已经提交过的敏感文件。

## 发布前人工确认

- [ ] 图片、表情包以及真人/合成配音的使用、公开再分发已获授权。
- [ ] 选择代码许可证；单独记录素材许可证及署名。没有许可证不等于开源授权。
- [ ] 无公开许可的素材应替换为获授权素材，并更新清单；不要直接删运行素材后声称项目可用。
- [ ] 检查成人标签、表情和语音是否符合平台规则，需要时用安全素材替代。
- [ ] 升级受支持的 Electron，做安全与功能回归；本次未升级依赖。
- [ ] 执行 npm run check、npm test，在新目录用 npm ci、npm start 验证。
- [ ] 人工检查待提交文件，确保没有个人路径、配对码、截图或浏览记录。

## 上传步骤

GitHub 上新建空仓库，在项目目录执行：

    git init
    git add .
    git status
    git diff --cached --stat

人工检查后执行：

    git commit -m 'Initial desktop pet project'
    git branch -M main
    git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
    git push -u origin main

将占位地址换成自己的仓库。本地 node_modules 特意保留以便继续运行，但不是源码包内容。