import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "神话猎手 · THE MYTH HUNTER",
  description: "搜索神话原文，精修成史诗故事，解析神话寓意",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
