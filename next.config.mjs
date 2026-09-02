/** @type {import('next').NextConfig} */
// GitHub Pages 项目页静态部署（https://poulnoodle.github.io/AI-Story-Teller/）
// 注意：仓库改名时需同步 basePath
const nextConfig = {
  output: "export", // 纯静态导出到 out/，禁止任何服务端路由
  basePath: "/AI-Story-Teller",
  images: { unoptimized: true }, // 静态导出不支持图片优化（防御性设置）
};

export default nextConfig;
