// family-daily: private family page. Data lives in KV (binding FD).
// Env vars: VIEW_KEY (link key for the family), WRITE_KEY (used by the daily task only).
const COOKIE = "fd_k";
const JSON_H = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: JSON_H });
function cookie(req, name) {
  const c = req.headers.get("cookie") || "";
  for (const part of c.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
const LOCKED = `<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>家里的今天</title><body style="font-family:system-ui;padding:48px 24px;text-align:center;color:#555"><p>这个页面是私密的。</p><p>请用带钥匙的链接打开一次，之后这台设备会记住。</p></body></html>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const k = url.searchParams.get("k");
    const VIEW = env.VIEW_KEY || "", WRITE = env.WRITE_KEY || "";
    if (url.pathname === "/api/health") return json({ ok: true, kv: !!env.FD, keys: !!(VIEW && WRITE) });

    const cookieOk = !!VIEW && cookie(req, COOKIE) === VIEW;
    const canRead = cookieOk || (!!VIEW && k === VIEW) || (!!WRITE && k === WRITE);

    if (url.pathname === "/api/data") {
      if (!env.FD) return json({ error: "KV not bound (variable name FD)" }, 500);
      if (req.method === "GET") {
        if (!canRead) return json({ error: "forbidden" }, 403);
        const v = await env.FD.get("data");
        return new Response(v || '{"days":[],"weekly":[]}', { headers: JSON_H });
      }
      if (req.method === "PUT") {
        if (!(WRITE && k === WRITE)) return json({ error: "forbidden" }, 403);
        const body = await req.text();
        if (body.length > 1500000) return json({ error: "too large" }, 413);
        let d;
        try { d = JSON.parse(body); } catch (e) { return json({ error: "not JSON" }, 400); }
        if (!d || !Array.isArray(d.days)) return json({ error: "days[] missing" }, 400);
        await env.FD.put("data", JSON.stringify(d));
        return json({ ok: true, days: d.days.length, weekly: (d.weekly || []).length });
      }
      return json({ error: "method" }, 405);
    }

    if (k && VIEW && k === VIEW) {
      url.searchParams.delete("k");
      return new Response(null, { status: 302, headers: {
        location: url.pathname + (url.search || ""),
        "set-cookie": `${COOKIE}=${encodeURIComponent(VIEW)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
      } });
    }
    if (!cookieOk) return new Response(LOCKED, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    out.headers.set("x-robots-tag", "noindex");
    out.headers.set("cache-control", "no-cache");
    return out;
  },
};
