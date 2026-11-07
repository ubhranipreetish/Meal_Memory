import { describe, expect, it } from "vitest";
import { validateBase64Upload } from "./uploadValidation";

describe("upload validation", () => {
  it("accepts supported content and returns a safe extension", () => {
    const result = validateBase64Upload(Buffer.from("small image").toString("base64"), "image/jpeg", "photo");
    expect(result.extension).toBe("jpg");
    expect(result.buffer.toString()).toBe("small image");
  });

  it("rejects a type that does not belong to the upload flow", () => {
    expect(() => validateBase64Upload("AAAA", "text/html", "report")).toThrow("Unsupported report file type");
    expect(() => validateBase64Upload("AAAA", "application/pdf", "photo")).toThrow("Unsupported photo file type");
  });

  it("rejects malformed base64", () => {
    expect(() => validateBase64Upload("not base64!", "audio/wav", "audio")).toThrow("Invalid audio data");
  });
});
