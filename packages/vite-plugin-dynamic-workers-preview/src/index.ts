import { build as bundle } from "esbuild";
import { createHash } from "node:crypto";
import { promises as fs, watch, type FSWatcher } from "node:fs";
import path from "node:path";
import { build as viteBuild, type Plugin, type ResolvedConfig, type ViteDevServer } from "vite";

export type DynamicWorkersPreviewOptions = {
  project: string;
  previewHost: string;
  deployToken: string;
  edgeEntry?: string;
  debounceMs?: number;
  distDir?: string;
  compatibilityDate?: string;
};

type UploadAsset = {
  path: string;
  body: string;
  contentType: string;
  cacheControl: string;
  etag: string;
};

type DeployResponse = {
  previewUrl: string;
  versionId: string;
  deployedAt: string;
  deployCount: number;
  versionCount: number;
};

const DEFAULT_EDGE_MODULE = `
export default {
  async fetch(_request, env) {
    return Response.json({
      message: "Create src/edge.ts to customize the API that runs inside the Dynamic Worker.",
      preview: env.PREVIEW_META ?? null,
      now: new Date().toISOString(),
    });
  },
};
`.trim();

export function dynamicWorkersPreview(options: DynamicWorkersPreviewOptions): Plugin {
  let config: ResolvedConfig;
  let server: ViteDevServer | undefined;
  let debounceTimer: NodeJS.Timeout | undefined;
  let activeDeploy: Promise<void> | null = null;
  let queuedReason: string | null = null;
  let fileWatchers: FSWatcher[] = [];

  const edgeEntry = options.edgeEntry ?? "src/edge.ts";
  const tempDistDir = options.distDir ?? ".dynamic-workers-preview/dist";
  const debounceMs = options.debounceMs ?? 250;
  const previewHost = options.previewHost.replace(/\/$/, "");
  const compatibilityDate = options.compatibilityDate ?? "2026-03-24";

  const queueDeploy = async (reason: string) => {
    if (activeDeploy) {
      queuedReason = reason;
      return;
    }

    activeDeploy = deploy(reason).finally(async () => {
      activeDeploy = null;
      if (queuedReason) {
        const nextReason = queuedReason;
        queuedReason = null;
        await queueDeploy(nextReason);
      }
    });

    await activeDeploy;
  };

  const scheduleDeploy = (reason: string) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void queueDeploy(reason);
    }, debounceMs);
  };

  async function deploy(reason: string) {
    if (!server) {
      return;
    }

    const previewBase = `/preview/${options.project}/`;
    const outputDirectory = path.resolve(config.root, tempDistDir);
    const start = Date.now();

    try {
      server.config.logger.info(
        `[dynamic-workers-preview] deploying ${reason}`,
        { clear: false, timestamp: true },
      );

      await viteBuild({
        configFile: config.configFile,
        root: config.root,
        mode: "production",
        logLevel: "error",
        base: previewBase,
        build: {
          outDir: outputDirectory,
          emptyOutDir: true,
          sourcemap: false,
        },
      });

      const [assets, edgeModule] = await Promise.all([
        readBuiltAssets(outputDirectory),
        bundleEdgeModule(config.root, edgeEntry),
      ]);

      const versionId = createVersionId(assets, edgeModule);
      const deployedAt = new Date().toISOString();

      const response = await fetch(`${previewHost}/api/deploy`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.deployToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          project: options.project,
          versionId,
          deployedAt,
          edgeModule,
          assets,
          publicOrigin: previewHost,
          compatibilityDate,
        }),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }

      const payload = (await response.json()) as DeployResponse;
      const elapsed = Date.now() - start;

      server.config.logger.info(
        `[dynamic-workers-preview] live at ${payload.previewUrl} (${payload.versionId}, ${elapsed}ms)`,
        { clear: false, timestamp: true },
      );

      server.ws.send("dynamic-workers-preview:update", payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      server.config.logger.error(`[dynamic-workers-preview] ${message}`);
    }
  }

  return {
    name: "vite-plugin-dynamic-workers-preview",
    apply: "serve",
    enforce: "post",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    configureServer(devServer) {
      server = devServer;
      fileWatchers = createFileWatchers(config.root, edgeEntry, scheduleDeploy);

      const onReady = () => scheduleDeploy("startup");
      devServer.httpServer?.once("listening", onReady);

      return () => {
        for (const fileWatcher of fileWatchers) {
          fileWatcher.close();
        }
        fileWatchers = [];
        clearTimeout(debounceTimer);
      };
    },
    handleHotUpdate(ctx) {
      if (shouldIgnore(ctx.file, config.root, tempDistDir)) {
        return ctx.modules;
      }

      scheduleDeploy(`updated ${toPosixPath(path.relative(config.root, ctx.file))}`);
      return ctx.modules;
    },
  };
}

async function bundleEdgeModule(root: string, edgeEntry: string) {
  const entryPath = path.resolve(root, edgeEntry);
  try {
    await fs.access(entryPath);
  } catch {
    return DEFAULT_EDGE_MODULE;
  }

  const result = await bundle({
    entryPoints: [entryPath],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
    legalComments: "none",
    external: ["cloudflare:*"],
  });

  const outputFile = result.outputFiles?.[0];
  if (!outputFile) {
    throw new Error(`No output was generated for ${edgeEntry}.`);
  }

  return outputFile.text;
}

async function readBuiltAssets(directory: string) {
  const files = await collectFiles(directory);
  const assets: UploadAsset[] = [];

  for (const file of files) {
    const relativePath = `/${toPosixPath(path.relative(directory, file))}`;
    const contents = await fs.readFile(file);
    const etag = createHash("sha256").update(contents).digest("hex").slice(0, 16);

    assets.push({
      path: relativePath,
      body: contents.toString("base64"),
      contentType: contentTypeFor(relativePath),
      cacheControl: cacheControlFor(relativePath),
      etag: `"${etag}"`,
    });
  }

  assets.sort((left, right) => left.path.localeCompare(right.path));
  return assets;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }

      return [entryPath];
    }),
  );

  return files.flat();
}

function createVersionId(assets: UploadAsset[], edgeModule: string) {
  const hash = createHash("sha256");

  for (const asset of assets) {
    hash.update(asset.path);
    hash.update(asset.etag);
  }

  hash.update(edgeModule);
  return hash.digest("hex").slice(0, 12);
}

function shouldIgnore(file: string, root: string, tempDistDir: string) {
  const resolved = path.resolve(file);
  const tempDirectory = path.resolve(root, tempDistDir);

  return (
    resolved.startsWith(tempDirectory) ||
    resolved.includes(`${path.sep}node_modules${path.sep}`) ||
    resolved.includes(`${path.sep}.git${path.sep}`)
  );
}

function createFileWatchers(
  root: string,
  edgeEntry: string,
  scheduleDeploy: (reason: string) => void,
) {
  const watchers: FSWatcher[] = [];

  for (const filePath of [path.resolve(root, "index.html"), path.resolve(root, edgeEntry)]) {
    try {
      const watcher = watch(filePath, () => {
        scheduleDeploy(`updated ${toPosixPath(path.relative(root, filePath))}`);
      });
      watchers.push(watcher);
    } catch {
      // Ignore missing optional files.
    }
  }

  return watchers;
}

function cacheControlFor(filePath: string) {
  if (filePath.endsWith(".html")) {
    return "public, max-age=0, must-revalidate";
  }

  if (/-[A-Za-z0-9]{8,}\./.test(filePath)) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=300";
}

function contentTypeFor(filePath: string) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  if (filePath.endsWith(".woff2")) return "font/woff2";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function toPosixPath(value: string) {
  return value.split(path.sep).join("/");
}
