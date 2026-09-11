const lines = [
  '[WorkThief] Native module rebuild did not succeed.',
  '  Symptom (Apple Silicon): mach-o incompatible architecture (have x86_64, need arm64).',
  '  ALWAYS use arm64 Node on Apple Silicon: node -p process.arch  →  must be arm64 (not x64).',
  '  Exact fix:',
  '    1) node -p process.arch   # expect arm64',
  '    2) If x64: install arm64 Node, or `arch -arm64 zsh` then use arm64 Node',
  '    3) rm -rf node_modules',
  '    4) pnpm install',
  '    5) pnpm setup',
  '  See README · Native modules.',
]
for (const line of lines) console.warn(line)
