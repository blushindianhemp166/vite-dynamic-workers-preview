type PreviewMeta = {
  project: string;
  versionId: string;
  deployedAt: string;
  previewUrl: string;
  deployCount: number;
};

type EdgeEnv = {
  PREVIEW_META: PreviewMeta;
};

const headline = "Every save ships a new Worker preview.";
const detail =
  "Vite rebuilds locally, the host Worker swaps the pointer, and the same public URL now runs a fresh edge isolate.";

export default {
  async fetch(request: Request, env: EdgeEnv) {
    const { pathname } = new URL(request.url);
    if (pathname !== "/api/message") {
      return Response.json(
        {
          ok: true,
          routes: ["/api/message"],
          preview: env.PREVIEW_META,
        },
        { status: 200 },
      );
    }

    const cf = (request as Request & {
      cf?: { colo?: string; city?: string; country?: string };
    }).cf;

    return Response.json({
      headline,
      detail,
      now: new Date().toISOString(),
      colo: cf?.colo ?? null,
      city: cf?.city ?? null,
      country: cf?.country ?? null,
      preview: env.PREVIEW_META,
    });
  },
};
