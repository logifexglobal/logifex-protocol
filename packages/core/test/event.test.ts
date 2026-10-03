import { describe, it, expect } from "vitest";
import { createEvent } from "../src/event.js";

describe("Event", () => {
  it("is immutable after creation", () => {
    const event = createEvent({ type: "order.created", payload: { id: 1 } });
    expect(() => {
      // @ts-expect-error - intentionally violating readonly for the runtime check
      event.payload = { id: 2 };
    }).toThrow();
  });

  it("defaults occurredAt to now, but accepts an explicit business time", () => {
    const backdated = "2020-01-01T00:00:00.000Z";
    const historical = createEvent({
      type: "order.imported",
      payload: {},
      occurredAt: backdated,
    });
    expect(historical.occurredAt).toBe(backdated);

    const now = createEvent({ type: "order.created", payload: {} });
    expect(Date.parse(now.occurredAt)).toBeGreaterThan(Date.parse(backdated));
  });

  it("generates unique ids when none is supplied", () => {
    const a = createEvent({ type: "x", payload: {} });
    const b = createEvent({ type: "x", payload: {} });
    expect(a.id).not.toBe(b.id);
  });

  it("accepts a Date on input and stores an ISO string", () => {
    const event = createEvent({ type: "x", payload: {}, occurredAt: new Date("2021-05-05T05:05:05.000Z") });
    expect(event.occurredAt).toBe("2021-05-05T05:05:05.000Z");
    expect(typeof event.occurredAt).toBe("string");
  });

  it("rejects an unparseable occurredAt", () => {
    expect(() => createEvent({ type: "x", payload: {}, occurredAt: "not a date" })).toThrow(TypeError);
  });
});
