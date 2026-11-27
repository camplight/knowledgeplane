const notes = 10000;
const chars = 800;
const sample = "a".repeat(chars);
const bytes = Buffer.byteLength(sample);
const total = bytes * notes;
console.log(
  JSON.stringify(
    {
      notes,
      bytes_per_note: bytes,
      text_bytes: total,
      text_mebibytes: Number((total / (1024 * 1024)).toFixed(2)),
    },
    null,
    2,
  ),
);
