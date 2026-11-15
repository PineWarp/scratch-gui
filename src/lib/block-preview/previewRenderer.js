/**
 * @file Renders block previews by building real ScratchBlocks blocks and cloning their SVG,
 * instead of drawing simplified approximations. Doing it this way means C blocks, nested stacks,
 * fields, fonts and theme colours are identical to what the editor renders.
 *
 * Two features share this module:
 * - the middle click popup (spotlight), which previews block *types* from the palette;
 * - the find bar, which previews blocks that already exist in the project.
 *
 * Rendering a block the real way is not cheap, so two things keep it fast:
 * - {@link beginPreviewBatch} suspends the workspace resize for the whole batch of previews.
 *   Every created and disposed block would otherwise re-measure the bounding box of the entire
 *   project (O(blocks)), which costs far more than rendering the previews themselves.
 * - Finished previews are cached, so only the rows that actually changed are built again.
 */

import {BlockInstance} from '../spotlight/BlockTypeInfo.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Extra vertical padding, in block units, added above and below a rendered block.
 * @type {number}
 */
const BLOCK_ROW_INSET = 6;

/**
 * How many rendered previews to keep for reuse. The find bar builds one preview per row, and a
 * project can easily have more block types than the old limit held, which made every reopen of
 * the dropdown rebuild the whole list from scratch.
 * @type {number}
 */
const CACHE_LIMIT = 192;

/**
 * Rendered previews, keyed by {@link getPreviewKey} or {@link getWorkspacePreviewKey},
 * oldest entry first. Values are `{node, width, height, top, rowHeight}` where `node` is a
 * detached clone.
 * @type {Map<string, object>}
 */
const previewCache = new Map();

/**
 * Stable identity per block type. Block *ids* are not unique enough (every custom block call
 * is a `procedures_call`), so the key has to identify the type instead.
 * @type {WeakMap<object, number>}
 */
const typeKeys = new WeakMap();
let nextTypeKey = 0;

/**
 * The block colours the cache was rendered with, see {@link getThemeSignature}.
 * @type {string|null}
 */
let themeSignature = null;

let batchDepth = 0;
let batchWorkspace = null;

/**
 * Creates an SVG element.
 * @param {string} name The tag name.
 * @returns {SVGElement} The element.
 */
const createSvgElement = name => document.createElementNS(SVG_NS, name);

/**
 * Gets a stable key for a block type.
 * @param {object} typeInfo The block type info.
 * @returns {number} The key.
 */
const getTypeKey = typeInfo => {
    let key = typeKeys.get(typeInfo);
    if (typeof key !== 'number') {
        nextTypeKey++;
        key = nextTypeKey;
        typeKeys.set(typeInfo, key);
    }
    return key;
};

/**
 * Appends everything that changes how a block looks, apart from its type, to `parts`.
 * @param {BlockInstance} blockInstance The block to describe.
 * @param {Array<string|number>} parts The array to append to.
 */
const appendInstanceKey = (blockInstance, parts) => {
    parts.push(getTypeKey(blockInstance.typeInfo));
    const inputs = blockInstance.inputs || [];
    parts.push(inputs.length);
    for (let i = 0; i < inputs.length; i++) {
        const value = inputs[i];
        if (value instanceof BlockInstance) {
            appendInstanceKey(value, parts);
        } else if (value && typeof value === 'object' && 'value' in value) {
            // Dropdown values may be passed as `{value, string}` options or as the value itself.
            parts.push(String(value.value));
        } else if (value && typeof value === 'object') {
            parts.push(JSON.stringify(value));
        } else {
            parts.push(String(value));
        }
    }
};

/**
 * Gets a key describing exactly what a preview of a block type will look like.
 * @param {BlockInstance} blockInstance The block to describe.
 * @returns {string} The cache key.
 */
const getPreviewKey = blockInstance => {
    const parts = [themeSignature ?? ''];
    try {
        appendInstanceKey(blockInstance, parts);
    } catch (error) {
        // Anything that can not be described gets its own key, so it is never served stale.
        nextTypeKey++;
        parts.push(`unknown-${nextTypeKey}`);
    }
    return parts.join('\u0001');
};

/**
 * Gets a key describing exactly what a preview of an existing block will look like. Unlike
 * {@link getPreviewKey} this describes the text the block currently reads as, which is all that
 * changes its appearance once the block itself exists.
 * @param {Array<object>} blocks The blocks that go into the preview, the block itself first.
 * @param {string} theme The theme the preview was rendered with.
 * @returns {string} The cache key.
 */
const getWorkspacePreviewKey = (blocks, theme) => {
    const parts = [theme || ''];
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        try {
            parts.push(block.type);
            const inputList = block.inputList || [];
            for (let j = 0; j < inputList.length; j++) {
                const fieldRow = inputList[j].fieldRow || [];
                for (let k = 0; k < fieldRow.length; k++) {
                    const field = fieldRow[k];
                    parts.push(typeof field.getText === 'function' ? String(field.getText()) : '');
                }
            }
        } catch (error) {
            // Anything that can not be described gets its own key, so it is never served stale.
            nextTypeKey++;
            parts.push(`unknown-${nextTypeKey}`);
        }
    }
    return parts.join('\u0001');
};

/**
 * Describes the block colours currently in use. The theme is applied by overwriting
 * `Blockly.Colours` in place, so the values have to be compared instead of the object.
 * @param {*} Blockly The Blockly instance.
 * @returns {string} A signature of the current block colours.
 */
const getThemeSignature = Blockly => {
    const colours = Blockly && Blockly.Colours;
    if (!colours) return '';
    const parts = [];
    for (const name of Object.keys(colours)) {
        const value = colours[name];
        if (value && typeof value === 'object') {
            const keys = Object.keys(value);
            const values = [];
            for (let i = 0; i < keys.length; i++) {
                values.push(value[keys[i]]);
            }
            parts.push(`${name}=${values.join(',')}`);
        } else {
            parts.push(`${name}=${value}`);
        }
    }
    return parts.join(';');
};

/**
 * Drops every cached preview. Called when the block colours change and once the fonts the
 * editor uses have finished loading, as both change how big the rendered blocks are.
 */
const clearPreviewCache = () => {
    previewCache.clear();
};

/**
 * Refreshes {@link themeSignature} and drops the cached previews when the block colours changed
 * since the last render. Called by every entry point so that a cache consumer never serves
 * previews rendered with the previous theme. Inside a batch the signature was already checked
 * when the batch started, and a batch builds many previews.
 * @param {*} Blockly The Blockly instance.
 */
const refreshPreviewTheme = Blockly => {
    if (batchDepth > 0) return;
    const signature = getThemeSignature(Blockly);
    if (signature !== themeSignature) {
        themeSignature = signature;
        clearPreviewCache();
    }
};

/**
 * Suspends the workspace resize for a batch of previews and re-measures it once at the end.
 * Creating or disposing a block normally makes ScratchBlocks recompute the bounding box of
 * every top level block in the project, which is much more expensive than the preview itself.
 * This is the same trick the block insert path uses in selectionUtils.js, applied to the whole
 * batch instead of a single block.
 * @param {*} Blockly The Blockly instance.
 * @returns {function(): void} Call once every preview of the batch has been rendered.
 */
const beginPreviewBatch = Blockly => {
    const workspace = Blockly && Blockly.getMainWorkspace && Blockly.getMainWorkspace();
    if (!workspace || typeof workspace.setResizesEnabled !== 'function') {
        return () => {};
    }

    const resume = () => {
        batchDepth--;
        if (batchDepth > 0 || !batchWorkspace) return;
        batchDepth = 0;
        const ended = batchWorkspace;
        batchWorkspace = null;
        ended.setResizesEnabled(true);
    };

    refreshPreviewTheme(Blockly);

    if (batchDepth === 0) {
        batchWorkspace = workspace;
        workspace.setResizesEnabled(false);
    }
    batchDepth++;
    return resume;
};

/**
 * Removes the Blockly block ids from a cloned SVG subtree. Without this the preview could be
 * picked up by code that looks blocks up in the DOM by their id (e.g. the debugger
 * highlighting), even though the block it refers to no longer exists. Selection and drag state
 * is cleared too, so a preview never shows the glow of a block that happens to be selected in
 * the editor.
 * @param {SVGElement} element The cloned element to clean up.
 */
const stripBlockIds = element => {
    if (element.hasAttribute('data-id')) {
        element.removeAttribute('data-id');
    }
    if (element.classList) {
        element.classList.remove('blocklySelected', 'blocklyDragging');
    }
    const dirty = element.querySelectorAll('[data-id], .blocklySelected, .blocklyDragging');
    for (let i = 0; i < dirty.length; i++) {
        dirty[i].removeAttribute('data-id');
        dirty[i].classList.remove('blocklySelected', 'blocklyDragging');
    }
};

/**
 * The input a "define" block keeps its signature in. It is a statement input, but unlike a loop
 * body it reads as part of the define block instead of as a script of its own.
 * @type {string}
 */
const SIGNATURE_INPUT = 'custom_block';

/**
 * Removes the parts of a block's XML that do not belong to the block itself: everything stacked
 * above or below it, the bodies of its loops and conditions, and the blocks plugged into its
 * inputs. What is left is the block as it reads on its own — its dropdowns and its signature
 * intact, every input slot empty.
 *
 * A row stands for one block, so it shows that block rather than whatever expression a user
 * happened to type into it. The filled-in values are still searchable through the value rows the
 * find bar indexes separately, and keeping the preview flat keeps it narrow enough to read.
 * @param {Element} element The block element to trim.
 */
const stripScriptElements = element => {
    for (let i = element.childNodes.length - 1; i >= 0; i--) {
        const child = element.childNodes[i];
        if (!child || child.nodeType !== 1) continue;
        const tag = child.tagName ? child.tagName.toLowerCase() : '';

        if (tag === 'next') {
            element.removeChild(child);
            continue;
        }
        if (tag === 'statement' && child.getAttribute('name') !== SIGNATURE_INPUT) {
            element.removeChild(child);
            continue;
        }
        if (tag === 'value') {
            // The empty slot stays, the block that was plugged into it does not. Shadows are kept
            // so an input the palette fills in still reads the way it does there.
            for (let j = child.childNodes.length - 1; j >= 0; j--) {
                const inner = child.childNodes[j];
                if (inner.nodeType === 1 && inner.tagName &&
                    inner.tagName.toLowerCase() === 'block') {
                    child.removeChild(inner);
                }
            }
            continue;
        }

        stripScriptElements(child);
    }
};

/**
 * True when a block's group already sits inside another block's group of the same list.
 * ScratchBlocks appends a connected block's group into the group of the block it is attached to
 * (see Blockly.BlockSvg.prototype.setParent in scratch-blocks/core/block_svg.js), so a parent and
 * its descendants are not independent things to clone.
 * @param {SVGElement} svgRoot The group to test.
 * @param {Array<object>} blocks The blocks being cloned.
 * @param {object} self The block `svgRoot` belongs to.
 * @returns {boolean} True when cloning `self` would draw it a second time.
 */
const isNestedInOtherBlock = (svgRoot, blocks, self) => {
    for (let i = 0; i < blocks.length; i++) {
        const other = blocks[i];
        if (!other || other === self) continue;
        const otherRoot = typeof other.getSvgRoot === 'function' ? other.getSvgRoot() : null;
        if (otherRoot && otherRoot !== svgRoot &&
            typeof otherRoot.contains === 'function' && otherRoot.contains(svgRoot)) {
            return true;
        }
    }
    return false;
};

/**
 * Clones each of the given blocks into a fresh group inside `container`. Used for the block types
 * the popup previews, which do not exist in the project yet. The caller owns the group until
 * {@link finishPreview} has measured it.
 *
 * Only the outermost blocks of the list are cloned: a connected block is already drawn inside the
 * group of the block it is attached to, so cloning it as well would draw it twice — once in place
 * and once wherever its own, now meaningless, transform happens to put it.
 * @param {Array<object>} blocks The blocks to clone.
 * @param {SVGElement} container The SVG element to render into.
 * @returns {{holder: SVGElement, content: SVGElement}} The unmeasured preview.
 */
const startPreviewClone = (blocks, container) => {
    const holder = container.appendChild(createSvgElement('g'));
    const content = holder.appendChild(createSvgElement('g'));

    let drawn = false;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const svgRoot = block && typeof block.getSvgRoot === 'function' ? block.getSvgRoot() : null;
        if (!svgRoot) continue;
        if (isNestedInOtherBlock(svgRoot, blocks, block)) continue;
        // Only the first of the outermost blocks is drawn. Anything after it is a block that is
        // not part of that one's drawing, so it would land wherever its own transform points and
        // show up as a second block in a row that stands for one. A preview is always built from
        // a single block, so there is nothing to lose by stopping here.
        if (drawn) continue;
        drawn = true;
        const clone = svgRoot.cloneNode(true);
        stripBlockIds(clone);
        content.appendChild(clone);
    }

    return {holder, content};
};

/**
 * Builds a copy of a block with the script around it and the expressions inside its inputs
 * removed, into `container`. The copy is a real block made from the block's own XML, so its
 * outline is drawn for exactly the inputs it ended up with instead of whatever the original
 * happened to carry.
 * @param {*} workspaceBlock The block to copy.
 * @param {SVGElement} container The SVG element to render into.
 * @param {*} Blockly The Blockly instance.
 * @returns {{holder: SVGElement, content: SVGElement}|null} The unmeasured preview.
 */
const startScriptFreeCopy = (workspaceBlock, container, Blockly) => {
    const xml = Blockly.Xml;
    if (!xml || typeof xml.blockToDom !== 'function' || typeof xml.domToBlock !== 'function') {
        return null;
    }
    const workspace = workspaceBlock.workspace;
    if (!workspace) return null;

    let copy = null;
    let draft = null;

    Blockly.Events.disable();
    try {
        const dom = xml.blockToDom(workspaceBlock, true);
        if (!dom) return null;
        stripScriptElements(dom);
        copy = xml.domToBlock(dom, workspace);
        if (!copy) return null;
        if (typeof copy.initSvg === 'function' && !copy.getSvgRoot()) copy.initSvg();
        if (typeof copy.render === 'function') copy.render();
        // The copy holds the block with its inputs emptied out, so cloning it whole is right.
        draft = startPreviewClone([copy], container);
    } catch (error) {
        if (draft) container.removeChild(draft.holder);
        return null;
    } finally {
        if (copy && copy.workspace) copy.dispose(false, false);
        Blockly.Events.enable();
    }

    return draft;
};

/**
 * Measures a cloned preview and moves the block's own origin to (0, 0), so the caller only has to
 * position the group it got back.
 * @param {{holder: SVGElement, content: SVGElement}|null} draft The preview to measure.
 * @param {SVGElement} container The SVG element the preview was rendered into.
 * @returns {{dom: SVGElement, width: number, height: number, top: number, rowHeight: number}|null}
 *   The rendered block, or null if it could not be measured. `width`, `height`, `top` and
 *   `rowHeight` are in unscaled block units.
 */
const finishPreview = (draft, container) => {
    if (!draft) return null;
    const {holder, content} = draft;

    let bounds = null;
    try {
        bounds = holder.getBBox();
    } catch (error) {
        // getBBox throws when the container is not rendered, for example when the popup was
        // closed while the search was still running.
        container.removeChild(holder);
        return null;
    }

    if (!bounds.width || !bounds.height) {
        container.removeChild(holder);
        return null;
    }

    // The caller positions `holder`, so counter the block's own origin here.
    content.setAttribute('transform', `translate(${-bounds.x}, ${-bounds.y})`);

    return {
        dom: holder,
        width: bounds.width,
        height: bounds.height,
        top: BLOCK_ROW_INSET,
        rowHeight: bounds.height + (BLOCK_ROW_INSET * 2)
    };
};

/**
 * Stores a measured preview in the cache, evicting the oldest entry when it is full.
 * @param {string} key The cache key.
 * @param {object} rendered The measured preview.
 */
const cachePreview = (key, rendered) => {
    previewCache.set(key, {
        node: rendered.dom.cloneNode(true),
        width: rendered.width,
        height: rendered.height,
        top: rendered.top,
        rowHeight: rendered.rowHeight
    });
    if (previewCache.size > CACHE_LIMIT) {
        previewCache.delete(previewCache.keys().next().value);
    }
};

/**
 * Clones a cached preview out of the cache, marking it as recently used.
 * @param {string} key The cache key.
 * @param {SVGElement} container The SVG element to render into.
 * @returns {object|null} The rendered block, or null when it is not cached.
 */
const takeCachedPreview = (key, container) => {
    const cached = previewCache.get(key);
    if (!cached) return null;
    // Move the entry to the end of the cache so it is the last one to be evicted.
    previewCache.delete(key);
    previewCache.set(key, cached);
    const node = cached.node.cloneNode(true);
    container.appendChild(node);
    return {
        dom: node,
        width: cached.width,
        height: cached.height,
        top: cached.top,
        rowHeight: cached.rowHeight
    };
};

/**
 * Renders a block type, including everything nested inside it, as real ScratchBlocks SVG.
 * @param {BlockInstance} blockInstance The block to render.
 * @param {SVGElement} container The SVG element to render the block into.
 * @param {*} Blockly The Blockly instance.
 * @returns {object|null} The rendered block, or null if it could not be rendered.
 */
const createPreview = (blockInstance, container, Blockly) => {
    let block = null;
    let draft = null;

    // A preview is not part of the project, so it must never produce workspace events.
    // `createWorkspaceForm` builds the same block that clicking the result would insert.
    Blockly.Events.disable();
    try {
        block = blockInstance.createWorkspaceForm();
        draft = startPreviewClone(block.getDescendants(false), container);
    } catch (error) {
        console.warn(`Spotlight: Could not render a preview of "${blockInstance.typeInfo.id}"`, error);
        if (draft) container.removeChild(draft.holder);
        return null;
    } finally {
        // Takes the block (and its children) back out of the workspace.
        if (block && block.workspace) block.dispose(false, false);
        Blockly.Events.enable();
    }

    return finishPreview(draft, container);
};

/**
 * Renders a block for the popup preview, reusing a cached copy when the same block was already
 * rendered (with the same inputs and the same theme) during an earlier search.
 * @param {BlockInstance} blockInstance The block to render.
 * @param {SVGElement} container The SVG element to render the block into.
 * @param {*} Blockly The Blockly instance.
 * @returns {object|null} The rendered block, or null if it could not be rendered.
 */
const renderPreviewBlock = (blockInstance, container, Blockly) => {
    if (!Blockly || !blockInstance || !blockInstance.typeInfo) return null;

    const key = getPreviewKey(blockInstance);
    const cached = takeCachedPreview(key, container);
    if (cached) return cached;

    const rendered = createPreview(blockInstance, container, Blockly);
    if (!rendered) return null;

    cachePreview(key, rendered);
    return rendered;
};

/**
 * Renders a block that already exists in a workspace, reusing a cached copy when an identical
 * looking block was rendered before. The block is rebuilt from its own XML with the script around
 * it and the expressions plugged into its inputs removed, so a row shows the block itself and
 * nothing that happens to surround it.
 * @param {object} workspaceBlock The Blockly block to render.
 * @param {SVGElement} container The SVG element to render the block into.
 * @param {*} Blockly The Blockly instance.
 * @returns {object|null} The rendered block, or null when the block is not rendered (deferred
 *   scripts), has no size, or the container is not visible.
 */
const renderWorkspaceBlockPreview = (workspaceBlock, container, Blockly) => {
    if (!Blockly || !workspaceBlock || !container || typeof container.appendChild !== 'function') {
        return null;
    }
    // Blocks the workspace has not rendered yet (virtualized scripts) have no SVG to clone.
    if (typeof workspaceBlock.getSvgRoot !== 'function' || !workspaceBlock.getSvgRoot()) return null;

    refreshPreviewTheme(Blockly);

    // The preview is always rebuilt from the block's own XML instead of cloned out of the editor,
    // for two reasons. A loop or condition outline is drawn around the body it had, so a clone
    // with the body removed would leave an empty shape the size of the original script. And a
    // clone brings along the expressions plugged into the block's inputs, which a row that stands
    // for a single block should not show. Only the block's own fields decide how it looks, so
    // only those go into the cache key.
    const key = getWorkspacePreviewKey([workspaceBlock], themeSignature);

    const cached = takeCachedPreview(key, container);
    if (cached) return cached;

    const draft = startScriptFreeCopy(workspaceBlock, container, Blockly);
    const rendered = finishPreview(draft, container);
    if (!rendered) return null;

    cachePreview(key, rendered);
    return rendered;
};

if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    // Block previews are sized from measured text, so anything rendered before the editor
    // fonts are ready is not trustworthy.
    document.fonts.ready.then(clearPreviewCache).catch(() => {});
}

/**
 * Gets a key describing what a preview built from a block's own data will look like.
 * @param {string} blockType The block opcode.
 * @param {object} fields The field values the block carries.
 * @param {string} theme The theme the preview was rendered with.
 * @returns {string} The cache key.
 */
const getBlockTypePreviewKey = (blockType, fields, theme) => {
    const parts = [theme || '', 'type', blockType];
    if (fields && typeof fields === 'object') {
        const names = Object.keys(fields).sort();
        for (let i = 0; i < names.length; i++) {
            const value = fields[names[i]];
            parts.push(names[i]);
            if (value && typeof value === 'object' && 'value' in value) {
                parts.push(String(value.value));
            } else {
                parts.push(String(value));
            }
        }
    }
    return parts.join('\u0001');
};

/**
 * Writes field values onto a freshly created block. Values are given either bare or as the
 * `{value, id}` records the VM stores blocks in, and a field that refuses its value keeps its
 * default rather than costing the whole preview.
 * @param {*} block The block to fill in.
 * @param {object} fields The field values, keyed by field name.
 */
const applyFieldValues = (block, fields) => {
    if (!block || !fields || typeof fields !== 'object') return;
    const names = Object.keys(fields);
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const field = fields[name];
        if (field === null || typeof field === 'undefined') continue;

        let value = field;
        if (typeof field === 'object') {
            value = 'value' in field ? field.value : field.name;
        }
        if (value === null || typeof value === 'undefined') continue;

        try {
            block.setFieldValue(String(value), name);
        } catch (error) {
            // Unknown field, or a value the field does not accept; keep the default.
        }
    }
};

/**
 * Renders a block type without needing an instance of it in the workspace. This covers the rows
 * that have no block to clone: scripts the editor has unloaded because they are off screen, and
 * entries that stand for a variable or a list rather than for one block in a script.
 *
 * The block is created through the same path the toolbox uses, so the preview matches what the
 * palette shows, and it is disposed again as soon as its SVG has been cloned.
 * @param {string} blockType The block opcode to render.
 * @param {object} fields Field values to write onto the block, keyed by field name.
 * @param {SVGElement} container The SVG element to render the block into.
 * @param {*} Blockly The Blockly instance.
 * @returns {object|null} The rendered block, or null when the type can not be rendered.
 */
const renderBlockTypePreview = (blockType, fields, container, Blockly) => {
    if (!Blockly || !blockType || !container || typeof container.appendChild !== 'function') {
        return null;
    }
    if (typeof blockType !== 'string') return null;
    if (!Blockly.Blocks || !Object.prototype.hasOwnProperty.call(Blockly.Blocks, blockType)) {
        return null;
    }

    const workspace = Blockly.getMainWorkspace && Blockly.getMainWorkspace();
    if (!workspace || typeof workspace.newBlock !== 'function') return null;

    refreshPreviewTheme(Blockly);

    const key = getBlockTypePreviewKey(blockType, fields, themeSignature);
    const cached = takeCachedPreview(key, container);
    if (cached) return cached;

    let block = null;
    let draft = null;

    // Building a preview must never reach the project or its undo history.
    Blockly.Events.disable();
    try {
        block = workspace.newBlock(blockType);
        applyFieldValues(block, fields);
        if (typeof block.initSvg === 'function') block.initSvg();
        if (typeof block.render === 'function') block.render();
        // A block created this way only ever carries its own inputs, never a script, so every
        // descendant belongs to the preview.
        const parts = typeof block.getDescendants === 'function' ? block.getDescendants(false) : [block];
        draft = startPreviewClone(parts, container);
    } catch (error) {
        if (draft) container.removeChild(draft.holder);
        return null;
    } finally {
        if (block && block.workspace) block.dispose(false, false);
        Blockly.Events.enable();
    }

    const rendered = finishPreview(draft, container);
    if (!rendered) return null;

    cachePreview(key, rendered);
    return rendered;
};

export {
    renderPreviewBlock,
    renderWorkspaceBlockPreview,
    renderBlockTypePreview,
    beginPreviewBatch,
    clearPreviewCache,
    BLOCK_ROW_INSET
};
