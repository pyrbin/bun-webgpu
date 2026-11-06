// A Dawn bump in one command: `bun dawn/update.ts [tag]` (the newest google/dawn release when no tag)
// downloads the release's static Windows build into dawn/libs/x86_64-windows, writes dawn/dawn.json,
// dawn/webgpu.h and dawn/VERSION from it, regenerates src/enums.ts and builds
// src/lib/x86_64-windows/webgpu_wrapper.dll. Then `bun test`: src/dawn.test.ts holds every enum number
// and struct layout to the new header. Needs gh, tar, pwsh, Zig 0.14.1 on PATH and the MSVC
// toolset the release was built with (v20261105: VS 2026, MSVC 14.51).
import { $ } from "bun"
import { cpSync, existsSync, mkdirSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

const here = import.meta.dir
const tag = Bun.argv[2] ?? (await $`gh release view -R google/dawn --json tagName -q .tagName`.text()).trim()
const assets = (await $`gh release view ${tag} -R google/dawn --json assets -q .assets[].name`.text()).split("\n")
const tarball = assets.find((a) => /^Dawn-[0-9a-f]{40}-windows-latest-Release\.tar\.gz$/.test(a))
if (!tarball) throw new Error(`Dawn ${tag} has no static Windows release build`)
const commit = tarball.split("-")[1]!

const cache = join(tmpdir(), `dawn-${tag}`)
if (!existsSync(join(cache, tarball))) {
  mkdirSync(cache, { recursive: true })
  await $`gh release download ${tag} -R google/dawn -p ${tarball} -D ${cache} --clobber`
}
const unpacked = join(cache, tarball.replace(/\.tar\.gz$/, ""))
if (!existsSync(unpacked)) await $`tar -xzf ${tarball}`.cwd(cache)

const libs = join(here, "libs/x86_64-windows")
rmSync(libs, { recursive: true, force: true })
mkdirSync(libs, { recursive: true })
cpSync(join(unpacked, "lib/webgpu_dawn.lib"), join(libs, "webgpu_dawn.lib"))
cpSync(join(unpacked, "include"), join(libs, "include"), { recursive: true })
cpSync(join(unpacked, "include/dawn/webgpu.h"), join(here, "webgpu.h"))

const json = await fetch(`https://raw.githubusercontent.com/google/dawn/${commit}/src/dawn/dawn.json`)
if (!json.ok) throw new Error(`dawn.json at ${commit}: HTTP ${json.status}`)
await Bun.write(join(here, "dawn.json"), await json.text())
await Bun.write(join(here, "VERSION"), `${tag} ${commit}\n`)

await $`bun ${join(here, "../scripts/enums.ts")}`
await $`pwsh -NoProfile -File ${join(here, "../build-windows.ps1")}`

// Dawn's D3D12 backend compiles with DXC, loaded only from the wrapper's own folder (never PATH), as
// Chromium ships it: the newest stable release's two DLLs and their licenses go beside the wrapper
const dxc = (await $`gh release view -R microsoft/DirectXShaderCompiler --json tagName -q .tagName`.text()).trim()
const dxcCache = join(tmpdir(), `dxc-${dxc}`)
if (!existsSync(join(dxcCache, "bin"))) {
  mkdirSync(dxcCache, { recursive: true })
  await $`gh release download ${dxc} -R microsoft/DirectXShaderCompiler -p ${"dxc_*.zip"} -D ${dxcCache} --clobber`
  const zip = join(dxcCache, (await $`ls ${dxcCache}`.text()).trim())
  await $`pwsh -NoProfile -Command Expand-Archive -LiteralPath ${zip} -DestinationPath ${dxcCache}`
}
const out = join(here, "../src/lib/x86_64-windows")
for (const f of ["bin/x64/dxcompiler.dll", "bin/x64/dxil.dll", "LICENSE-MS.txt", "LICENSE-LLVM.txt"])
  cpSync(join(dxcCache, f), join(out, f.startsWith("bin") ? f.slice(8) : `dxc-${f}`))
await Bun.write(join(here, "VERSION"), `${tag} ${commit}\ndxc ${dxc}\n`)
console.log(`Dawn ${tag} (${commit}), DXC ${dxc}: run bun test`)
