import {getMenuBarLayout, applyMenuBarLayout} from '../mw-menu-bar-layout.js';
import {getStoredStyleSettings, applyStyleSettings} from '../mw-style-settings.js';
import {getFrostedGlassSettings, applyFrostedGlass} from '../bl-frosted-glass.js';

// New theme-aware visual settings only need one entry here.
const MODULES = [
    {id: 'menuBarLayout', read: getMenuBarLayout, apply: applyMenuBarLayout},
    {id: 'styles', read: getStoredStyleSettings, apply: applyStyleSettings},
    {id: 'frostedGlass', read: getFrostedGlassSettings, apply: applyFrostedGlass}
];

const captureStoredAppearance = () => MODULES.reduce((appearance, module) => {
    const value = module.read();
    if (value !== null) appearance[module.id] = value;
    return appearance;
}, {});

const mergeStoredAppearance = appearance => ({
    ...captureStoredAppearance(),
    ...(appearance || {})
});

const applyAppearance = appearance => {
    for (const module of MODULES) {
        // Frosted glass is a global user preference stored on its own, not part of a
        // theme. Always apply the stored value (off when unset) so an outdated theme
        // snapshot can never turn it back on against the setting.
        const value = module.id === 'frostedGlass' ?
            module.read() : (appearance || {})[module.id];
        module.apply(value || null);
    }
};

export {
    captureStoredAppearance,
    mergeStoredAppearance,
    applyAppearance
};
