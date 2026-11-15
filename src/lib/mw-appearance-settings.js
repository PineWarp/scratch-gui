import {getItem as getStorageItem} from './utils/safe-storage.js';

const storageKey = id => `mw:${id}`;

const safeGetItem = key => {
    try {
        return getStorageItem(key);
    } catch (err) {
        return null;
    }
};

// Static CSS presets for the simple toggles (square corners, hidden buttons, etc.).
const APPEARANCE_SETTINGS = [
    {
        id: 'square-stage-corners',
        // 注意：舞台根节点的 CSS Module 类名是 stage_stage_<hash>（见 src/components/stage/stage.css
        // 的 .stage），不是 stage_section。full-screen 时同一元素上会追加 stage_full-screen_<hash>，
        // 前缀匹配 stage_stage 依然命中，所以全屏也一起变方。
        css: '[class*="stage_stage"],[class*="stage_green-flag-overlay-wrapper"]{border-radius:0 !important;}'
    },
    {
        id: 'hide-delete-button',
        css: '[data-tabs] > :nth-child(3) div[class*="delete-button_delete-button_"],' +
            '[data-tabs] > :nth-child(4) div[class*="delete-button_delete-button_"],' +
            'div[class*="sprite-selector_sprite-wrapper_"] div[class*="delete-button_delete-button_"]{display:none;}'
    },
    {
        // 依赖 gui.jsx 里 palette-footer 上的 data-palette-footer / data-extension-button 标记。
        // 旧选择器 [class*="extension-button-container"] 在积木区重构后已经不存在，设置形同虚设。
        // 非窄屏（>900px，见 gui.css 的媒体查询）时积木搜索按钮是隐藏的，
        // 此时整个底部按钮条只剩扩展按钮，直接连 footer 一起收掉，避免残留 1px 边框的空条。
        id: 'hide-extension-button',
        css: '[data-extension-button]{display:none !important;}' +
            '@media only screen and (min-width: 901px){[data-palette-footer]{display:none !important;}}'
    },
    {
        // 背包组件根节点标记见 backpack.jsx；类名兜底保留，旧代码把 backpack 误写成 uppack，
        // 且 [class^=] 只在类名恰好排第一时才命中，所以一直没生效。
        id: 'hide-backpack',
        css: '[data-backpack-container],[class*="backpack_backpack-container"]{display:none !important;}'
    },
    {
        id: 'unclip-palette',
        default: true,
        css: '.injectionDiv:has(> .blocklyToolboxDiv:hover, > svg.blocklyFlyout:not(.sa-flyoutClose):hover)' +
            ' > svg.blocklyFlyout:not(.sa-flyoutClose){overflow:visible;}' +
            '.injectionDiv:has(> .blocklyToolboxDiv:hover, > svg.blocklyFlyout:not(.sa-flyoutClose):hover)' +
            ' #blocklyBlockMenuClipRect{width:100000px;}'
    }
];

const elementId = id => `mw-appearance-${id}`;

const defaultValue = id => {
    const setting = APPEARANCE_SETTINGS.find(s => s.id === id);
    return !!(setting && setting.default);
};

const getAppearanceSetting = id => {
    const stored = safeGetItem(storageKey(id));
    return stored === null ? defaultValue(id) : stored === 'true';
};

const applyAppearanceSetting = (id, enabled) => {
    const setting = APPEARANCE_SETTINGS.find(s => s.id === id);
    if (!setting) return;
    const existing = document.getElementById(elementId(id));
    if (enabled) {
        if (existing) return;
        const style = document.createElement('style');
        style.id = elementId(id);
        style.textContent = setting.css;
        document.head.appendChild(style);
    } else if (existing) {
        existing.remove();
    }
};

const setAppearanceSetting = (id, enabled) => {
    try {
        localStorage.setItem(storageKey(id), enabled);
    } catch (err) {
        // ignore
    }
    applyAppearanceSetting(id, enabled);
};

// Apply all appearance settings on initial load.
const initAppearanceSettings = () => {
    for (const setting of APPEARANCE_SETTINGS) {
        applyAppearanceSetting(setting.id, getAppearanceSetting(setting.id));
    }
};

export {
    APPEARANCE_SETTINGS,
    getAppearanceSetting,
    setAppearanceSetting,
    applyAppearanceSetting,
    initAppearanceSettings
};
