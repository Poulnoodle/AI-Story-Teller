// 生成最终 Markdown 文件元数据（实际下载由前端通过 Blob 执行）

import { NextRequest, NextResponse } from "next/server";
import { buildMarkdown, type SaveInput } from "@/lib/markdown";
import { formatTimestamp, sanitizeFileName } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: SaveInput;
  try {
    body = (await req.json()) as SaveInput;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }
  if (!body.processedText?.trim()) {
    return NextResponse.json({ error: "缺少精修故事内容" }, { status: 400 });
  }

  const markdownContent = buildMarkdown(body);
  const fileName = `${sanitizeFileName(title)}_${formatTimestamp(new Date())}.md`;

  return NextResponse.json({ fileName, markdownContent });
}
