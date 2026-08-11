"use strict";

const crypto = require("node:crypto");
const { MAX_IMPORT_PACKAGE_BYTES } = require("../phase2/draft-service.js");

function readerError(code) { const error = new Error(code); error.code = code; return error; }

function createStoragePackageReader(options) {
  const input = options || {};
  if (!input.storage || typeof input.storage.bucket !== "function") throw new Error("greenfield_injected_storage_required");
  return Object.freeze({
    async readPackage(source) {
      const file = input.storage.bucket(source.bucket).file(source.objectPath);
      const hash = crypto.createHash("sha256");
      const chunks = [];
      let bytes = 0;
      await new Promise(function (resolve, reject) {
        const stream = file.createReadStream();
        stream.on("data", function (chunk) {
          bytes += chunk.length;
          if (bytes > MAX_IMPORT_PACKAGE_BYTES || bytes > source.sizeBytes) {
            stream.destroy(readerError("source_stream_too_large"));
            return;
          }
          hash.update(chunk);
          chunks.push(chunk);
        });
        stream.on("error", reject);
        stream.on("end", resolve);
      });
      if (bytes !== source.sizeBytes) throw readerError("source_size_mismatch");
      const checksum = "sha256:" + hash.digest("hex");
      if (checksum !== source.checksumSha256) throw readerError("source_checksum_mismatch");
      try { return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8")); }
      catch (_error) { throw readerError("source_json_invalid"); }
    },
    async deleteSource(source) {
      await input.storage.bucket(source.bucket).file(source.objectPath).delete({ ignoreNotFound: true });
    }
  });
}

module.exports = { createStoragePackageReader };