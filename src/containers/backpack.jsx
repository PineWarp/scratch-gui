import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import BackpackComponent from '../components/backpack/backpack.jsx';
import {
    getBackpackContents,
    saveBackpackObject,
    deleteBackpackObject,
    updateBackpackObject,
    subscribeBackpackChanges,
    soundPayload,
    costumePayload,
    spritePayload,
    codePayload,
    fetchCode,
    fetchSprite,
    LOCAL_API
} from '../lib/api/backpack';
import DragConstants from '../lib/constants/drag-constants';
import storage from '../lib/persistence/storage';
import {updateCallbacks} from '../lib/shortcuts/event-router.js';
import {placeInViewport} from '../lib/backpack/code-payload.js';
import {describeBlocks, humanizeOpcode, getWorkspaceBlockText} from '../lib/backpack/script-name.js';
import {getBackpackHeight, setBackpackHeight} from '../lib/backpack/preferences.js';
import {ensurePatched, subscribeBlockDrag} from '../lib/backpack/block-drag-hooks.js';
import installBlockContextMenu from '../lib/backpack/block-context-menu.js';
import collectStackBlocks from '../lib/backpack/script-stack.js';
import {registerBackpackSaver} from '../lib/backpack/save-to-backpack.js';
import lazyScratchBlocks from '../lib/tw-lazy-scratch-blocks';
import log from '../lib/utils/log';
import {closeAlertWithId, showStandardAlert} from '../reducers/alerts';

const incomingDragTypes = [DragConstants.COSTUME, DragConstants.SOUND, DragConstants.SPRITE];

const STRIP_MIN_HEIGHT = 8.75 * 16;
const STRIP_DEFAULT_HEIGHT = STRIP_MIN_HEIGHT;
const MIN_WORKSPACE_HEIGHT = 240;
const ALERT_DURATION = 3000;
const CHANGE_REFRESH_DELAY = 100;
// 「设置 → 开启窗口动画」会给 <html> 加/删 no-window-animation 类，
// 背包展开/收起动画跟随这个开关（见 src/components/gui/gui.jsx）。
const BACKPACK_ANIMATION_DURATION = 300;
const BACKPACK_ANIMATION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
// 高度动画期间给 <html> 打标记，blocks.jsx 据此降低积木区的重排频率，
// 避免每一帧都重排整个 Blockly 工作区造成卡顿。
const BACKPACK_ANIMATING_CLASS = 'backpack-animating';

const messages = defineMessages({
    scriptAutoName: {
        defaultMessage: '{block} · {count, plural, one {# block} other {# blocks}}',
        description: 'Automatic name for a script saved to the backpack, showing its first block and block count',
        id: 'mw.backpack.scriptAutoName'
    },
    scriptAutoNameNoBlock: {
        defaultMessage: 'Script · {count, plural, one {# block} other {# blocks}}',
        description: 'Automatic name for a script saved to the backpack when its first block has no text',
        id: 'mw.backpack.scriptAutoNameNoBlock'
    },
    addToBackpack: {
        defaultMessage: 'Add to backpack',
        description: 'Right-click menu item that saves a script, sprite, costume or sound to the backpack',
        id: 'mw.backpack.addToBackpack'
    }
});

const normalizeSearch = value => `${value || ''}`.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const filterBackpackContents = (contents, value) => {
    const query = normalizeSearch(value).trim();
    if (!query) return contents;

    const terms = query.split(/\s+/);
    const aliases = {
        costume: 'costumes image images',
        script: 'scripts block blocks code',
        sound: 'sounds audio',
        sprite: 'sprites character characters'
    };

    return contents.map((item, index) => {
        const name = normalizeSearch(item.name || item.type || 'script');
        const searchable = `${name} ${item.type} ${aliases[item.type] || ''}`;
        if (!terms.every(term => searchable.includes(term))) return null;

        let score = 3;
        if (name === query) score = 0;
        else if (name.startsWith(query)) score = 1;
        else if (name.split(/\s+/).some(word => word.startsWith(query))) score = 2;
        return {item, index, score};
    }).filter(Boolean)
        .sort((a, b) => a.score - b.score || a.index - b.index)
        .map(result => result.item);
};

const isIncomingAssetDrag = dragInfo => Boolean(
    dragInfo && dragInfo.dragging && incomingDragTypes.includes(dragInfo.dragType)
);

const pointInElement = (element, x, y) => {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
};

class Backpack extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleDrop',
            'handleToggle',
            'handleFilterChange',
            'handleDelete',
            'handleInsert',
            'handleRenameStart',
            'handleRenameSubmit',
            'handleRenameCancel',
            'getBackpackAssetURL',
            'getContents',
            'refreshContents',
            'handleExternalChange',
            'handleRefresh',
            'handleBlockDragEnd',
            'handleBlockDragUpdate',
            'handleBlockDragHook',
            'handleResizePointerDown',
            'handleResizePointerMove',
            'handleResizePointerUp',
            'handleGlobalPointerMove',
            'handleSaveRequest',
            'getAddToBackpackLabel',
            'setContainerRef',
            'setPanelRef',
            'setHandleRef',
            'handleMore',
            'handleSearchChange'
        ]);

        this.dropZones = {panel: null, handle: null};
        this.lastPointer = {x: null, y: null};
        this.resizeSession = null;
        this.filteredCache = null;
        this.contentsRequest = null;
        this.loadAllContents = false;
        this.hasLoaded = false;
        this.refreshQueued = false;
        this.refreshInFlight = false;
        this.morePending = false;
        this.changeTimer = null;
        this.unsubscribeChanges = null;
        this.dropRequest = null;
        this.dropRequestInfo = null;
        this.deletingItems = new Set();
        this.insertingItems = new Set();
        this.renamingItems = new Set();
        this.pendingBlockDrop = false;
        this.pendingBlockDropTimer = null;
        this.shortcutTimer = null;
        this.unsubscribeBlockDrag = null;
        this.alertTimer = null;
        this.shownAlert = null;
        this.unregisterSaver = registerBackpackSaver(this.handleSaveRequest);
        this.unmounted = false;

        this.containerRef = null;
        this.heightAnimationTimer = null;
        this.collapsedHeight = null;
        this.desiredExpanded = false;

        this.state = {
            blockDragActive: false,
            blockDragOutsideWorkspace: false,
            blockDragOverBackpack: false,
            assetDragOver: false,
            error: false,
            itemsPerPage: 100,
            moreToLoad: false,
            loading: false,
            refreshing: false,
            expanded: false,
            closing: false,
            contents: [],
            height: getBackpackHeight(STRIP_MIN_HEIGHT) || STRIP_DEFAULT_HEIGHT,
            searchQuery: '',
            filter: 'all',
            renamingId: null,
            busyId: null
        };

        if (props.host && !storage._hasAddedBackpackSource && props.host !== LOCAL_API) {
            storage.addWebSource(
                [storage.AssetType.ImageVector, storage.AssetType.ImageBitmap, storage.AssetType.Sound],
                this.getBackpackAssetURL
            );
            storage._hasAddedBackpackSource = true;
        }
    }
    componentDidMount () {
        this.unmounted = false;
        this.props.vm.addListener('BLOCK_DRAG_END', this.handleBlockDragEnd);
        this.props.vm.addListener('BLOCK_DRAG_UPDATE', this.handleBlockDragUpdate);

        document.addEventListener('pointermove', this.handleGlobalPointerMove);
        document.addEventListener('mousemove', this.handleGlobalPointerMove);

        this.unsubscribeBlockDrag = subscribeBlockDrag(this.handleBlockDragHook);
        installBlockContextMenu(this.getAddToBackpackLabel);
        updateCallbacks({toggleBackpack: this.handleToggle});
        this.shortcutTimer = setTimeout(() => {
            updateCallbacks({toggleBackpack: this.handleToggle});
        }, 0);
        this.unsubscribeChanges = subscribeBackpackChanges(this.props.host, this.handleExternalChange);
        this.getContents();
    }
    UNSAFE_componentWillReceiveProps (nextProps) {
        const previous = this.props.dragInfo;
        const next = nextProps.dragInfo;
        if (previous === next) return;

        const wasIncoming = isIncomingAssetDrag(previous);
        const isIncoming = isIncomingAssetDrag(next);

        if (isIncoming && next.currentOffset) {
            const over = this.isPointOverDropZones(next.currentOffset.x, next.currentOffset.y);
            if (over !== this.state.assetDragOver) {
                this.setState({assetDragOver: over});
            }
        }
        if (wasIncoming && !isIncoming && this.state.assetDragOver) {
            this.handleDrop(previous);
            this.setState({assetDragOver: false});
        }
    }
    componentWillUnmount () {
        this.unmounted = true;
        this.props.vm.removeListener('BLOCK_DRAG_END', this.handleBlockDragEnd);
        this.props.vm.removeListener('BLOCK_DRAG_UPDATE', this.handleBlockDragUpdate);

        document.removeEventListener('pointermove', this.handleGlobalPointerMove);
        document.removeEventListener('mousemove', this.handleGlobalPointerMove);

        window.removeEventListener('pointermove', this.handleResizePointerMove);
        window.removeEventListener('pointerup', this.handleResizePointerUp);
        window.removeEventListener('pointercancel', this.handleResizePointerUp);

        if (this.unsubscribeBlockDrag) this.unsubscribeBlockDrag();
        if (this.unsubscribeChanges) this.unsubscribeChanges();
        this.unregisterSaver();
        clearTimeout(this.changeTimer);
        clearTimeout(this.shortcutTimer);
        clearTimeout(this.pendingBlockDropTimer);
        clearTimeout(this.alertTimer);
        this.stopHeightAnimation();
        this.clearHeightStyles();
        this.setContainerRef(null);
        this.setPanelRef(null);
        this.setHandleRef(null);
    }

    setDropZone (name, element) {
        this.dropZones[name] = element;
    }
    setContainerRef (element) {
        this.containerRef = element;
    }
    setPanelRef (element) {
        this.setDropZone('panel', element);
    }
    setHandleRef (element) {
        this.setDropZone('handle', element);
    }

    isPointOverDropZones (x, y) {
        if (typeof x !== 'number' || typeof y !== 'number') return false;
        return pointInElement(this.dropZones.panel, x, y) || pointInElement(this.dropZones.handle, x, y);
    }
    isPointerOverDropArea () {
        return this.isPointOverDropZones(this.lastPointer.x, this.lastPointer.y);
    }
    isBlockDragActive () {
        return this.state.blockDragActive || this.state.blockDragOutsideWorkspace;
    }

    handleGlobalPointerMove (e) {
        if (!e) return;
        if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
            this.lastPointer = {x: e.clientX, y: e.clientY};
        }
        ensurePatched();
        installBlockContextMenu();

        if (this.isBlockDragActive()) {
            const over = this.isPointerOverDropArea();
            if (over !== this.state.blockDragOverBackpack) {
                this.setState({blockDragOverBackpack: over});
            }
        }
    }

    getBackpackAssetURL (asset) {
        return `${this.props.host}/${asset.assetId}.${asset.dataFormat}`;
    }
    emitResize () {
        window.dispatchEvent(new Event('resize'));
    }
    getWorkspaceHeight () {
        if (!lazyScratchBlocks.isLoaded()) return null;
        try {
            const workspace = lazyScratchBlocks.get().getMainWorkspace();
            const svg = workspace && workspace.getParentSvg();
            return svg ? svg.getBoundingClientRect().height : null;
        } catch (e) {
            return null;
        }
    }
    getMaxHeight (availableHeight) {
        const byWindow = Math.floor(window.innerHeight * 0.75);
        const byWorkspace = typeof availableHeight === 'number' ?
            Math.floor(availableHeight - MIN_WORKSPACE_HEIGHT) :
            byWindow;
        return Math.max(STRIP_MIN_HEIGHT, Math.min(byWindow, byWorkspace));
    }
    isAnimationEnabled () {
        return !document.documentElement.classList.contains('no-window-animation');
    }
    getHeaderElement () {
        return this.containerRef ? this.containerRef.querySelector('[data-backpack-header]') : null;
    }
    readHeaderMetrics (header) {
        if (!header) return null;
        const computed = window.getComputedStyle(header);
        return {
            padding: parseFloat(computed.paddingTop) || 0,
            minHeight: parseFloat(computed.minHeight) || 0,
            borderBottom: parseFloat(computed.borderBottomWidth) || 0
        };
    }
    setAnimating (animating) {
        // 动画期间动画一个普通的 height 过渡即可，头部尺寸直接切到目标状态，
        // 由容器的 overflow: hidden 裁掉超出部分；不要再对 padding / min-height
        // 这类会触发布局的属性做逐帧动画，否则每一帧都要重排整个编辑器。
        document.documentElement.classList.toggle(BACKPACK_ANIMATING_CLASS, animating);
    }
    stopHeightAnimation () {
        if (this.heightAnimationTimer) {
            clearTimeout(this.heightAnimationTimer);
            this.heightAnimationTimer = null;
        }
        this.setAnimating(false);
    }
    clearHeightStyles () {
        this.setAnimating(false);
        const container = this.containerRef;
        if (!container) return;
        container.style.transition = '';
        container.style.overflow = '';
        container.style.height = '';
    }
    animateHeight (from, to, onDone) {
        const container = this.containerRef;
        this.stopHeightAnimation();
        if (!container) {
            if (onDone) onDone();
            return;
        }
        if (from === to) {
            this.clearHeightStyles();
            if (onDone) onDone();
            return;
        }
        container.style.transition = 'none';
        container.style.overflow = 'hidden';
        container.style.height = `${from}px`;
        // 先把起始高度刷进布局，再打开 transition，避免从 auto 高度直接跳变。
        container.getBoundingClientRect();
        this.setAnimating(true);
        container.style.transition =
            `height ${BACKPACK_ANIMATION_DURATION}ms ${BACKPACK_ANIMATION_EASING}`;
        container.style.height = `${to}px`;

        // 积木区由 blocks.jsx 的 ResizeObserver 跟随 CSS 过渡重排；动画期间会
        // 限制重排频率（见 handleBlocksResize），这里不再额外派发 window resize。
        this.heightAnimationTimer = setTimeout(() => {
            this.stopHeightAnimation();
            if (onDone) onDone();
        }, BACKPACK_ANIMATION_DURATION + 30);
    }
    getCollapsedHeight () {
        if (this.collapsedHeight) return this.collapsedHeight;
        const metrics = this.readHeaderMetrics(this.getHeaderElement());
        return metrics ? Math.max(0, metrics.minHeight - (metrics.padding * 2)) : 0;
    }
    openBackpack () {
        const workspaceHeight = this.getWorkspaceHeight();
        const heightPatch = workspaceHeight ?
            {height: Math.min(this.state.height, this.getMaxHeight(workspaceHeight))} : null;

        if (this.state.expanded) {
            // 收起动画还没结束时又点了展开：先恢复完整 UI，再把高度撑回去。
            const container = this.containerRef;
            const startHeight = container ? container.getBoundingClientRect().height : 0;
            this.stopHeightAnimation();
            this.setState({closing: false, renamingId: null}, () => {
                if (this.unmounted) return;
                if (!this.isAnimationEnabled() || !this.containerRef || startHeight <= 0) {
                    this.clearHeightStyles();
                    this.emitResize();
                    return;
                }
                this.clearHeightStyles();
                const fullHeight = this.containerRef.getBoundingClientRect().height;
                this.animateHeight(startHeight, fullHeight, () => {
                    this.clearHeightStyles();
                    this.emitResize();
                });
            });
        } else {
            const container = this.containerRef;
            const startHeight = container ? container.getBoundingClientRect().height : 0;
            if (startHeight > 0) this.collapsedHeight = startHeight;
            this.stopHeightAnimation();
            this.clearHeightStyles();
            this.setState(Object.assign({expanded: true, renamingId: null}, heightPatch), () => {
                if (this.unmounted) return;
                if (!this.isAnimationEnabled() || !this.containerRef || startHeight <= 0) {
                    this.emitResize();
                    return;
                }
                const fullHeight = this.containerRef.getBoundingClientRect().height;
                this.animateHeight(startHeight, fullHeight, () => {
                    this.clearHeightStyles();
                    this.emitResize();
                });
            });
        }

        if (this.hasLoaded) {
            this.refreshContents();
        } else {
            this.getContents();
        }
    }
    closeBackpack () {
        const container = this.containerRef;
        if (!this.isAnimationEnabled() || !container) {
            this.stopHeightAnimation();
            this.clearHeightStyles();
            this.setState({expanded: false, closing: false, renamingId: null}, this.emitResize);
            return;
        }
        const startHeight = container.getBoundingClientRect().height;
        if (startHeight <= 0) {
            this.stopHeightAnimation();
            this.clearHeightStyles();
            this.setState({expanded: false, closing: false, renamingId: null}, this.emitResize);
            return;
        }
        const endHeight = Math.min(startHeight, this.getCollapsedHeight());
        this.stopHeightAnimation();
        // 先冻结当前高度，再把 UI 直接切回打开前的折叠样式（按钮、列表立即消失），
        // 最后单独把剩下的高度缩回去。
        container.style.transition = 'none';
        container.style.overflow = 'hidden';
        container.style.height = `${startHeight}px`;
        container.getBoundingClientRect();
        this.setState({closing: true}, () => {
            if (this.unmounted) return;
            this.animateHeight(startHeight, endHeight, () => {
                this.setState({expanded: false, closing: false, renamingId: null}, () => {
                    this.clearHeightStyles();
                    this.emitResize();
                });
            });
        });
    }
    setExpanded (expanded) {
        if (expanded === this.desiredExpanded) return;
        this.desiredExpanded = expanded;
        if (expanded) {
            this.openBackpack();
        } else {
            this.closeBackpack();
        }
    }
    handleToggle () {
        this.setExpanded(!this.desiredExpanded);
    }
    handleFilterChange (filter) {
        this.setState({filter});
    }
    showAlert (alertId) {
        clearTimeout(this.alertTimer);
        if (this.shownAlert && this.shownAlert !== alertId) this.props.onCloseAlert(this.shownAlert);
        this.shownAlert = alertId;
        this.props.onShowAlert(alertId);
        this.alertTimer = setTimeout(() => {
            this.props.onCloseAlert(alertId);
            this.shownAlert = null;
        }, ALERT_DURATION);
    }
    handleError (error) {
        if (this.unmounted) return false;
        log.error(error);
        this.setState({
            error: `${error}`,
            loading: false,
            busyId: null
        });
        return false;
    }
    getAddToBackpackLabel () {
        return this.props.intl.formatMessage(messages.addToBackpack);
    }
    handleSaveRequest (request) {
        if (!request) return Promise.resolve(false);
        if (request.kind === 'script') {
            const target = this.props.vm.editingTarget;
            if (!target) return Promise.resolve(false);
            const blocks = collectStackBlocks(target.blocks, request.blockId);
            if (blocks.length === 0) return Promise.resolve(false);
            return this.handleDrop({
                dragType: DragConstants.CODE,
                payload: {
                    blockObjects: this.props.vm.exportStandaloneBlocks(blocks),
                    topBlockId: request.blockId
                }
            });
        }
        if (!incomingDragTypes.includes(request.dragType)) return Promise.resolve(false);
        return this.handleDrop({dragType: request.dragType, payload: request.payload});
    }
    getScriptName (dragPayload, payload) {
        const {opcode, blockCount} = describeBlocks(dragPayload.blockObjects);
        const block = getWorkspaceBlockText(dragPayload.topBlockId) || humanizeOpcode(opcode);
        if (block) {
            return this.props.intl.formatMessage(messages.scriptAutoName, {block, count: blockCount});
        }
        if (blockCount > 0) {
            return this.props.intl.formatMessage(messages.scriptAutoNameNoBlock, {count: blockCount});
        }
        return payload.name;
    }
    handleDrop (dragInfo) {
        if (this.dropRequest && this.dropRequestInfo === dragInfo) return this.dropRequest;
        const previous = this.dropRequest || Promise.resolve();
        const request = previous
            .then(() => this.saveDrop(dragInfo))
            .then(result => {
                if (this.dropRequest === request) {
                    this.dropRequest = null;
                    this.dropRequestInfo = null;
                }
                return result;
            });
        this.dropRequest = request;
        this.dropRequestInfo = dragInfo;
        return request;
    }
    saveDrop (dragInfo) {
        let payloader = null;
        let presaveAsset = null;
        switch (dragInfo.dragType) {
        case DragConstants.COSTUME:
            payloader = costumePayload;
            presaveAsset = dragInfo.payload.asset;
            break;
        case DragConstants.SOUND:
            payloader = soundPayload;
            presaveAsset = dragInfo.payload.asset;
            break;
        case DragConstants.SPRITE:
            payloader = spritePayload;
            break;
        case DragConstants.CODE:
            payloader = codePayload;
            break;
        }
        if (!payloader) return Promise.resolve(false);

        this.setState({loading: true, error: false});
        return Promise.resolve()
            .then(() => payloader(dragInfo.payload, this.props.vm))
            .then(payload => {
                if (dragInfo.dragType === DragConstants.CODE) {
                    payload.name = this.getScriptName(dragInfo.payload, payload);
                }
                if (presaveAsset && !presaveAsset.clean && this.props.host !== LOCAL_API) {
                    return storage.store(
                        presaveAsset.assetType,
                        presaveAsset.dataFormat,
                        presaveAsset.data,
                        presaveAsset.assetId
                    ).then(() => payload);
                }
                return payload;
            })
            .then(payload => saveBackpackObject({
                host: this.props.host,
                token: this.props.token,
                username: this.props.username,
                ...payload
            }))
            .then(item => {
                if (this.unmounted) return false;
                this.queueRefreshIfLoading();
                this.setState(oldState => ({
                    loading: false,
                    contents: [item].concat(oldState.contents.filter(existing => existing.id !== item.id))
                }));
                this.showAlert('backpackSaved');
                return true;
            })
            .catch(error => this.handleError(error));
    }
    handleDelete (id) {
        if (this.deletingItems.has(id)) return Promise.resolve(false);
        this.deletingItems.add(id);
        this.setState({loading: true, error: false});
        return deleteBackpackObject({
            host: this.props.host,
            token: this.props.token,
            username: this.props.username,
            id: id
        })
            .then(() => {
                if (this.unmounted) return false;
                this.queueRefreshIfLoading();
                this.setState(oldState => ({
                    loading: false,
                    contents: oldState.contents.filter(o => o.id !== id),
                    renamingId: oldState.renamingId === id ? null : oldState.renamingId
                }));
                return true;
            })
            .catch(error => this.handleError(error))
            .then(result => {
                this.deletingItems.delete(id);
                return result;
            });
    }
    findItemById (id) {
        return this.state.contents.find(i => i.id === id);
    }
    getViewport () {
        if (!lazyScratchBlocks.isLoaded()) return null;
        try {
            const workspace = lazyScratchBlocks.get().getMainWorkspace();
            const metrics = workspace && workspace.getMetrics();
            if (!metrics) return null;
            return {width: metrics.viewWidth, height: metrics.viewHeight};
        } catch (e) {
            return null;
        }
    }
    async handleInsert (id) {
        if (this.insertingItems.has(id)) return false;
        const item = this.findItemById(id);
        const vm = this.props.vm;
        const target = vm.editingTarget;
        if (!item || !target) return false;

        this.insertingItems.add(id);
        this.setState({busyId: id, error: false});
        try {
            const targetId = target.id;
            if (item.type === 'script') {
                const payload = await fetchCode(item.bodyUrl);
                const metrics = this.props.workspaceMetrics.targets[targetId];
                placeInViewport(payload, metrics, this.props.isRtl, this.getViewport());
                await vm.shareBlocksToTarget(payload, targetId);
                vm.refreshWorkspace();
            } else if (item.type === 'costume') {
                await vm.addCostume(item.body, {name: item.name}, targetId);
            } else if (item.type === 'sound') {
                await vm.addSound({md5: item.body, name: item.name}, targetId);
            } else if (item.type === 'sprite') {
                const sprite3Zip = await fetchSprite(item.bodyUrl);
                await vm.addSprite(sprite3Zip);
                const added = vm.editingTarget;
                if (added && added.sprite && item.name && added.sprite.name !== item.name) {
                    vm.renameSprite(added.id, item.name);
                }
            }
            if (this.unmounted) return false;
            this.setState({busyId: null});
            this.showAlert('backpackInserted');
            return true;
        } catch (error) {
            return this.handleError(error);
        } finally {
            this.insertingItems.delete(id);
        }
    }
    handleRenameStart (id) {
        if (!this.canRename() || !this.findItemById(id)) return false;
        this.setState({renamingId: id});
        return true;
    }
    handleRenameCancel () {
        this.setState({renamingId: null});
    }
    async handleRenameSubmit (id, value) {
        if (this.state.renamingId === id) {
            this.setState({renamingId: null});
        }
        if (this.renamingItems.has(id)) return false;
        const item = this.findItemById(id);
        if (!item) return false;
        const newName = `${value === null || typeof value === 'undefined' ? '' : value}`.trim();
        if (!newName || newName === item.name) return false;

        this.renamingItems.add(id);
        try {
            this.setState({loading: true, error: false});
            const newItem = await updateBackpackObject({
                host: this.props.host,
                ...item,
                name: newName
            });
            if (this.unmounted) return false;
            this.queueRefreshIfLoading();
            this.setState(oldState => ({
                loading: false,
                contents: oldState.contents.map(i => (i.id === id ? newItem : i))
            }));
            return true;
        } catch (error) {
            const result = this.handleError(error);
            if (!this.unmounted) this.refreshContents();
            return result;
        } finally {
            this.renamingItems.delete(id);
        }
    }
    canRename () {
        return this.props.host === LOCAL_API;
    }
    canLoadContents () {
        return this.props.host === LOCAL_API || Boolean(this.props.token && this.props.username);
    }
    getContents (loadAll = false) {
        if (!this.canLoadContents()) return;

        this.loadAllContents = this.loadAllContents || loadAll;
        if (this.contentsRequest) {
            if (!loadAll && this.refreshInFlight) this.morePending = true;
            return;
        }
        this.loadContents(false);
    }
    refreshContents () {
        if (!this.canLoadContents()) return;
        if (this.contentsRequest) {
            this.refreshQueued = true;
            return;
        }
        this.loadContents(true);
    }
    queueRefreshIfLoading () {
        if (this.contentsRequest) this.refreshQueued = true;
    }
    loadContents (refresh) {
        this.hasLoaded = true;
        this.refreshQueued = false;
        this.refreshInFlight = refresh;
        const wantsMore = this.morePending;
        this.morePending = false;
        this.loadAllContents = this.loadAllContents || Boolean(this.state.searchQuery.trim());
        this.setState({loading: true, refreshing: refresh, error: false});
        const pageSize = this.state.itemsPerPage;
        const loaded = refresh ? [] : this.state.contents.slice();
        const shownCount = this.state.contents.length + (wantsMore ? pageSize : 0);
        const minimumCount = refresh ?
            Math.max(pageSize, Math.ceil(shownCount / pageSize) * pageSize) :
            0;
        const loadPage = () => getBackpackContents({
            host: this.props.host,
            token: this.props.token,
            username: this.props.username,
            offset: loaded.length,
            limit: pageSize
        }).then(contents => {
            loaded.push(...contents);
            const fullPage = contents.length === pageSize;
            const stale = refresh && this.refreshQueued;
            if (fullPage && !stale && (this.loadAllContents || loaded.length < minimumCount)) {
                return loadPage();
            }
            return fullPage;
        });

        this.contentsRequest = loadPage()
            .then(moreToLoad => {
                if (this.unmounted) return false;
                if (refresh && this.refreshQueued && this.canLoadContents()) {
                    if (wantsMore) this.morePending = true;
                    return false;
                }
                const loadedIds = new Set(loaded.map(item => item.id));
                this.setState(oldState => {
                    if (refresh) {
                        return {
                            contents: loaded,
                            moreToLoad,
                            loading: false,
                            refreshing: false,
                            renamingId: loadedIds.has(oldState.renamingId) ? oldState.renamingId : null
                        };
                    }
                    const newerItems = oldState.contents.filter(item => !loadedIds.has(item.id));
                    return {
                        contents: newerItems.concat(loaded),
                        moreToLoad,
                        loading: false,
                        refreshing: false
                    };
                });
                return true;
            })
            .catch(error => {
                const result = this.handleError(error);
                if (!this.unmounted) this.setState({refreshing: false});
                return result;
            })
            .then(() => {
                this.contentsRequest = null;
                this.refreshInFlight = false;
                this.loadAllContents = false;
                if (this.unmounted) return;
                if (this.refreshQueued) {
                    this.refreshQueued = false;
                    this.refreshContents();
                } else if (this.morePending) {
                    this.morePending = false;
                    this.getContents();
                }
            });
    }
    handleExternalChange () {
        clearTimeout(this.changeTimer);
        this.changeTimer = setTimeout(this.refreshContents, CHANGE_REFRESH_DELAY);
    }
    handleRefresh () {
        if (this.state.refreshing) return;
        this.refreshContents();
    }
    handleBlockDragHook (type) {
        if (this.unmounted) return;
        if (type === 'start') {
            clearTimeout(this.pendingBlockDropTimer);
            this.pendingBlockDrop = false;
            this.setState({
                blockDragActive: true,
                blockDragOverBackpack: this.isPointerOverDropArea()
            });
            return;
        }
        this.pendingBlockDrop = this.state.blockDragOverBackpack || this.isPointerOverDropArea();
        clearTimeout(this.pendingBlockDropTimer);
        this.pendingBlockDropTimer = setTimeout(() => {
            this.pendingBlockDrop = false;
        }, 500);
        this.setState({blockDragActive: false, blockDragOverBackpack: false});
    }
    handleBlockDragUpdate (isOutsideWorkspace) {
        this.setState({
            blockDragOutsideWorkspace: isOutsideWorkspace,
            blockDragOverBackpack: (isOutsideWorkspace || this.state.blockDragActive) ?
                this.isPointerOverDropArea() : false
        });
    }
    handleBlockDragEnd (blocks, topBlockId) {
        const shouldDrop = this.pendingBlockDrop || this.state.blockDragOverBackpack || this.isPointerOverDropArea();
        this.pendingBlockDrop = false;
        clearTimeout(this.pendingBlockDropTimer);
        if (shouldDrop) {
            this.handleDrop({
                dragType: DragConstants.CODE,
                payload: {
                    blockObjects: this.props.vm.exportStandaloneBlocks(blocks),
                    topBlockId: topBlockId
                }
            });
        }
        this.setState({
            blockDragOverBackpack: false,
            blockDragOutsideWorkspace: false,
            blockDragActive: false
        });
    }

    handleResizePointerDown (e) {
        if (!e) return;
        if (!this.state.expanded) return;
        if (typeof e.preventDefault === 'function') e.preventDefault();

        const workspaceHeight = this.getWorkspaceHeight();
        this.resizeSession = {
            startY: e.clientY,
            startHeight: this.state.height,
            maxHeight: this.getMaxHeight(workspaceHeight === null ? null : workspaceHeight + this.state.height)
        };

        window.addEventListener('pointermove', this.handleResizePointerMove);
        window.addEventListener('pointerup', this.handleResizePointerUp);
        window.addEventListener('pointercancel', this.handleResizePointerUp);
    }

    handleResizePointerMove (e) {
        if (!this.resizeSession) return;
        const maxHeight = this.resizeSession.maxHeight;
        const delta = this.resizeSession.startY - e.clientY;
        const next = Math.max(
            STRIP_MIN_HEIGHT,
            Math.min(maxHeight, Math.round(this.resizeSession.startHeight + delta))
        );
        if (next !== this.state.height) {
            this.setState({height: next}, this.emitResize);
        }
    }

    handleResizePointerUp () {
        this.resizeSession = null;
        window.removeEventListener('pointermove', this.handleResizePointerMove);
        window.removeEventListener('pointerup', this.handleResizePointerUp);
        window.removeEventListener('pointercancel', this.handleResizePointerUp);
        setBackpackHeight(this.state.height);
    }
    handleMore () {
        this.getContents();
    }
    handleSearchChange (event) {
        const value = event.target.value;
        this.setState({searchQuery: value});
        if (value.trim() && (this.state.moreToLoad || this.contentsRequest)) this.getContents(true);
    }
    getFilteredContents () {
        // 必须缓存：这段逻辑在 render 期间调用，每次都会新建数组（filter/sort 都返回
        // 新引用），BackpackItems 随之重建 N 个 <BackpackItem> element。下游虽然靠
        // connect / PureComponent 的浅比较兜住了元素级 props，但数组本身每次都是新的，
        // 容器任意一次 setState（拖拽、busy、重命名、搜索）都要白跑一遍 N 项的 diff。
        // 项数越多越明显。
        const {contents, filter, searchQuery} = this.state;
        const cache = this.filteredCache;
        if (cache && cache.contents === contents && cache.filter === filter &&
            cache.searchQuery === searchQuery) {
            return cache.result;
        }
        const byType = filter === 'all' ? contents : contents.filter(item => item.type === filter);
        const result = filterBackpackContents(byType, searchQuery);
        this.filteredCache = {contents, filter, searchQuery, result};
        return result;
    }
    render () {
        const dragOver = this.state.blockDragOverBackpack;
        return (
            <BackpackComponent
                busyId={this.state.busyId}
                canRename={this.canRename()}
                canToggle={Boolean(this.props.host)}
                containerRef={this.setContainerRef}
                contents={this.getFilteredContents()}
                dragActive={this.isBlockDragActive()}
                dragOver={dragOver}
                error={this.state.error}
                expanded={this.state.expanded && !this.state.closing}
                filter={this.state.filter}
                handleRef={this.setHandleRef}
                height={this.state.height}
                loading={this.state.loading && this.state.contents.length === 0}
                panelRef={this.setPanelRef}
                refreshing={this.state.refreshing}
                renamingId={this.state.renamingId}
                searchQuery={this.state.searchQuery}
                showMore={!this.state.searchQuery && this.state.moreToLoad}
                totalCount={this.state.contents.length}
                onDelete={this.handleDelete}
                onFilterChange={this.handleFilterChange}
                onInsert={this.handleInsert}
                onMore={this.handleMore}
                onRefresh={this.handleRefresh}
                onRenameCancel={this.handleRenameCancel}
                onRenameStart={this.handleRenameStart}
                onRenameSubmit={this.handleRenameSubmit}
                onResizePointerDown={this.handleResizePointerDown}
                onSearchChange={this.handleSearchChange}
                onToggle={this.handleToggle}
            />
        );
    }
}

Backpack.propTypes = {
    dragInfo: PropTypes.shape({
        currentOffset: PropTypes.shape({
            x: PropTypes.number,
            y: PropTypes.number
        }),
        dragType: PropTypes.string,
        dragging: PropTypes.bool,
        payload: PropTypes.object
    }),
    host: PropTypes.string,
    intl: intlShape,
    isRtl: PropTypes.bool,
    onCloseAlert: PropTypes.func,
    onShowAlert: PropTypes.func,
    token: PropTypes.string,
    username: PropTypes.string,
    vm: PropTypes.instanceOf(VM),
    workspaceMetrics: PropTypes.shape({
        targets: PropTypes.objectOf(PropTypes.object)
    })
};

Backpack.defaultProps = {
    dragInfo: {dragging: false, currentOffset: null},
    isRtl: false,
    onCloseAlert: () => {},
    onShowAlert: () => {},
    workspaceMetrics: {targets: {}}
};

const getTokenAndUsername = state => {
    if (state.session && state.session.session && state.session.session.user) {
        return {
            token: state.session.session.user.token,
            username: state.session.session.user.username
        };
    }
    const tokenMatches = window.location.href.match(/[?&]token=([^&]*)&?/);
    const usernameMatches = window.location.href.match(/[?&]username=([^&]*)&?/);
    return {
        token: tokenMatches ? tokenMatches[1] : null,
        username: usernameMatches ? usernameMatches[1] : null
    };
};

const mapStateToProps = state => Object.assign(
    {
        dragInfo: state.scratchGui.assetDrag,
        isRtl: state.locales.isRtl,
        vm: state.scratchGui.vm,
        workspaceMetrics: state.scratchGui.workspaceMetrics
    },
    getTokenAndUsername(state)
);

const mapDispatchToProps = dispatch => ({
    onCloseAlert: alertId => dispatch(closeAlertWithId(alertId)),
    onShowAlert: alertId => dispatch(showStandardAlert(alertId))
});

export {Backpack, filterBackpackContents};
export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(Backpack));
