import type { NextConfig } from "next";
import path from "node:path";

// 화면의 /api/* 요청을 FastAPI 백엔드로 넘긴다(브라우저는 같은 주소만 보므로 CORS 설정 불필요).
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
  turbopack: {
    root: path.resolve(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
