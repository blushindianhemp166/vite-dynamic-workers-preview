type DeployAsset = {
  path: string;
  body: string;
  contentType: string;
  cacheControl: string;
  etag: string;
};

type DeployPayload = {
  project: string;
  versionId: string;
  deployedAt: string;
  edgeModule: string;
  assets: DeployAsset[];
  publicOrigin: string;
  compatibilityDate?: string;
};

type AssetMeta = {
  contentType: string;
  cacheControl: string;
  etag: string;
};

type VersionRecord = {
  project: string;
  id: string;
  deployedAt: string;
  previewUrl: string;
  deployCount: number;
  compatibilityDate: string;
  edgeModule: string;
  assets: Record<string, AssetMeta>;
};

type PreviewMeta = {
  project: string;
  versionId: string;
  deployedAt: string;
  previewUrl: string;
  deployCount: number;
  versionCount: number;
};

type Env = {
  PREVIEWS: DurableObjectNamespace;
  LOADER: WorkerLoader;
  PREVIEW_DEPLOY_TOKEN: string;
};

const DEFAULT_COMPATIBILITY_DATE = "2026-03-24";
const LATEST_KEY = "preview:latest";
const VERSION_LIST_KEY = "preview:versions";
const DEPLOY_COUNT_KEY = "preview:deploy-count";
const MAX_VERSIONS = 12;

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/deploy") {
      return handleDeployRequest(request, env);
    }

    if (url.pathname.startsWith("/preview/")) {
      return handlePreviewRequest(request, env, url);
    }

    return Response.json({
      ok: true,
      routes: ["POST /api/deploy", "GET /preview/:project/*"],
    });
  },
};

export class PreviewSession {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/deploy") {
      return this.handleDeploy(request);
    }

    if (url.pathname === "/__preview/meta") {
      return this.handleMeta();
    }

    if (url.pathname === "/__preview/versions") {
      return this.handleVersions();
    }

    const latest = await this.getLatestVersion();
    if (!latest) {
      return Response.json(
        { error: "No preview has been deployed for this project yet." },
        { status: 404 },
      );
    }

    if (url.pathname.startsWith("/api/")) {
      return this.handleApi(request, latest);
    }

    return this.handleAsset(request, latest);
  }

  private async handleDeploy(request: Request) {
    const payload = (await request.json()) as DeployPayload;
    const stored = await this.state.blockConcurrencyWhile(async () => {
      const existingVersions = (await this.state.storage.get<string[]>(VERSION_LIST_KEY)) ?? [];
      const existingRecord = await this.getVersion(payload.versionId);

      if (existingRecord) {
        const deduped = [payload.versionId, ...existingVersions.filter((id) => id !== payload.versionId)];
        const kept = deduped.slice(0, MAX_VERSIONS);
        await this.state.storage.put(VERSION_LIST_KEY, kept);
        await this.state.storage.put(LATEST_KEY, payload.versionId);
        return {
          version: existingRecord,
          versionCount: kept.length,
        };
      }

      const nextDeployCount = ((await this.state.storage.get<number>(DEPLOY_COUNT_KEY)) ?? 0) + 1;
      const assetMap: Record<string, AssetMeta> = {};

      for (const asset of payload.assets) {
        assetMap[asset.path] = {
          contentType: asset.contentType,
          cacheControl: asset.cacheControl,
          etag: asset.etag,
        };

        await this.state.storage.put(assetStorageKey(payload.versionId, asset.path), asset);
      }

      const version: VersionRecord = {
        project: payload.project,
        id: payload.versionId,
        deployedAt: payload.deployedAt,
        previewUrl: `${payload.publicOrigin}/preview/${payload.project}/`,
        deployCount: nextDeployCount,
        compatibilityDate: payload.compatibilityDate ?? DEFAULT_COMPATIBILITY_DATE,
        edgeModule: payload.edgeModule,
        assets: assetMap,
      };

      await this.state.storage.put(versionStorageKey(payload.versionId), version);
      await this.state.storage.put(DEPLOY_COUNT_KEY, nextDeployCount);
      await this.state.storage.put(LATEST_KEY, payload.versionId);

      const nextVersions = [payload.versionId, ...existingVersions.filter((id) => id !== payload.versionId)];
      const keptVersions = nextVersions.slice(0, MAX_VERSIONS);
      const droppedVersions = nextVersions.slice(MAX_VERSIONS);

      for (const oldVersionId of droppedVersions) {
        await this.deleteVersion(oldVersionId);
      }

      await this.state.storage.put(VERSION_LIST_KEY, keptVersions);
      return {
        version,
        versionCount: keptVersions.length,
      };
    });

    return Response.json({
      previewUrl: stored.version.previewUrl,
      versionId: stored.version.id,
      deployedAt: stored.version.deployedAt,
      deployCount: stored.version.deployCount,
      versionCount: stored.versionCount,
    });
  }

  private async handleMeta() {
    const meta = await this.getPreviewMeta();
    if (!meta) {
      return Response.json({ error: "No preview yet." }, { status: 404 });
    }

    return Response.json(meta);
  }

  private async handleVersions() {
    const versionIds = (await this.state.storage.get<string[]>(VERSION_LIST_KEY)) ?? [];
    const versions = await Promise.all(versionIds.map((id) => this.getVersion(id)));

    return Response.json({
      versions: versions
        .filter((entry): entry is VersionRecord => Boolean(entry))
        .map((entry) => ({
          id: entry.id,
          deployedAt: entry.deployedAt,
          deployCount: entry.deployCount,
        })),
    });
  }

  private async handleApi(request: Request, version: VersionRecord) {
    const worker = this.env.LOADER.get(`${version.project}:${version.id}`, async () => ({
      compatibilityDate: version.compatibilityDate,
      mainModule: "preview-entry.js",
      modules: {
        "preview-entry.js": createEntrypoint(version),
        "user-edge.js": version.edgeModule,
      },
    }));

    return worker.getEntrypoint().fetch(request);
  }

  private async handleAsset(request: Request, version: VersionRecord) {
    const url = new URL(request.url);
    const requestedPath = normalizeAssetPath(url.pathname, version);
    const meta = version.assets[requestedPath];

    if (!meta) {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("if-none-match") === meta.etag) {
      return new Response(null, {
        status: 304,
        headers: {
          "cache-control": meta.cacheControl,
          etag: meta.etag,
          "x-preview-version": version.id,
        },
      });
    }

    const asset = await this.state.storage.get<DeployAsset>(assetStorageKey(version.id, requestedPath));
    if (!asset) {
      return new Response("Missing asset", { status: 500 });
    }

    return new Response(decodeBase64(asset.body), {
      headers: {
        "cache-control": meta.cacheControl,
        "content-type": meta.contentType,
        etag: meta.etag,
        "x-preview-version": version.id,
      },
    });
  }

  private async getPreviewMeta(): Promise<PreviewMeta | null> {
    const latestVersionId = await this.state.storage.get<string>(LATEST_KEY);
    if (!latestVersionId) {
      return null;
    }

    const [version, versions] = await Promise.all([
      this.getVersion(latestVersionId),
      this.state.storage.get<string[]>(VERSION_LIST_KEY),
    ]);

    if (!version) {
      return null;
    }

    return {
      project: version.project,
      versionId: version.id,
      deployedAt: version.deployedAt,
      previewUrl: version.previewUrl,
      deployCount: version.deployCount,
      versionCount: versions?.length ?? 0,
    };
  }

  private async getLatestVersion() {
    const latestVersionId = await this.state.storage.get<string>(LATEST_KEY);
    if (!latestVersionId) {
      return null;
    }

    return this.getVersion(latestVersionId);
  }

  private async getVersion(id: string) {
    return (await this.state.storage.get<VersionRecord>(versionStorageKey(id))) ?? null;
  }

  private async deleteVersion(id: string) {
    const version = await this.getVersion(id);
    if (!version) {
      return;
    }

    for (const assetPath of Object.keys(version.assets)) {
      await this.state.storage.delete(assetStorageKey(id, assetPath));
    }

    await this.state.storage.delete(versionStorageKey(id));
  }
}

async function handleDeployRequest(request: Request, env: Env) {
  if (!isAuthorized(request, env)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = (await request.json()) as DeployPayload;
  if (!payload.project) {
    return new Response("Missing project name", { status: 400 });
  }

  const session = getPreviewStub(env, payload.project);
  return session.fetch(
    new Request("https://preview.internal/deploy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
}

async function handlePreviewRequest(request: Request, env: Env, url: URL) {
  const parts = url.pathname.split("/").filter(Boolean);
  const project = parts[1];
  const rest = parts.slice(2);

  if (!project) {
    return new Response("Missing preview project", { status: 404 });
  }

  if (rest.length === 0 && !url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
    return Response.redirect(url.toString(), 307);
  }

  const rewrittenPath = `/${rest.join("/")}`;
  const nextUrl = new URL(request.url);
  nextUrl.pathname = rewrittenPath === "/" ? "/" : rewrittenPath;

  const session = getPreviewStub(env, project);
  return session.fetch(new Request(nextUrl.toString(), request));
}

function getPreviewStub(env: Env, project: string) {
  const id = env.PREVIEWS.idFromName(project);
  return env.PREVIEWS.get(id);
}

function isAuthorized(request: Request, env: Env) {
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${env.PREVIEW_DEPLOY_TOKEN}`;
}

function versionStorageKey(id: string) {
  return `version:${id}`;
}

function assetStorageKey(versionId: string, assetPath: string) {
  return `asset:${versionId}:${encodeURIComponent(assetPath)}`;
}

function normalizeAssetPath(pathname: string, version: VersionRecord) {
  if (pathname === "/") {
    return "/index.html";
  }

  if (version.assets[pathname]) {
    return pathname;
  }

  if (/\.[A-Za-z0-9]+$/.test(pathname)) {
    return pathname;
  }

  return "/index.html";
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function createEntrypoint(version: VersionRecord) {
  const previewMeta = JSON.stringify({
    project: version.project,
    versionId: version.id,
    deployedAt: version.deployedAt,
    previewUrl: version.previewUrl,
    deployCount: version.deployCount,
  });

  return `
import * as user from "./user-edge.js";

const previewMeta = ${previewMeta};

function resolveHandler() {
  const candidate = user.default ?? user.fetch ?? user.handler;
  if (typeof candidate === "function") {
    return candidate;
  }
  if (candidate && typeof candidate.fetch === "function") {
    return candidate.fetch.bind(candidate);
  }
  throw new Error("Expected src/edge.ts to export a fetch handler.");
}

const handler = resolveHandler();

export default {
  async fetch(request, env, ctx) {
    try {
      const runtimeEnv = Object.assign({}, env, { PREVIEW_META: previewMeta });
      const result = await handler(request, runtimeEnv, ctx);
      return result instanceof Response ? result : Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ error: message, preview: previewMeta }, { status: 500 });
    }
  },
};
`.trim();
}
