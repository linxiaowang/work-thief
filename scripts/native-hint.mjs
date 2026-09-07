const lines = [
  '[WorkThief] Native module rebuild did not succeed.',
  '  Symptom (Apple Silicon): mach-o incompatible architecture (have x86_64, need arm64).',
  '  Fix: use arm64 Node; remove node_modules; pnpm install; then pnpm setup (or pnpm rebuild).',
  '  See README Native modules.',
]
for (const line of lines) console.warn(line)
