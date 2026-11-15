/**
 * The sb3 `meta` block: who saved a project and when.
 *
 *   "meta": {
 *     ...,
 *     "author": {"username": "mist", "id": "..."},
 *     "created": "2026-07-01T…", // written once, then carried forward untouched
 *     "edited": "2026-07-13T…"   // rewritten every save
 *   }
 *
 * A VM built with the `meta` serialization option takes these fields while it is
 * building project.json, so the json is produced once. An older VM has nowhere
 * to put them, so the fallback re-parses and re-stringifies the finished json --
 * correct, just slower (it scales with project size).
 *
 * Authorship is only added for a signed-in account. Dates and the standard
 * Scratch user-agent field are written for every project save.
 */

let author = null;

// The `meta` of the project currently open, as loaded or most recently saved.
let loadedMeta = null;

// When this project first came into existence. Adopted from the file it was
// loaded from, otherwise minted at its first save — and then never touched
// again, so it survives every later save of the same project.
let created = null;

// Fields the VM writes into `meta` on every save. A loaded project's copies of
// these are stale by definition, so they are not carried forward.
const VM_META_FIELDS = ['semver', 'vm', 'origin', 'agent', 'platform'];

/**
 * Set (or clear, with null) the account whose name goes on saves.
 * @param {{username: string, id: string}|null} user The signed-in PineWarp Accounts user.
 */
const setProjectAuthor = user => {
    author = user && user.username ? {
        username: user.username,
        id: user.id || null
    } : null;
};

/**
 * The `meta` of the open project as it was loaded, or null for a project that
 * has never been saved (a fresh one, or one saved before this existed).
 * @returns {object|null} The metadata.
 */
const getLoadedProjectMeta = () => loadedMeta;

/**
 * The fields this save adds on top of the ones the VM writes itself: everything
 * the open project already carried, plus the fields that change per save.
 * @param {VirtualMachine} vm The VM holding the project.
 * @returns {object} Meta fields to merge into project.json's `meta`.
 */
const metaForSave = vm => {
    const meta = {};
    if (loadedMeta) {
        for (const key of Object.keys(loadedMeta)) {
            if (!VM_META_FIELDS.includes(key)) meta[key] = loadedMeta[key];
        }
    }
    // Migrate projects saved by the metadata draft before these names settled.
    delete meta.createdAt;
    delete meta.savedAt;
    if (!created) created = new Date().toISOString();
    meta.created = created;
    meta.edited = new Date().toISOString();
    meta.agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    if (author) meta.author = Object.assign({}, author);
    // Same value the VM would write, passed back so that the metadata panel can
    // still show a platform for a project that has never been saved to a file.
    if (vm.runtime && vm.runtime.platform) {
        meta.platform = Object.assign({}, vm.runtime.platform);
    }
    return meta;
};

/**
 * Wrap a VM so project saves carry authorship and loads remember it.
 * @param {VirtualMachine} vm The VM to stamp.
 * @param {object} [options] How to talk to this VM.
 * @param {boolean} [options.nativeMeta] Whether the VM understands the `meta`
 *     serialization option. Defaults to asking the VM class.
 */
const installProjectMetadata = (vm, {
    nativeMeta = Boolean(vm.constructor && vm.constructor.SUPPORTS_SERIALIZE_META)
} = {}) => {
    const originalToJSON = vm.toJSON.bind(vm);
    vm.toJSON = (optTargetId, serializationOptions) => {
        // Sprite exports have no project meta to stamp.
        if (optTargetId) return originalToJSON(optTargetId, serializationOptions);

        let meta = null;
        try {
            meta = metaForSave(vm);
        } catch (error) {
            // A save that loses its byline still beats a save that fails.
            return originalToJSON(optTargetId, serializationOptions);
        }

        if (nativeMeta) {
            loadedMeta = Object.assign({}, loadedMeta, meta);
            return originalToJSON(optTargetId, Object.assign({}, serializationOptions, {meta}));
        }

        const json = originalToJSON(optTargetId, serializationOptions);
        try {
            const project = JSON.parse(json);
            project.meta = Object.assign({}, project.meta, meta);
            loadedMeta = project.meta;
            return JSON.stringify(project);
        } catch (error) {
            return json;
        }
    };

    // deserializeProject is the one place the VM hands us the parsed project
    // json, so it is the only cheap way to see the meta a file arrived with.
    const originalDeserialize = vm.deserializeProject.bind(vm);
    vm.deserializeProject = (projectJSON, zip) => {
        loadedMeta = (projectJSON && projectJSON.meta) || null;
        // Opening a project adopts its birthday; opening one without a
        // recorded birthday means the next save mints one.
        created = (loadedMeta && (loadedMeta.created || loadedMeta.createdAt)) || null;
        return originalDeserialize(projectJSON, zip);
    };
};

export {
    setProjectAuthor,
    getLoadedProjectMeta,
    installProjectMetadata
};
