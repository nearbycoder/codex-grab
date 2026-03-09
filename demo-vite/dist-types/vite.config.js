import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@codex-grab/core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)),
            "@codex-grab/react": fileURLToPath(new URL("../packages/react/src/index.ts", import.meta.url)),
            "@codex-grab/demo-shell": fileURLToPath(new URL("../packages/demo-shell/src/index.ts", import.meta.url))
        },
        dedupe: ["react", "react-dom"]
    },
    server: {
        fs: {
            allow: [repoRoot]
        }
    }
});
//# sourceMappingURL=vite.config.js.map