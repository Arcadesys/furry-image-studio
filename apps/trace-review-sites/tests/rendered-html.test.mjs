import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("build contains the Trace Review product shell", async () => {
  const clientManifest = JSON.parse(
    await readFile(new URL("../dist/client/.vite/manifest.json", import.meta.url), "utf8"),
  );
  const clientPagePath = clientManifest["app/page.tsx"].file;
  const serverAssets = await readdir(new URL("../dist/server/ssr/assets/", import.meta.url));
  const serverPagePath = serverAssets.find((file) => file.startsWith("page-") && file.endsWith(".js"));
  assert.ok(serverPagePath);
  const [worker, serverPage, clientPage] = await Promise.all([
    readFile(new URL("../dist/server/index.js", import.meta.url), "utf8"),
    readFile(new URL(`../dist/server/ssr/assets/${serverPagePath}`, import.meta.url), "utf8"),
    readFile(new URL(`../dist/client/${clientPagePath}`, import.meta.url), "utf8"),
  ]);
  const build = `${worker}\n${serverPage}\n${clientPage}`;
  assert.match(build, /Furry Image Studio Trace Review/);
  assert.match(build, /Loading review sets/);
  assert.match(build, /evals\/outputs/);
  assert.doesNotMatch(build, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("packages persistence metadata without bundled image evidence", async () => {
  await Promise.all([
    access(new URL("../dist/server/index.js", import.meta.url)),
    access(new URL("../dist/.openai/hosting.json", import.meta.url)),
    access(new URL("../drizzle", import.meta.url)),
  ]);

  const hosting = JSON.parse(
    await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  );
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, null);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  assert.equal(projectRoot.pathname.endsWith("/apps/trace-review-sites/"), true);
});
