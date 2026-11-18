import { httpRouter } from "convex/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization",
  "Access-Control-Max-Age": "86400",
};
const http = httpRouter();

http.route({
  path: "/file",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const id = new URL(request.url).searchParams.get("id") as Id<"files"> | null;
    const storageId = id && (await ctx.runQuery(api.files.stored, { id }).catch(() => null));
    const stored = storageId && (await ctx.storage.get(storageId));
    if (!stored) return new Response(null, { status: 404, headers: cors });
    return new Response(stored, {
      headers: { ...cors, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  }),
});

http.route({
  path: "/file",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: cors })),
});

export default http;
