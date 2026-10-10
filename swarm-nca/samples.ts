export type SampleId = "zeros" | "repeat" | "json" | "prose" | "code" | "clones" | "random" | "custom";

export const SAMPLES: { id: Exclude<SampleId, "custom">; label: string; hint: string; build: () => string }[] = [
  {
    id: "zeros",
    label: "Zeros",
    hint: "Long run",
    build: () => "0".repeat(2048),
  },
  {
    id: "repeat",
    label: "Motif",
    hint: "Repeating phrase",
    build: () => "swarm-nca-pack ".repeat(180),
  },
  {
    id: "json",
    label: "JSON",
    hint: "Structured text",
    build: () =>
      JSON.stringify(
        {
          model: "swarm-nca",
          steps: 3,
          workers: 8,
          tags: ["lit", "run", "match", "clone"],
          notes: Array.from({ length: 24 }, (_, i) => ({
            i,
            ok: i % 2 === 0,
            msg: "cell consensus",
          })),
        },
        null,
        2,
      ).repeat(3),
  },
  {
    id: "prose",
    label: "Prose",
    hint: "Natural language",
    build: () =>
      "A general compressor should treat bits as a field, not a stream. ".repeat(40) +
      "Neural cellular automata tag local structure; a swarm puts the field back together.",
  },
  {
    id: "code",
    label: "Source",
    hint: "Token-like",
    build: () =>
      `function encode(bytes) {\n  const cells = Array.from(bytes, (b) => ({ b, h: 0 }));\n  for (let t = 0; t < 4; t++) step(cells);\n  return pack(cells);\n}\n`.repeat(16),
  },
  {
    id: "clones",
    label: "Clones",
    hint: "Identical 4 KB workers",
    build: () => {
      const block = "0123456789abcdef".repeat(256);
      return block + block;
    },
  },
  {
    id: "random",
    label: "Noise",
    hint: "Should stay near 1.0x",
    build: () => {
      const a = new Uint8Array(800);
      for (let i = 0; i < a.length; i++) a[i] = (i * 47 + 13) % 251;
      return Array.from(a, (b) => String.fromCharCode(32 + (b % 95))).join("");
    },
  },
];

export const SCHOOL_STRING = "aaaabaaaab";
