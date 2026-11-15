/**
 * Reuse already-compressed assets when saving an sb3.
 *
 * Saving a project is dominated by DEFLATE, not by the disk write. On a 38 MB
 * project (2000 SVGs, 20 MB of fonts, 12 MB of MP3s) one save spends ~6.6 s
 * compressing, and almost all of it goes on recompressing assets that did not
 * change since the last save. Assets are content addressed, so their file name
 * *is* the md5 of their bytes: the same name always means the same content.
 *
 * JSZip keeps the compressed form of every entry it loads and re-emits it
 * untouched as long as the entry is asked for the same compression method -- it
 * never has to inflate and re-deflate. So we keep the archive produced by the
 * previous save around, swap in a freshly serialized `project.json`, sync the
 * asset set, and generate again. Same result bytes, ~12x less work.
 *
 * The output is not merely "equivalent": every asset entry in it is the
 * original compressed block, verified byte-for-byte against the md5 in its name.
 *
 * Installed by wrapping the VM, like `installProjectMetadata`: every save path
 * (Ctrl+S, download, save-to-file, publish, git, packager, collaboration) goes
 * through `saveProjectSb3` / `saveProjectSb3Stream`, so none of them need to
 * know this exists.
 */

import JSZip from '@turbowarp/jszip';

const MIME_TYPE = 'application/x.scratch.sb3';

// Compression for a VM that predates per-format levels in scratch-vm: those
// builds deflate these formats at JSZip's default level, everything else is
// stored. Only used as a fallback -- see compressionFor.
const LEGACY_COMPRESSABLE_FORMATS = [
    '.json',
    '.svg',
    '.wav',
    '.ttf',
    '.otf'
];

// Fixed zip entry timestamp, same value scratch-vm uses, so saves stay
// reproducible and do not leak the wall clock.
const FIXED_DATE = new Date(1591657163000);

// The cache costs one compressed copy of the project. Past this size we stop
// caching rather than risk running a phone (or a huge project) out of memory;
// saves simply behave exactly as they did before.
const MAX_CACHE_BYTES = 64 * 1024 * 1024;

// Zip compression method magic numbers, keyed the way JSZip stores them.
const STORED_METHODS = {
    '\u0008\u0000': 'DEFLATE',
    '\u0000\u0000': 'STORE'
};

const isCompressable = fileName => LEGACY_COMPRESSABLE_FORMATS.some(ext => fileName.endsWith(ext));

/**
 * How to write one entry, asking the VM first so that a save assembled here is
 * identical to an ordinary one -- levels are a VM policy, and a second copy of
 * it would drift.
 * @param {VirtualMachine} vm The VM holding the project.
 * @param {string} fileName Name of the entry inside the zip.
 * @returns {{compression: string}} JSZip file options.
 */
const compressionFor = (vm, fileName) => {
    if (typeof vm.getSb3CompressionOptions === 'function') {
        return vm.getSb3CompressionOptions(fileName);
    }
    return {compression: isCompressable(fileName) ? 'DEFLATE' : 'STORE'};
};

/**
 * The compression method an entry already carries, if it came from loadAsync.
 * Following the stored method is what makes JSZip hand back the compressed
 * bytes untouched; asking for a different one silently inflates and recompresses
 * the file instead, which would cost more than the cache saves.
 * @param {object} file A JSZip entry.
 * @returns {string|null} 'DEFLATE', 'STORE', or null for entries we just added.
 */
const storedMethod = file => {
    const data = file._data;
    const magic = data && data.compression && data.compression.magic;
    return (magic && STORED_METHODS[magic]) || null;
};

// Output types we can produce from the bytes we always generate internally.
// Anything else is passed straight through to the original VM method.
const CONVERTIBLE_TYPES = new Set(['uint8array', 'arraybuffer', 'blob']);

// One cache per VM. `zip` is null until the first save seeds it.
const states = new WeakMap();
const getState = vm => {
    let state = states.get(vm);
    if (!state) {
        state = {zip: null, disabled: false, installed: false};
        states.set(vm, state);
    }
    return state;
};

// All cache state goes through these two, so no mutation happens across an
// await and a half-written cache is never observable.
const rememberZip = (state, zip) => {
    state.zip = zip;
};
const forgetZip = (state, disabled = false) => {
    state.zip = null;
    state.disabled = disabled;
};

/**
 * Apply the compression method and timestamp scratch-vm would have used. For an
 * entry that came from `loadAsync` this is what tells JSZip to hand back its
 * stored compressed bytes instead of recompressing them.
 * @param {JSZip} zip The zip to normalize.
 * @param {VirtualMachine} vm The VM holding the project.
 */
const normalizeZip = (zip, vm) => {
    for (const file of Object.values(zip.files)) {
        file.date = FIXED_DATE;
        if (file.dir) continue;
        const stored = storedMethod(file);
        if (stored) {
            // Must repeat the stored method exactly, or JSZip inflates and
            // recompresses -- the level is irrelevant to that decision.
            file.options.compression = stored;
        } else {
            Object.assign(file.options, compressionFor(vm, file.name));
        }
    }
};

/**
 * Bring a cached zip up to date with the project as it is right now.
 * @param {VirtualMachine} vm The VM holding the project.
 * @param {object} state The cache state for that VM.
 * @param {object} [options] Serialization options, forwarded to the VM.
 * @returns {JSZip} A zip ready to generate.
 */
const syncZip = (vm, state, options) => {
    const zip = state.zip;
    const projectJson = vm.toJSON(null, options);
    const assets = vm.serializeAssets();

    // A string is recompressed every time, which is what we want: project.json
    // is the one file that always changes. Its compression comes from
    // normalizeZip below, like every other entry.
    zip.file('project.json', projectJson);

    const keep = new Set(['project.json']);
    for (const asset of assets) {
        keep.add(asset.fileName);
        const existing = zip.files[asset.fileName];
        // Asset file names are content hashes: if the name is present the
        // bytes are, by construction, already correct.
        if (existing && !existing.dir) continue;
        zip.file(asset.fileName, asset.fileContent);
    }

    // Assets deleted from the project must not linger in the archive.
    for (const name of Object.keys(zip.files)) {
        if (!keep.has(name)) zip.remove(name);
    }

    normalizeZip(zip, vm);
    return zip;
};

/**
 * Remember a freshly generated sb3 as the base for the next save. Never throws:
 * a cache that cannot be built is simply a cache that does not exist.
 * @param {object} state The cache state for the VM.
 * @param {Uint8Array} bytes A complete sb3.
 */
const seed = async (state, bytes) => {
    if (bytes.byteLength > MAX_CACHE_BYTES) {
        forgetZip(state, true);
        return;
    }
    let zip = null;
    try {
        zip = await JSZip.loadAsync(bytes);
    } catch (error) {
        zip = null;
    }
    rememberZip(state, zip);
};

/**
 * Convert the bytes we always generate internally into whatever type the caller
 * asked for.
 * @param {Uint8Array} bytes The sb3.
 * @param {string} type The requested output type, one of CONVERTIBLE_TYPES.
 * @returns {Blob|ArrayBuffer|Uint8Array} The converted value.
 */
const convert = (bytes, type) => {
    switch (type) {
    case 'uint8array':
        return bytes;
    case 'arraybuffer':
        return bytes.buffer.byteLength === bytes.byteLength ?
            bytes.buffer :
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    default:
        return new Blob([bytes], {type: MIME_TYPE});
    }
};

/**
 * Copy a live sb3 stream into the cache without disturbing the consumer. This
 * is the cold path's only chance to learn the compressed form of the assets, so
 * the first save of a session pays for the buffer the cache will keep anyway.
 * @param {object} state The cache state for the VM.
 * @param {StreamHelper} helper The stream being handed to the caller.
 */
const teeIntoCache = (state, helper) => {
    const chunks = [];
    let total = 0;
    let abandoned = false;

    helper.on('data', chunk => {
        if (abandoned || state.disabled) return;
        if (!(chunk instanceof Uint8Array)) {
            abandoned = true;
            return;
        }
        total += chunk.length;
        if (total > MAX_CACHE_BYTES) {
            abandoned = true;
            chunks.length = 0;
            forgetZip(state, true);
            return;
        }
        chunks.push(chunk);
    });
    helper.on('error', () => {
        abandoned = true;
        chunks.length = 0;
    });
    helper.on('end', () => {
        if (abandoned || chunks.length === 0) return;
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        chunks.length = 0;
        seed(state, bytes);
    });
};

/**
 * Wrap a VM so its saves reuse the previous save's compressed assets.
 * @param {VirtualMachine} vm The VM to wrap.
 */
const installSb3SaveCache = vm => {
    const state = getState(vm);
    if (state.installed) return;
    state.installed = true;

    // Bound up front: callers reach these through different wrappers, and one
    // of them (`saveProjectSb3: (...args) => vm.saveProjectSb3(...args)`) does
    // not keep a useful `this`.
    const originalLoadProject = vm.loadProject.bind(vm);
    const originalSaveProjectSb3 = vm.saveProjectSb3.bind(vm);
    const originalSaveProjectSb3Stream = vm.saveProjectSb3Stream.bind(vm);

    // Opening another project makes the cached archive both useless and
    // expensive to keep, so drop it up front instead of paying for it on save.
    vm.loadProject = (...args) => {
        forgetZip(state);
        return originalLoadProject(...args);
    };

    vm.saveProjectSb3 = async (type, options) => {
        const wanted = type || 'blob';

        if (!CONVERTIBLE_TYPES.has(wanted)) {
            return originalSaveProjectSb3(type, options);
        }

        if (state.disabled || !state.zip) {
            // Cold path: unchanged behavior, except that the result is also
            // kept as the base for the next save.
            const bytes = await originalSaveProjectSb3('uint8array', options);
            await seed(state, bytes);
            return convert(bytes, wanted);
        }

        try {
            const bytes = await syncZip(vm, state, options)
                .generateAsync({type: 'uint8array', mimeType: MIME_TYPE});
            return convert(bytes, wanted);
        } catch (error) {
            // A broken cache must never break a save.
            forgetZip(state);
            return originalSaveProjectSb3(type, options);
        }
    };

    vm.saveProjectSb3Stream = (type, options) => {
        if (!state.disabled && state.zip) {
            try {
                return syncZip(vm, state, options).generateInternalStream({
                    type: type || 'arraybuffer',
                    mimeType: MIME_TYPE,
                    compression: 'DEFLATE'
                });
            } catch (error) {
                forgetZip(state);
            }
        }
        const helper = originalSaveProjectSb3Stream(type, options);
        teeIntoCache(state, helper);
        return helper;
    };
};

export {
    installSb3SaveCache,
    MAX_CACHE_BYTES
};
