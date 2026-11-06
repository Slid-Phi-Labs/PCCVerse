// Boundary: replayFromMemory is in-session memory replay, NOT a bitstream decoder.
// An imprint number alone (fresh machine, restarted process, serialized copy)
// reproduces nothing. This test pins that documented boundary — see README
// "Not a codec — in-session replay only".
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as machineModule from "../src/machine.js";
import { boot, ingest, replayFromMemory } from "../src/machine.js";

describe("swarm-smart replay boundary (not a codec)", () => {
  it("exposes no bitstream-decoder export: `restore` is gone", () => {
    assert.ok(!("restore" in machineModule), "restore export must not exist");
    assert.equal(typeof replayFromMemory, "function");
  });

  it("same session replays; a fresh machine with the same imprint throws", async () => {
    const live = boot();
    const msg = Buffer.from("in-session replay boundary probe");
    const r = await ingest(live, msg);
    assert.equal(r.ok, true);
    assert.ok(replayFromMemory(live, r.imprint).bytes.equals(msg));
    const fresh = boot();
    assert.throws(() => replayFromMemory(fresh, r.imprint));
  });

  it("a serialized imprint number in a new session cannot reproduce bytes", async () => {
    const live = boot();
    const { imprint } = await ingest(live, Buffer.from("copied-number-is-not-a-bitstream"));
    const copied = JSON.parse(JSON.stringify(imprint));
    const restarted = boot();
    assert.throws(
      () => replayFromMemory(restarted, copied),
      "bare imprint number must not decode",
    );
  });
});
