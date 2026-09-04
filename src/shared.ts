import { JSCallback, type Pointer, toArrayBuffer } from "bun:ffi";
import { BufferPool, type BlockBuffer } from "./buffer_pool.js";

// Every FFI trampoline this binding ever builds, held for the process's life. Nothing here is a
// cache and nothing is ever read back: the array IS the reference that keeps the wrapper — and the
// page bun put its trampoline on — alive. Dawn holds a callback's `.ptr` for as long as it may
// still deliver through it, and a collected `JSCallback` frees that page exactly as `close()` does,
// so a device-lost or uncaptured-error callback dropped by GC is the same use-after-free the closes
// were, only timed by the collector instead of by a destroy. Retaining makes "never freed" an
// invariant of this code rather than of bun's GC. The cost is ~26 KB per trampoline, never
// reclaimed: one per adapter request, per device request, per queue, and one per buffer that
// actually maps — against a process that ends.
const retained: JSCallback[] = [];

/** hold `callback` for the process's life and hand it back — every `new JSCallback` in this binding
 *  goes through here, because a trampoline the driver may still call must never be freed. */
export function retain<T extends JSCallback>(callback: T): T {
    retained.push(callback);
    return callback;
}

export const AsyncStatus = {
    Success: 1,
    CallbackCancelled: 2,
    Error: 3,
    Aborted: 4,
    Force32: 0x7FFFFFFF,
} as const;

export const WGPUErrorType = {
    "no-error": 1,
    "validation": 2,
    "out-of-memory": 3,
    "internal": 4,
    "unknown": 5,
    // "device-lost": 6,
    "force-32": 0x7FFFFFFF
} as const;

const idBufferPool = new BufferPool(64, 1024, 8);

/** claim an 8-byte block carrying `id` and its own index — pass its pointer as a callback's
 *  userdata and read it back with {@link unpackUserDataId}. */
export function packUserDataId(id: number): ArrayBuffer {
    const blockBuffer = idBufferPool.request();
    const userDataBuffer = new Uint32Array(blockBuffer.buffer);
    userDataBuffer[0] = id;
    userDataBuffer[1] = blockBuffer.index;
    return blockBuffer.buffer;
}

/** read a userdata id back and return its block to the pool, or `-1` when the pointer names no
 *  block this pool still has out. NEVER throws: it runs inside an FFI callback, where a throw
 *  leaves the native caller mid-flight and the JS side half-updated — the shape that made a
 *  mis-shifted win32 argument read as "Block was not allocated or already freed" from inside
 *  `wgpuInstanceProcessEvents`. */
export function unpackUserDataId(userDataPtr: Pointer): number {
    if (!userDataPtr) return -1;
    let id: number;
    let index: number;
    // The catch covers only what `toArrayBuffer` REFUSES — a pointer bun will not wrap. It is not a
    // validity test: a wrong but mapped address reads two words of garbage and returns them, and an
    // unmapped one faults the process rather than throwing. `owns(index)` below is the real guard,
    // and the only reason a garbage read is survivable.
    try {
        const view = new Uint32Array(toArrayBuffer(userDataPtr, 0, 8));
        id = view[0]!;
        index = view[1]!;
    } catch {
        return -1;
    }
    if (!idBufferPool.owns(index)) return -1;
    idBufferPool.releaseBlock(index);
    return id;
}

export class GPUAdapterInfoImpl implements GPUAdapterInfo {
    __brand: "GPUAdapterInfo" = "GPUAdapterInfo";
    vendor: string = "";
    architecture: string = "";
    device: string = "";
    description: string = "";
    subgroupMinSize: number = 0;
    subgroupMaxSize: number = 0;
    isFallbackAdapter: boolean = false;

    constructor() {
        throw new TypeError('Illegal constructor');
    }
}

export function normalizeIdentifier(input: string): string {
    if (!input || input.trim() === '') {
        return '';
    }
    
    return input
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export function decodeCallbackMessage(messagePtr: Pointer | null, messageSize?: number | bigint): string {
    if (!messagePtr || messageSize === 0n || messageSize === 0) {
        // Windows x64 passes a by-value WGPUStringView BY REFERENCE (structs over 8 bytes), so
        // the callback's declared (pointer, u64) pair actually receives a pointer to
        // { data: ptr, length: u64 } and a shifted (null) size argument. Recover the real view
        // instead of reporting every Dawn diagnostic as empty.
        if (messagePtr && process.platform === 'win32') {
            try {
                const view = new DataView(toArrayBuffer(messagePtr, 0, 16));
                const data = view.getBigUint64(0, true);
                const length = view.getBigUint64(8, true);
                if (data !== 0n && length > 0n && length < 1048576n) {
                    return Buffer.from(toArrayBuffer(Number(data), 0, Number(length))).toString();
                }
            } catch {
                // unreadable memory: fall through to the empty-message report
            }
        }
        return '[empty message]';
    }

    let arrayBuffer: ArrayBuffer | null = null;
    arrayBuffer = messageSize ? toArrayBuffer(messagePtr, 0, Number(messageSize)) : toArrayBuffer(messagePtr);

    let message = 'Could not decode error message';
    if (arrayBuffer instanceof Error) {
        message = arrayBuffer.message;
    } else {
        message = Buffer.from(arrayBuffer).toString();
    }
    return message;
}

export const DEFAULT_SUPPORTED_LIMITS: Omit<GPUSupportedLimits, '__brand'> & { maxImmediateSize: number } = Object.freeze({
    maxTextureDimension1D: 8192,
    maxTextureDimension2D: 8192,
    maxTextureDimension3D: 2048,
    maxTextureArrayLayers: 256,
    maxBindGroups: 4,
    maxBindGroupsPlusVertexBuffers: 24,
    maxBindingsPerBindGroup: 1000,
    maxStorageBuffersInFragmentStage: 8,
    maxStorageBuffersInVertexStage: 8,
    maxStorageTexturesInFragmentStage: 4,
    maxStorageTexturesInVertexStage: 4,
    maxDynamicUniformBuffersPerPipelineLayout: 8,
    maxDynamicStorageBuffersPerPipelineLayout: 4,
    maxSampledTexturesPerShaderStage: 16,
    maxSamplersPerShaderStage: 16,
    maxStorageBuffersPerShaderStage: 8,
    maxStorageTexturesPerShaderStage: 4,
    maxUniformBuffersPerShaderStage: 12,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 134217728,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    maxVertexBuffers: 8,
    maxBufferSize: 268435456,
    maxVertexAttributes: 16,
    maxVertexBufferArrayStride: 2048,
    maxInterStageShaderComponents: 4294967295,
    maxInterStageShaderVariables: 16,
    maxColorAttachments: 8,
    maxColorAttachmentBytesPerSample: 32,
    maxComputeWorkgroupStorageSize: 16384,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeWorkgroupsPerDimension: 65535,
    maxImmediateSize: 0,
});

export class GPUSupportedLimitsImpl implements GPUSupportedLimits {
    __brand: "GPUSupportedLimits" = "GPUSupportedLimits";
    maxTextureDimension1D = 8192;
    maxTextureDimension2D = 8192;
    maxTextureDimension3D = 2048;
    maxTextureArrayLayers = 256;
    maxBindGroups = 4;
    maxBindGroupsPlusVertexBuffers = 24;
    maxBindingsPerBindGroup = 1000;
    maxStorageBuffersInFragmentStage = 8;
    maxStorageBuffersInVertexStage = 8;
    maxStorageTexturesInFragmentStage = 4;
    maxStorageTexturesInVertexStage = 4;
    maxDynamicUniformBuffersPerPipelineLayout = 8;
    maxDynamicStorageBuffersPerPipelineLayout = 4;
    maxSampledTexturesPerShaderStage = 16;
    maxSamplersPerShaderStage = 16;
    maxStorageBuffersPerShaderStage = 8;
    maxStorageTexturesPerShaderStage = 4;
    maxUniformBuffersPerShaderStage = 12;
    maxUniformBufferBindingSize = 65536;
    maxStorageBufferBindingSize = 134217728;
    minUniformBufferOffsetAlignment = 256;
    minStorageBufferOffsetAlignment = 256;
    maxVertexBuffers = 8;
    maxBufferSize = 268435456;
    maxVertexAttributes = 16;
    maxVertexBufferArrayStride = 2048;
    maxInterStageShaderComponents = 4294967295;
    maxInterStageShaderVariables = 16;
    maxColorAttachments = 8;
    maxColorAttachmentBytesPerSample = 32;
    maxComputeWorkgroupStorageSize = 16384;
    maxComputeInvocationsPerWorkgroup = 256;
    maxComputeWorkgroupSizeX = 256;
    maxComputeWorkgroupSizeY = 256;
    maxComputeWorkgroupSizeZ = 64;
    maxComputeWorkgroupsPerDimension = 65535;

    constructor() {
        throw new TypeError('Illegal constructor');
    }
}