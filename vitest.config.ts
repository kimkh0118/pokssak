import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only 는 Next.js 서버 번들 밖에서 import 하면 오류를 내므로 테스트에서는 빈 모듈로 대체
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
