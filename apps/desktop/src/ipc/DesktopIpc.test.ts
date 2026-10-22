import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import * as DesktopIpc from "./DesktopIpc.ts";

interface FakeInvokeEvent {
  readonly sender: { readonly id: number };
}
interface FakeSyncEvent {
  returnValue: unknown;
  readonly sender: { readonly id: number };
}

const makeFakeIpcMain = () => {
  let invoke: ((event: FakeInvokeEvent, raw: unknown) => unknown) | undefined;
  let sync: ((event: FakeSyncEvent) => void) | undefined;
  const main: DesktopIpc.DesktopIpcMain = {
    removeHandler() {},
    handle(_channel, listener) {
      invoke = listener as (event: FakeInvokeEvent, raw: unknown) => unknown;
    },
    removeAllListeners() {},
    on(_channel, listener) {
      sync = listener as (event: FakeSyncEvent) => void;
    },
  };
  return {
    main,
    callInvoke: (senderId: number) =>
      Promise.resolve(invoke?.({ sender: { id: senderId } }, undefined)),
    callSync: (senderId: number) => {
      const event: FakeSyncEvent = { returnValue: "unset", sender: { id: senderId } };
      sync?.(event);
      return event.returnValue;
    },
  };
};

// Only this sender id stands in for the trusted app renderer.
const TRUSTED_SENDER_ID = 1;
const authorizeTrusted: DesktopIpc.DesktopIpcSenderAuthorizer = (event) =>
  (event as FakeInvokeEvent).sender?.id === TRUSTED_SENDER_ID;

describe("DesktopIpc sender authorization", () => {
  it.effect("runs an invoke handler for the trusted sender", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fake = makeFakeIpcMain();
        const ipc = DesktopIpc.make(fake.main, authorizeTrusted);
        let calls = 0;
        yield* ipc.handle({
          channel: "secret",
          handler: () =>
            Effect.sync(() => {
              calls += 1;
              return "bearer-token";
            }),
        });

        const result = yield* Effect.promise(() => fake.callInvoke(TRUSTED_SENDER_ID));
        assert.strictEqual(result, "bearer-token");
        assert.strictEqual(calls, 1);
      }),
    ),
  );

  it.effect("rejects an invoke from an untrusted sender without running the handler", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fake = makeFakeIpcMain();
        const ipc = DesktopIpc.make(fake.main, authorizeTrusted);
        let calls = 0;
        yield* ipc.handle({
          channel: "secret",
          handler: () =>
            Effect.sync(() => {
              calls += 1;
              return "bearer-token";
            }),
        });

        const outcome = yield* Effect.promise(() =>
          fake.callInvoke(TRUSTED_SENDER_ID + 1).then(
            () => "resolved" as const,
            () => "rejected" as const,
          ),
        );
        assert.strictEqual(outcome, "rejected");
        assert.strictEqual(calls, 0);
      }),
    ),
  );

  it.effect("drops a sync call from an untrusted sender", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fake = makeFakeIpcMain();
        const ipc = DesktopIpc.make(fake.main, authorizeTrusted);
        let calls = 0;
        yield* ipc.handleSync({
          channel: "branding",
          handler: () =>
            Effect.sync(() => {
              calls += 1;
              return "app";
            }),
        });

        assert.strictEqual(fake.callSync(TRUSTED_SENDER_ID), "app");
        assert.strictEqual(fake.callSync(TRUSTED_SENDER_ID + 1), undefined);
        assert.strictEqual(calls, 1);
      }),
    ),
  );
});
