import LazyScratchBlocks from '../tw-lazy-scratch-blocks';

// React 状态驱动的菜单（如 fractch 文件树）监听该事件后自行关闭
const CLOSE_CONTEXT_MENUS_EVENT = 'mw:close-context-menus';
// react-contextmenu 的全局隐藏事件
const HIDE_REACT_CONTEXTMENU_EVENT = 'REACT_CONTEXTMENU_HIDE';

// 菜单自身的容器：事件目标落在其中时说明是在操作菜单，不能当成「点外部」
const MENU_CONTAINER_SELECTOR = [
    'nav.react-contextmenu',
    '.blocklyWidgetDiv',
    '.sa-folder-context-menu',
    '[data-mw-context-menu]'
].join(', ');

// 会自己弹 Blockly 菜单的区域；在这些区域右键时由 Blockly 自己 hideChaff
const BLOCKLY_MENU_ZONE_SELECTOR = [
    '.blocklySvg',
    '.blocklyToolboxDiv',
    '.blocklyFlyout'
].join(', ');

// react-contextmenu 的触发器：右键落在其中时库里会紧接着派发 SHOW，
// 提前 hide 会把它刚弹出的菜单一起关掉
const REACT_MENU_TRIGGER_SELECTOR = '.react-contextmenu-wrapper';

const matchesSelector = (target, selector) => (
    !!target && typeof target.closest === 'function' && !!target.closest(selector)
);

const hideReactContextMenus = () => {
    window.dispatchEvent(new CustomEvent(HIDE_REACT_CONTEXTMENU_EVENT, {detail: {}}));
};

const hideSpriteFolderContextMenus = () => {
    document.querySelectorAll('.sa-folder-context-menu').forEach(menu => menu.remove());
};

const hideBlocklyContextMenu = () => {
    if (!LazyScratchBlocks.isLoaded()) return;
    const ScratchBlocks = LazyScratchBlocks.get();
    if (ScratchBlocks.ContextMenu && ScratchBlocks.ContextMenu.hide) {
        ScratchBlocks.ContextMenu.hide();
    }
};

const hideFractchContextMenu = () => {
    window.dispatchEvent(new CustomEvent(CLOSE_CONTEXT_MENUS_EVENT));
};

/**
 * 统一关闭全站右键菜单。
 */
const closeAllContextMenus = () => {
    // react-contextmenu：角色 / 造型 / 声音 / 背包 / 监视器
    hideReactContextMenus();

    // scratch-blocks：积木 / 工作区 / 积木区右键菜单
    hideBlocklyContextMenu();

    // sprite-folders 扩展：独立 DOM 菜单
    hideSpriteFolderContextMenus();

    // fractch 文件树：React 状态驱动
    hideFractchContextMenu();
};

let installed = false;

/**
 * 补齐各套菜单自己没覆盖的关闭路径，让「点外部 / 右键别处 / Esc」对四套菜单一致生效。
 *
 * 各套菜单原有的监听继续保留，这里只兜底它们漏掉的场景：
 *  - 点击舞台、舞台面板、菜单栏等 Blockly 监听不到的区域（Blockly 菜单不会自己关）
 *  - 右键落在 Blockly 区域时，Gesture 的 stopPropagation 让 document 上的
 *    mousedown / contextmenu 收不到（其它三套菜单不会自己关）
 *  - sprite-folders 与 fractch 文件树完全没有外部点击、Esc 处理
 *
 * @returns {Function} 卸载函数
 */
const installGlobalContextMenuCloser = () => {
    if (installed) return () => {};
    installed = true;

    const handlePointerDown = event => {
        // 右键按下后还会触发 contextmenu，交给 handleContextMenu 处理，
        // 否则会和「右键同一项重新弹出菜单」的时序打架
        if (event.type === 'mousedown' && event.button === 2) return;
        // 点在菜单内部：菜单项自己负责关闭
        if (matchesSelector(event.target, MENU_CONTAINER_SELECTOR)) return;
        closeAllContextMenus();
    };

    const handleContextMenu = event => {
        const target = event.target;
        // 右键点在菜单上（Blockly 把菜单项上的右键当左键点击）：不动
        if (matchesSelector(target, MENU_CONTAINER_SELECTOR)) return;

        if (matchesSelector(target, BLOCKLY_MENU_ZONE_SELECTOR)) {
            // Blockly 会先 hideChaff 再弹新菜单，这里只收拾其它三套
            hideReactContextMenus();
            hideSpriteFolderContextMenus();
            hideFractchContextMenu();
            return;
        }

        hideBlocklyContextMenu();
        hideSpriteFolderContextMenus();
        hideFractchContextMenu();
        // 右键落在 react 菜单的触发器上时，库自己会先 hide 再 SHOW，
        // 这里不要再插手，否则刚弹出的菜单会被一起关掉
        if (!matchesSelector(target, REACT_MENU_TRIGGER_SELECTOR)) {
            hideReactContextMenus();
        }
    };

    const handleKeyDown = event => {
        if (event.keyCode !== 27 && event.key !== 'Escape') return;
        closeAllContextMenus();
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    window.addEventListener('touchstart', handlePointerDown, true);
    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
        installed = false;
        window.removeEventListener('mousedown', handlePointerDown, true);
        window.removeEventListener('touchstart', handlePointerDown, true);
        window.removeEventListener('contextmenu', handleContextMenu, true);
        window.removeEventListener('keydown', handleKeyDown, true);
    };
};

export {
    CLOSE_CONTEXT_MENUS_EVENT,
    closeAllContextMenus,
    installGlobalContextMenuCloser
};
