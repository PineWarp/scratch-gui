import JSZip from '@turbowarp/jszip';
import PropTypes from 'prop-types';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import {
    ChevronDown,
    ChevronRight,
    Download,
    FileCode,
    FileQuestion,
    Folder,
    FolderOpen,
    Image,
    Music,
    RefreshCw,
    Trash2,
    Type,
    Upload
} from 'lucide-react';

import Modal from '../../containers/windowed-modal.jsx';
import {costumeUpload, soundUpload} from '../../lib/file-uploader.js';
import downloadBlob from '../../lib/utils/download-blob.js';

import styles from './project-assets-manager.css';

const messages = defineMessages({
    title: {
        id: 'mw.projectAssets.title',
        defaultMessage: 'Project Assets Manager'
    },
    costumes: {
        id: 'mw.projectAssets.costumes',
        defaultMessage: 'Costumes'
    },
    sounds: {
        id: 'mw.projectAssets.sounds',
        defaultMessage: 'Sounds'
    },
    extensions: {
        id: 'mw.projectAssets.extensions',
        defaultMessage: 'Extensions'
    },
    stage: {
        // 复用编辑器已有的「舞台」词条
        id: 'gui.stageSelector.stage',
        defaultMessage: 'Stage'
    },
    untitled: {
        id: 'mw.projectAssets.untitled',
        defaultMessage: 'Untitled project'
    },
    fileCount: {
        id: 'mw.projectAssets.fileCount',
        defaultMessage: '{count, plural, one {# file} other {# files}}'
    },
    selectedCount: {
        id: 'mw.projectAssets.selectedCount',
        defaultMessage: '{count, plural, one {# file selected} other {# files selected}}'
    },
    downloadSelected: {
        id: 'mw.projectAssets.downloadSelected',
        defaultMessage: 'Download selected'
    },
    downloadAll: {
        id: 'mw.projectAssets.downloadAll',
        defaultMessage: 'Download all'
    },
    deleteSelected: {
        id: 'mw.projectAssets.deleteSelected',
        defaultMessage: 'Delete selected'
    },
    confirmDelete: {
        id: 'mw.projectAssets.confirmDelete',
        defaultMessage: 'Delete {count, plural, one {# selected asset} other {# selected assets}}? ' +
            'This cannot be undone.'
    },
    deleteFailed: {
        id: 'mw.projectAssets.deleteFailed',
        defaultMessage: 'Could not delete {count, plural, one {# asset} other {# assets}}. ' +
            'The stage and each sprite must keep at least one costume.'
    },
    expandFolder: {
        id: 'mw.projectAssets.expandFolder',
        defaultMessage: 'Expand {name}'
    },
    collapseFolder: {
        id: 'mw.projectAssets.collapseFolder',
        defaultMessage: 'Collapse {name}'
    },
    selectFolder: {
        id: 'mw.projectAssets.selectFolder',
        defaultMessage: 'Select every file in {name}'
    },
    refresh: {
        id: 'mw.projectAssets.refresh',
        defaultMessage: 'Refresh'
    },
    empty: {
        id: 'mw.projectAssets.empty',
        defaultMessage: 'This project has no assets to export.'
    },
    busy: {
        id: 'mw.projectAssets.busy',
        defaultMessage: 'Preparing download…'
    },
    fonts: {
        id: 'mw.projectAssets.fonts',
        defaultMessage: 'Fonts'
    },
    importCostumes: {
        id: 'mw.projectAssets.importCostumes',
        defaultMessage: 'Import costumes into {name}'
    },
    importSounds: {
        id: 'mw.projectAssets.importSounds',
        defaultMessage: 'Import sounds into {name}'
    },
    importing: {
        id: 'mw.projectAssets.importing',
        defaultMessage: 'Importing assets…'
    },
    importFailed: {
        id: 'mw.projectAssets.importFailed',
        defaultMessage: 'Failed to import assets: {message}'
    },
    error: {
        id: 'mw.projectAssets.error',
        defaultMessage: 'Failed to read assets: {message}'
    }
});

const MIME_TYPES = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    js: 'text/javascript',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2'
};

// 文件名里不能出现的字符（Windows / macOS / Linux 取并集）+ 控制字符 + 结尾的点和空格
const toSafeFileName = name => {
    const safe = String(name)
        .replace(/[\\/:*?"<>|]/g, '_')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[. ]+$/, '')
        .trim();
    return safe || 'asset';
};

const toUniqueFileName = (fileName, used) => {
    if (!used.has(fileName)) {
        used.add(fileName);
        return fileName;
    }
    const dot = fileName.lastIndexOf('.');
    const base = dot === -1 ? fileName : fileName.slice(0, dot);
    const extension = dot === -1 ? '' : fileName.slice(dot);
    let index = 2;
    while (used.has(`${base} (${index})${extension}`)) {
        index += 1;
    }
    const unique = `${base} (${index})${extension}`;
    used.add(unique);
    return unique;
};

const readFileAsArrayBuffer = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
});

const stripFileExtension = name => String(name).replace(/\.[^.]+$/, '') || 'asset';

// 自定义扩展可能是 data URL 或远程地址，只在真正下载时才读取源码
const loadExtensionSource = async url => {
    if (/^data:/i.test(url)) {
        const comma = url.indexOf(',');
        if (comma === -1) throw new Error('Invalid data URL');
        const header = url.slice(5, comma);
        const payload = url.slice(comma + 1);
        if (header.includes(';base64')) {
            const binary = atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index++) {
                bytes[index] = binary.charCodeAt(index);
            }
            return new TextDecoder().decode(bytes);
        }
        return decodeURIComponent(payload);
    }
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.text();
};

const buildAssetTree = (vm, projectTitle, intl) => {
    const stageLabel = intl.formatMessage(messages.stage);
    const trimmedTitle = String(projectTitle || '').trim();
    const rootName = `${toSafeFileName(trimmedTitle || intl.formatMessage(messages.untitled))}.sb3`;

    const targets = ((vm && vm.runtime && vm.runtime.targets) || [])
        .filter(target => target && target.sprite && target.isOriginal !== false);
    const stage = targets.find(target => target.isStage);
    const orderedTargets = stage ? [stage, ...targets.filter(target => !target.isStage)] : targets;

    const makeTargetFolder = (target, category) => {
        const isSound = category === 'sounds';
        const items = (isSound ?
            (target.getSounds && target.getSounds()) :
            (target.getCostumes && target.getCostumes())) || [];
        const usedNames = new Set();
        const children = items.map((item, index) => {
            const asset = item.asset;
            const dataFormat = (asset && asset.dataFormat) || (isSound ? 'wav' : 'png');
            const name = toUniqueFileName(
                `${toSafeFileName(item.name || (isSound ? 'sound' : 'costume'))}.${dataFormat}`,
                usedNames
            );
            return {
                id: `${category}:${target.id}:${index}`,
                kind: 'file',
                name,
                fileType: isSound ? 'audio' : 'image',
                mime: MIME_TYPES[dataFormat.toLowerCase()] || 'application/octet-stream',
                targetId: target.id,
                category,
                item,
                index,
                deletable: true,
                getData: isSound ?
                    () => asset.data :
                    () => vm.getExportedCostume(item)
            };
        });
        return {
            id: `${category}-target:${target.id}`,
            kind: 'folder',
            name: target.isStage ? stageLabel : toSafeFileName(target.getName()),
            targetId: target.id,
            category,
            importable: true,
            children
        };
    };

    const costumesFolder = {
        id: 'costumes',
        kind: 'folder',
        name: intl.formatMessage(messages.costumes),
        children: orderedTargets.map(target => makeTargetFolder(target, 'costumes'))
    };
    const soundsFolder = {
        id: 'sounds',
        kind: 'folder',
        name: intl.formatMessage(messages.sounds),
        children: orderedTargets.map(target => makeTargetFolder(target, 'sounds'))
    };

    const extensionURLs = (vm && vm.extensionManager && typeof vm.extensionManager.getExtensionURLs === 'function') ?
        vm.extensionManager.getExtensionURLs() : {};
    const usedExtensionNames = new Set();
    const extensionChildren = Object.keys(extensionURLs)
        .sort((a, b) => a.localeCompare(b))
        .map(extensionId => {
            const url = extensionURLs[extensionId];
            return {
                id: `extension:${extensionId}`,
                kind: 'file',
                name: toUniqueFileName(`${toSafeFileName(extensionId)}.js`, usedExtensionNames),
                fileType: 'code',
                mime: MIME_TYPES.js,
                getData: () => loadExtensionSource(url)
            };
        });
    const extensionsFolder = {
        id: 'extensions',
        kind: 'folder',
        name: intl.formatMessage(messages.extensions),
        children: extensionChildren
    };

    const fontsFolder = (() => {
        const fontManager = vm && vm.runtime && vm.runtime.fontManager;
        if (!fontManager || typeof fontManager.getFonts !== 'function') return null;
        const customFonts = fontManager.getFonts().filter(font => !font.system && font.data);
        if (!customFonts.length) return null;
        const usedFontNames = new Set();
        return {
            id: 'fonts',
            kind: 'folder',
            name: intl.formatMessage(messages.fonts),
            children: customFonts.map((font, index) => {
                const format = String(font.format || 'ttf').toLowerCase();
                return {
                    id: `fonts:${index}`,
                    kind: 'file',
                    name: toUniqueFileName(
                        `${toSafeFileName(font.name || 'font')}.${format}`,
                        usedFontNames
                    ),
                    fileType: 'font',
                    mime: MIME_TYPES[format] || 'application/octet-stream',
                    getData: () => font.data
                };
            })
        };
    })();

    return {
        id: 'root',
        kind: 'folder',
        name: rootName,
        children: fontsFolder ?
            [costumesFolder, soundsFolder, extensionsFolder, fontsFolder] :
            [costumesFolder, soundsFolder, extensionsFolder]
    };
};

// 收集一个节点下所有文件；path 以该节点为起点，用于 zip 内的目录结构
const collectFiles = (node, prefix = '') => {
    if (node.kind === 'file') {
        return [{file: node, path: prefix ? `${prefix}/${node.name}` : node.name}];
    }
    // 根节点自身不进入 zip 路径
    const nextPrefix = node.id === 'root' ? prefix : (prefix ? `${prefix}/${node.name}` : node.name);
    return node.children.flatMap(child => collectFiles(child, nextPrefix));
};

const countFiles = node => (node.kind === 'file' ? 1 : node.children.reduce(
    (total, child) => total + countFiles(child), 0
));

const FileTypeIcon = ({fileType}) => {
    if (fileType === 'image') return <Image className={styles.fileIcon} size={16} />;
    if (fileType === 'audio') return <Music className={styles.fileIcon} size={16} />;
    if (fileType === 'font') return <Type className={styles.fileIcon} size={16} />;
    if (fileType === 'code') return <FileCode className={styles.fileIcon} size={16} />;
    return <FileQuestion className={styles.fileIcon} size={16} />;
};

const AssetNode = props => {
    const {
        node, expanded, selected, busy, draggingId, dragOverId,
        onToggleExpand, onToggleFolder, onToggleFile, onImport,
        onDragStartFile, onDragEndFile, onDragOverFile, onDropFile
    } = props;
    const isFolder = node.kind === 'folder';

    if (!isFolder) {
        const rowClassName = [
            styles.fileRow,
            node.id === draggingId ? styles.dragging : '',
            node.id === dragOverId ? styles.dragOver : ''
        ].filter(Boolean).join(' ');
        return (
            <div
                className={rowClassName}
                draggable={Boolean(node.deletable)}
                onDragStart={node.deletable ? event => onDragStartFile(node, event) : null}
                onDragEnd={node.deletable ? onDragEndFile : null}
                onDragOver={node.deletable ? event => onDragOverFile(node, event) : null}
                onDrop={node.deletable ? event => onDropFile(node, event) : null}
            >
                <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selected.has(node.id)}
                    onChange={event => onToggleFile(node, event.target.checked)}
                />
                <FileTypeIcon fileType={node.fileType} />
                <span className={styles.fileName}>{node.name}</span>
            </div>
        );
    }

    const fileIds = collectFiles(node).map(entry => entry.file.id);
    const selectedCount = fileIds.reduce((total, id) => total + (selected.has(id) ? 1 : 0), 0);
    const allSelected = fileIds.length > 0 && selectedCount === fileIds.length;
    const someSelected = selectedCount > 0 && !allSelected;
    const isOpen = expanded.has(node.id);

    return (
        <div className={styles.folder}>
            <div className={styles.folderRow}>
                <button
                    type="button"
                    className={styles.folderToggle}
                    aria-label={props.intl.formatMessage(
                        isOpen ? messages.collapseFolder : messages.expandFolder,
                        {name: node.name}
                    )}
                    onClick={() => onToggleExpand(node.id)}
                >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <input
                    type="checkbox"
                    className={styles.checkbox}
                    aria-label={props.intl.formatMessage(messages.selectFolder, {name: node.name})}
                    checked={allSelected}
                    ref={element => {
                        if (element) element.indeterminate = someSelected;
                    }}
                    onChange={event => onToggleFolder(node, event.target.checked)}
                />
                {isOpen ? (
                    <FolderOpen className={styles.folderIcon} size={16} />
                ) : (
                    <Folder className={styles.folderIcon} size={16} />
                )}
                <span className={styles.folderName}>{node.name}</span>
                <span className={styles.fileCount}>
                    {props.intl.formatMessage(messages.fileCount, {count: fileIds.length})}
                </span>
                {node.importable && (
                    <button
                        type="button"
                        className={styles.rowAction}
                        title={props.intl.formatMessage(
                            node.category === 'sounds' ? messages.importSounds : messages.importCostumes,
                            {name: node.name}
                        )}
                        aria-label={props.intl.formatMessage(
                            node.category === 'sounds' ? messages.importSounds : messages.importCostumes,
                            {name: node.name}
                        )}
                        disabled={busy}
                        onClick={() => onImport(node)}
                    >
                        <Upload
                            size={14}
                        />
                    </button>
                )}
            </div>
            {isOpen && (
                <div className={styles.folderChildren}>
                    {node.children.map(child => (
                        <AssetNode
                            {...props}
                            key={child.id}
                            node={child}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

AssetNode.propTypes = {
    node: PropTypes.shape({
        id: PropTypes.string.isRequired,
        kind: PropTypes.oneOf(['folder', 'file']).isRequired,
        name: PropTypes.string.isRequired,
        fileType: PropTypes.string,
        category: PropTypes.string,
        deletable: PropTypes.bool,
        importable: PropTypes.bool,
        children: PropTypes.array
    }).isRequired,
    busy: PropTypes.bool,
    draggingId: PropTypes.string,
    dragOverId: PropTypes.string,
    expanded: PropTypes.instanceOf(Set).isRequired,
    selected: PropTypes.instanceOf(Set).isRequired,
    intl: intlShape,
    onToggleExpand: PropTypes.func.isRequired,
    onToggleFolder: PropTypes.func.isRequired,
    onToggleFile: PropTypes.func.isRequired,
    onImport: PropTypes.func.isRequired,
    onDragStartFile: PropTypes.func.isRequired,
    onDragEndFile: PropTypes.func.isRequired,
    onDragOverFile: PropTypes.func.isRequired,
    onDropFile: PropTypes.func.isRequired
};

AssetNode.defaultProps = {
    busy: false,
    draggingId: null,
    dragOverId: null
};

const ProjectAssetsManager = props => {
    const {intl, projectTitle, vm} = props;
    const [tree, setTree] = useState(() => buildAssetTree(vm, projectTitle, intl));
    const [expanded, setExpanded] = useState(() => new Set([
        'root', 'costumes', 'sounds', 'extensions', 'fonts'
    ]));
    const [selected, setSelected] = useState(() => new Set());
    const [busy, setBusy] = useState(false);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState('');
    const [draggingId, setDraggingId] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const fileInputRef = useRef(null);
    const importTargetRef = useRef(null);
    const dragFileRef = useRef(null);

    const allFiles = useMemo(() => collectFiles(tree), [tree]);
    const selectedFiles = useMemo(
        () => allFiles.filter(entry => selected.has(entry.file.id)),
        [allFiles, selected]
    );
    const deletableSelectedCount = useMemo(
        () => selectedFiles.reduce((count, entry) => count + (entry.file.deletable ? 1 : 0), 0),
        [selectedFiles]
    );

    const toggleExpand = useCallback(id => {
        setExpanded(current => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const toggleFolder = useCallback((node, checked) => {
        const ids = collectFiles(node).map(entry => entry.file.id);
        setSelected(current => {
            const next = new Set(current);
            for (const id of ids) {
                if (checked) next.add(id);
                else next.delete(id);
            }
            return next;
        });
    }, []);

    const toggleFile = useCallback((node, checked) => {
        setSelected(current => {
            const next = new Set(current);
            if (checked) next.add(node.id);
            else next.delete(node.id);
            return next;
        });
    }, []);

    const runDownload = useCallback(async task => {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            await task();
        } catch (e) {
            console.error('project-assets-manager: download failed', e);
            setError(intl.formatMessage(messages.error, {message: (e && e.message) || String(e)}));
        } finally {
            setBusy(false);
        }
    }, [busy, intl]);

    const downloadFile = file => runDownload(async () => {
        const data = await file.getData();
        const blob = data instanceof Blob ? data : new Blob([data], {type: file.mime});
        downloadBlob(file.name, blob);
    });

    const downloadZip = (entries, zipName) => runDownload(async () => {
        const zip = new JSZip();
        for (const entry of entries) {
            zip.file(entry.path, await entry.file.getData());
        }
        const blob = await zip.generateAsync({type: 'blob'});
        downloadBlob(`${toSafeFileName(zipName)}.zip`, blob);
    });

    const downloadSelection = () => {
        if (!selectedFiles.length) return;
        if (selectedFiles.length === 1) {
            downloadFile(selectedFiles[0].file);
            return;
        }
        downloadZip(selectedFiles, `${tree.name}-selected`);
    };

    const downloadAll = () => {
        const entries = collectFiles(tree);
        if (!entries.length) return;
        downloadZip(entries, tree.name);
    };

    const deleteSelection = () => {
        const entries = selectedFiles.filter(entry => entry.file.deletable);
        if (!entries.length) return;
        const confirmed = window.confirm(
            intl.formatMessage(messages.confirmDelete, {count: entries.length})
        );
        if (!confirmed) return;
        let deleted = 0;
        let failed = 0;
        for (const {file} of entries) {
            const target = vm.runtime.getTargetById(file.targetId);
            if (!target) continue;
            const items = file.category === 'sounds' ? target.getSounds() : target.getCostumes();
            const index = items.indexOf(file.item);
            if (index === -1) continue;
            const result = file.category === 'sounds' ?
                target.deleteSound(index) :
                target.deleteCostume(index);
            if (result) deleted += 1;
            else failed += 1;
        }
        if (deleted) vm.runtime.emitProjectChanged();
        setTree(buildAssetTree(vm, projectTitle, intl));
        setSelected(new Set());
        setError(failed ? intl.formatMessage(messages.deleteFailed, {count: failed}) : '');
    };

    const refresh = () => {
        setTree(buildAssetTree(vm, projectTitle, intl));
        setSelected(new Set());
        setError('');
    };

    const onDragStartFile = (file, event) => {
        dragFileRef.current = file;
        setDraggingId(file.id);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', file.id);
        }
    };

    const onDragEndFile = () => {
        dragFileRef.current = null;
        setDraggingId(null);
        setDragOverId(null);
    };

    const onDragOverFile = (file, event) => {
        const dragged = dragFileRef.current;
        if (!dragged || dragged.id === file.id ||
            dragged.targetId !== file.targetId || dragged.category !== file.category) {
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        if (dragOverId !== file.id) setDragOverId(file.id);
    };

    const onDropFile = (file, event) => {
        event.preventDefault();
        const dragged = dragFileRef.current;
        dragFileRef.current = null;
        setDraggingId(null);
        setDragOverId(null);
        if (!dragged || dragged.id === file.id ||
            dragged.targetId !== file.targetId || dragged.category !== file.category) {
            return;
        }
        const target = vm.runtime.getTargetById(file.targetId);
        if (!target) return;
        const items = file.category === 'sounds' ? target.getSounds() : target.getCostumes();
        const from = items.indexOf(dragged.item);
        const to = items.indexOf(file.item);
        if (from === -1 || to === -1 || from === to) return;
        // 指针落在目标行的上半部分时插到它前面，下半部分时插到它后面
        const rect = event.currentTarget.getBoundingClientRect();
        const insertAfter = event.clientY > rect.top + (rect.height / 2);
        let newIndex = to + (insertAfter ? 1 : 0);
        if (from < newIndex) newIndex -= 1;
        if (newIndex === from) return;
        const moved = file.category === 'sounds' ?
            vm.reorderSound(file.targetId, from, newIndex) :
            vm.reorderCostume(file.targetId, from, newIndex);
        if (moved) {
            vm.runtime.requestTargetsUpdate(target);
            vm.emitTargetsUpdate();
            setTree(buildAssetTree(vm, projectTitle, intl));
            setSelected(new Set());
        }
    };

    const addCostumeFile = (buffer, fileType, name, targetId) => new Promise((resolve, reject) => {
        costumeUpload(buffer, fileType, vm, costumes => {
            const additions = costumes.map((costume, index) => {
                costume.name = `${name}${index ? index + 1 : ''}`;
                return vm.addCostume(costume.md5, costume, targetId);
            });
            Promise.all(additions).then(resolve, reject);
        }, reject);
    });

    const addSoundFile = (buffer, fileType, name, targetId) => new Promise((resolve, reject) => {
        soundUpload(buffer, fileType, vm.runtime.storage, sound => {
            sound.name = name;
            vm.addSound(sound, targetId).then(resolve, reject);
        }, reject);
    });

    const startImport = node => {
        if (busy || !node.importable) return;
        importTargetRef.current = {targetId: node.targetId, category: node.category};
        const input = fileInputRef.current;
        if (!input) return;
        input.value = null;
        input.accept = node.category === 'sounds' ?
            'audio/*,.wav,.mp3,.ogg,.m4a,.aac' :
            'image/svg+xml,.svg,.png,.jpg,.jpeg,.bmp,.gif,.webp';
        input.click();
    };

    const handleImport = async event => {
        const files = Array.from(event.target.files || []);
        event.target.value = null;
        const target = importTargetRef.current;
        if (!files.length || !target) return;
        setBusy(true);
        setImporting(true);
        setError('');
        let failed = 0;
        let lastError = '';
        for (const file of files) {
            try {
                const buffer = await readFileAsArrayBuffer(file);
                const name = stripFileExtension(file.name);
                if (target.category === 'sounds') {
                    await addSoundFile(buffer, file.type, name, target.targetId);
                } else {
                    await addCostumeFile(buffer, file.type, name, target.targetId);
                }
            } catch (e) {
                console.error('project-assets-manager: import failed', e);
                failed += 1;
                lastError = (e && e.message) || String(e);
            }
        }
        vm.runtime.emitProjectChanged();
        if (vm.editingTarget) vm.runtime.requestTargetsUpdate(vm.editingTarget);
        setTree(buildAssetTree(vm, projectTitle, intl));
        setSelected(new Set());
        setBusy(false);
        setImporting(false);
        if (failed) {
            setError(intl.formatMessage(messages.importFailed, {message: lastError}));
        }
    };

    const totalFiles = countFiles(tree);

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            height={620}
            id="projectAssetsManagerModal"
            maximizable
            minHeight={380}
            minWidth={540}
            resizable
            width={900}
            onRequestClose={props.onClose}
        >
            <div className={styles.body}>
                <div className={styles.toolbar}>
                    <div className={styles.summary}>
                        <strong>{tree.name}</strong>
                        <span className={styles.summaryText}>
                            {intl.formatMessage(messages.fileCount, {count: totalFiles})}
                            {' · '}
                            {intl.formatMessage(messages.selectedCount, {count: selectedFiles.length})}
                        </span>
                    </div>
                    <div className={styles.actions}>
                        <button
                            type="button"
                            className={styles.iconButton}
                            aria-label={intl.formatMessage(messages.refresh)}
                            title={intl.formatMessage(messages.refresh)}
                            onClick={refresh}
                        >
                            <RefreshCw size={16} />
                        </button>
                        <button
                            type="button"
                            className={styles.dangerButton}
                            disabled={!deletableSelectedCount || busy}
                            onClick={deleteSelection}
                        >
                            <Trash2 size={15} />
                            {intl.formatMessage(messages.deleteSelected)}
                        </button>
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            disabled={!selectedFiles.length || busy}
                            onClick={downloadSelection}
                        >
                            <Download size={15} />
                            {intl.formatMessage(messages.downloadSelected)}
                        </button>
                        <button
                            type="button"
                            className={styles.primaryButton}
                            disabled={!totalFiles || busy}
                            onClick={downloadAll}
                        >
                            <Download size={15} />
                            {intl.formatMessage(messages.downloadAll)}
                        </button>
                    </div>
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{display: 'none'}}
                    onChange={handleImport}
                />

                <div className={styles.tree}>
                    {totalFiles === 0 ? (
                        <div className={styles.empty}>{intl.formatMessage(messages.empty)}</div>
                    ) : (
                        <AssetNode
                            busy={busy}
                            dragOverId={dragOverId}
                            draggingId={draggingId}
                            expanded={expanded}
                            intl={intl}
                            node={tree}
                            selected={selected}
                            onDragEndFile={onDragEndFile}
                            onDragOverFile={onDragOverFile}
                            onDragStartFile={onDragStartFile}
                            onDropFile={onDropFile}
                            onImport={startImport}
                            onToggleExpand={toggleExpand}
                            onToggleFile={toggleFile}
                            onToggleFolder={toggleFolder}
                        />
                    )}
                </div>

                {busy && (
                    <div className={styles.footer}>
                        <span className={styles.busy}>
                            {intl.formatMessage(importing ? messages.importing : messages.busy)}
                        </span>
                    </div>
                )}
            </div>
        </Modal>
    );
};

ProjectAssetsManager.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func.isRequired,
    projectTitle: PropTypes.string,
    vm: PropTypes.shape({
        addCostume: PropTypes.func,
        addSound: PropTypes.func,
        editingTarget: PropTypes.shape({
            id: PropTypes.string
        }),
        emitTargetsUpdate: PropTypes.func,
        extensionManager: PropTypes.shape({
            getExtensionURLs: PropTypes.func
        }),
        getExportedCostume: PropTypes.func.isRequired,
        reorderCostume: PropTypes.func,
        reorderSound: PropTypes.func,
        runtime: PropTypes.shape({
            emitProjectChanged: PropTypes.func,
            fontManager: PropTypes.shape({
                getFonts: PropTypes.func
            }),
            getTargetById: PropTypes.func,
            requestTargetsUpdate: PropTypes.func,
            storage: PropTypes.object,
            targets: PropTypes.array
        })
    }).isRequired
};

ProjectAssetsManager.defaultProps = {
    projectTitle: ''
};

export {messages, buildAssetTree};
export default injectIntl(ProjectAssetsManager);
