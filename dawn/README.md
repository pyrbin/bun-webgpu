# Dawn

The binding is built on a static Dawn from google/dawn's releases. `bun dawn/update.ts [tag]` (the newest
release without a tag) moves it in one step: it downloads the release's Windows build into `libs/`
(ignored), writes `dawn.json`, `webgpu.h` and `VERSION` here, regenerates `src/enums.ts` with
`scripts/enums.ts`, and builds `src/lib/x86_64-windows/webgpu_wrapper.dll`. Then `bun test`:
`src/dawn.test.ts` fails on any enum number or struct layout the new header changed.

Needs `gh`, `tar`, Zig 0.14.1 and MSVC's `link.exe`.
