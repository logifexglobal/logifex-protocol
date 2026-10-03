import { describe, it, expect, vi } from "vitest";
import { EventBus, handlerFrom } from "../src/bus.js";
import { createEvent } from "../src/event.js";

describe("EventBus", () => {
  it("publish() resolves as accepted without waiting for handlers to finish", async () => {
    const bus = new EventBus();
    await bus.start();

    let resolveHandler!: () => void;
    const slow = new Promise<void>((r) => (resolveHandler = r));
    bus.subscribe("x", handlerFrom(async () => { await slow; }));

    const event = createEvent({ type: "x", payload: {} });
    const result = await bus.publish(event);

    expect(result).toEqual({ accepted: true, eventId: event.id });
    resolveHandler();
  });

  it("refuses to publish before start() / after dispose()", async () => {
    const bus = new EventBus();
    const event = createEvent({ type: "x", payload: {} });

    const beforeStart = await bus.publish(event);
    expect(beforeStart.accepted).toBe(false);

    await bus.start();
    await bus.dispose();
    const afterDispose = await bus.publish(event);
    expect(afterDispose.accepted).toBe(false);
  });

  it("one handler failing does not block sibling handlers", async () => {
    const bus = new EventBus({ onHandlerError: () => {} });
    await bus.start();

    const succeeded = vi.fn();
    bus.subscribe("x", handlerFrom(async () => { throw new Error("boom"); }));
    bus.subscribe("x", handlerFrom(async () => { succeeded(); }));

    await bus.publish(createEvent({ type: "x", payload: {} }));
    await new Promise((r) => setTimeout(r, 0));

    expect(succeeded).toHaveBeenCalledOnce();
  });

  it("reports handler errors without throwing through publish()", async () => {
    const onHandlerError = vi.fn();
    const bus = new EventBus({ onHandlerError });
    await bus.start();

    bus.subscribe("x", handlerFrom(async () => { throw new Error("boom"); }));
    await expect(bus.publish(createEvent({ type: "x", payload: {} }))).resolves.toMatchObject({ accepted: true });

    await new Promise((r) => setTimeout(r, 0));
    expect(onHandlerError).toHaveBeenCalledOnce();
  });

  it("subscribe() returns an unsubscribe function", async () => {
    const bus = new EventBus();
    await bus.start();

    const called = vi.fn();
    const unsubscribe = bus.subscribe("x", handlerFrom(called));
    unsubscribe();

    await bus.publish(createEvent({ type: "x", payload: {} }));
    await new Promise((r) => setTimeout(r, 0));
    expect(called).not.toHaveBeenCalled();
  });

  it("drain() resolves only after every in-flight handler has settled", async () => {
    const bus = new EventBus({ onHandlerError: () => {} });
    await bus.start();

    const order: string[] = [];
    bus.subscribe("x", handlerFrom(async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("slow");
    }));
    bus.subscribe("x", handlerFrom(async () => { throw new Error("boom"); }));

    await bus.publish(createEvent({ type: "x", payload: {} }));
    expect(order).toEqual([]); // publish() did not wait
    await bus.drain();
    expect(order).toEqual(["slow"]);
  });

  it("drain() resolves immediately when nothing is in flight", async () => {
    const bus = new EventBus();
    await bus.start();
    await expect(bus.drain()).resolves.toBeUndefined();
  });

  it('a "*" subscriber observes every event type, without double-dispatching', async () => {
    const bus = new EventBus();
    await bus.start();
    const seen: string[] = [];
    bus.subscribe("*", handlerFrom((e) => { seen.push(e.type); }));
    bus.subscribe("a", handlerFrom(() => {}));

    await bus.publish(createEvent({ type: "a", payload: {} }));
    await bus.publish(createEvent({ type: "b", payload: {} }));
    await bus.publish(createEvent({ type: "*", payload: {} }));
    await bus.drain();
    expect(seen).toEqual(["a", "b", "*"]);
  });
});
