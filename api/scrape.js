import * as cheerio from "cheerio";
import dns from "node:dns/promises";

const isPrivate = (ip) =>
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::1|f[cd])/i.test(ip);

export default async function handler(req, res) {
  const { url, selector, attr = "text", limit = "200" } = req.query;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error("URL invalide (http ou https)");
    const { address } = await dns.lookup(u.hostname);
    if (isPrivate(address)) throw new Error("Adresse non autorisée");

    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BeeScraper/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    const $ = cheerio.load(await r.text());
    const abs = (h) => { try { return new URL(h, u).href; } catch { return h || ""; } };
    const max = Math.min(+limit || 200, 1000);
    const txt = (el) => $(el).text().replace(/\s+/g, " ").trim();

    let data;
    if (selector) {
      data = $(selector).slice(0, max).map((_, el) => {
        if (attr === "text") return txt(el);
        if (attr === "html") return $(el).html();
        const v = $(el).attr(attr);
        return attr === "href" || attr === "src" ? abs(v) : v;
      }).get().filter(Boolean);
    } else {
      data = {
        title: $("title").text().trim(),
        description: $('meta[name="description"]').attr("content") || "",
        headings: $("h1,h2,h3").slice(0, max).map((_, e) => txt(e)).get().filter(Boolean),
        links: $("a[href]").slice(0, max).map((_, e) => ({ text: txt(e), href: abs($(e).attr("href")) })).get(),
        images: $("img[src]").slice(0, max).map((_, e) => abs($(e).attr("src"))).get(),
      };
    }
    res.status(200).json({ ok: true, status: r.status, url: u.href, data });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
}
