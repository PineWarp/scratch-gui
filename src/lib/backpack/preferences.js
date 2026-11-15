import {getItem, setItem} from '../utils/safe-storage.js';

const HEIGHT_KEY = 'mw:backpackHeight';

const FILTERS = ['all', 'script', 'sprite', 'costume', 'sound'];

const getBackpackHeight = minimum => {
    const raw = getItem(HEIGHT_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= minimum) return parsed;
    return null;
};

const setBackpackHeight = height => setItem(HEIGHT_KEY, String(height));

export {
    FILTERS,
    getBackpackHeight,
    setBackpackHeight
};
