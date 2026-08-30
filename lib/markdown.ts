// 保存用 Markdown 组装（固定模板）

export interface SaveInput {
  title: string;
  rawText: string;
  processedText: string;
  analysis: string;
  meta: {
    sourceUrl: string;
    language: string;
    style: string;
    cost: number;
  };
}

/** front-matter 值清洗：去换行；含特殊字符时加引号 */
function yamlValue(s: string): string {
  const clean = s.replace(/\r?\n/g, " ").trim();
  return /[:"#]/.test(clean) ? `"${clean.replace(/"/g, '\\"')}"` : clean;
}

/** 按规格书固定模板组装最终 .md 内容 */
export function buildMarkdown(input: SaveInput): string {
  const { title, rawText, processedText, analysis, meta } = input;
  const generatedAt = new Date().toISOString();
  const analysisText = analysis.trim() || "（本次未生成解析）";

  return `---
title: ${yamlValue(title)}
source: ${yamlValue(meta.sourceUrl || "未知来源")}
language: ${yamlValue(meta.language)}
style: ${yamlValue(meta.style || "未指定")}
cost: $${meta.cost.toFixed(4)}
generated_at: ${generatedAt}
---
# 📜 原始文本（参考）
${rawText.trim()}

---

# ✨ 精修故事（可读版）
${processedText.trim()}

---

# 🏺 神话解析
${analysisText}
`;
}
