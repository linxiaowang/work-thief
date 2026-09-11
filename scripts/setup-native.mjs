#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for the installed Electron (ABI + arch).
 *
 * Why this exists: `pnpm install` / `npm install` installs a Node prebuild for
 * process.arch. Electron on Apple Silicon is arm64 — if Node is x64 (Rosetta)
 * or rebuild is skipped, you get:
 *   mach-o file, but is an incompatible architecture (have 'x86_64', need 'arm64')
 *
 * Usage:
 *   node scripts/setup-native.mjs              # full native setup
 *   node scripts/setup-native.mjs --postinstall # soft-fail for postinstall
 *   node scripts/setup-native.mjs --rebuild-only
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { arch as osArch, platform } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const args = new Set(process.argv.slice(2))
const softFail = args.has('--postinstall')
const rebuildOnly = args.has('--rebuild-only')

function log(...parts) {
  console.log('[WorkThief:setup-native]', ...parts)
}

function warn(...parts) {
  console.warn('[WorkThief:setup-native]', ...parts)
}

function run(cmd, cmdArgs, opts = {}) {
  log('$', cmd, cmdArgs.join(' '))
  const r = spawnSync(cmd, cmdArgs, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: false,
    ...opts
  })
  if (r.stdout?.trim()) process.stdout.write(r.stdout.endsWith('\n') ? r.stdout : r.stdout + '\n')
  if (r.stderr?.trim()) process.stderr.write(r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n')
  return r
}

function which(bin) {
  const r = spawnSync(platform() === 'win32' ? 'where' : 'which', [bin], {
    encoding: 'utf8',
    shell: false
  })
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/)[0] : null
}

function pnpmOrNpx(binName) {
  const local = join(root, 'node_modules', '.bin', binName)
  if (existsSync(local)) return local
  return which(binName)
}

/** true when this process is Rosetta-translated on Apple Silicon */
function isRosettaTranslated() {
  if (platform() !== 'darwin') return false
  try {
    const r = spawnSync('sysctl', ['-in', 'sysctl.proc_translated'], { encoding: 'utf8' })
    return r.status === 0 && r.stdout.trim() === '1'
  } catch {
    return false
  }
}

/** Prefer hw.optional.arm64; fall back to uname when not under Rosetta. */
function isAppleSiliconMachine() {
  if (platform() !== 'darwin') return false
  try {
    const r = spawnSync('sysctl', ['-in', 'hw.optional.arm64'], { encoding: 'utf8' })
    if (r.status === 0 && r.stdout.trim() === '1') return true
  } catch {
    /* ignore */
  }
  if (isRosettaTranslated()) return true
  return false
}

function printArchGuidance() {
  const lines = [
    '',
    '=== Apple Silicon: always use arm64 Node ===',
    `  Current Node process.arch = ${process.arch}`,
    '  Required: node -p process.arch  →  arm64',
    '',
    '  Exact fix:',
    '  1) node -p process.arch   # must print arm64 (not x64)',
    '  2) If x64: install arm64 Node (nodejs.org macOS ARM64), or open an arm64 shell:',
    '       arch -arm64 zsh',
    '     then reinstall Node / use an arm64 Homebrew Node.',
    '  3) rm -rf node_modules',
    '  4) pnpm install',
    '  5) pnpm setup',
    '  6) Optional verify: find node_modules -name better_sqlite3.node -exec file {} \\;',
    '     Expect: Mach-O 64-bit bundle arm64',
    '  See README Native modules.',
    ''
  ]
  for (const line of lines) console.warn(line)
}

function findBetterSqliteNode() {
  const hits = []
  const walk = (dir, depth) => {
    if (depth > 8 || !existsSync(dir)) return
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name === '.git' || name === 'out' || name === 'release') continue
      const p = join(dir, name)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (name === 'better-sqlite3' || name === 'build' || name === 'Release' || name === '.pnpm' || name.startsWith('better-sqlite3@')) {
          walk(p, depth + 1)
        } else if (depth < 4 && (name === 'node_modules' || name.startsWith('@'))) {
          walk(p, depth + 1)
        }
      } else if (name === 'better_sqlite3.node') {
        hits.push(p)
      }
    }
  }
  // Fast paths first
  const candidates = [
    join(root, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'),
    join(root, 'node_modules/better-sqlite3/build/Debug/better_sqlite3.node')
  ]
  for (const c of candidates) {
    if (existsSync(c)) hits.push(c)
  }
  walk(join(root, 'node_modules'), 0)
  return [...new Set(hits)]
}

/** Best-effort Mach-O / ELF arch sniff (no `file` binary required). */
function sniffNativeArch(path) {
  try {
    const buf = readFileSync(path)
    if (buf.length < 8) return 'unknown'
    // Mach-O 64-bit little-endian magic 0xFEEDFACF
    if (buf.readUInt32LE(0) === 0xfeedfacf) {
      const cputype = buf.readUInt32LE(4)
      if (cputype === 0x0100000c) return 'arm64'
      if (cputype === 0x01000007) return 'x86_64'
      return `macho-cputype-${cputype}`
    }
    // Mach-O fat / big-endian — report via `file` if available
    if (buf.readUInt32LE(0) === 0xbebafeca || buf.readUInt32BE(0) === 0xfeedfacf) {
      return 'macho-other'
    }
    // ELF
    if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) {
      const elfClass = buf[4]
      const machine = elfClass === 2 ? buf.readUInt16LE(18) : buf.readUInt16LE(16)
      if (machine === 62) return 'x86_64'
      if (machine === 183) return 'arm64'
      return `elf-machine-${machine}`
    }
    return 'unknown'
  } catch {
    return 'unreadable'
  }
}

function verifyNativeBinary(expectedArch) {
  const nodes = findBetterSqliteNode()
  if (nodes.length === 0) {
    warn('No better_sqlite3.node found after rebuild')
    return false
  }
  let ok = true
  for (const p of nodes) {
    let label = sniffNativeArch(p)
    const fileBin = which('file')
    if (fileBin) {
      const r = spawnSync(fileBin, [p], { encoding: 'utf8' })
      if (r.status === 0 && r.stdout.trim()) {
        log('file:', r.stdout.trim())
        if (/arm64/.test(r.stdout) && !/x86_64/.test(r.stdout.replace(/arm64/g, ''))) label = 'arm64'
        else if (/x86_64/.test(r.stdout) && !/arm64/.test(r.stdout)) label = 'x86_64'
      }
    } else {
      log('binary:', p, '→', label)
    }
    if (expectedArch === 'arm64' && label === 'x86_64') {
      warn(`WRONG ARCH at ${p}: have x86_64, need arm64`)
      ok = false
    }
    if (expectedArch === 'x64' && label === 'arm64') {
      warn(`WRONG ARCH at ${p}: have arm64, need x86_64`)
      ok = false
    }
  }
  return ok
}

function ensureElectron() {
  if (rebuildOnly) return true
  const installJs = join(root, 'node_modules/electron/install.js')
  if (!existsSync(installJs)) {
    warn('electron package missing — skip electron download')
    return false
  }
  const dist = join(root, 'node_modules/electron/dist')
  const marker = join(root, 'node_modules/electron/path.txt')
  if (existsSync(dist) && existsSync(marker)) {
    log('Electron dist present')
    return true
  }
  log('Downloading Electron via electron/install.js …')
  const r = run(process.execPath, [installJs])
  return r.status === 0
}

function rebuildNative() {
  const electronBuilder = pnpmOrNpx('electron-builder')
  const electronRebuild = pnpmOrNpx('electron-rebuild')

  // Align target arch with this Node process (user must use arm64 Node on Apple Silicon).
  const targetArch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch
  const env = {
    ...process.env,
    npm_config_arch: targetArch,
    npm_config_target_arch: targetArch,
    npm_config_platform: platform(),
    npm_config_target_platform: platform()
  }

  if (electronBuilder) {
    log('Trying electron-builder install-app-deps …')
    const r = run(electronBuilder, ['install-app-deps'], { env })
    if (r.status === 0) {
      log('install-app-deps OK')
      return true
    }
    warn('install-app-deps failed (status', r.status, ')')
  } else {
    warn('electron-builder not found in node_modules/.bin')
  }

  if (electronRebuild) {
    log('Falling back to electron-rebuild -f -w better-sqlite3 …')
    const rebuildArgs = ['-f', '-w', 'better-sqlite3', '--arch', targetArch]
    const r = run(electronRebuild, rebuildArgs, { env })
    if (r.status === 0) {
      log('electron-rebuild OK')
      return true
    }
    warn('electron-rebuild failed (status', r.status, ')')
  } else {
    warn('electron-rebuild not found in node_modules/.bin')
  }

  return false
}

function main() {
  log(`node=${process.version} process.arch=${process.arch} os.arch=${osArch()} platform=${platform()}`)

  const appleSilicon = isAppleSiliconMachine()
  const rosetta = isRosettaTranslated()

  if (appleSilicon) {
    if (process.arch !== 'arm64' || rosetta) {
      warn(
        rosetta
          ? 'This Node is running under Rosetta (x86_64). Electron needs arm64 better-sqlite3.'
          : `Apple Silicon Mac but Node process.arch=${process.arch} (need arm64).`
      )
      printArchGuidance()
      // Still attempt rebuild so non-interactive postinstall prints the hint path,
      // but treat as failure — wrong Node arch almost always yields wrong .node.
      ensureElectron()
      rebuildNative()
      verifyNativeBinary('arm64')
      fail(1)
      return
    }
    log('Apple Silicon + arm64 Node — good')
  }

  if (!existsSync(join(root, 'node_modules/better-sqlite3'))) {
    warn('better-sqlite3 not installed yet — skip native rebuild')
    fail(softFail ? 0 : 1)
    return
  }

  ensureElectron()
  const rebuilt = rebuildNative()
  const expectedArch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x64' : process.arch
  const verified = verifyNativeBinary(expectedArch)

  if (!rebuilt) {
    printArchGuidance()
    fail(1)
    return
  }
  if (appleSilicon && !verified) {
    printArchGuidance()
    fail(1)
    return
  }
  log('Native setup finished')
  process.exit(0)
}

function fail(code) {
  try {
    const hint = join(root, 'scripts/native-hint.mjs')
    if (existsSync(hint)) run(process.execPath, [hint])
  } catch {
    /* ignore */
  }
  if (softFail) {
    warn('postinstall soft-fail — install continues; run: pnpm setup')
    process.exit(0)
  }
  process.exit(code)
}

main()
