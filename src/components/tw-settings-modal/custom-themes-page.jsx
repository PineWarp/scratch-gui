import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {
    Blend, Check, CircleAlert, CircleCheck, Download, Palette, PenLine, Save, Trash2, Upload, X
} from 'lucide-react';

import {Theme} from '../../lib/themes/index.js';
import {customThemeManager, CustomTheme, GradientUtils} from '../../lib/themes/custom-themes.js';
import CustomThemeEditor from './custom-theme-editor.jsx';
import CustomThemePreview from './custom-theme-preview.jsx';
import messages from './custom-themes-messages.js';

import styles from './custom-themes.css';

const MAX_THEMES = 50;
const VIEWS = ['library', 'create', 'gradient'];
const customThemesTab = value => (VIEWS.includes(value) ? value : 'library');

const EDITOR_MODES = {
    create: 'current',
    gradient: 'gradient',
    edit: 'edit'
};

const downloadJSON = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const themeFileName = name => {
    const slug = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '')
        .toLowerCase();
    return `${slug || 'custom'}-theme.json`;
};

class CustomThemesPage extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            view: customThemesTab(props.initialTab),
            customThemes: customThemeManager.getAllThemes(),
            editingUuid: null,
            editorKey: 0,
            editorError: '',
            status: null,
            pendingDelete: null
        };
        this.previewOriginal = null;
        this.pendingFocus = null;
        this.fileInputRef = React.createRef();
        this.pageRef = React.createRef();
        this.primaryActionRef = React.createRef();
        this.confirmCancelRef = React.createRef();
    }

    componentDidMount () {
        this.unsubscribe = customThemeManager.subscribe(() => {
            this.setState({customThemes: customThemeManager.getAllThemes()});
        });
    }

    componentDidUpdate (previousProps, previousState) {
        if (this.state.pendingDelete && this.state.pendingDelete !== previousState.pendingDelete &&
            this.confirmCancelRef.current) {
            this.confirmCancelRef.current.focus();
        }
        if (this.pendingFocus && this.state.view === 'library') {
            this.applyPendingFocus();
        }
        if (previousProps.initialTab === this.props.initialTab) return;
        const next = customThemesTab(this.props.initialTab);
        if (next !== this.state.view && !(next === 'library' && this.state.view === 'edit')) {
            this.openView(next, {notify: false});
        }
    }

    componentWillUnmount () {
        if (this.unsubscribe) this.unsubscribe();
        this.stopPreview();
    }

    applyPendingFocus () {
        const target = this.pendingFocus;
        this.pendingFocus = null;
        const page = this.pageRef.current;
        const tile = target.uuid && page ?
            Array.from(page.querySelectorAll('button[data-uuid]'))
                .find(button => button.dataset.uuid === target.uuid) : null;
        const element = tile || this.primaryActionRef.current;
        if (element) element.focus();
    }

    message (descriptor, values) {
        return this.props.intl.formatMessage(descriptor, values);
    }

    openView (view, {notify = true, editingUuid = null} = {}) {
        this.stopPreview();
        this.setState(state => ({
            view,
            editingUuid,
            editorKey: state.editorKey + 1,
            editorError: '',
            pendingDelete: null,
            status: view === 'library' ? state.status : null
        }), () => {
            if (notify && this.props.onTabChange && view !== 'edit') this.props.onTabChange(view);
        });
    }

    showStatus (kind, text) {
        this.setState({status: {kind, text}});
    }

    previewTheme (theme) {
        if (this.props.onPreviewTheme) this.props.onPreviewTheme(theme);
        else this.props.onChangeTheme(theme);
    }

    stopPreview () {
        if (!this.previewOriginal) return;
        const original = this.previewOriginal;
        this.previewOriginal = null;
        this.previewTheme(original);
    }

    baseTheme () {
        return this.previewOriginal || this.props.theme;
    }

    handlePreview = theme => {
        if (!theme) {
            this.stopPreview();
            return;
        }
        if (!this.previewOriginal) this.previewOriginal = this.props.theme;
        this.previewTheme(theme);
    };

    handleOpenCreate = () => this.openView('create');

    handleOpenGradient = () => this.openView('gradient');

    handleBack = () => {
        this.pendingFocus = {uuid: this.state.view === 'edit' ? this.state.editingUuid : null};
        this.openView('library');
    };

    handleEditorInput = () => {
        if (this.state.editorError) this.setState({editorError: ''});
    };

    handleDismissStatus = () => this.setState({status: null});

    handleApply = e => {
        const theme = customThemeManager.getTheme(e.currentTarget.dataset.uuid);
        if (theme) this.props.onChangeTheme(theme);
    };

    handleEdit = e => {
        this.openView('edit', {editingUuid: e.currentTarget.dataset.uuid});
    };

    handleExportOne = e => {
        const theme = customThemeManager.getTheme(e.currentTarget.dataset.uuid);
        if (!theme) return;
        try {
<<<<<<< eea4f3f
            const customTheme = customThemeManager.createGradientTheme(
                name.trim(),
                description.trim(),
                colorStops.map(stop => ({color: stop.color, position: stop.position})),
                primary,
                {direction},
                this.props.theme
            );
            this.closeEditor();
            this.setState({
                tab: TABS.LIBRARY,
                statusMessage: `“${customTheme.name}” saved to your library.`
            });
            this.props.onChangeTheme(customTheme);
        } catch (error) {
            await showAlert(`Failed to create gradient theme: ${error.message}`);
        }
    };

    handleEditGradient = async themeUuid => {
        try {
            const gradientInfo = customThemeManager.getThemeGradientInfo(themeUuid);
            const theme = customThemeManager.getTheme(themeUuid);
            if (!gradientInfo || !theme) {
                await showAlert(this.props.intl.formatMessage({
                    id: 'tw.customThemes.loadGradientInfo.failed',
                    defaultMessage: 'Could not load gradient information for this theme'
                }));
                return;
            }
            this.setState({
                tab: TABS.CREATE,
                createMode: 'gradient',
                activeEditor: 'editGradient',
                editingThemeUuid: themeUuid,
                createDescription: theme.description,
                editorInitial: {
                    name: theme.name,
                    description: theme.description,
                    gradientColors: gradientInfo.colorStops,
                    direction: gradientInfo.direction,
                    primaryColor: gradientInfo.primaryColor
                }
            });
        } catch (error) {
            await showAlert(`Failed to load gradient theme: ${error.message}`);
        }
    };

    handleUpdateGradient = async (name, description, colorStops, primary, direction) => {
        const {editingThemeUuid} = this.state;
        if (!name.trim()) {
            await showAlert('Theme name is required');
            return;
        }
        this.stopPreview();
        try {
            const updatedTheme = customThemeManager.updateThemeGradient(
                editingThemeUuid,
                colorStops.map(stop => ({color: stop.color, position: stop.position})),
                primary,
                {direction}
            );

            if (updatedTheme.name !== name.trim() || updatedTheme.description !== description.trim()) {
                const newTheme = new CustomTheme(
                    name.trim(),
                    description.trim(),
                    updatedTheme.customAccent,
                    updatedTheme.gui,
                    updatedTheme.blocks,
                    updatedTheme.menuBarAlign,
                    updatedTheme.wallpaper,
                    updatedTheme.fonts,
                    updatedTheme.author,
                    updatedTheme.appearance
                );
                Object.defineProperty(newTheme, 'uuid', {value: editingThemeUuid, writable: false});
                Object.defineProperty(newTheme, 'createdAt', {value: updatedTheme.createdAt, writable: false});
                customThemeManager.themes.set(editingThemeUuid, newTheme);
                customThemeManager.saveCustomThemes();
            }

            this.closeEditor();
            this.setState({
                tab: TABS.LIBRARY,
                statusMessage: 'Theme updated.'
            });

            const {theme} = this.props;
            if (theme instanceof CustomTheme && theme.uuid === editingThemeUuid) {
                this.props.onChangeTheme(customThemeManager.getTheme(editingThemeUuid));
            }
        } catch (error) {
            await showAlert(`Failed to update gradient theme: ${error.message}`);
        }
    };

    handleDeleteTheme = async (themeUuid, themeName) => {
        // eslint-disable-next-line no-alert
        if (confirm(`Delete “${themeName}”? This cannot be undone.`)) {
            try {
                customThemeManager.removeTheme(themeUuid);
                this.setState({statusMessage: `“${themeName}” deleted.`});
            } catch (error) {
                await showAlert(this.props.intl.formatMessage({
                    id: 'tw.customThemes.delete.failed',
                    defaultMessage: 'Failed to delete theme: {error}',
                    values: {error: error.message}
                }));
            }
        }
    };

    downloadJSON (data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    handleExportThemes = async () => {
        try {
            const date = new Date().toISOString()
                .split('T')[0];
            this.downloadJSON(
                customThemeManager.exportAllThemes(),
                `pinewarp-themes-${date}.json`
            );
            this.setState({statusMessage: 'Exported all themes.'});
        } catch (error) {
            await showAlert(this.props.intl.formatMessage({
                id: 'tw.customThemes.export.failed',
                defaultMessage: 'Failed to export theme: {error}',
                values: {error: error.message}
            }));
        }
    };

    handleExportSingleTheme = async theme => {
        try {
            this.downloadJSON({
                version: '2.0',
                timestamp: Date.now(),
                themes: [theme.export()],
                platform: 'PineWarp'
            }, `${theme.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-theme.json`);
=======
            downloadJSON({
                version: '2.0',
                timestamp: Date.now(),
                themes: [theme.export()],
                platform: 'MistWarp'
            }, themeFileName(theme.name));
>>>>>>> bilup/develop
        } catch (error) {
            this.showStatus('error', this.message(messages.errorExport));
        }
    };

    handleExportAll = () => {
        try {
            const date = new Date().toISOString()
                .split('T')[0];
            downloadJSON(customThemeManager.exportAllThemes(), `mistwarp-themes-${date}.json`);
            this.showStatus('success', this.message(messages.exported, {count: this.state.customThemes.length}));
        } catch (error) {
            this.showStatus('error', this.message(messages.errorExport));
        }
    };

    handleImportClick = () => {
        if (this.fileInputRef.current) this.fileInputRef.current.click();
    };

    handleImportFile = e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let results;
            try {
                results = customThemeManager.importThemes(JSON.parse(reader.result), false);
            } catch (error) {
                this.showStatus('error', this.message(messages.errorImport));
                return;
            }
            if (results.errors.length > 0 && results.imported === 0) {
                this.showStatus('error', this.message(messages.importedWithErrors, {failed: results.errors.length}));
                return;
            }
            const parts = [results.skipped > 0 ?
                this.message(messages.importedWithSkipped, {imported: results.imported, skipped: results.skipped}) :
                this.message(messages.imported, {imported: results.imported})];
            if (results.errors.length > 0) {
                parts.push(this.message(messages.importedWithErrors, {failed: results.errors.length}));
            }
            this.showStatus(results.errors.length > 0 ? 'error' : 'success', parts.join(' '));
        };
        reader.onerror = () => this.showStatus('error', this.message(messages.errorImport));
        reader.readAsText(file);
    };

    handleRequestDelete = e => {
        this.setState({pendingDelete: e.currentTarget.dataset.uuid});
    };

    handleCancelDelete = () => {
        this.pendingFocus = {uuid: this.state.pendingDelete};
        this.setState({pendingDelete: null});
    };

    handleConfirmDelete = () => {
        const theme = customThemeManager.getTheme(this.state.pendingDelete);
        this.pendingFocus = {uuid: null};
        this.setState({pendingDelete: null});
        if (!theme) return;
        try {
            customThemeManager.removeTheme(theme.uuid);
            this.showStatus('success', this.message(messages.deleted, {themeName: theme.name}));
        } catch (error) {
            this.showStatus('error', this.message(messages.errorDelete));
        }
    };

    nameError (name, editingTheme) {
        if (!name) return this.message(messages.errorNameRequired);
        if (editingTheme && editingTheme.name === name) return '';
        const ignoreUuid = editingTheme ? editingTheme.uuid : null;
        const lower = name.toLowerCase();
        const taken = this.state.customThemes.some(theme => theme.uuid !== ignoreUuid &&
            theme.name.trim().toLowerCase() === lower);
        if (taken) return this.message(messages.errorNameTaken, {themeName: name});
        return '';
    }

    handleSubmit = ({name, description, gradient, gradientChanged}) => {
        const {view, editingUuid} = this.state;
        const editingTheme = view === 'edit' ? customThemeManager.getTheme(editingUuid) : null;
        const editing = view === 'edit';
        if (editing && !editingTheme) {
            this.setState({editorError: this.message(messages.errorSave)});
            return;
        }
        const nameError = this.nameError(name, editingTheme);
        if (nameError) {
            this.setState({editorError: nameError});
            return;
        }
        if (!editing && this.state.customThemes.length >= MAX_THEMES) {
            this.setState({editorError: this.message(messages.errorLimit)});
            return;
        }

        const base = this.baseTheme();
        const wasActive = editing && base instanceof CustomTheme && base.uuid === editingUuid;
        let saved;
        try {
            if (editing) {
                const updates = {name, description};
                if (gradient && gradientChanged) {
                    const accent = GradientUtils.createGradientAccent(gradient.stops, gradient.primaryColor, {
                        direction: gradient.direction
                    });
                    const foreground = editingTheme.customAccent && editingTheme.customAccent.guiColors &&
                        editingTheme.customAccent.guiColors['menu-bar-foreground'];
                    if (foreground) accent.guiColors['menu-bar-foreground'] = foreground;
                    updates.accent = accent;
                }
                saved = customThemeManager.updateTheme(editingUuid, updates);
            } else if (gradient) {
                saved = customThemeManager.createGradientTheme(
                    name,
                    description,
                    gradient.stops,
                    gradient.primaryColor,
                    {direction: gradient.direction},
                    base
                );
            } else {
                saved = customThemeManager.createFromCurrentTheme(base, name, description);
            }
        } catch (error) {
            this.setState({editorError: this.message(messages.errorSave)});
            return;
        }

        const original = this.previewOriginal;
        this.previewOriginal = null;
        if (!editing || wasActive) this.props.onChangeTheme(saved);
        else if (original) this.previewTheme(original);
        this.pendingFocus = {uuid: saved.uuid};
        this.openView('library');
        this.showStatus('success', this.message(editing ? messages.updated : messages.saved, {themeName: saved.name}));
    };

    renderToolbar () {
        return (
            <div className={styles.toolbar}>
                <div className={styles.toolbarGroup}>
                    <button
                        ref={this.primaryActionRef}
                        type="button"
                        className={styles.primaryButton}
                        onClick={this.handleOpenCreate}
                    >
                        <Save size={16} />
                        <FormattedMessage {...messages.saveCurrent} />
                    </button>
                    <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={this.handleOpenGradient}
                    >
                        <Blend size={16} />
                        <FormattedMessage {...messages.newGradient} />
                    </button>
                </div>
            </div>
        );
    }

    renderStatus () {
        const {status} = this.state;
        if (!status) return null;
        const error = status.kind === 'error';
        const Icon = error ? CircleAlert : CircleCheck;
        return (
            <div
                className={classNames(styles.status, error ? styles.statusError : styles.statusSuccess)}
                role={error ? 'alert' : 'status'}
            >
                <Icon size={16} />
                <span className={styles.statusText}>{status.text}</span>
                <button
                    type="button"
                    className={styles.statusDismiss}
                    aria-label={this.message(messages.dismiss)}
                    title={this.message(messages.dismiss)}
                    onClick={this.handleDismissStatus}
                >
                    <X size={14} />
                </button>
            </div>
        );
    }

    renderEmpty () {
        return (
            <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                    <Palette size={22} />
                </span>
                <span className={styles.emptyTitle}>
                    <FormattedMessage {...messages.emptyTitle} />
                </span>
                <span className={styles.emptyText}>
                    <FormattedMessage {...messages.emptyHint} />
                </span>
            </div>
        );
    }

    renderTile (customTheme) {
        const {theme} = this.props;
        const active = theme instanceof CustomTheme && theme.uuid === customTheme.uuid;
        const confirming = this.state.pendingDelete === customTheme.uuid;
        const isGradient = Boolean(customThemeManager.hasCustomGradient(customTheme.uuid));
        const themeName = customTheme.name;
        const author = customTheme.author && customTheme.author !== 'User' && customTheme.author !== 'Unknown' ?
            customTheme.author : '';
        let meta = customTheme.description;
        if (!meta && author) meta = this.message(messages.byAuthor, {author});
        if (!meta) meta = this.message(isGradient ? messages.gradientKind : messages.savedKind);

        return (
            <li
                key={customTheme.uuid}
                className={classNames(styles.tile, {
                    [styles.tileActive]: active,
                    [styles.tileConfirming]: confirming
                })}
            >
                <button
                    type="button"
                    className={styles.tilePreviewButton}
                    data-uuid={customTheme.uuid}
                    aria-pressed={active}
                    aria-label={this.message(messages.applyTheme, {themeName})}
                    onClick={this.handleApply}
                >
                    <CustomThemePreview theme={customTheme} />
                    {active ? (
                        <span className={styles.activeBadge}>
                            <Check size={12} />
                            <FormattedMessage {...messages.active} />
                        </span>
                    ) : null}
                </button>
                {confirming ? null : (
                    <div className={styles.tileActions}>
                        <button
                            type="button"
                            className={styles.iconButton}
                            data-uuid={customTheme.uuid}
                            aria-label={this.message(messages.editTheme, {themeName})}
                            title={this.message(messages.editTheme, {themeName})}
                            onClick={this.handleEdit}
                        >
                            <PenLine size={16} />
                        </button>
                        <button
                            type="button"
                            className={styles.iconButton}
                            data-uuid={customTheme.uuid}
                            aria-label={this.message(messages.exportTheme, {themeName})}
                            title={this.message(messages.exportTheme, {themeName})}
                            onClick={this.handleExportOne}
                        >
                            <Download size={16} />
                        </button>
                        <button
                            type="button"
                            className={styles.iconButton}
                            data-uuid={customTheme.uuid}
                            aria-label={this.message(messages.deleteTheme, {themeName})}
                            title={this.message(messages.deleteTheme, {themeName})}
                            onClick={this.handleRequestDelete}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )}
                {confirming ? (
                    <div className={styles.tileConfirm}>
                        <span className={styles.tileConfirmText}>
                            <FormattedMessage {...messages.deleteConfirm} />
                        </span>
                        <button
                            ref={this.confirmCancelRef}
                            type="button"
                            className={styles.smallButton}
                            onClick={this.handleCancelDelete}
                        >
                            <FormattedMessage {...messages.cancel} />
                        </button>
                        <button
                            type="button"
                            className={classNames(styles.smallButton, styles.dangerButton)}
                            onClick={this.handleConfirmDelete}
                        >
                            <FormattedMessage {...messages.deleteAction} />
                        </button>
                    </div>
                ) : (
                    <div className={styles.tileInfo}>
                        <span
                            className={styles.tileName}
                            title={themeName}
                        >
                            {themeName}
                        </span>
                        <span
                            className={styles.tileMeta}
                            title={meta}
                        >
                            {meta}
                        </span>
                    </div>
                )}
            </li>
        );
    }

    renderLibrary () {
        const {customThemes} = this.state;
<<<<<<< eea4f3f

        if (customThemes.length === 0) {
            return (
                <div className={styles.ctEmpty}>
                    <Palette size={28} />
                    <h3>
                        <FormattedMessage
                            defaultMessage="No custom themes yet"
                            id="tw.customThemes.empty"
                        />
                    </h3>
                    <p className={styles.detail}>
                        <FormattedMessage
                            defaultMessage="Create one from your current look, build a gradient, or browse PineWarpTheme."
                            id="mw.customThemes.empty.hint"
                        />
                    </p>
                    <div className={styles.ctEmptyActions}>
=======
        return (
            <React.Fragment>
                {this.renderToolbar()}
                {this.renderStatus()}
                {customThemes.length === 0 ? this.renderEmpty() : (
                    <ul className={styles.grid}>
                        {customThemes.map(customTheme => this.renderTile(customTheme))}
                    </ul>
                )}
                <div className={styles.libraryFooter}>
                    <div className={styles.toolbarGroup}>
>>>>>>> bilup/develop
                        <button
                            type="button"
                            className={styles.ghostButton}
                            onClick={this.handleImportClick}
                        >
                            <Upload size={16} />
                            <FormattedMessage {...messages.importFile} />
                        </button>
                        <button
                            type="button"
                            className={styles.ghostButton}
                            disabled={customThemes.length === 0}
                            onClick={this.handleExportAll}
                        >
                            <Download size={16} />
                            <FormattedMessage {...messages.exportAll} />
                        </button>
                    </div>
                </div>
            </React.Fragment>
        );
    }

    renderEditor () {
        const {view, editingUuid, editorKey, editorError} = this.state;
        const editingTheme = view === 'edit' ? customThemeManager.getTheme(editingUuid) : null;
        if (view === 'edit' && !editingTheme) return this.renderLibrary();
        let initialGradient = null;
        if (editingTheme) {
            const info = customThemeManager.getThemeGradientInfo(editingUuid);
            if (info && info.colorStops.length >= 2) {
                initialGradient = {
                    stops: info.colorStops,
                    direction: info.direction,
                    primaryColor: info.primaryColor
                };
            }
        }
        return (
<<<<<<< eea4f3f
            <div className={styles.ctCreate}>
                <div className={styles.ctModeSwitch}>
                    <button
                        type="button"
                        className={classNames(styles.ctModeBtn, {
                            [styles.ctModeBtnSelected]: createMode === 'current'
                        })}
                        onClick={() => this.setState({createMode: 'current'})}
                    >
                        <Sparkles size={15} />
                        <FormattedMessage
                            defaultMessage="From current"
                            id="mw.customThemes.create.fromCurrent"
                        />
                    </button>
                    <button
                        type="button"
                        className={classNames(styles.ctModeBtn, {
                            [styles.ctModeBtnSelected]: createMode === 'gradient'
                        })}
                        onClick={() => this.setState({createMode: 'gradient'})}
                    >
                        <Palette size={15} />
                        <FormattedMessage
                            defaultMessage="Gradient"
                            id="mw.customThemes.create.gradient"
                        />
                    </button>
                </div>

                {createMode === 'current' ? (
                    <div className={styles.ctPanel}>
                        <div className={styles.ctSnapshot}>
                            <div
                                className={styles.ctSnapshotSwatch}
                                style={themePreviewStyle(this.props.theme)}
                            />
                            <div className={styles.ctSnapshotMeta}>
                                <strong>
                                    <FormattedMessage
                                        defaultMessage="Current look"
                                        id="mw.customThemes.create.snapshot"
                                    />
                                </strong>
                                <span>
                                    <FormattedMessage
                                        defaultMessage="Saves accent, GUI mode, blocks, wallpaper, and fonts."
                                        id="mw.customThemes.create.fromCurrent.hint"
                                    />
                                </span>
                            </div>
                        </div>

                        <label className={styles.ctField}>
                            <span className={styles.ctLabel}>
                                <FormattedMessage
                                    defaultMessage="Name"
                                    id="tw.customThemes.createDialog.name"
                                />
                            </span>
                            <input
                                type="text"
                                className={styles.ctInput}
                                value={this.state.createName}
                                onChange={e => this.setState({createName: e.target.value})}
                                placeholder={this.props.intl.formatMessage({
                                    id: 'tw.customThemes.createDialog.namePlaceholder',
                                    defaultMessage: 'My Custom Theme'
                                })}
                                maxLength={50}
                                autoComplete="off"
                            />
                        </label>

                        <label className={styles.ctField}>
                            <span className={styles.ctLabel}>
                                <FormattedMessage
                                    defaultMessage="Description (optional)"
                                    id="tw.customThemes.createDialog.description"
                                />
                            </span>
                            <textarea
                                className={styles.ctTextarea}
                                value={this.state.createDescription}
                                onChange={e => this.setState({createDescription: e.target.value})}
                                placeholder={this.props.intl.formatMessage({
                                    id: 'tw.customThemes.createDialog.descriptionPlaceholder',
                                    defaultMessage: 'A custom theme based on current settings'
                                })}
                                maxLength={200}
                                rows={3}
                            />
                        </label>

                        <div className={styles.ctFormActions}>
                            <button
                                type="button"
                                className={styles.button}
                                disabled={!this.state.createName.trim()}
                                onClick={this.handleCreateFromCurrent}
                            >
                                <FormattedMessage
                                    defaultMessage="Save to library"
                                    id="mw.customThemes.create.save"
                                />
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className={styles.ctPanel}>
                        <GradientBuilder
                            mode="create"
                            onSubmit={this.handleCreateGradient}
                            onPreview={this.handlePreviewGradient}
                            onCancel={() => this.setTab(TABS.LIBRARY)}
                        />
                    </div>
                )}
            </div>
        );
    }

    renderImportExport () {
        const {customThemes} = this.state;
        return (
            <div className={styles.ctImport}>
                <div className={styles.ctActionCard}>
                    <div className={styles.ctActionIcon}><Upload size={18} /></div>
                    <div className={styles.ctActionBody}>
                        <h3>
                            <FormattedMessage
                                defaultMessage="Import"
                                id="tw.customThemes.import"
                            />
                        </h3>
                        <p className={styles.detail}>
                            <FormattedMessage
                                defaultMessage="Load themes from a PineWarp file."
                                id="mw.customThemes.import.hint"
                            />
                        </p>
                    </div>
                    <button
                        type="button"
                        className={styles.button}
                        onClick={() => this.fileInputRef.current && this.fileInputRef.current.click()}
                    >
                        <FolderInput size={14} />
                        <FormattedMessage
                            defaultMessage="Choose file"
                            id="mw.customThemes.import.choose"
                        />
                    </button>
                </div>

                <div className={styles.ctActionCard}>
                    <div className={styles.ctActionIcon}><Download size={18} /></div>
                    <div className={styles.ctActionBody}>
                        <h3>
                            <FormattedMessage
                                defaultMessage="Export all"
                                id="tw.customThemes.export"
                            />
                        </h3>
                        <p className={styles.detail}>
                            <FormattedMessage
                                defaultMessage="Download every theme in your library as one JSON file."
                                id="mw.customThemes.export.hint"
                            />
                        </p>
                    </div>
                    <button
                        type="button"
                        className={styles.ctButtonSecondary}
                        disabled={customThemes.length === 0}
                        onClick={this.handleExportThemes}
                    >
                        <Download size={14} />
                        <FormattedMessage
                            defaultMessage="Export"
                            id="mw.customThemes.export.button"
                        />
                    </button>
                </div>

                    {this.props.onOpenWarpThemeMarketplace && (
                        <div className={styles.ctActionCard}>
                            <div className={styles.ctActionIcon}><Store size={18} /></div>
                            <div className={styles.ctActionBody}>
                                <h3>
                                    <FormattedMessage
                                        defaultMessage="PineWarpTheme Marketplace"
                                        id="mw.menu.pinewarptheme"
                                    />
                                </h3>
                                <p className={styles.detail}>
                                    <FormattedMessage
                                        defaultMessage="Browse community themes and add them to your library."
                                        id="mw.customThemes.marketplace.hint"
                                    />
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.ctButtonSecondary}
                                onClick={this.props.onOpenWarpThemeMarketplace}
                            >
                                <Store size={14} />
                                <FormattedMessage
                                    defaultMessage="Open"
                                    id="mw.customThemes.marketplace.open"
                                />
                            </button>
                        </div>
                    )}
            </div>
=======
            <CustomThemeEditor
                key={editorKey}
                baseTheme={this.baseTheme()}
                editingTheme={editingTheme}
                error={editorError}
                initialGradient={initialGradient}
                mode={EDITOR_MODES[view]}
                onCancel={this.handleBack}
                onInput={this.handleEditorInput}
                onPreview={this.handlePreview}
                onSubmit={this.handleSubmit}
            />
>>>>>>> bilup/develop
        );
    }

    render () {
        return (
            <div
                className={styles.page}
                ref={this.pageRef}
            >
                {this.state.view === 'library' ? this.renderLibrary() : this.renderEditor()}
                <input
                    ref={this.fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className={styles.hiddenInput}
                    onChange={this.handleImportFile}
                />
            </div>
        );
    }
}

CustomThemesPage.propTypes = {
    initialTab: PropTypes.string,
    intl: intlShape.isRequired,
    theme: PropTypes.instanceOf(Theme),
    onChangeTheme: PropTypes.func,
    onPreviewTheme: PropTypes.func,
    onTabChange: PropTypes.func
};

export {customThemesTab};
export default injectIntl(CustomThemesPage);
