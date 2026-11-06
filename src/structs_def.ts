import { toArrayBuffer, type Pointer } from "bun:ffi";
import { fatalError, OperationError } from "./utils/error.js";
import { defineEnum, defineStruct, objectPtr } from "./structs_ffi.js";
import { DEFAULT_SUPPORTED_LIMITS } from "./shared.js";
import * as dawn from "./enums.js";

export const WGPUBool = 'bool_u32';
export const UINT64_MAX = 0xFFFFFFFFFFFFFFFFn;
export const WGPU_WHOLE_SIZE = 0xFFFFFFFFFFFFFFFFn;
export const WGPU_STRLEN = UINT64_MAX;

export const WGPUCallbackModeDef = defineEnum(dawn.CallbackMode);
export const WGPUErrorTypeDef = defineEnum(dawn.ErrorType);

export const WGPUDeviceLostReasonDef = defineEnum(dawn.DeviceLostReason);

export const WGPUCompareFunction = defineEnum(dawn.CompareFunction);

export const WGPUErrorFilter = defineEnum(dawn.ErrorFilter);

export const WGPUStringView = defineStruct([
    ['data', 'char*', { optional: true }],
    ['length', 'u64'],
], {
    mapValue: (v: string | null | undefined) => {
        if (!v) {
            return {
                data: null,
                length: WGPU_STRLEN,
            };
        }
        return {
            data: v,
            length: Buffer.byteLength(v),
        };
    },
    reduceValue: (v: { data: Pointer | null; length: bigint }) => {
        if (v.data === null || v.length === 0n) {
            return '';
        }
        const buffer = toArrayBuffer(v.data, 0, Number(v.length) || 0);
        return new TextDecoder().decode(buffer);
    },
});

export function pointerValue(ptr: Pointer | null): bigint {
    const value = ptr ? BigInt(ptr.valueOf()) : 0n;
    if (value === 0n) {
        fatalError("Pointer is null before FFI call!");
    }
    return value;
}

export const PowerPreference = defineEnum(dawn.PowerPreference);

export const WGPUBackendType = defineEnum(dawn.BackendType);

export const WGPUFeatureLevel = defineEnum(dawn.FeatureLevel);

export const WGPURequestAdapterOptionsStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['featureLevel', WGPUFeatureLevel, { optional: true }],
    ['powerPreference', PowerPreference, { optional: true }],
    ['forceFallbackAdapter', WGPUBool, { optional: true }],
    ['backendType', WGPUBackendType, { optional: true }],
    ['compatibleSurface', 'pointer', { optional: true }],
]);

export const WGPUCallbackInfoStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['mode', WGPUCallbackModeDef],
    ['callback', 'pointer'],
    ['userdata1', 'pointer', { optional: true }],
    ['userdata2', 'pointer', { optional: true }],
]);

export const WGPUChainedStructStruct = defineStruct([
    ['next', 'pointer', { optional: true }],
    ['sType', 'u32']
]);

export const WGPUDawnLoadCacheDataCallbackInfoStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['callback', 'pointer'],
    ['userdata1', 'pointer', { optional: true }],
    ['userdata2', 'pointer', { optional: true }],
]);
// the store callback's info is laid out as the load one's (src/dawn.test.ts holds both to the header)
export const WGPUDawnStoreCacheDataCallbackInfoStruct = WGPUDawnLoadCacheDataCallbackInfoStruct;

export const WGPUDawnCacheDeviceDescriptorStruct = defineStruct([
    ['chain', WGPUChainedStructStruct],
    ['isolationKey', WGPUStringView],
    ['dawnLoadCacheDataCallbackInfo', WGPUDawnLoadCacheDataCallbackInfoStruct],
    ['dawnStoreCacheDataCallbackInfo', WGPUDawnStoreCacheDataCallbackInfoStruct],
]);

export const WGPUFeatureNameDef = defineEnum(dawn.FeatureName, 'u32');

export const WGPUTextureFormat = defineEnum(dawn.TextureFormat, 'u32');

export const WGPUWGSLLanguageFeatureNameDef = defineEnum(dawn.WGSLLanguageFeatureName, 'u32');

export const WGPUSupportedFeaturesStruct = defineStruct([
    ['featureCount', 'u64', { unpackTransform: (val: bigint) => Number(val), lengthOf: 'features' }],
    ['features', [WGPUFeatureNameDef]],
]);

export const WGPUSupportedWGSLLanguageFeaturesStruct = defineStruct([
    ['featureCount', 'u64', { unpackTransform: (val: bigint) => Number(val), lengthOf: 'features' }],
    ['features', [WGPUWGSLLanguageFeatureNameDef]],
]);

function validateMutipleOf(val: number, multipleOf: number) {
    const mod = val % multipleOf;
    if (mod !== 0) {
        throw new OperationError(`Value must be a multiple of ${multipleOf}, got ${val}`);
    }
}

function validateRange(val: number, min: number, max: number) {
    if (val < 0 || val > Number.MAX_SAFE_INTEGER) {
        throw new TypeError(`Value must be between 0 and ${Number.MAX_SAFE_INTEGER}, got ${val}`);
    }
    if (val < min || val > max) {
        throw new OperationError(`Value must be between ${min} and ${max}, got ${val}`);
    }
}

function minValidator(val: number, fieldName: string, { hints }: { hints?: { limits: GPUSupportedLimits, features: GPUSupportedFeatures } } = {}) {
    if (val < 0 || val > Number.MAX_SAFE_INTEGER) {
        throw new TypeError(`Value must be between 0 and ${Number.MAX_SAFE_INTEGER}, got ${val}`);
    }
    if (hints && fieldName in hints.limits) {
        const minValue = hints.limits[fieldName as keyof GPUSupportedLimits] as number;
        if (val < minValue) {
            throw new OperationError(`Value must be >= ${minValue}, got ${val}`);
        }
    }
}

function validateLimitField(val: number, fieldName: string, { hints }: { hints?: { limits: GPUSupportedLimits, features: GPUSupportedFeatures } } = {}) {
    if (hints && fieldName in hints.limits) {
        const maxValue = hints.limits[fieldName as keyof GPUSupportedLimits] as number;
        validateRange(val, 0, maxValue);
    }
}

// WGPULimits struct mirroring C layout
export const WGPULimitsStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['maxTextureDimension1D', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxTextureDimension1D, validate: validateLimitField }],
    ['maxTextureDimension2D', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxTextureDimension2D, validate: validateLimitField }],
    ['maxTextureDimension3D', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxTextureDimension3D, validate: validateLimitField }],
    ['maxTextureArrayLayers', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxTextureArrayLayers, validate: validateLimitField }],
    ['maxBindGroups', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxBindGroups, validate: validateLimitField }],
    ['maxBindGroupsPlusVertexBuffers', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxBindGroupsPlusVertexBuffers, validate: validateLimitField }],
    ['maxBindingsPerBindGroup', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxBindingsPerBindGroup, validate: validateLimitField }],
    ['maxDynamicUniformBuffersPerPipelineLayout', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxDynamicUniformBuffersPerPipelineLayout, validate: validateLimitField }],
    ['maxDynamicStorageBuffersPerPipelineLayout', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxDynamicStorageBuffersPerPipelineLayout, validate: validateLimitField }],
    ['maxSampledTexturesPerShaderStage', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxSampledTexturesPerShaderStage, validate: validateLimitField }],
    ['maxSamplersPerShaderStage', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxSamplersPerShaderStage, validate: validateLimitField }],
    ['maxStorageBuffersPerShaderStage', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxStorageBuffersPerShaderStage, validate: validateLimitField }],
    ['maxStorageTexturesPerShaderStage', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxStorageTexturesPerShaderStage, validate: validateLimitField }],
    ['maxUniformBuffersPerShaderStage', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxUniformBuffersPerShaderStage, validate: validateLimitField }],
    ['maxUniformBufferBindingSize', 'u64', { default: DEFAULT_SUPPORTED_LIMITS.maxUniformBufferBindingSize, validate: validateLimitField }],
    ['maxStorageBufferBindingSize', 'u64', { default: DEFAULT_SUPPORTED_LIMITS.maxStorageBufferBindingSize, validate: validateLimitField }],
    ['minUniformBufferOffsetAlignment', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.minUniformBufferOffsetAlignment, validate: [minValidator, (val: number) => validateMutipleOf(val, 2)] }],
    ['minStorageBufferOffsetAlignment', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.minStorageBufferOffsetAlignment, validate: [minValidator, (val: number) => validateMutipleOf(val, 2)] }],
    ['maxVertexBuffers', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxVertexBuffers, validate: validateLimitField }],
    ['maxBufferSize', 'u64', { default: DEFAULT_SUPPORTED_LIMITS.maxBufferSize, validate: validateLimitField }],
    ['maxVertexAttributes', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxVertexAttributes, validate: validateLimitField }],
    ['maxVertexBufferArrayStride', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxVertexBufferArrayStride, validate: validateLimitField }],
    ['maxInterStageShaderVariables', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxInterStageShaderVariables, validate: validateLimitField }],
    ['maxColorAttachments', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxColorAttachments, validate: validateLimitField }],
    ['maxColorAttachmentBytesPerSample', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxColorAttachmentBytesPerSample, validate: validateLimitField }],
    ['maxComputeWorkgroupStorageSize', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxComputeWorkgroupStorageSize, validate: validateLimitField }],
    ['maxComputeInvocationsPerWorkgroup', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxComputeInvocationsPerWorkgroup, validate: validateLimitField }],
    ['maxComputeWorkgroupSizeX', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxComputeWorkgroupSizeX, validate: validateLimitField }],
    ['maxComputeWorkgroupSizeY', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxComputeWorkgroupSizeY, validate: validateLimitField }],
    ['maxComputeWorkgroupSizeZ', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxComputeWorkgroupSizeZ, validate: validateLimitField }],
    ['maxComputeWorkgroupsPerDimension', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxComputeWorkgroupsPerDimension, validate: validateLimitField }],
    // the shipped Dawn's WGPULimits ends at this field (152 bytes): one past it reads as 0, and
    // requiredLimits then refuses its own default against that 0.
    ['maxImmediateSize', 'u32', { default: DEFAULT_SUPPORTED_LIMITS.maxImmediateSize, validate: validateLimitField }],
], {
    default: {
        ...DEFAULT_SUPPORTED_LIMITS,
    }
});

// Corresponding TypeScript type for convenience
export type WGPULimits = GPUSupportedLimits & {
    nextInChain?: Pointer | null;
};

// WGPUQueueDescriptor struct mirroring C layout
export type WGPUQueueDescriptor = {
    nextInChain?: Pointer | null;
    label?: string;
};
export const WGPUQueueDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
]);

// WGPUUncapturedErrorCallbackInfo + Callback FFI type
export type WGPUUncapturedErrorCallbackInfo = {
    nextInChain?: Pointer | null;
    callback: Pointer;
    userdata1?: Pointer | null;
    userdata2?: Pointer | null;
};
export const WGPUUncapturedErrorCallbackInfoStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['callback', 'pointer'],
    ['userdata1', 'pointer', { optional: true }],
    ['userdata2', 'pointer', { optional: true }],
]);

export const WGPUAdapterInfoStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['vendor', WGPUStringView],
    ['architecture', WGPUStringView],
    ['device', WGPUStringView],
    ['description', WGPUStringView],
    ['backendType', 'u32'],
    ['adapterType', 'u32'],
    ['vendorID', 'u32'],
    ['deviceID', 'u32'],
    ['subgroupMinSize', 'u32'],
    ['subgroupMaxSize', 'u32'],
]);

export const WGPUDeviceDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['requiredFeatureCount', 'u64', { lengthOf: 'requiredFeatures' }], // Assuming 64-bit size_t
    ['requiredFeatures', [WGPUFeatureNameDef], { optional: true, validate: (val: string[] | undefined, fieldName: string, { hints }: { hints?: { limits: GPUSupportedLimits, features: GPUSupportedFeatures } } = {}) => {
        if (!val) {
            return;
        }
        for (const feature of val) {
            if (!hints?.features.has(feature)) {
                throw new TypeError(`Invalid feature required: ${feature}`);
            }
        }
    } }],
    ['requiredLimits', WGPULimitsStruct, { optional: true, asPointer: true, validate: (val: WGPULimits | undefined, fieldName: string, { hints }: { hints?: { limits: GPUSupportedLimits, features: GPUSupportedFeatures } } = {}) => {
        if (!val) {
            return;
        }
        for (const key in val) {
            if (hints?.limits && !(key in hints?.limits) && val[key as keyof WGPULimits] !== undefined) {
                throw new OperationError(`Invalid limit required: ${key} ${val[key as keyof WGPULimits]}`);
            }
        }
    } }],
    ['defaultQueue', WGPUQueueDescriptorStruct],
    ['deviceLostCallbackInfo', WGPUCallbackInfoStruct, { optional: true }],
    ['uncapturedErrorCallbackInfo', WGPUUncapturedErrorCallbackInfoStruct],
]);

export const WGPUBufferDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['usage', 'u64'],
    ['size', 'u64'],
    ['mappedAtCreation', WGPUBool, { default: false }],
]);

export function normalizeGPUExtent3DStrict(size: GPUExtent3DStrict): { width: number; height?: number; depthOrArrayLayers?: number } {
    if (Symbol.iterator in size) {
        const arr = Array.from(size);
        return {
            width: arr[0] ?? 1,
            height: arr[1] ?? 1,
            depthOrArrayLayers: arr[2] ?? 1
        };
    }
    return size;
}

export const WGPUExtent3DStruct = defineStruct([
    ['width', 'u32'],
    ['height', 'u32', { default: 1 }],
    ['depthOrArrayLayers', 'u32', { default: 1 }],
], {
    mapValue: (v: GPUExtent3DStrict) => {
        return normalizeGPUExtent3DStrict(v);
    }
});

export const WGPUTextureDimension = defineEnum(dawn.TextureDimension);
export const WGPUTextureDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['usage', 'u64'],
    ['dimension', WGPUTextureDimension, { default: '2d' }],
    ['size', WGPUExtent3DStruct],
    ['format', WGPUTextureFormat, { default: 'rgba8unorm' }],
    ['mipLevelCount', 'u32', { default: 1 }],
    ['sampleCount', 'u32', { default: 1 }],
    ['viewFormatCount', 'u64', { lengthOf: 'viewFormats' }],
    ['viewFormats', [WGPUTextureFormat], { optional: true }],
]);

export const WGPUFilterMode = defineEnum(dawn.FilterMode);

export const WGPUMipmapFilterMode = defineEnum(dawn.MipmapFilterMode);

export const WGPUAddressMode = defineEnum(dawn.AddressMode);

export const WGPUSamplerDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['addressModeU', WGPUAddressMode, { default: 'undefined' }],
    ['addressModeV', WGPUAddressMode, { default: 'undefined' }],
    ['addressModeW', WGPUAddressMode, { default: 'undefined' }],
    ['magFilter', WGPUFilterMode, { default: 'undefined' }],
    ['minFilter', WGPUFilterMode, { default: 'undefined' }],
    ['mipmapFilter', WGPUMipmapFilterMode, { default: 'undefined' }],
    ['lodMinClamp', 'f32', { default: 0.0 }],
    ['lodMaxClamp', 'f32', { default: 32.0 }],
    ['compare', WGPUCompareFunction, { default: 'undefined' }],
    ['maxAnisotropy', 'u16', { default: 1, packTransform: (val: number) => val < 0 ? 0 : val  }],
]);

export const WGPUBufferBindingType = defineEnum(dawn.BufferBindingType);

export const WGPUSamplerBindingType = defineEnum(dawn.SamplerBindingType);

export const WGPUTextureSampleType = defineEnum(dawn.TextureSampleType);

export const WGPUTextureViewDimension = defineEnum(dawn.TextureViewDimension);

export const WGPUStorageTextureAccess = defineEnum(dawn.StorageTextureAccess);

export const WGPUBufferBindingLayoutStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['type', WGPUBufferBindingType, { default: 'uniform' }],
    ['hasDynamicOffset', WGPUBool, { default: false }],
    ['minBindingSize', 'u64', { default: 0 }],
]);

export const WGPUSamplerBindingLayoutStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['type', WGPUSamplerBindingType, { default: 'filtering' }],
]);

export const WGPUTextureBindingLayoutStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['sampleType', WGPUTextureSampleType, { default: 'float' }],
    ['viewDimension', WGPUTextureViewDimension, { default: '2d' }],
    ['multisampled', WGPUBool, { default: false }],
]);

export const WGPUStorageTextureBindingLayoutStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['access', WGPUStorageTextureAccess, { default: 'write-only' }],
    ['format', WGPUTextureFormat, { default: 'rgba8unorm' }],
    ['viewDimension', WGPUTextureViewDimension, { default: '2d' }],
]);

export const WGPUTextureAspect = defineEnum(dawn.TextureAspect, 'u32');

export const WGPUTextureViewDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['format', WGPUTextureFormat, { default: 'undefined' }],
    ['dimension', WGPUTextureViewDimension, { default: 'undefined' }],
    ['baseMipLevel', 'u32', { default: 0 }],
    ['mipLevelCount', 'u32', { default: 0xFFFFFFFF }], // WGPU_MIP_LEVEL_COUNT_UNDEFINED
    ['baseArrayLayer', 'u32', { default: 0 }],
    ['arrayLayerCount', 'u32', { default: 0xFFFFFFFF }], // WGPU_ARRAY_LAYER_COUNT_UNDEFINED
    ['aspect', WGPUTextureAspect, { default: 'all' }], // Default 'all' is more useful than 'undefined'
    ['usage', 'u64', { default: 0n }], // WGPUTextureUsage_None - C definition uses flags (u64)
]);

export const WGPUExternalTextureBindingLayoutStruct = defineStruct([
    ['chain', WGPUChainedStructStruct],
]);

export const WGPUBindGroupLayoutEntryStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['binding', 'u32'],
    ['visibility', 'u64'],
    // Dawn's webgpu.h declares `uint32_t bindingArraySize` between visibility and buffer
    // (bind-group arrays). Omitting it shifts every union member 8 bytes early (4 for the field,
    // 4 more from buffer's 8-byte re-alignment) and Dawn then fails createBindGroupLayout with
    // "BindGroupLayoutEntry had none of buffer, sampler, texture, storageTexture, or
    // externalTexture set". It is part of the C struct on every platform — the previous
    // platform-conditional pad broke all explicit bind group layouts on win32.
    ['bindingArraySize', 'u32', { default: 0 }],
    ['buffer', WGPUBufferBindingLayoutStruct, { optional: true }],
    ['sampler', WGPUSamplerBindingLayoutStruct, { optional: true }],
    ['texture', WGPUTextureBindingLayoutStruct, { optional: true }],
    ['storageTexture', WGPUStorageTextureBindingLayoutStruct, { optional: true }],
]);

export const WGPUBindGroupLayoutDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['entryCount', 'u64', { lengthOf: 'entries' }],
    ['entries', [WGPUBindGroupLayoutEntryStruct]],
]);

export const WGPUBindGroupEntryStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['binding', 'u32'],
    ['buffer', objectPtr<GPUBuffer>(), { optional: true }],
    ['offset', 'u64', { optional: true }], // Optional because only relevant for buffers
    ['size', 'u64', { optional: true }],   // Optional because only relevant for buffers
    ['sampler', objectPtr<GPUSampler>(), { optional: true }],
    ['textureView', objectPtr<GPUTextureView>(), { optional: true }],
]);

export const WGPUBindGroupDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['layout', objectPtr<GPUBindGroupLayout>()],
    ['entryCount', 'u64', { lengthOf: 'entries' }],
    ['entries', [WGPUBindGroupEntryStruct]],
]);

export const WGPUPipelineLayoutDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['bindGroupLayoutCount', 'u64', { lengthOf: 'bindGroupLayouts' }],
    ['bindGroupLayouts', ['pointer']],
    ['immediateSize', 'u32', { default: 0 }]
]);

// Pack shader module descriptor
export const WGPUShaderModuleDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }]
]);

// For WGSL shader source
export const WGPUShaderSourceWGSLStruct = defineStruct([
    ['chain', WGPUChainedStructStruct],
    ['code', WGPUStringView]
]);

// --- Render Pipeline Structs ---

export const WGPUVertexStepMode = defineEnum(dawn.VertexStepMode);

export const WGPUPrimitiveTopology = defineEnum(dawn.PrimitiveTopology);

export const WGPUIndexFormat = defineEnum(dawn.IndexFormat);

export const WGPUFrontFace = defineEnum(dawn.FrontFace);

export const WGPUCullMode = defineEnum(dawn.CullMode);

export const WGPUStencilOperation = defineEnum(dawn.StencilOperation);

export const WGPUBlendOperation = defineEnum(dawn.BlendOperation);

export const WGPUBlendFactor = defineEnum(dawn.BlendFactor);

export const WGPUOptionalBool = defineEnum(dawn.OptionalBool);

// @ts-ignore TODO: Add missing formats from webgpu.h
export const WGPUVertexFormat = defineEnum(dawn.VertexFormat, 'u32');


// -- Nested Structs needed for Render Pipeline --

export const WGPUConstantEntryStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['key', WGPUStringView],
    ['value', 'f64', { validate: (val: number) => {
        if (!Number.isFinite(val)) {
            throw new TypeError(`Pipeline constant value must be finite, got ${val}`);
        }
    } }]
]);

export const WGPUVertexAttributeStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['format', WGPUVertexFormat],
    ['offset', 'u64'],
    ['shaderLocation', 'u32']
]);

export const WGPUVertexBufferLayoutStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['stepMode', WGPUVertexStepMode, { default: 'vertex' }],
    ['arrayStride', 'u64'],
    ['attributeCount', 'u64', { lengthOf: 'attributes' }],
    ['attributes', [WGPUVertexAttributeStruct]] // Pointer to array
]);

export const WGPUVertexStateStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['module', objectPtr<GPUShaderModule>()],
    ['entryPoint', WGPUStringView, { optional: true, mapOptionalInline: true }],
    ['constantCount', 'u64', { lengthOf: 'constants' }],
    ['constants', [WGPUConstantEntryStruct], { optional: true }],
    ['bufferCount', 'u64', { lengthOf: 'buffers' }],
    ['buffers', [WGPUVertexBufferLayoutStruct], { optional: true }]
]);

export const WGPUPrimitiveStateStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['topology', WGPUPrimitiveTopology, { default: 'triangle-list' }],
    ['stripIndexFormat', WGPUIndexFormat, { default: 'undefined' }], // Defaults to Undefined (0)
    ['frontFace', WGPUFrontFace, { default: 'ccw' }],
    ['cullMode', WGPUCullMode, { default: 'none' }],
    ['unclippedDepth', WGPUBool, { optional: true }]
]);

export const WGPUStencilFaceStateStruct = defineStruct([
    ['compare', WGPUCompareFunction, { default: 'always' }],
    ['failOp', WGPUStencilOperation, { default: 'keep' }],
    ['depthFailOp', WGPUStencilOperation, { default: 'keep' }],
    ['passOp', WGPUStencilOperation, { default: 'keep' }]
]);

export const WGPUDepthStencilStateStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['format', WGPUTextureFormat],
    ['depthWriteEnabled', WGPUBool, { default: false }],
    ['depthCompare', WGPUCompareFunction, { default: 'always' }],
    ['stencilFront', WGPUStencilFaceStateStruct, { default: {} }], // Inline struct
    ['stencilBack', WGPUStencilFaceStateStruct, { default: {} }], // Inline struct
    ['stencilReadMask', 'u32', { default: 0xFFFFFFFF }],
    ['stencilWriteMask', 'u32', { default: 0xFFFFFFFF }],
    ['depthBias', 'i32', { default: 0 }], // Use i32
    ['depthBiasSlopeScale', 'f32', { default: 0.0 }],
    ['depthBiasClamp', 'f32', { default: 0.0 }]
]);

export const WGPUMultisampleStateStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['count', 'u32', { default: 1 }],
    ['mask', 'u32', { default: 0xFFFFFFFF }],
    ['alphaToCoverageEnabled', WGPUBool, { default: false }] // Use u8 for WGPUBool
]);

export const WGPUBlendComponentStruct = defineStruct([
    ['operation', WGPUBlendOperation, { default: 'add' }],
    ['srcFactor', WGPUBlendFactor, { default: 'one' }],
    ['dstFactor', WGPUBlendFactor, { default: 'zero' }]
]);

export const WGPUBlendStateStruct = defineStruct([
    ['color', WGPUBlendComponentStruct], // Inline struct
    ['alpha', WGPUBlendComponentStruct] // Inline struct
]);

export const WGPUColorTargetStateStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['format', WGPUTextureFormat],
    ['blend', WGPUBlendStateStruct, { optional: true, asPointer: true }],
    ['writeMask', 'u64', { default: dawn.ColorWriteMask.All }] // Use u64 for flags
]);

export const WGPUFragmentStateStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['module', objectPtr<GPUShaderModule>()],
    ['entryPoint', WGPUStringView, { optional: true, mapOptionalInline: true }],
    ['constantCount', 'u64', { lengthOf: 'constants' }],
    ['constants', [WGPUConstantEntryStruct], { optional: true }],
    ['targetCount', 'u64', { lengthOf: 'targets' }],
    ['targets', [WGPUColorTargetStateStruct]]
]);

// -- Finally, the Render Pipeline Descriptor --

export const WGPURenderPipelineDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['layout', objectPtr<GPUPipelineLayout>(), { optional: true }],
    ['vertex', WGPUVertexStateStruct], // Inline struct
    ['primitive', WGPUPrimitiveStateStruct, { default: {} }], // Inline struct
    ['depthStencil', WGPUDepthStencilStateStruct, { optional: true, asPointer: true }],
    ['multisample', WGPUMultisampleStateStruct, { default: {} }], // Inline struct
    ['fragment', WGPUFragmentStateStruct, { optional: true, asPointer: true }]
]);

// --- Compute Pipeline Structs ---

export const WGPUComputeStateStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['module', objectPtr<GPUShaderModule>()],
    ['entryPoint', WGPUStringView, { optional: true, mapOptionalInline: true }],
    ['constantCount', 'u64', { lengthOf: 'constants' }],
    ['constants', [WGPUConstantEntryStruct], { optional: true }],
]);

export const WGPUComputePipelineDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['layout', objectPtr<GPUPipelineLayout>(), { optional: true }],
    ['compute', WGPUComputeStateStruct],
]);

// Structs for Command Encoder
export const WGPUCommandEncoderDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }]
]);

export const WGPULoadOp = defineEnum(dawn.LoadOp, 'u32');

export const WGPUStoreOp = defineEnum(dawn.StoreOp, 'u32');

export const WGPUColorStruct = defineStruct([
    ['r', 'f64'],
    ['g', 'f64'],
    ['b', 'f64'],
    ['a', 'f64'],
], {
    default: { r: 0, g: 0, b: 0, a: 0 },
    mapValue: (v?: GPUColor) => {
        if (!v) return null;
        const clearValue = v ?? { r: 0, g: 0, b: 0, a: 0 };
        let mappedClearValue = { r: 0, g: 0, b: 0, a: 0 };
        if (typeof clearValue === 'object' && 'r' in clearValue) {
            mappedClearValue = clearValue as {r: number, g: number, b: number, a: number};
        } else if (Array.isArray(clearValue)) {
            mappedClearValue = { r: clearValue[0]!, g: clearValue[1]!, b: clearValue[2]!, a: clearValue[3]! };
        }
        return mappedClearValue;
    }
});

export const WGPUOrigin3DStruct = defineStruct([
    ['x', 'u32', { default: 0 }],
    ['y', 'u32', { default: 0 }],
    ['z', 'u32', { default: 0 }],
], {
    mapValue: (v: GPUOrigin3D) => {
        if (Symbol.iterator in v) {
            const arr = Array.from(v);
            return {
                x: arr[0] ?? 0,
                y: arr[1] ?? 0,
                z: arr[2] ?? 0
            };
        }
        return v;
    }
});

export const WGPURenderPassColorAttachmentStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['view', objectPtr<GPUTextureView>()], // Can be null in JS API, but C expects a valid pointer or error
    ['depthSlice', 'u32', { default: 0xFFFFFFFF }], // WGPU_DEPTH_SLICE_UNDEFINED
    ['resolveTarget', objectPtr<GPUTextureView>(), { optional: true }],
    ['loadOp', WGPULoadOp],
    ['storeOp', WGPUStoreOp],
    ['clearValue', WGPUColorStruct, { default: { r: 0, g: 0, b: 0, a: 0 } }],
]);


export const WGPURenderPassDepthStencilAttachmentStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['view', objectPtr<GPUTextureView>()],
    ['depthLoadOp', WGPULoadOp, { optional: true }], // Optional because only needed if format has depth
    ['depthStoreOp', WGPUStoreOp, { optional: true }], // Optional
    ['depthClearValue', 'f32', { default: NaN }], // WGPU_DEPTH_CLEAR_VALUE_UNDEFINED -> use NaN
    ['depthReadOnly', WGPUBool, { default: false }],
    ['stencilLoadOp', WGPULoadOp, { optional: true }], // Optional because only needed if format has stencil
    ['stencilStoreOp', WGPUStoreOp, { optional: true }], // Optional
    ['stencilClearValue', 'u32', { default: 0 }],
    ['stencilReadOnly', WGPUBool, { default: false }],
]);

export const WGPUPassTimestampWritesStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['querySet', objectPtr<GPUQuerySet>()],
    ['beginningOfPassWriteIndex', 'u32', { default: 0xFFFFFFFF }], // WGPU_QUERY_SET_INDEX_UNDEFINED
    ['endOfPassWriteIndex', 'u32', { default: 0xFFFFFFFF }], // WGPU_QUERY_SET_INDEX_UNDEFINED
]);

export const WGPURenderPassDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['colorAttachmentCount', 'u64', { lengthOf: 'colorAttachments' }],
    ['colorAttachments', [WGPURenderPassColorAttachmentStruct], { optional: true }],
    ['depthStencilAttachment', WGPURenderPassDepthStencilAttachmentStruct, { optional: true, asPointer: true }],
    ['occlusionQuerySet', objectPtr<GPUQuerySet>(), { optional: true }],
    ['timestampWrites', WGPUPassTimestampWritesStruct, { optional: true, asPointer: true }],
]);

export const WGPUComputePassDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['timestampWrites', WGPUPassTimestampWritesStruct, { optional: true, asPointer: true }],
]);

export const WGPUTexelCopyBufferLayoutStruct = defineStruct([
    ['offset', 'u64', { default: 0 }],
    ['bytesPerRow', 'u32', { default: 0xFFFFFFFF }], // WGPU_COPY_STRIDE_UNDEFINED
    ['rowsPerImage', 'u32', { default: 0xFFFFFFFF }], // WGPU_COPY_STRIDE_UNDEFINED
]);

export const WGPUTexelCopyBufferInfoStruct = defineStruct([
    ['layout', WGPUTexelCopyBufferLayoutStruct], // Nested struct
    ['buffer', objectPtr<GPUBuffer>()],
], {
    // Map the JS GPUTexelCopyBufferInfo to the nested structure
    mapValue: (v: GPUTexelCopyBufferInfo) => ({
        layout: {
            offset: v.offset ?? 0,
            bytesPerRow: v.bytesPerRow,
            rowsPerImage: v.rowsPerImage
        },
        buffer: v.buffer
    })
});

export const WGPUTexelCopyTextureInfoStruct = defineStruct([
    ['texture', objectPtr<GPUTexture>()],
    ['mipLevel', 'u32', { default: 0 }],
    ['origin', WGPUOrigin3DStruct, { default: { x:0, y:0, z:0 } }],
    ['aspect', WGPUTextureAspect, { default: 'all' }],
]);

export const WGPUCommandBufferDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
]);

export const WGPUQueryType = defineEnum(dawn.QueryType, 'u32');

export const WGPUQuerySetDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['type', WGPUQueryType],
    ['count', 'u32'],
]);

// --- Workaround Structs ---

export const ZWGPUWorkaroundCopyTextureAndMapStruct = defineStruct([
    ['device', 'pointer'],
    ['queue', 'pointer'],
    ['instance', 'pointer'],
    ['render_texture', 'pointer'],
    ['readback_buffer', 'pointer'],
    ['bytes_per_row', 'u32'],
    ['width', 'u32'],
    ['height', 'u32'],
    ['output_buffer', 'pointer'],
    ['buffer_size', 'u64'],
]);

export const WGPURenderBundleDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
]);

export const WGPURenderBundleEncoderDescriptorStruct = defineStruct([
    ['nextInChain', 'pointer', { optional: true }],
    ['label', WGPUStringView, { optional: true }],
    ['colorFormatCount', 'u64', { lengthOf: 'colorFormats' }],
    ['colorFormats', [WGPUTextureFormat]],
    ['depthStencilFormat', WGPUTextureFormat, { default: 'undefined' }],
    ['sampleCount', 'u32', { default: 1 }],
    ['depthReadOnly', WGPUBool, { default: false }],
    ['stencilReadOnly', WGPUBool, { default: false }],
]);
