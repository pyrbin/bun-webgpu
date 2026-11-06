# bun-webgpu

WebGPU ([Dawn](https://dawn.googlesource.com/dawn)) FFI bindings for Bun.

## Usage

```ts
import { setupGlobals } from 'bun-webgpu';

setupGlobals();

const adapter = navigator.gpu.requestAdapter();
const device = await adapter?.requestDevice();

// ... use WebGPU ...
```

Find out more about [WebGPU types here](https://gpuweb.github.io/types/).


## Building

The Windows build is committed at `src/lib/x86_64-windows`: `webgpu_wrapper.dll` (the Zig wrapper over a
static Dawn) and the DXC it compiles shaders with. `bun dawn/update.ts [tag]` moves it to another google/dawn
release in one step (see [dawn/README.md](./dawn/README.md)); `bun test` then holds every enum number and
struct layout to that release's header. It needs `gh`, Zig 0.14.1 on PATH and the MSVC build tools of the
toolset the Dawn release was built with.

## Conformance Test Suite (CTS)

To run the CTS, build the library first, then run the tests:

```bash
./run-cts.sh 'webgpu:api,operation,adapter,requestDevice:always_returns_device:*'
```

Run all webgpu tests for example with `./run-cts.sh 'webgpu:*'`

Current results for `webgpu:api,*` are:
```
** Summary **
Passed  w/o warnings = 39994 / 51160 =  78.17%
Passed with warnings =     0 / 51160 =   0.00%
Skipped              =  8290 / 51160 =  16.20%
Failed               =  2876 / 51160 =   5.62%
```

## Testing

To run tests, build the library first, then run the tests:

```bash
bun test
```
