import { describe, expect, it } from "vitest";
import {
  httpRequestsTotal,
  matchingQueueSize,
  matchingSearchDuration,
  positionUpdateLatency,
  registry,
  rideDuration,
} from "./metrics.js";

describe("metrics registry", () => {
  it("exposes the custom metrics alongside the default process metrics", async () => {
    httpRequestsTotal.inc({ method: "GET", route: "/health", status_code: "200" });
    matchingQueueSize.set(2);
    matchingSearchDuration.observe({ outcome: "assigned" }, 1.5);
    positionUpdateLatency.observe(0.2);
    rideDuration.observe(600);

    const text = await registry.metrics();

    expect(text).toContain("http_requests_total");
    expect(text).toContain("matching_queue_size 2");
    expect(text).toContain("matching_search_duration_seconds");
    expect(text).toContain("position_update_latency_seconds");
    expect(text).toContain("ride_duration_seconds");
    expect(text).toContain("process_cpu_user_seconds_total");
  });
});
