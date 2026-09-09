import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the 字芽 learning experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>字芽 · 一笔一画学汉字<\/title>/);
  assert.match(html, /今天想学哪个字/);
  assert.match(html, /开始学习/);
  assert.match(html, /看笔顺/);
  assert.match(html, /我来写/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("exposes installable offline app metadata", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /theme-color/);
  assert.match(html, /og\.png/);
});
