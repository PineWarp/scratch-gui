import {getItem as getStorageItem} from './utils/safe-storage.js';

const STORAGE_KEY = 'mw:embed-git-on-save';
const EMBED_GIT_ON_SAVE_CHANGED = 'mw:embed-git-on-save-changed';

/**
 * Whether saving a project to a file should also embed the git repository
 * (the fractch tree plus `.git`) under GIT_EMBED_DIR.
 *
 * Defaults to off. Embedding is not free: it needs the whole zip in memory,
 * because the streaming save path cannot inject extra files, so with a
 * repository present every save buffers instead of streaming. Leaving it off
 * also keeps a saved file a plain .sb3, so opening it back does not silently
 * import a repository the user did not ask for.
 *
 * @returns {boolean} True when the repository should be embedded on save.
 */
const getEmbedGitOnSave = () => {
    try {
        return getStorageItem(STORAGE_KEY) === 'true';
    } catch (err) {
        return false;
    }
};

/**
 * @param {boolean} enabled Whether to embed the repository when saving.
 */
const setEmbedGitOnSave = enabled => {
    try {
        localStorage.setItem(STORAGE_KEY, enabled);
    } catch (err) {
        // Storage can be unavailable (private mode, WebView with storage
        // disabled); the setting then simply does not persist.
    }
    window.dispatchEvent(new CustomEvent(EMBED_GIT_ON_SAVE_CHANGED));
};

export {
    getEmbedGitOnSave,
    setEmbedGitOnSave,
    EMBED_GIT_ON_SAVE_CHANGED
};
