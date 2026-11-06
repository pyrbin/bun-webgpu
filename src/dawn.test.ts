// The binding's ABI against the Dawn it is built on: src/enums.ts as scripts/enums.ts writes it from
// dawn/dawn.json, every number in it as dawn/webgpu.h defines it, and every struct's size and field
// offsets as a C compiler lays the header's out. A wrong number makes a texture of another format and
// a wrong offset reads another field, both silently, so these fail loudly instead.
import { expect, test } from "bun:test"
import { cc, ptr } from "bun:ffi"
import { mkdtempSync, mkdirSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { generate, tablesOf } from "../scripts/enums.js"
import * as defs from "./structs_def.js"

const root = join(import.meta.dir, "..")
const json = await Bun.file(join(root, "dawn/dawn.json")).json()
const header = await Bun.file(join(root, "dawn/webgpu.h")).text()

test("src/enums.ts is what scripts/enums.ts writes from dawn/dawn.json", async () => {
  const version = (await Bun.file(join(root, "dawn/VERSION")).text()).split(/\r?\n/)[0]!
  // a checkout may hold the file with CRLF endings
  const file = (await Bun.file(join(import.meta.dir, "enums.ts")).text()).replaceAll("\r\n", "\n")
  expect(file).toBe(generate(json, version))
})

test("every enum value is the number dawn/webgpu.h gives it, and none is missing", () => {
  const defined = new Map<string, number>()
  for (const [, name, value] of header.matchAll(/\b(WGPU\w+?_\w+) = (0x[0-9A-F]+)/g)) defined.set(name!, Number(value))
  const wrong: string[] = []
  for (const { name, values } of tablesOf(json)) {
    for (const [key, value, c] of values) {
      const want = defined.get(`WGPU${name}_${c}`)
      if (want !== value) wrong.push(`${name}.${key} = ${value}, header WGPU${name}_${c} = ${want}`)
    }
    const declared = [...defined.keys()].filter((k) => k.startsWith(`WGPU${name}_`) && !k.endsWith("_Force32"))
    if (declared.length !== values.length) wrong.push(`${name}: ${values.length} values, header ${declared.length}`)
  }
  expect(wrong).toEqual([])
})

// the binding's own structs, which mirror no C type of the header
const own = new Set(["WGPUCallbackInfo", "ZWGPUWorkaroundCopyTextureAndMap"])

test("every struct's size and field offsets are the header's", () => {
  const structs = Object.entries(defs).flatMap(([name, def]) => {
    const c = name.match(/^(Z?WGPU\w+)Struct$/)?.[1]
    return c && !own.has(c) && (def as any)?.__type === "struct" ? [{ c, def: def as any }] : []
  })
  const missing = structs.filter(({ c }) => !header.includes(`typedef struct ${c} {`)).map(({ c }) => c)
  expect(missing).toEqual([])

  // one C function writes sizeof and each offsetof in order; the headers cc lacks are stubbed
  const lines: string[] = []
  const ours: number[] = []
  for (const { c, def } of structs) {
    lines.push(`sizeof(${c})`)
    ours.push(def.size)
    for (const f of def.describe()) {
      lines.push(`offsetof(${c}, ${f.name})`)
      ours.push(f.offset)
    }
  }
  const dir = mkdtempSync(join(tmpdir(), "dawn-abi-"))
  mkdirSync(join(dir, "dawn"))
  writeFileSync(join(dir, "dawn/webgpu.h"), header)
  writeFileSync(join(dir, "dawn/dawn_version.h"), "")
  writeFileSync(join(dir, "math.h"), "#define NAN (0.0f / 0.0f)\n")
  writeFileSync(join(dir, "stddef.h"), "typedef unsigned long long size_t;\n#define NULL ((void *)0)\n#define offsetof(t, m) ((size_t) & ((t *)0)->m)\n")
  writeFileSync(
    join(dir, "stdint.h"),
    "typedef unsigned char uint8_t; typedef unsigned short uint16_t; typedef unsigned int uint32_t; typedef unsigned long long uint64_t;\n" +
      "typedef signed char int8_t; typedef short int16_t; typedef int int32_t; typedef long long int64_t;\n" +
      "#define UINT32_MAX 0xffffffffu\n#define UINT64_MAX 0xffffffffffffffffull\n#define SIZE_MAX UINT64_MAX\n#define UINT64_C(x) x##ull\n",
  )
  writeFileSync(
    join(dir, "layout.c"),
    `#include "dawn/webgpu.h"\nvoid layout(uint64_t *out) {\n${lines.map((l, i) => `  out[${i}] = ${l};`).join("\n")}\n}\n`,
  )
  const lib = cc({ source: join(dir, "layout.c"), include: [dir], symbols: { layout: { args: ["ptr"], returns: "void" } } })
  const theirs = new BigUint64Array(lines.length)
  lib.symbols.layout(ptr(theirs))
  const wrong = lines.flatMap((l, i) => (BigInt(ours[i]!) === theirs[i] ? [] : [`${l}: ours ${ours[i]}, header ${theirs[i]}`]))
  expect(wrong).toEqual([])
})
