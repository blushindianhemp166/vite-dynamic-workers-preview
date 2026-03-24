import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { dynamicWorkersPreview } from "../../packages/vite-plugin-dynamic-workers-preview/src/index";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const previewHost = env.CF_PREVIEW_HOST ?? "";
  const deployToken = env.CF_PREVIEW_TOKEN ?? "";

  if (!previewHost || !deployToken) {
    console.warn(
      "[dynamic-workers-preview] Set CF_PREVIEW_HOST and CF_PREVIEW_TOKEN to enable live deploys.",
    );
  }

  return {
    plugins: [
      react(),
      previewHost && deployToken
        ? dynamicWorkersPreview({
            project: "react-edge-live",
            previewHost,
            deployToken,
            edgeEntry: "src/edge.ts",
          })
        : null,
    ],
  };
});
