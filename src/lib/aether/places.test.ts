import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { distanceMeters, fetchNearbyPlaces } from "./places.ts";

describe("fetchNearbyPlaces", () => {
  it("returns sorted real hits from mock Nominatim", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          {
            name: "City Pharmacy",
            display_name: "City Pharmacy, Main St",
            lat: "1.301",
            lon: "103.801",
            type: "pharmacy",
          },
          {
            name: "Far Pharmacy",
            display_name: "Far Pharmacy, Outskirts",
            lat: "1.35",
            lon: "103.9",
            type: "pharmacy",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const result = await fetchNearbyPlaces(1.3, 103.8, "pharmacy", {
      fetchImpl: mockFetch,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.ok(result.places.length >= 1);
      assert.equal(result.places[0].name, "City Pharmacy");
      assert.ok((result.places[0].distanceM ?? 1e9) < (result.places[1]?.distanceM ?? 1e9));
      assert.match(result.message, /City Pharmacy/);
    }
  });

  it("fails cleanly on empty results", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const result = await fetchNearbyPlaces(1, 2, "pharmacy", { fetchImpl: mockFetch });
    assert.equal(result.ok, false);
  });
});

describe("distanceMeters", () => {
  it("is zero for identical points", () => {
    assert.equal(Math.round(distanceMeters(10, 20, 10, 20)), 0);
  });
});
