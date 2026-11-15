/**
 * Persisted git author identity (``user.name`` / ``user.email`` defaults).
 *
 * This lives on its own, with no isomorphic-git / lightning-fs / jszip in the
 * import graph, because the settings window only needs to read and write two
 * localStorage strings. Importing it from `browser-git.js` (as
 * `lib/git/config.js` used to do) dragged the whole git toolchain into the
 * lazily loaded settings chunk, so opening 设置 could trigger a several-hundred
 * kilobyte download of code the window never calls.
 *
 * `browser-git.js` re-exports both helpers, so existing callers keep working.
 */

import {getItem as getStorageItem} from '../utils/safe-storage.js';

const AUTHOR_KEY = 'mw:git-author';
const DEFAULT_AUTHOR = {name: 'User', email: 'user@example.com'};

const getDefaultAuthor = () => {
    try {
        const saved = JSON.parse(getStorageItem(AUTHOR_KEY) || 'null');
        if (saved && typeof saved.name === 'string' && typeof saved.email === 'string') {
            return saved;
        }
    } catch (e) {
        // ignore
    }
    return {...DEFAULT_AUTHOR};
};

const setDefaultAuthor = author => {
    try {
        localStorage.setItem(AUTHOR_KEY, JSON.stringify(author));
    } catch (e) {
        // ignore
    }
};

export {getDefaultAuthor, setDefaultAuthor, AUTHOR_KEY};
