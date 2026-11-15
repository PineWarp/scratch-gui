import BlockInstance from '../../lib/find-bar/BlockInstance';
import {
    renderWorkspaceBlockPreview,
    renderBlockTypePreview,
    beginPreviewBatch
} from '../../lib/block-preview/previewRenderer.js';

import Carousel from './Carousel';
import {getReactInternalKey} from './dom-utils';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Reference width used to derive the preview scale, the same way the middle click popup does
 * (see POPUP_SCALE in spotlight.jsx).
 * @type {number}
 */
const POPUP_SCALE = 48;

/**
 * Horizontal room the dropdown leaves around a preview row, in CSS pixels. Includes slack for a
 * scrollbar appearing once the result list grows.
 * @type {number}
 */
const PREVIEW_HORIZONTAL_INSET = 24;

/**
 * Fallback dropdown width, used before the dropdown has been laid out.
 * @type {number}
 */
const FALLBACK_DROPDOWN_WIDTH = 320;

/**
 * How far past the visible part of the list a row is still turned into a block, in CSS pixels.
 * Building a block costs far more than a text row, so only what is about to be seen is built,
 * with a little headroom so scrolling does not show text rows for long.
 * @type {number}
 */
const RENDER_AHEAD = 240;


// Opcode -> scratch-blocks message key remapping for blocks whose opcode has
// underscores that the message table does not.
const operatorMap = {
    'OPERATORS_LETTER_OF': 'OPERATORS_LETTEROF',
    'OPERATORS_LETTERS_OF': 'OPERATORS_LETTERSOF',
    'OPERATORS_INDEX_OF': 'OPERATORS_INDEXOF',
    'OPERATORS_CHANGE_CASE': 'OPERATORS_CHANGECASE'
};

const normalizeType = type => {
    const upper = type.toUpperCase();
    if (upper.startsWith('OPERATOR')) {
        const mapped = 'OPERATORS' + upper.slice(8);
        return operatorMap[mapped] || mapped;
    }
    if (upper === 'SOUND_SETEFFECTTO') return 'SOUND_SETEFFECTO';
    const controlMap = {
        'CONTROL_WAIT_UNTIL': 'CONTROL_WAITUNTIL',
        'CONTROL_REPEAT_UNTIL': 'CONTROL_REPEATUNTIL',
        'CONTROL_FOR_EACH': 'CONTROL_FOREACH',
        'CONTROL_START_AS_CLONE': 'CONTROL_STARTASCLONE',
        'CONTROL_CREATE_CLONE_OF': 'CONTROL_CREATECLONEOF',
        'CONTROL_DELETE_THIS_CLONE': 'CONTROL_DELETETHISCLONE',
        'CONTROL_INCR_COUNTER': 'CONTROL_INCRCOUNTER',
        'CONTROL_CLEAR_COUNTER': 'CONTROL_CLEARCOUNTER',
        'CONTROL_ALL_AT_ONCE': 'CONTROL_ALLATONCE',
        'CONTROL_GET_COUNTER': 'CONTROL_COUNTER'
    };
    if (controlMap[upper]) return controlMap[upper];
    return upper;
};

const normalizeMessagePlaceholders = text => String(text).replace(/%\d+/g, '()');

export default class Dropdown {
    constructor ({ScratchBlocks, utils, vm, msg}) {
        this.ScratchBlocks = ScratchBlocks;
        this.utils = utils;
        this.vm = vm;
        this.msg = msg;

        this.el = null;
        this.items = [];
        this.selected = null;
        this.carousel = new Carousel(utils);

        this._cachedVariableUses = new Map();
        this._cachedProcedureCalls = new Map();
        this._cachedEventCalls = new Map();
    }

    createDom () {
        this.el = document.createElement('ul');
        this.el.className = 'sa-find-dropdown';
        // Event delegation instead of one listener per item: big projects can
        // build hundreds of entries and individual listeners add up quickly.
        this.el.addEventListener('mousedown', e => {
            const item = e.target && e.target.closest ? e.target.closest('li') : null;
            if (item && this.items.indexOf(item) !== -1) {
                this.onItemClick(item);
                e.preventDefault();
                return false;
            }
            return undefined;
        });
        // Rows are only turned into blocks once they are on screen, so scrolling in has to build
        // the ones that come into view. Throttled to one pass per frame.
        this.el.addEventListener('scroll', () => {
            if (this._scrollFrame) return;
            const run = () => {
                this._scrollFrame = null;
                this.renderVisiblePreviews();
            };
            this._scrollFrame = typeof requestAnimationFrame === 'function' ?
                requestAnimationFrame(run) : null;
            if (!this._scrollFrame) run();
        }, {passive: true});
        return this.el;
    }

    inputKeyDown (e) {
        if (e.key === 'ArrowUp') {
            this.navigateFilter(-1);
            e.preventDefault();
            return;
        }

        if (e.key === 'ArrowDown') {
            this.navigateFilter(1);
            e.preventDefault();
            return;
        }

        if (e.key === 'Enter') {
            if (this.selected) {
                this.navigateFilter(1);
            }
            e.preventDefault();
            return;
        }

        this.carousel.inputKeyDown(e);
    }

    navigateFilter (dir) {
        let nxt;
        if (this.selected && this.selected.style.display !== 'none') {
            nxt = dir === -1 ? this.selected.previousSibling : this.selected.nextSibling;
        } else {
            nxt = this.items[0];
            dir = 1;
        }
        while (nxt && nxt.style.display === 'none') {
            nxt = dir === -1 ? nxt.previousSibling : nxt.nextSibling;
        }
        if (nxt) {
            nxt.scrollIntoView({block: 'nearest'});
            this.onItemClick(nxt);
        }
    }

    addItem (proc, messagesList, colours) {
        const item = document.createElement('li');
        item.data = proc;
        item.displayName = this.translateProcCode(proc, messagesList);

        // Attach before anything is rendered: the block preview is measured with getBBox, which
        // is not reliable for an SVG that is not in the document yet.
        this.items.push(item);
        this.el.appendChild(item);

        // A row starts out as its plain text and is only turned into a real block once it is
        // actually on screen (see renderVisiblePreviews). Building a block costs far more than
        // writing a line of text, and a big project has many more rows than fit in the dropdown.
        this.applyTextRow(item, proc, colours);

        return item;
    }

    /**
     * Paints the plain text form of a row. This is what a row shows until it is turned into a
     * real block, and what it keeps when it can not be drawn as one.
     * @param {HTMLLIElement} item The row to paint.
     * @param {object} proc The BlockItem describing the row.
     * @param {object} colours The colour per block type, as built by the find bar.
     */
    applyTextRow (item, proc, colours) {
        if (!item || !proc) return;
        const name = normalizeType(proc.procCode);
        const colour = colours && (colours[proc.procCode] || colours[name]);
        // textContent, not innerText: setting innerText has to look at the layout, and this runs
        // once per row while the list is being built.
        item.textContent = proc.procCode;

        const colorIds = {
            receive: 'events',
            event: 'events',
            define: 'more',
            var: 'data',
            VAR: 'data',
            list: 'data-lists',
            LIST: 'data-lists',
            costume: 'looks',
            sound: 'sounds',
            block: 'more'
        };

        if (proc.cls === 'flag') {
            item.className = 'sa-find-flag';
        } else {
            let colorId = colorIds[proc.cls];
            if (!colorId) {
                const code = proc.procCode.split('_', 1)[0];
                if ([
                    'motion',
                    'control',
                    'looks',
                    'event',
                    'sound',
                    'sensing',
                    'data',
                    'pen',
                    'extensions',
                    'other'
                ].includes(code)) {
                    colorId = code;
                    if (colorId === 'sound') colorId = 'sounds';
                } else if (code === 'operator') {
                    colorId = 'operators';
                } else {
                    colorId = 'more';
                }
            }
            if (colorId === 'more') {
                item.className = 'sa-block-color sa-block-color-more';
                item.style.color = colour;
            } else {
                item.className = `sa-block-color sa-block-color-${colorId}`;
            }
        }
    }

    /**
     * Turns one row into the block it refers to, if it can be. Rows that can not be drawn as a
     * block keep their text; each row is only ever attempted once.
     * @param {HTMLLIElement} item The row to build.
     * @returns {boolean} True when the row now shows a rendered block.
     */
    renderPreview (item) {
        if (!item || item.previewState) return Boolean(item && item.isBlockPreview);
        const proc = item.data;
        if (!proc) {
            item.previewState = 'text';
            return false;
        }

        item.previewState = 'rendering';
        item.isBlockPreview = this.buildBlockPreview(item, proc);
        item.previewState = item.isBlockPreview ? 'block' : 'text';
        return item.isBlockPreview;
    }

    /**
     * Builds the blocks for the rows that are inside (or just outside) the visible part of the
     * list. Everything else keeps its text row until it is scrolled to.
     */
    renderVisiblePreviews () {
        if (!this.el || !this.items.length) return;

        // Read the layout once, on its own. Measuring a row and then writing the DOM for it, over
        // and over, forces a synchronous layout for every single row — which is what made opening
        // the dropdown take about a second on a large project.
        const viewTop = this.el.scrollTop || 0;
        const listHeight = this.el.clientHeight || 0;
        const top = viewTop - RENDER_AHEAD;
        const bottom = viewTop + listHeight + RENDER_AHEAD;
        this._previewWidth = this.el.clientWidth || 0;

        const pending = [];
        for (let i = 0; i < this.items.length; i++) {
            const item = this.items[i];
            if (item.previewState || item.isBlockPreview) continue;
            if (item.style.display === 'none') continue;
            const itemTop = item.offsetTop || 0;
            const itemBottom = itemTop + (item.offsetHeight || 0);
            if (itemBottom < top || itemTop > bottom) continue;
            pending.push(item);
        }

        // Nothing to build: do not open a batch, because closing one makes ScratchBlocks
        // re-measure the bounding box of the whole project.
        if (pending.length === 0) {
            this._previewWidth = 0;
            return;
        }

        // Now write. One batch for the whole pass: every block that is created or disposed
        // otherwise makes ScratchBlocks re-measure the bounding box of the entire project.
        const endBatch = beginPreviewBatch(this.ScratchBlocks);
        try {
            for (let i = 0; i < pending.length; i++) {
                this.renderPreview(pending[i]);
            }
        } finally {
            endBatch();
            this._previewWidth = 0;
        }
    }

    /**
     * Draws the row as the real block it refers to.
     * @param {HTMLLIElement} item The row being built.
     * @param {object} proc The BlockItem describing the row.
     * @returns {boolean} True when the row now shows a rendered block.
     */
    buildBlockPreview (item, proc) {
        // Value rows exist to show the text that matched, so they deliberately stay as text.
        if (!proc || proc.isTextInputEntry) return false;
        if (proc.cls === 'costume' || proc.cls === 'sound') return false;

        const workspace = this.utils.getWorkspace() || this.ScratchBlocks.getMainWorkspace();

        // The block this row stands for, when the editor still has it rendered. Variables and
        // lists are indexed by their own id, which never belongs to a block, so they have none
        // and are built from their data instead.
        let block = null;
        if (typeof proc.labelID === 'string' && proc.labelID &&
            workspace && typeof workspace.getBlockById === 'function') {
            block = workspace.getBlockById(proc.labelID);
            if (block && typeof block.isShadow === 'function' && block.isShadow()) block = null;
        }

        // Nothing to clone: either a script the editor has unloaded because it sits off screen,
        // or an entry that stands for a variable or a list. Both are still drawn as the block
        // they refer to, built from the block's own data.
        const data = block ? null : this.getBlockDataForPreview(proc);
        if (!block && !data) return false;

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'sa-find-block-preview');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        // The row is already in the dropdown, so the preview can be measured as soon as it is
        // attached. The text row it was built from stays until the block is known to work, so a
        // preview that can not be rendered simply leaves the row as it was.
        item.appendChild(svg);

        const rendered = block ?
            renderWorkspaceBlockPreview(block, svg, this.ScratchBlocks) :
            renderBlockTypePreview(data.type, data.fields, svg, this.ScratchBlocks);

        if (!rendered) {
            item.removeChild(svg);
            return false;
        }

        // The block replaces the text the row showed until now.
        for (let i = item.childNodes.length - 1; i >= 0; i--) {
            if (item.childNodes[i] !== svg) item.removeChild(item.childNodes[i]);
        }

        const scale = this.getBlockPreviewScale(rendered.width);
        // The viewBox is what scales the block. It also keeps a block intact when a narrow row
        // shrinks it, because the contents are scaled to fit instead of being clipped.
        svg.setAttribute('viewBox', `0 0 ${rendered.width} ${rendered.height}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('width', `${Math.ceil(rendered.width * scale)}`);
        svg.setAttribute('height', `${Math.ceil(rendered.height * scale)}`);

        item.classList.add('sa-find-block-row');
        // The block already reads as its own name, but screen readers and the tooltip still
        // need the text the row used to show.
        item.title = item.displayName || proc.procCode;
        return true;
    }

    /**
     * Describes the block a row should be drawn as, for the rows that have no rendered block to
     * clone: scripts the editor has unloaded, and the entries that stand for a variable or a
     * list rather than for one block in a script.
     * @param {object} proc The BlockItem describing the row.
     * @returns {?{type: string, fields: ?object}} The block type and the field values to write
     *   onto it, or null when the row has no block to draw.
     */
    getBlockDataForPreview (proc) {
        if (proc.cls === 'var' || proc.cls === 'VAR') {
            if (!proc.variableName) return null;
            return {type: 'data_variable', fields: {VARIABLE: proc.variableName}};
        }
        if (proc.cls === 'list' || proc.cls === 'LIST') {
            if (!proc.variableName) return null;
            return {type: 'data_listcontents', fields: {LIST: proc.variableName}};
        }
        // A define block reads as its signature, which lives in a mutation this module would have
        // to rebuild; the text row is closer to the truth than an empty definition would be.
        if (proc.cls === 'define') return null;
        if (!proc.opcode || typeof proc.opcode !== 'string') return null;
        return {type: proc.opcode, fields: proc.vmFields || null};
    }

    /**
     * The scale previews are drawn at: the middle click popup's scale, shrunk so a wide block
     * still fits the dropdown.
     * @param {number} width The width of the block in unscaled block units.
     * @returns {number} The scale to apply.
     */
    getBlockPreviewScale (width) {
        const viewportScale = (window.innerWidth * 0.00005) + (POPUP_SCALE / 100);
        let scale = viewportScale > 0 && isFinite(viewportScale) ? viewportScale : 0.56;

        // Reading the list's width here would force a layout for every row that is built, so the
        // batch that builds them reads it once and leaves it on the instance.
        const listWidth = this._previewWidth || (this.el && this.el.clientWidth) || 0;
        let available = listWidth > 0 ? listWidth - PREVIEW_HORIZONTAL_INSET : FALLBACK_DROPDOWN_WIDTH;
        if (!(available > 0)) available = FALLBACK_DROPDOWN_WIDTH;

        if (width > 0 && (width * scale) > available) {
            scale = available / width;
        }
        return scale;
    }

    /**
     * Resolve the translated name shown for a search result.
     * The translated block JSON is looked up by the raw opcode first and only then by the name
     * scratch-blocks messages use, so an extension block whose opcode merely looks like a core
     * one (anything starting with "operator", for instance) keeps its own name instead of being
     * answered with the core block's. ScratchBlocks.Msg is the fallback for the core blocks,
     * whose message names differ from their opcodes.
     * @param {string} name An opcode, raw or as a scratch-blocks message key.
     * @param {Array} messagesList - [ScratchBlocks.Msg, translatedBlockJson].
     * @returns {?string} The translated name, or null when there is none.
     */
    translateBlockName (name, messagesList) {
        if (!name) return null;
        const normalized = normalizeType(name);
        return messagesList[1][name] ||
            messagesList[1][normalized] ||
            messagesList[0][name] ||
            messagesList[0][normalized] ||
            null;
    }

    /**
     * Compute the display name of a search result.
     * @param {object} proc - the BlockItem being rendered.
     * @param {Array} messagesList - [ScratchBlocks.Msg, translatedBlockJson].
     * @returns {string} the translated (or fallback) display text.
     */
    translateProcCode (proc, messagesList) {
        const procCode = proc.procCode;

        if (proc.isTextInputEntry) {
            // Entries look like "motion_movesteps: 10". Translate the opcode
            // prefix and keep the user-entered value, so the row shows the
            // localized block name instead of the raw English opcode.
            const colonIndex = procCode.indexOf(':');
            if (colonIndex !== -1) {
                const opcodePart = procCode.substring(0, colonIndex).trim();
                const valuePart = procCode.substring(colonIndex + 1).trim();
                const translated = this.translateBlockName(opcodePart, messagesList);
                if (translated) {
                    return normalizeMessagePlaceholders(`${translated}: ${valuePart}`);
                }
            }
        }

        if (normalizeType(procCode) === 'CONTROL_IF_ELSE') {
            return normalizeMessagePlaceholders(
                normalizeMessagePlaceholders(this.translateBlockName('control_if', messagesList)) + ' %2 ' +
                normalizeMessagePlaceholders(this.translateBlockName('control_else', messagesList)) + ' %3 '
            );
        }

        return normalizeMessagePlaceholders(this.translateBlockName(procCode, messagesList) || procCode);
    }

    onItemClick (item, instanceBlock) {
        if (this.selected && this.selected !== item) {
            this.selected.classList.remove('sel');
            this.selected = null;
        }
        if (this.selected !== item) {
            item.classList.add('sel');
            this.selected = item;
        }

        this.navigateToBlock(item, instanceBlock);
    }

    navigateToBlock (item, instanceBlock) {
        const cls = item.data.cls;

        if (cls === 'costume' || cls === 'sound') {
            const assetPanel = document.querySelector('[class^=asset-panel_wrapper]');
            if (assetPanel) {
                const reactKey = getReactInternalKey(assetPanel);
                const reactInstance = reactKey ? assetPanel[reactKey] : null;
                const reactProps = reactInstance?.child?.stateNode?.props;
                if (reactProps && typeof reactProps.onItemClick === 'function') {
                    reactProps.onItemClick(item.data.y);
                    const selectorList = assetPanel.firstChild?.firstChild;
                    const row = selectorList?.children?.[item.data.y];
                    if (row && typeof row.scrollIntoView === 'function') {
                        row.scrollIntoView({behavior: 'auto', block: 'center', inline: 'start'});
                    }
                    const wrapper = assetPanel.closest('div[class*=gui_flex-wrapper]');
                    if (wrapper) wrapper.scrollTop = 0;
                }
            }
            return;
        }

        if (cls === 'var' || cls === 'VAR' || cls === 'list' || cls === 'LIST') {
            const blocks = this.getVariableUsesById(item.data.labelID);
            this.carousel.build(item, blocks, instanceBlock);
            return;
        }

        if (cls === 'define') {
            const blocks = this.getCallsToProcedureById(item.data.labelID);
            this.carousel.build(item, blocks, instanceBlock);
            return;
        }

        if (cls === 'receive') {
            const blocks = this.getCallsToEventsByName(item.data.eventName);
            if (!instanceBlock) {
                const currentTargetID = this.utils.getEditingTarget().id;
                for (const block of blocks) {
                    if (block.targetId === currentTargetID) {
                        instanceBlock = block;
                        break;
                    }
                }
            }
            this.carousel.build(item, blocks, instanceBlock);
            return;
        }

        if (item.data.clones) {
            const blocks = [item.data.labelID, ...item.data.clones].map(id => ({id}));
            this.carousel.build(item, blocks, instanceBlock);
            return;
        }

        this.utils.scrollBlockIntoView(item.data.labelID);
        this.carousel.remove();
    }

    getVariableUsesById (id) {
        if (this._cachedVariableUses.has(id)) {
            return this._cachedVariableUses.get(id);
        }

        const uses = [];
        const target = this.utils.getEditingTarget();
        const blocks = target && target.blocks && target.blocks._blocks;
        if (blocks) {
            for (const blockId of Object.keys(blocks)) {
                const block = blocks[blockId];
                const fields = block.fields;
                if (!fields) continue;
                for (const name of Object.keys(fields)) {
                    if (fields[name].id === id) {
                        uses.push(new BlockInstance(target, block));
                        break;
                    }
                }
            }
        }

        this._cachedVariableUses.set(id, uses);
        return uses;
    }

    getCallsToProcedureById (id) {
        if (this._cachedProcedureCalls.has(id)) {
            return this._cachedProcedureCalls.get(id);
        }

        const uses = [];
        const target = this.utils.getEditingTarget();
        const blocks = target && target.blocks && target.blocks._blocks;
        const def = blocks && blocks[id];
        if (def) {
            uses.push(new BlockInstance(target, def));
            const protoId = def.inputs && def.inputs.custom_block && def.inputs.custom_block.block;
            const proto = protoId && blocks[protoId];
            const procCode = proto && proto.mutation && proto.mutation.proccode;
            if (procCode) {
                for (const blockId of Object.keys(blocks)) {
                    const block = blocks[blockId];
                    if (
                        block.opcode === 'procedures_call' &&
                        block.mutation && block.mutation.proccode === procCode
                    ) {
                        uses.push(new BlockInstance(target, block));
                    }
                }
            }
        }

        this._cachedProcedureCalls.set(id, uses);
        return uses;
    }

    getCallsToEventsByName (name) {
        if (this._cachedEventCalls.has(name)) {
            return this._cachedEventCalls.get(name);
        }

        const uses = [];
        const targets = this.vm.runtime.targets;

        for (const target of targets) {
            if (!target.isOriginal) continue;
            const blocks = target.blocks;
            if (!blocks._blocks) continue;

            for (const id of Object.keys(blocks._blocks)) {
                const block = blocks._blocks[id];
                if (
                    block.opcode === 'event_whenbroadcastreceived' &&
                    block.fields.BROADCAST_OPTION.value === name
                ) {
                    uses.push(new BlockInstance(target, block));
                } else if (block.opcode === 'event_broadcast' || block.opcode === 'event_broadcastandwait') {
                    const broadcastInputBlockId = block.inputs.BROADCAST_INPUT.block;
                    const broadcastInputBlock = blocks._blocks[broadcastInputBlockId];
                    if (broadcastInputBlock) {
                        const eventName = broadcastInputBlock.opcode === 'event_broadcast_menu' ?
                            broadcastInputBlock.fields.BROADCAST_OPTION.value :
                            this.msg('complex-broadcast');
                        if (eventName === name) {
                            uses.push(new BlockInstance(target, block));
                        }
                    }
                }
            }
        }

        this._cachedEventCalls.set(name, uses);
        return uses;
    }

    empty () {
        for (const item of this.items) {
            if (this.el.contains(item)) {
                this.el.removeChild(item);
            }
        }
        this.items = [];
        this.selected = null;
        this._cachedVariableUses.clear();
        this._cachedProcedureCalls.clear();
        this._cachedEventCalls.clear();
    }
}
