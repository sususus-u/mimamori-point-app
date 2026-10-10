// 実行: npm test(Node 標準のテスト機能。追加の部品は不要)
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAuthToken, stripAuthToken, MAX_AUTH_TOKEN_LENGTH } from "./authToken.ts";

const B = "https://app.example/p";

test("クエリだけ", () => {
  const r = extractAuthToken(`${B}?authToken=abc`);
  assert.equal(r.token, "abc");
  assert.equal(r.cleanedPath, "/p");
});
test("フラグメントだけ", () => {
  const r = extractAuthToken(`${B}#authToken=abc`);
  assert.equal(r.token, "abc");
  assert.equal(r.cleanedPath, "/p");
});
test("両方あるときはフラグメントを優先し、両方消す", () => {
  const r = extractAuthToken(`${B}?authToken=q#authToken=f`);
  assert.equal(r.token, "f");
  assert.equal(r.cleanedPath, "/p");
});
test("どちらもなし(何も変えない)", () => {
  const r = extractAuthToken(`${B}?a=1#x`);
  assert.equal(r.token, null);
  assert.equal(r.rejected, false);
  assert.equal(r.cleanedPath, "/p?a=1#x");
});
test("join と invite は残す", () => {
  const r = extractAuthToken(`${B}?join=g1&invite=i1&authToken=t#authToken=t`);
  assert.equal(r.cleanedPath, "/p?join=g1&invite=i1");
});
test("別のフラグメントは残す", () => {
  assert.equal(extractAuthToken(`${B}#sec`).cleanedPath, "/p#sec");
  assert.equal(extractAuthToken(`${B}#sec&authToken=t`).cleanedPath, "/p#sec");
  assert.equal(extractAuthToken(`${B}#authToken=t&sec`).cleanedPath, "/p#sec");
  assert.equal(extractAuthToken(`${B}?return=%2Fa#authToken=t`).cleanedPath, "/p?return=%2Fa");
});
test("値が空は引き継ぎなし。URL からは消す", () => {
  const r = extractAuthToken(`${B}?authToken=#authToken=`);
  assert.equal(r.token, null);
  assert.equal(r.rejected, false);
  assert.equal(r.cleanedPath, "/p");
});
test("長すぎる値は拒否する(クエリ・フラグメントとも)", () => {
  const long = "a".repeat(MAX_AUTH_TOKEN_LENGTH + 1);
  for (const u of [`${B}?authToken=${long}`, `${B}#authToken=${long}`]) {
    const r = extractAuthToken(u);
    assert.equal(r.token, null);
    assert.equal(r.rejected, true);
    assert.equal(r.cleanedPath, "/p");
  }
  assert.equal(extractAuthToken(`${B}#authToken=${"a".repeat(MAX_AUTH_TOKEN_LENGTH)}`).rejected, false);
});
test("stripAuthToken は戻り先 URL から両方外す", () => {
  assert.equal(stripAuthToken(`${B}?join=g&authToken=t#authToken=t`), `${B}?join=g`);
});
