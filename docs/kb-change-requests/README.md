# 投资日报知识库变更请求

这里记录对 active 知识卡的修改提案。

建议每次变更都写一份 Markdown：

```text
change-id:
target-id:
target-file:
change-type: update | deprecate | split | merge | rollback
reason:
before:
after:
risk:
reviewer:
status: draft | approved | rejected
```

原则：

- 不直接覆盖 active 知识。
- 不物理删除历史知识，只标记 deprecated。
- 涉及合规、商业边界、算法权重的变更必须人工审核。
