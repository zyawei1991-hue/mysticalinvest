# 投资日报知识库草稿区

这里放从定期文件、群消息、附件或外部来源生成的 draft 知识卡。

状态规则：

```text
inbox -> draft -> review -> active -> deprecated
```

草稿审核重点：

1. 是否属于投资日报子知识库。
2. 是否应该回写母知识库。
3. 是否需要拆成多张知识卡。
4. 是否有合规风险。
5. 是否需要回测或案例支撑。

通过审核后使用：

```bash
node bin/promote-kb-draft.js --draft docs/kb-drafts/example.md --domain strategy --reviewer owner-name
node bin/build-knowledge-base.js
```

注意：draft 不进入日报程序默认调用范围。
