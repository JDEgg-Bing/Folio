# 长文档科研报告 {#sec:report}

本示例用于检查中英文混排与长文档编辑。Compression and torsion response 描述材料在压缩与扭转载荷下的响应。行内公式 $E = mc^2$ 和 \(\sigma=E\varepsilon\) 应与正文融为一体。

## 研究方法 {#sec:methods}

请检查 **重要结论**、*斜体说明* 和 `parameter` 的视觉关系。参见 [@fig:device]、[@tbl:parameters] 与 [@eq:energy]，章节引用为 [@sec:methods]。

![实验装置示意](long-document.assets/example.svg){#fig:device}

| 参数 | 数值 | 说明 |
| :--- | ---: | :---: |
| E | 210 | **弹性模量** |
| ratio | $x^2$ | `parameter` |
| 方向 | 1 | 压缩\|扭转 |
{#tbl:parameters}

$$
E = mc^2
$$
{#eq:energy}

### 理论模型与方法 {#sec:model}

同一段内部行距应保持稳定，段间距保持克制。窗口缩放、目录开启与关闭、正文宽度改变时，文字都应自然重排。

1. 首先记录加载条件。
2. 再检查实验参数与理论模型。
3. 最后比较不同条件下的结果。

- 中文与 Latin 字符保持统一的正文气质。
- 目录条目按实际标题层级显示。
- 点击表格、公式或图片可编辑原始 Markdown。

> 引用说明采用轻微缩进和细线，不使用卡片背景。

\[
\begin{aligned}
\sigma &= E\varepsilon \\
F &= kx
\end{aligned}
\]

---

## 边界检查

金额 $20 与 $30 不应显示为数学公式，`$source$` 仍为代码。缺失引用 [@fig:missing] 保留原文并提供提示。

![网络图片](https://example.invalid/image.png)

无效公式 $\invalidcommand$ 应显示中文提示，点击后仍可编辑。

#### 补充说明

在正文中使用中文输入法；检查撤销／重做、查找／替换、保存、重启恢复与附件拖入。更改文稿标题不应自动重命名磁盘文件。
