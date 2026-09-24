import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fetchWeather, weatherConditionFromCode } from "./weather.ts";

describe("fetchWeather", () => {
  it("returns structured snapshot on success", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          current: {
            temperature_2m: 22.4,
            apparent_temperature: 21.0,
            relative_humidity_2m: 55,
            weather_code: 0,
            wind_speed_10m: 12,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const result = await fetchWeather(1.3, 103.8, { fetchImpl: mockFetch });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.snapshot.temperatureC, 22.4);
      assert.equal(result.snapshot.condition, "clear");
      assert.equal(result.snapshot.source, "open-meteo");
      assert.match(result.message, /22/);
      assert.doesNotMatch(result.message, /1\.3/);
    }
  });

  it("fails without inventing weather", async () => {
    const mockFetch: typeof fetch = async () =>
      new Response("nope", { status: 503 });
    const result = await fetchWeather(1, 2, { fetchImpl: mockFetch });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /unavailable|Couldn't/i);
    }
  });

  it("fails on invalid coords", async () => {
    const result = await fetchWeather(Number.NaN, 0);
    assert.equal(result.ok, false);
  });
});

describe("weatherConditionFromCode", () => {
  it("covers common WMO codes", () => {
    assert.equal(weatherConditionFromCode(3), "overcast");
    assert.equal(weatherConditionFromCode(71), "snow");
  });
});
