import assert from "node:assert/strict";
import test from "node:test";
import { collectOrderPages } from "../src/ametller/api.mjs";

test("collectOrderPages follows numeric pages through the short final page", async () => {
  const calls = [];
  const result = await collectOrderPages(async (page, limit) => {
    calls.push([page, limit]);
    return { total: 3, data: page === 1 ? [{ orderNo: "a" }, { orderNo: "b" }] : [{ orderNo: "c" }] };
  }, { limit: 2 });
  assert.deepEqual(calls, [[1, 2], [2, 2]]);
  assert.deepEqual(result, { data: [{ orderNo: "a" }, { orderNo: "b" }, { orderNo: "c" }], total: 3, pages: 2 });
});

test("collectOrderPages stops repeated server pages", async () => {
  await assert.rejects(
    collectOrderPages(async () => ({ data: [{ orderNo: "same" }] }), { limit: 1, maxPages: 3 }),
    /repeated a page/,
  );
});
