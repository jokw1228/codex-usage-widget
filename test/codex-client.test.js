const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { CodexRpcClient } = require("../src/core/codex-client");

function createClient(t) {
  const requests = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new Writable({
    write(chunk, _encoding, callback) {
      requests.push(JSON.parse(chunk.toString()));
      callback();
    }
  });
  child.kill = () => { child.killed = true; };
  const client = new CodexRpcClient({
    version: "test",
    command: "codex.exe",
    spawnProcess: () => child
  });
  t.after(() => client.dispose());
  const reply = (id, result) => child.stdout.write(`${JSON.stringify({ id, result })}\n`);
  return { client, child, requests, reply };
}

test("simultaneous reads share initialization and match out-of-order responses", async (t) => {
  const { client, requests, reply } = createClient(t);
  const first = client.getRateLimits();
  const second = client.getRateLimits();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "initialize");
  reply(requests[0].id, {});
  await new Promise(setImmediate);
  assert.equal(requests.length, 3);
  reply(requests[2].id, { tag: "second" });
  reply(requests[1].id, { tag: "first" });
  assert.deepEqual(await Promise.all([first, second]), [{ tag: "first" }, { tag: "second" }]);
  assert.equal(client.pending.size, 0);
});

test("fragmented JSON and notifications are handled independently", async (t) => {
  const { client, child, requests } = createClient(t);
  const updates = [];
  client.on("rate-limits", (value) => updates.push(value));
  const pending = client.request("read", null);
  child.stdout.write(`not-json\n{"id":${requests[0].id},"res`);
  child.stdout.write('ult":{"ok":true}}\n{"method":"account/rateLimits/updated","params":{"tag":1}}\n');
  assert.deepEqual(await pending, { ok: true });
  assert.deepEqual(updates, [{ tag: 1 }]);
});

test("server errors reject requests and clear their deadlines", async (t) => {
  const { client, child, requests } = createClient(t);
  const pending = client.request("read", null);
  const rejected = assert.rejects(pending, /login required/);
  child.stdout.write(`${JSON.stringify({ id: requests[0].id, error: { message: "login required" } })}\n`);
  await rejected;
  assert.equal(client.pending.size, 0);
});

for (const event of ["error", "exit", "stdin-error", "dispose"]) {
  test(`${event} rejects outstanding and future requests without leaving timers`, async (t) => {
    const { client, child } = createClient(t);
    const pending = client.request("read", null);
    const rejected = assert.rejects(pending);
    if (event === "dispose") client.dispose();
    else if (event === "stdin-error") child.stdin.emit("error", new Error("pipe closed"));
    else child.emit(event, new Error("process failed"));
    await rejected;
    assert.equal(client.pending.size, 0);
    await assert.rejects(client.request("read", null));
  });
}
