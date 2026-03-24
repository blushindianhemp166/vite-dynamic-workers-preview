import { useEffect, useMemo, useState } from "react";

type PreviewMeta = {
  project: string;
  versionId: string;
  deployedAt: string;
  previewUrl: string;
  deployCount: number;
  versionCount: number;
};

type VersionEntry = {
  id: string;
  deployedAt: string;
  deployCount: number;
};

type ApiMessage = {
  headline: string;
  detail: string;
  now: string;
  colo: string | null;
  city: string | null;
  country: string | null;
  preview: {
    versionId: string;
    deployedAt: string;
    previewUrl: string;
    deployCount: number;
  };
};

type PreviewUpdate = {
  previewUrl: string;
  versionId: string;
  deployedAt: string;
  deployCount: number;
  versionCount: number;
};

const isLocalhost =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

function previewPath(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "Waiting for the first deploy";
  }

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function shortId(id: string | null | undefined) {
  if (!id) {
    return "not-yet-live";
  }

  return id.slice(0, 8);
}

async function fetchJson<T>(path: string) {
  const response = await fetch(path, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export default function App() {
  const [meta, setMeta] = useState<PreviewMeta | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [message, setMessage] = useState<ApiMessage | null>(null);
  const [localPreview, setLocalPreview] = useState<PreviewUpdate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modeLabel = useMemo(() => {
    if (meta) {
      return "Live edge preview";
    }

    if (localPreview) {
      return "Local dev, live deploy armed";
    }

    return isLocalhost ? "Local dev" : "Preview booting";
  }, [localPreview, meta]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      try {
        const [nextMeta, nextVersions, nextMessage] = await Promise.all([
          fetchJson<PreviewMeta>(previewPath("/__preview/meta")),
          fetchJson<{ versions: VersionEntry[] }>(previewPath("/__preview/versions")),
          fetchJson<ApiMessage>(previewPath("/api/message")),
        ]);

        if (cancelled) {
          return;
        }

        setMeta(nextMeta);
        setVersions(Array.isArray(nextVersions.versions) ? nextVersions.versions : []);
        setMessage(nextMessage);
        setError(null);
      } catch (nextError) {
        if (!cancelled && !isLocalhost) {
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.hot) {
      return;
    }

    const handler = (payload: PreviewUpdate) => {
      setLocalPreview(payload);
      setLoading(false);
    };

    import.meta.hot.on("dynamic-workers-preview:update", handler);

    return () => {
      import.meta.hot?.off("dynamic-workers-preview:update", handler);
    };
  }, []);

  useEffect(() => {
    if (!meta) {
      return;
    }

    let cancelled = false;
    let previousVersion = meta.versionId;

    const interval = window.setInterval(async () => {
      try {
        const nextMeta = await fetchJson<PreviewMeta>(previewPath("/__preview/meta"));
        if (cancelled) {
          return;
        }

        if (nextMeta.versionId !== previousVersion) {
          setRefreshing(true);
          window.setTimeout(() => window.location.reload(), 900);
          return;
        }

        previousVersion = nextMeta.versionId;
        setMeta(nextMeta);
      } catch {
        // Ignore intermittent polling errors.
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [meta]);

  async function refreshMessage() {
    try {
      const nextMessage = await fetchJson<ApiMessage>(previewPath("/api/message"));
      setMessage(nextMessage);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }

  return (
    <main className="shell">
      <div className="glow glow-one" />
      <div className="glow glow-two" />

      <section className="hero panel">
        <div>
          <p className="eyebrow">Dynamic Workers x Vite</p>
          <h1>Every save becomes a public preview.</h1>
          <p className="lede">
            This builds a React, uploads the bundle, and flips a stable URL to the
            latest Dynamic Worker version.
          </p>
        </div>

        <div className="hero-meta">
          <span className="status-pill">{modeLabel}</span>
          <div className="metric-row">
            <div>
              <p className="metric-label">Latest version</p>
              <p className="metric-value">{shortId(meta?.versionId ?? localPreview?.versionId)}</p>
            </div>
            <div>
              <p className="metric-label">Deploy count</p>
              <p className="metric-value">
                {meta?.deployCount ?? localPreview?.deployCount ?? "--"}
              </p>
            </div>
            <div>
              <p className="metric-label">Last ship</p>
              <p className="metric-value">
                {formatTime(meta?.deployedAt ?? localPreview?.deployedAt)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {refreshing ? <div className="banner">New version reached the edge. Reloading…</div> : null}

      <section className="grid">
        <article className="panel callout">
          <div className="card-head">
            <h2>Edge API</h2>
            <button className="action" onClick={() => void refreshMessage()}>
              Hit `/api/message`
            </button>
          </div>

          {loading ? <p className="muted">Deploying the first preview…</p> : null}

          {message ? (
            <>
              <p className="statement">{message.headline}</p>
              <p className="copy">{message.detail}</p>
              <div className="facts">
                <span>Version {shortId(message.preview.versionId)}</span>
                <span>{message.city ?? message.country ?? "Global edge"}</span>
                <span>{message.colo ?? "colo pending"}</span>
                <span>{formatTime(message.now)}</span>
              </div>
            </>
          ) : (
            <p className="copy muted">
              {localPreview
                ? "The preview is live. Open it to see the edge API respond from the latest Dynamic Worker."
                : "Start the preview host, add the token to your env, then save a file. The public URL appears as soon as the first deploy finishes."}
            </p>
          )}

          {error ? <p className="error">{error}</p> : null}
        </article>

        <article className="panel">
          <div className="card-head">
            <h2>Stable URL</h2>
          </div>

          <p className="url-block">{meta?.previewUrl ?? localPreview?.previewUrl ?? "waiting-for-first-deploy"}</p>
          <p className="copy muted">
            Keep editing locally, keep sharing the same URL. The preview host just swaps which
            Dynamic Worker version it points at.
          </p>
        </article>

        <article className="panel">
          <div className="card-head">
            <h2>Version trail</h2>
          </div>

          <div className="trail">
            {versions.length ? (
              versions.map((entry) => (
                <div className="trail-row" key={entry.id}>
                  <span className="trail-id">{shortId(entry.id)}</span>
                  <span>{formatTime(entry.deployedAt)}</span>
                  <span>deploy #{entry.deployCount}</span>
                </div>
              ))
            ) : (
              <p className="copy muted">Versions appear here once the first public deploy lands.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="card-head">
            <h2>Why it feels neat</h2>
          </div>

          <ul className="bullets">
            <li>One tiny host Worker stays fixed.</li>
            <li>Each save uploads a fresh website snapshot.</li>
            <li>The API runs inside a Dynamic Worker isolate.</li>
            <li>The public preview refreshes as soon as a new version is ready.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
