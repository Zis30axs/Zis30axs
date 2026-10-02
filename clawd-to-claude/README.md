# Clawd → Claude

![一只 Clawd 分裂成 64 只，拼成 Claude 的星芒](clawd-to-claude.gif)

一只 Clawd（Claude Code 的像素小螃蟹）不停分裂：1 → 2 → 4 → … → 64。
64 只 Clawd 打着旋飞进 Claude 星芒的轮廓，头朝外站成 12 条光芒，
中间坐着一只和最初一样大的 Clawd。然后它们闭上眼睛融化成完整的 Claude 图标，
图标再旋转缩回成一只 Clawd，无缝循环。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.html` | 前端页面：单文件、无依赖，浏览器直接打开。可暂停、拖时间轴、调倍速、切亮/暗主题，并能在页面里直接导出 GIF。 |
| `clawd-to-claude.gif` | 导出的 GIF，500×500，25 fps，约 11 秒一个循环。 |
| `clawd-to-claude-dark.gif` | 同一段动画的暗色版，主页 README 在 GitHub 暗色模式下显示它。 |
| `scripts/export-gif.cjs` | 用 Playwright 无头打开页面，调用页面自带的编码器重新生成 GIF。 |

## 重新生成 GIF

```bash
npm i -D playwright && npx playwright install chromium
node scripts/export-gif.cjs                      # 亮色 → clawd-to-claude.gif
node scripts/export-gif.cjs dark.gif --dark      # 暗色
node scripts/export-gif.cjs big.gif --size=800 --fps=30
```

## 实现要点

- 整段动画是时间的纯函数 `render(ctx, t)`，所以播放、拖动和导出得到的每一帧都完全一致。
- Clawd 是 16×10 的像素精灵，照 Claude Code 欢迎界面里的方块字符画还原（换成了方形像素）。
- 分裂：第 g 代排成 2^⌈g/2⌉ × 2^⌊g/2⌋ 的网格，偶数代横向、奇数代纵向分裂，子代总落在父代两侧。
- 组队：运行时把星芒路径光栅化，用距离变换找到中心，用径向扫描找出 12 条光芒，
  再沿每条光芒按局部宽度摆放 Clawd；匈牙利算法把 64 只 Clawd 分配到这些位置（总路程最短），
  飞行轨迹在以中心为原点的极坐标里插值，所以看起来像旋涡。
- GIF 编码器（LZW，只编码相邻帧之间变化的矩形）直接写在页面里，没有第三方依赖。

## 版权

星芒路径来自 [Simple Icons](https://simpleicons.org/)（CC0）。Claude、Clawd 及相关标志归 Anthropic 所有，这是一个同人小作品。
