const MB = 1024 * 1024;

const UPLOAD_RULES = {
  photo: {
    maxBytes: 5 * MB,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
  },
  audio: {
    maxBytes: 5 * MB,
    mimeTypes: ["audio/wav", "audio/x-wav"],
  },
  report: {
    maxBytes: 5 * MB,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  },
} as const;

type UploadKind = keyof typeof UPLOAD_RULES;

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateBase64Upload(base64: string, mimeType: string, kind: UploadKind) {
  const rules = UPLOAD_RULES[kind];
  const normalizedMime = mimeType.toLowerCase().trim();
  if (!(rules.mimeTypes as readonly string[]).includes(normalizedMime)) {
    throw new Error(`Unsupported ${kind} file type`);
  }

  // Check encoded length first so a huge payload never reaches the regex or decoder.
  const maxEncodedLength = Math.ceil((rules.maxBytes * 4) / 3) + 4;
  if (!base64 || base64.length > maxEncodedLength) {
    throw new Error(`${kind[0].toUpperCase() + kind.slice(1)} must be 5 MB or smaller`);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new Error(`Invalid ${kind} data`);
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > rules.maxBytes) {
    throw new Error(`${kind[0].toUpperCase() + kind.slice(1)} must be 5 MB or smaller`);
  }
  return { buffer, mimeType: normalizedMime, extension: EXTENSIONS[normalizedMime] };
}
