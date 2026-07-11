# 投资日报知识库收件箱

这里放团队定期发来的原始材料副本。

当前阶段采用“文件导入优先”：

```bash
node bin/import-kb-file.js --source attachments/example.md --title "材料标题" --domain strategy
```

导入后会生成：

- `docs/kb-inbox/files/`：原始材料副本。
- `docs/kb-drafts/`：待审核知识卡草稿。
- `data/kb-audit-log.jsonl`：导入审计记录。

注意：

- 收件箱不是正式知识库。
- 收件箱内容不得被日报程序直接调用。
- 所有材料必须先进入 `draft`，审核后才可进入 `docs/kb`。
