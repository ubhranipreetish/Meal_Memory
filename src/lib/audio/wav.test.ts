import { describe, expect, it } from "vitest";
import { VOICE_SAMPLE_RATE, downsample, encodeWav, normalize, toMono } from "./wav";

describe("toMono", () => {
  it("averages channels", () => {
    const out = toMono([new Float32Array([1, 0]), new Float32Array([0, 1])]);
    expect(Array.from(out)).toEqual([0.5, 0.5]);
  });
  it("passes a single channel straight through", () => {
    const one = new Float32Array([0.3, -0.2]);
    expect(toMono([one])).toBe(one);
  });
});

describe("downsample", () => {
  it("reduces the sample count by the rate ratio", () => {
    const input = new Float32Array(48_000);
    expect(downsample(input, 48_000, VOICE_SAMPLE_RATE).length).toBe(16_000);
  });
  it("never upsamples", () => {
    const input = new Float32Array([1, 2, 3]);
    expect(downsample(input, 8_000, 16_000)).toBe(input);
  });
});

describe("normalize", () => {
  it("lifts a quiet recording toward the target peak", () => {
    const out = normalize(new Float32Array([0.1, -0.05]), 0.9);
    expect(out[0]).toBeCloseTo(0.9, 5);
    expect(out[1]).toBeCloseTo(-0.45, 5);
  });
  it("leaves already-loud audio alone", () => {
    const loud = new Float32Array([0.95, -0.9]);
    expect(normalize(loud, 0.9)).toBe(loud);
  });
});

describe("encodeWav", () => {
  const header = (b: ArrayBuffer, off: number, len: number) =>
    String.fromCharCode(...new Uint8Array(b, off, len));

  it("writes a valid 16-bit mono PCM header Gemini can read", () => {
    const buf = encodeWav(new Float32Array([0, 0.5, -0.5]), VOICE_SAMPLE_RATE);
    const view = new DataView(buf);
    expect(header(buf, 0, 4)).toBe("RIFF");
    expect(header(buf, 8, 4)).toBe("WAVE");
    expect(header(buf, 36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(VOICE_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(buf.byteLength).toBe(44 + 3 * 2);
  });

  it("converts float samples to 16-bit and clamps out-of-range values", () => {
    const view = new DataView(encodeWav(new Float32Array([0, 1, -1, 2, -2])));
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32768);
    expect(view.getInt16(50, true)).toBe(32767); // clamped
    expect(view.getInt16(52, true)).toBe(-32768); // clamped
  });
});
