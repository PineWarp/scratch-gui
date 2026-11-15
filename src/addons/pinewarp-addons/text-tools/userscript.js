/*
 * PineWarp addon: project text tools.
 *
 * A single dialog that can:
 *  - list every piece of text stored in block fields (messages, questions,
 *    numbers, ...) across the whole project,
 *  - search that text,
 *  - replace it everywhere at once (with a one click undo),
 *  - export the result as a CSV file for proofreading or translation.
 */

import Utils from '../../../lib/find-bar/Utils.js';
import downloadBlob from '../../../lib/utils/download-blob.js';
import {updateCallbacks} from '../../../lib/shortcuts/event-router.js';

const NUMBER_FIELDS = new Set([
    'NUM',
    'SECS',
    'CHANGE',
    'ITEM',
    'INDEX',
    'DURATION',
    'WIDTH',
    'HEIGHT',
    'STEPS',
    'DEGREES',
    'TIMES',
    'DISTANCE',
    'RADIUS',
    'AMOUNT',
    'COUNT',
    'SECONDS'
]);

const TEXT_FIELDS = new Set([
    'TEXT',
    'STRING',
    'VALUE',
    'OPERAND',
    'OPERAND1',
    'OPERAND2',
    'FROM',
    'MESSAGE',
    'QUESTION'
]);

const SVG_ICON = `
<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M10.5 3a7.5 7.5 0 0 1 5.94 12.08l4.24 4.24-1.41 1.41-4.24-4.24A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"/>
    <path fill="currentColor" d="M9.3 7.6h1.5v2.2h2.1V7.6h1.5v5.9h-1.5v-2.3H10.8v2.3H9.3z"/>
</svg>`;

const createElement = (tagName, className, text) => {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    if (typeof text === 'string') {
        element.textContent = text;
    }
    return element;
};

const escapeCSVValue = value => `"${String(value).replace(/"/g, '""')}"`;

export default async function ({addon, console, msg}) {
    const getVM = () => addon.tab.traps.vm;

    const maxRows = () => {
        const configured = Number(addon.settings.get('maxResults'));
        return Number.isFinite(configured) && configured > 0 ? configured : 1000;
    };

    const state = {
        query: '',
        replacement: '',
        searchAllSprites: Boolean(addon.settings.get('searchAllSprites')),
        caseSensitive: Boolean(addon.settings.get('caseSensitive')),
        wholeField: false,
        entries: [],
        matches: [],
        lastBatch: null,
        lastBatchLabel: '',
        vmIdentity: null
    };

    // ---------------------------------------------------------------- scanning

    const fieldLabel = fieldName => {
        if (fieldName === 'MESSAGE') return msg('field-message');
        if (fieldName === 'QUESTION') return msg('field-question');
        if (NUMBER_FIELDS.has(fieldName)) return msg('field-number');
        if (TEXT_FIELDS.has(fieldName)) return msg('field-text');
        return fieldName;
    };

    const getVmIdentity = () => {
        const vm = getVM();
        if (!vm || !vm.runtime) return null;
        const editingTarget = vm.runtime.getEditingTarget();
        return {
            vm,
            // Object identity also catches fresh VM instances even when the
            // project has no visible text fields.
            runtime: vm.runtime,
            editingTarget,
            projectId: vm.runtime.projectId
        };
    };

    const collectEntries = () => {
        const vm = getVM();
        if (!vm || !vm.runtime) return [];

        const editingTarget = vm.runtime.getEditingTarget();
        const editingId = editingTarget ? editingTarget.id : null;
        const targets = vm.runtime.targets.filter(target => target && target.isOriginal !== false);
        const entries = [];

        for (const target of targets) {
            if (!state.searchAllSprites && target.id !== editingId) continue;
            const blocks = target.blocks && target.blocks._blocks;
            if (!blocks) continue;

            let targetName;
            try {
                targetName = target.getName();
            } catch (error) {
                targetName = target.sprite && target.sprite.name ? target.sprite.name : '';
            }

            for (const blockId of Object.keys(blocks)) {
                const block = blocks[blockId];
                if (!block || !block.fields) continue;
                for (const fieldName of Object.keys(block.fields)) {
                    const field = block.fields[fieldName];
                    // Only literal text fields are editable here. Anything with
                    // an id is a variable/list/broadcast reference, and the
                    // dropdown menu fields below would break the project if
                    // their values changed without also changing field ids.
                    if (!field || typeof field.value !== 'string') continue;
                    if (field.id) continue;
                    if (!TEXT_FIELDS.has(fieldName)) continue;
                    if (field.value === '') continue;
                    entries.push({
                        targetId: target.id,
                        targetName,
                        blockId,
                        opcode: block.opcode,
                        fieldName,
                        value: field.value
                    });
                }
            }
        }
        return entries;
    };

    // ---------------------------------------------------------------- matching

    const findMatch = value => {
        if (!state.query) return null;
        if (state.wholeField) {
            const equal = state.caseSensitive ?
                value === state.query :
                value.toLowerCase() === state.query.toLowerCase();
            return equal ? {index: 0, length: value.length} : null;
        }
        const haystack = state.caseSensitive ? value : value.toLowerCase();
        const needle = state.caseSensitive ? state.query : state.query.toLowerCase();
        const index = haystack.indexOf(needle);
        return index === -1 ? null : {index, length: needle.length};
    };

    const buildReplacement = value => {
        if (!state.query) return value;
        if (state.wholeField) return state.replacement;
        if (state.caseSensitive) return value.split(state.query).join(state.replacement);

        const haystack = value.toLowerCase();
        const needle = state.query.toLowerCase();
        let result = '';
        let cursor = 0;
        for (;;) {
            const index = haystack.indexOf(needle, cursor);
            if (index === -1) {
                result += value.slice(cursor);
                break;
            }
            result += value.slice(cursor, index) + state.replacement;
            cursor = index + needle.length;
        }
        return result;
    };

    // ---------------------------------------------------------------------- UI

    const root = createElement('div', 'pw-tt');
    root.dir = addon.tab.direction;

    const toolbar = createElement('div', 'pw-tt-toolbar');

    const searchInput = createElement('input', 'pw-tt-input pw-tt-search');
    searchInput.type = 'text';
    searchInput.spellcheck = false;
    searchInput.placeholder = msg('search-placeholder');
    searchInput.setAttribute('aria-label', msg('search-placeholder'));

    const replaceInput = createElement('input', 'pw-tt-input pw-tt-replace');
    replaceInput.type = 'text';
    replaceInput.spellcheck = false;
    replaceInput.placeholder = msg('replace-placeholder');
    replaceInput.setAttribute('aria-label', msg('replace-placeholder'));

    const replaceButton = createElement(
        'button',
        `pw-tt-button-primary ${addon.tab.scratchClass('prompt_ok-button')}`,
        msg('replace-all')
    );
    replaceButton.type = 'button';

    toolbar.append(searchInput, replaceInput, replaceButton);

    const options = createElement('div', 'pw-tt-options');
    const makeOption = (labelText, checked, onChange) => {
        const label = createElement('label', 'pw-tt-option');
        const input = createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        label.append(input, createElement('span', null, labelText));
        options.appendChild(label);
        return input;
    };

    makeOption(msg('option-all-sprites'), state.searchAllSprites, checked => {
        state.searchAllSprites = checked;
        refresh();
    });
    makeOption(msg('option-case-sensitive'), state.caseSensitive, checked => {
        state.caseSensitive = checked;
        refresh();
    });
    makeOption(msg('option-whole-field'), state.wholeField, checked => {
        state.wholeField = checked;
        refresh();
    });

    const summary = createElement('div', 'pw-tt-summary');

    const results = createElement('div', 'pw-tt-results');
    results.setAttribute('role', 'list');

    const footer = createElement('div', 'pw-tt-footer');
    const status = createElement('div', 'pw-tt-status');

    const undoButton = createElement('button', 'pw-tt-button-secondary', msg('undo'));
    undoButton.type = 'button';
    undoButton.hidden = true;

    const exportButton = createElement('button', 'pw-tt-button-secondary', msg('export-csv'));
    exportButton.type = 'button';

    footer.append(status, undoButton, exportButton);

    root.append(toolbar, options, summary, results, footer);

    // A self-contained overlay: addon.tab.createModal() depends on editor CSS
    // modules that are only loaded once a native modal has been opened, which
    // would leave this dialog unstyled and behind the editor.
    const overlay = createElement('div', 'pw-tt-overlay');
    overlay.dir = addon.tab.direction;
    overlay.style.display = 'none';

    const dialog = createElement('div', 'pw-tt-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', msg('title'));

    const header = createElement('div', 'pw-tt-header');
    header.appendChild(createElement('span', 'pw-tt-title', msg('title')));

    const closeButton = createElement('button', 'pw-tt-close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', msg('close'));
    closeButton.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">' +
        '<path fill="currentColor" d="M5.3 4.3 10 9l4.7-4.7 1.4 1.4-4.7 4.7 4.7 4.7-1.4 1.4L10 11.8l-4.7 4.7-1.4-1.4 4.7-4.7z"/></svg>';
    header.appendChild(closeButton);

    dialog.append(header, root);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const isModalOpen = () => overlay.style.display !== 'none';
    const closeModal = () => {
        overlay.style.display = 'none';
    };

    const setStatus = text => {
        status.textContent = text || '';
    };

    const appendHighlightedText = (container, text, match) => {
        if (!match) {
            container.textContent = text;
            return;
        }
        const before = text.slice(0, match.index);
        const hit = text.slice(match.index, match.index + match.length);
        const after = text.slice(match.index + match.length);
        if (before) container.appendChild(document.createTextNode(before));
        const mark = createElement('mark', 'pw-tt-mark', hit);
        container.appendChild(mark);
        if (after) container.appendChild(document.createTextNode(after));
    };

    const createRow = entry => {
        const match = findMatch(entry.value);
        const row = createElement('button', 'pw-tt-row');
        row.type = 'button';
        row.setAttribute('role', 'listitem');
        row.title = msg('jump-tooltip');

        row.appendChild(createElement('span', 'pw-tt-sprite', entry.targetName));
        row.appendChild(createElement('span', 'pw-tt-field', fieldLabel(entry.fieldName)));

        const value = createElement('span', 'pw-tt-value');
        appendHighlightedText(value, entry.value, match);
        row.appendChild(value);

        if (state.query) {
            const replaced = buildReplacement(entry.value);
            if (replaced !== entry.value) {
                const preview = createElement('span', 'pw-tt-preview');
                preview.appendChild(createElement('span', 'pw-tt-arrow', '→'));
                const previewValue = createElement('span', 'pw-tt-value pw-tt-value-new');
                previewValue.textContent = replaced || msg('empty-value');
                if (!replaced) previewValue.classList.add('pw-tt-value-empty');
                preview.appendChild(previewValue);
                row.appendChild(preview);
            }
        }

        row.addEventListener('click', () => {
            jumpTo(entry);
        });

        return row;
    };

    const renderResults = () => {
        const visible = state.matches.slice(0, maxRows());
        results.textContent = '';

        if (visible.length === 0) {
            const empty = createElement('div', 'pw-tt-empty');
            empty.textContent = state.query ? msg('no-results') : msg('no-text');
            results.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const entry of visible) {
            fragment.appendChild(createRow(entry));
        }
        results.appendChild(fragment);
    };

    const renderSummary = () => {
        const total = state.matches.length;
        const sprites = new Set(state.matches.map(entry => entry.targetId)).size;
        const shown = Math.min(total, maxRows());

        if (!state.query) {
            summary.textContent = msg('summary-all', {count: total, sprites});
        } else if (total === 0) {
            summary.textContent = msg('summary-none');
        } else {
            summary.textContent = msg('summary-matches', {count: total, sprites});
        }
        if (total > shown) {
            summary.textContent += ` ${msg('summary-truncated', {shown})}`;
        }

        replaceButton.disabled = total === 0 || !state.query;
        undoButton.hidden = !state.lastBatch;
    };

    const refresh = () => {
        state.entries = collectEntries();
        if (!state.query) {
            state.matches = state.entries.slice();
        } else {
            state.matches = state.entries.filter(entry => findMatch(entry.value));
        }
        renderSummary();
        renderResults();
    };

    // ------------------------------------------------------------- navigation

    const jumpTo = async entry => {
        closeModal();
        const vm = getVM();
        if (!vm || !vm.runtime) return;
        try {
            const Blockly = await addon.tab.traps.getBlockly();
            const editingTarget = vm.runtime.getEditingTarget();
            if (editingTarget && editingTarget.id !== entry.targetId) {
                vm.setEditingTarget(entry.targetId);
            }
            addon.tab.redux.dispatch({
                type: 'scratch-gui/navigation/ACTIVATE_TAB',
                activeTabIndex: 0
            });
            setTimeout(() => {
                try {
                    new Utils(vm, Blockly).scrollBlockIntoView(entry.blockId);
                } catch (error) {
                    console.warn('[text-tools] could not scroll to block', error);
                }
            }, 150);
        } catch (error) {
            console.warn('[text-tools] could not jump to block', error);
        }
    };

    // -------------------------------------------------------------- replacing

    const writeFieldValue = (target, item, newValue, expectedValue, workspace, editingTargetId, Blockly) => {
        const block = target.blocks && target.blocks._blocks && target.blocks._blocks[item.blockId];
        if (!block || !block.fields || !block.fields[item.fieldName]) return false;
        const field = block.fields[item.fieldName];

        // The field must still hold the value this batch expects:
        // - replace expects the originally searched value,
        // - undo expects the value the replacement produced.
        // This keeps later user edits safe from being clobbered.
        if (typeof expectedValue === 'string' && field.value !== expectedValue) return false;

        field.value = newValue;

        if (workspace && editingTargetId === target.id) {
            const blocklyBlock = workspace.getBlockById(item.blockId);
            if (blocklyBlock && typeof blocklyBlock.setFieldValue === 'function') {
                try {
                    // Keep Blockly's own undo/redo stack out of this bulk update;
                    // the addon provides its own one-step undo instead.
                    if (Blockly && Blockly.Events) Blockly.Events.disable();
                    blocklyBlock.setFieldValue(newValue, item.fieldName);
                } catch (error) {
                    console.warn('[text-tools] could not update rendered block', error);
                } finally {
                    if (Blockly && Blockly.Events) Blockly.Events.enable();
                }
            }
        }
        return true;
    };

    const applyBatch = async (batch, direction) => {
        const vm = getVM();
        if (!vm || !vm.runtime) return 0;

        let workspace = null;
        let editingTargetId = null;
        let Blockly = null;
        try {
            Blockly = await addon.tab.traps.getBlockly();
            workspace = Blockly.getMainWorkspace();
            const editingTarget = vm.runtime.getEditingTarget();
            editingTargetId = editingTarget ? editingTarget.id : null;
        } catch (error) {
            workspace = null;
        }

        const touched = new Set();
        let changed = 0;
        for (const item of batch) {
            const target = vm.runtime.targets.find(candidate => candidate.id === item.targetId);
            if (!target) continue;
            const newValue = direction === 'undo' ? item.oldValue : item.newValue;
            const expectedValue = direction === 'undo' ? item.newValue : item.oldValue;
            const applied = writeFieldValue(
                target, item, newValue, expectedValue, workspace, editingTargetId, Blockly
            );
            if (!applied) continue;
            changed += 1;
            touched.add(target);
        }

        for (const target of touched) {
            if (target.blocks && typeof target.blocks.resetCache === 'function') {
                target.blocks.resetCache();
            }
            if (target.blocks && typeof target.blocks.emitProjectChanged === 'function') {
                target.blocks.emitProjectChanged();
            }
        }
        if (changed > 0) {
            try {
                vm.runtime.requestBlocksUpdate();
            } catch (error) {
                console.warn('[text-tools] could not refresh workspace', error);
            }
        }
        return changed;
    };

    const replaceAll = async () => {
        if (!state.query || state.matches.length === 0) return;

        const vm = getVM();
        if (!vm || !vm.runtime) return;

        const identity = getVmIdentity();
        state.vmIdentity = identity;

        const batch = [];
        for (const entry of state.matches) {
            const newValue = buildReplacement(entry.value);
            if (newValue === entry.value) continue;
            batch.push({
                targetId: entry.targetId,
                blockId: entry.blockId,
                fieldName: entry.fieldName,
                oldValue: entry.value,
                expectedValue: entry.value,
                newValue
            });
        }
        if (batch.length === 0) {
            setStatus(msg('nothing-to-replace'));
            return;
        }

        const changed = await applyBatch(batch, 'replace');
        state.lastBatch = batch;
        state.lastBatchLabel = msg('replaced', {count: changed});

        refresh();
        setStatus(state.lastBatchLabel);
        undoButton.hidden = false;
    };

    const undoLast = async () => {
        if (!state.lastBatch) return;
        const changed = await applyBatch(state.lastBatch, 'undo');
        state.lastBatch = null;
        refresh();
        setStatus(msg('undone', {count: changed}));
        undoButton.hidden = true;
    };

    // ---------------------------------------------------------------- exporting

    const startsCsvFormula = value => /^[=+\-@\t\r]/.test(value);

    const csvSafeValue = value => {
        // Prevent spreadsheet applications from interpreting exported values
        // as formulas or commands.
        return startsCsvFormula(value) ? `'${value}` : value;
    };

    const exportCSV = () => {
        const rows = state.matches.length > 0 ? state.matches : state.entries;
        if (rows.length === 0) {
            setStatus(msg('nothing-to-export'));
            return;
        }

        const header = [msg('csv-sprite'), msg('csv-block'), msg('csv-field'), msg('csv-text')];
        if (state.query) header.push(msg('csv-replacement'));

        const lines = [header.map(escapeCSVValue).join(',')];
        for (const entry of rows) {
            const values = [
                csvSafeValue(entry.targetName),
                csvSafeValue(entry.opcode),
                fieldLabel(entry.fieldName),
                csvSafeValue(entry.value)
            ];
            if (state.query) values.push(csvSafeValue(buildReplacement(entry.value)));
            lines.push(values.map(escapeCSVValue).join(','));
        }

        const csv = `\ufeff${lines.join('\r\n')}`;
        const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
        const stamp = new Date().toISOString().slice(0, 10);
        downloadBlob(`pinewarp-project-text-${stamp}.csv`, blob);
        setStatus(msg('exported', {count: rows.length}));
    };

    // -------------------------------------------------------------- modal glue

    let refreshTimer = null;
    const scheduleRefresh = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refresh, 120);
    };

    searchInput.addEventListener('input', () => {
        state.query = searchInput.value;
        scheduleRefresh();
    });
    replaceInput.addEventListener('input', () => {
        state.replacement = replaceInput.value;
        scheduleRefresh();
    });
    searchInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            replaceInput.focus();
        }
    });
    replaceInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            replaceAll();
        }
    });
    replaceButton.addEventListener('click', replaceAll);
    undoButton.addEventListener('click', undoLast);
    exportButton.addEventListener('click', exportCSV);

    const openModal = () => {
        const identity = getVmIdentity();
        // A new project was loaded since the last undo point; restoring old
        // values into it would corrupt the new project.
        if (identity && state.vmIdentity && (
            identity.vm !== state.vmIdentity.vm ||
            identity.runtime !== state.vmIdentity.runtime ||
            identity.projectId !== state.vmIdentity.projectId
        )) {
            state.lastBatch = null;
            state.lastBatchLabel = '';
            undoButton.hidden = true;
        }
        state.vmIdentity = identity;
        // Pick up the current sprite / project state every time the dialog opens.
        setStatus('');
        refresh();
        overlay.style.display = 'flex';
        setTimeout(() => searchInput.focus(), 30);
    };

    closeButton.addEventListener('click', closeModal);
    overlay.addEventListener('mousedown', event => {
        if (event.target === overlay) closeModal();
    });

    // ---------------------------------------------------------------- entry UI

    const openButton = createElement('button', 'pw-tt-open-button');
    openButton.type = 'button';
    openButton.title = msg('open-tooltip');
    openButton.setAttribute('aria-label', msg('open-tooltip'));
    openButton.innerHTML = SVG_ICON;
    openButton.addEventListener('click', () => openModal());

    let attachAttempts = 0;
    const attachButton = () => {
        const placed = addon.tab.appendToSharedSpace({
            space: 'stageHeader',
            element: openButton,
            order: 0
        });
        if (!placed && attachAttempts < 60) {
            attachAttempts += 1;
            setTimeout(attachButton, 500);
        }
    };
    attachButton();

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isModalOpen()) {
            event.stopPropagation();
            closeModal();
        }
    });

    // Also make it reachable from the keyboard / shortcut manager.
    try {
        updateCallbacks({openTextTools: () => openModal()});
    } catch (error) {
        console.warn('[text-tools] could not register shortcut callback', error);
    }
}
