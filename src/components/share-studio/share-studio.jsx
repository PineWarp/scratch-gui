import PropTypes from 'prop-types';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import {
    Check,
    Download,
    Image as ImageIcon,
    RefreshCw,
    Share2,
    Sparkles
} from 'lucide-react';

import Modal from '../../containers/windowed-modal.jsx';
import {getLoadedProjectMeta} from '../../lib/mw-project-metadata';
import {
    buildShareText,
    createShareCardCanvas,
    dataUrlToBlob,
    FORMATS,
    formatBytes,
    getShareUrl,
    TEMPLATES
} from '../../lib/share-card.js';
import downloadBlob from '../../lib/utils/download-blob';
import styles from './share-studio.css';

const messages = defineMessages({
    title: {
        id: 'mw.shareStudio.title',
        defaultMessage: 'Share Studio'
    },
    subtitle: {
        id: 'mw.shareStudio.subtitle',
        defaultMessage: 'Turn this project into a ready-to-post share card. Everything happens locally.'
    },
    titleLabel: {
        id: 'mw.shareStudio.titleLabel',
        defaultMessage: 'Project title'
    },
    authorLabel: {
        id: 'mw.shareStudio.authorLabel',
        defaultMessage: 'Author'
    },
    authorPlaceholder: {
        id: 'mw.shareStudio.authorPlaceholder',
        defaultMessage: 'PineWarp creator'
    },
    layout: {
        id: 'mw.shareStudio.layout',
        defaultMessage: 'Layout'
    },
    layoutWide: {
        id: 'mw.shareStudio.layoutWide',
        defaultMessage: 'Landscape 16:9'
    },
    layoutSquare: {
        id: 'mw.shareStudio.layoutSquare',
        defaultMessage: 'Square 1:1'
    },
    theme: {
        id: 'mw.shareStudio.theme',
        defaultMessage: 'Palette'
    },
    themeForest: {
        id: 'mw.shareStudio.themeForest',
        defaultMessage: 'Forest'
    },
    themeDawn: {
        id: 'mw.shareStudio.themeDawn',
        defaultMessage: 'Dawn'
    },
    themeAurora: {
        id: 'mw.shareStudio.themeAurora',
        defaultMessage: 'Aurora'
    },
    showStats: {
        id: 'mw.shareStudio.showStats',
        defaultMessage: 'Show project stats'
    },
    showQr: {
        id: 'mw.shareStudio.showQr',
        defaultMessage: 'Show QR code'
    },
    download: {
        id: 'mw.shareStudio.download',
        defaultMessage: 'Download PNG'
    },
    copyImage: {
        id: 'mw.shareStudio.copyImage',
        defaultMessage: 'Copy image'
    },
    copyText: {
        id: 'mw.shareStudio.copyText',
        defaultMessage: 'Copy share text'
    },
    copiedImage: {
        id: 'mw.shareStudio.copiedImage',
        defaultMessage: 'Image copied'
    },
    copiedText: {
        id: 'mw.shareStudio.copiedText',
        defaultMessage: 'Share text copied'
    },
    copyFailed: {
        id: 'mw.shareStudio.copyFailed',
        defaultMessage: 'Copy failed — use Download PNG instead.'
    },
    generating: {
        id: 'mw.shareStudio.generating',
        defaultMessage: 'Rendering share card…'
    },
    error: {
        id: 'mw.shareStudio.error',
        defaultMessage: 'Could not render the card. Please try again.'
    },
    hint: {
        id: 'mw.shareStudio.hint',
        defaultMessage: 'Nothing is uploaded. The QR code opens the editor.'
    },
    refresh: {
        id: 'mw.shareStudio.refresh',
        defaultMessage: 'Refresh stage snapshot'
    },
    noRenderer: {
        id: 'mw.shareStudio.noRenderer',
        defaultMessage: 'Stage is not ready yet — using a gradient background.'
    },
    stats: {
        id: 'mw.shareStudio.stats',
        defaultMessage: '{sprites} sprites · {blocks} blocks · {costumes} costumes · {sounds} sounds'
    }
});

const TEMPLATE_LABELS = {
    forest: messages.themeForest,
    dawn: messages.themeDawn,
    aurora: messages.themeAurora
};

const getProjectStats = vm => {
    const stats = {
        sprites: 0,
        blocks: 0,
        costumes: 0,
        sounds: 0,
        size: 0
    };
    if (!vm || !vm.runtime) return stats;

    try {
        const targets = vm.runtime.targets || [];
        for (const target of targets) {
            if (!target.isOriginal) continue;
            const sprite = target.sprite || target;
            if (!target.isStage) stats.sprites += 1;
            stats.costumes += (sprite.costumes || []).length;
            stats.sounds += (sprite.sounds || []).length;
            const blocks = sprite.blocks && sprite.blocks._blocks;
            if (blocks) {
                for (const id in blocks) {
                    if (blocks[id] && !blocks[id].shadow) stats.blocks += 1;
                }
            }
            for (const costume of sprite.costumes || []) {
                if (costume.asset && costume.asset.data) {
                    stats.size += costume.asset.data.byteLength || costume.asset.data.length || 0;
                }
            }
            for (const sound of sprite.sounds || []) {
                if (sound.asset && sound.asset.data) {
                    stats.size += sound.asset.data.byteLength || sound.asset.data.length || 0;
                }
            }
        }
        if (typeof vm.toJSON === 'function') {
            stats.size += new TextEncoder().encode(vm.toJSON()).length;
        }
    } catch (error) {
        // Stats are decoration; never let a malformed project block sharing.
    }
    return stats;
};

const getDefaultAuthor = () => {
    try {
        const meta = getLoadedProjectMeta() || {};
        if (meta.author && meta.author.username) return `@${meta.author.username}`;
    } catch (error) {
        // Ignore.
    }
    return '';
};

const sanitizeFileName = name => String(name || 'pinewarp')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'pinewarp';

const ShareStudio = props => {
    const {intl, onRequestClose, projectTitle, vm} = props;

    const [title, setTitle] = useState(() => (projectTitle || '').trim() || '未命名作品');
    const [author, setAuthor] = useState(getDefaultAuthor);
    const [template, setTemplate] = useState('forest');
    const [format, setFormat] = useState('wide');
    const [showStats, setShowStats] = useState(true);
    const [showQr, setShowQr] = useState(true);
    const [stageImage, setStageImage] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [rendering, setRendering] = useState(true);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(null);
    const [snapshotAvailable, setSnapshotAvailable] = useState(true);

    const cardDataUrlRef = useRef('');
    const copyTimerRef = useRef(null);

    const stats = useMemo(() => getProjectStats(vm), [vm, stageImage]);
    const shareUrl = useMemo(() => getShareUrl(), []);

    const takeSnapshot = useCallback(() => {
        const renderer = vm && vm.renderer;
        if (!renderer || typeof renderer.requestSnapshot !== 'function') {
            setSnapshotAvailable(false);
            return;
        }
        let settled = false;
        const finish = dataUrl => {
            if (settled) return;
            settled = true;
            if (dataUrl) {
                setStageImage(dataUrl);
                setSnapshotAvailable(true);
            } else {
                setSnapshotAvailable(false);
            }
        };
        try {
            renderer.requestSnapshot(finish);
            // The renderer only flushes snapshot callbacks while drawing. A
            // project that is not running produces no frames, so ask for one.
            if (typeof renderer.draw === 'function') {
                renderer.dirty = true;
                renderer.draw();
            }
            setTimeout(() => {
                if (settled) return;
                try {
                    if (typeof renderer.draw === 'function') {
                        renderer.dirty = true;
                        renderer.draw();
                    }
                } catch (drawError) {
                    // Ignore: the fallback below reports the failure.
                }
                setTimeout(() => finish(null), 400);
            }, 250);
        } catch (snapshotError) {
            setSnapshotAvailable(false);
        }
    }, [vm]);

    useEffect(() => {
        takeSnapshot();
        const runtime = vm && vm.runtime;
        if (!runtime || typeof runtime.on !== 'function') return undefined;
        const handleProjectLoaded = () => setTimeout(takeSnapshot, 120);
        runtime.on('PROJECT_LOADED', handleProjectLoaded);
        return () => {
            if (typeof runtime.removeListener === 'function') {
                runtime.removeListener('PROJECT_LOADED', handleProjectLoaded);
            }
        };
    }, [takeSnapshot, vm]);

    useEffect(() => () => {
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setRendering(true);
        const timer = setTimeout(async () => {
            try {
                const canvas = await createShareCardCanvas({
                    stageImage,
                    title: title.trim() || '未命名作品',
                    author: author.trim() || 'PineWarp 创作者',
                    stats,
                    template,
                    format,
                    showStats,
                    showQr,
                    url: shareUrl
                });
                if (cancelled) return;
                const dataUrl = canvas.toDataURL('image/png');
                cardDataUrlRef.current = dataUrl;
                setPreviewUrl(dataUrl);
                setError(null);
            } catch (renderError) {
                if (!cancelled) setError(renderError);
            } finally {
                if (!cancelled) setRendering(false);
            }
        }, 140);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [author, format, shareUrl, showQr, showStats, stageImage, stats, template, title]);

    const markCopied = useCallback(kind => {
        setCopied(kind);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(null), 2200);
    }, []);

    const handleDownload = useCallback(() => {
        if (!cardDataUrlRef.current) return;
        const blob = dataUrlToBlob(cardDataUrlRef.current);
        downloadBlob(`${sanitizeFileName(title)}-pinewarp-share.png`, blob);
    }, [title]);

    const handleCopyImage = useCallback(async () => {
        if (!cardDataUrlRef.current) return;
        try {
            if (!navigator.clipboard || !window.ClipboardItem) {
                throw new Error('Clipboard images are not supported');
            }
            const blob = dataUrlToBlob(cardDataUrlRef.current);
            await navigator.clipboard.write([new window.ClipboardItem({'image/png': blob})]);
            markCopied('image');
        } catch (copyError) {
            markCopied('failed');
        }
    }, [markCopied]);

    const handleCopyText = useCallback(async () => {
        try {
            const text = buildShareText({
                title: title.trim() || '未命名作品',
                author: author.trim() || 'PineWarp 创作者',
                stats,
                url: shareUrl
            });
            await navigator.clipboard.writeText(text);
            markCopied('text');
        } catch (copyError) {
            markCopied('failed');
        }
    }, [author, markCopied, shareUrl, stats, title]);

    const copyLabel = copied === 'image' ?
        intl.formatMessage(messages.copiedImage) :
        copied === 'text' ?
            intl.formatMessage(messages.copiedText) :
            copied === 'failed' ?
                intl.formatMessage(messages.copyFailed) :
                null;

    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            height={700}
            id="shareStudioModal"
            maximizable
            minHeight={560}
            minWidth={820}
            onRequestClose={onRequestClose}
            resizable
            width={1120}
        >
            <div className={styles.body}>
                <div className={styles.previewPane}>
                    <div className={styles.previewHeader}>
                        <div className={styles.previewTitle}>
                            <Sparkles size={16} />
                            {intl.formatMessage(messages.title)}
                        </div>
                        <div className={styles.previewMeta}>
                            {format === 'wide' ? '1200 × 630' : '1080 × 1080'}
                        </div>
                    </div>
                    <div className={styles.previewFrame}>
                        {previewUrl ? (
                            <img
                                alt=""
                                className={styles.previewImage}
                                src={previewUrl}
                            />
                        ) : (
                            <div className={styles.previewPlaceholder}>
                                <RefreshCw className={styles.spin} size={26} />
                                <span>{intl.formatMessage(messages.generating)}</span>
                            </div>
                        )}
                        {rendering && previewUrl ? (
                            <div className={styles.renderingBadge}>
                                <RefreshCw className={styles.spin} size={13} />
                                {intl.formatMessage(messages.generating)}
                            </div>
                        ) : null}
                    </div>
                    <div className={styles.previewFooter}>
                        <span>{intl.formatMessage(messages.hint)}</span>
                        <button
                            className={styles.ghostButton}
                            type="button"
                            onClick={takeSnapshot}
                        >
                            <RefreshCw size={14} />
                            {intl.formatMessage(messages.refresh)}
                        </button>
                    </div>
                    {!snapshotAvailable ? (
                        <div className={styles.notice}>{intl.formatMessage(messages.noRenderer)}</div>
                    ) : null}
                </div>

                <aside className={styles.controls}>
                    <p className={styles.subtitle}>{intl.formatMessage(messages.subtitle)}</p>

                    <label className={styles.field}>
                        <span className={styles.fieldLabel}>{intl.formatMessage(messages.titleLabel)}</span>
                        <input
                            className={styles.input}
                            maxLength={60}
                            value={title}
                            onChange={event => setTitle(event.target.value)}
                        />
                    </label>

                    <label className={styles.field}>
                        <span className={styles.fieldLabel}>{intl.formatMessage(messages.authorLabel)}</span>
                        <input
                            className={styles.input}
                            maxLength={40}
                            placeholder={intl.formatMessage(messages.authorPlaceholder)}
                            value={author}
                            onChange={event => setAuthor(event.target.value)}
                        />
                    </label>

                    <div className={styles.field}>
                        <span className={styles.fieldLabel}>{intl.formatMessage(messages.layout)}</span>
                        <div className={styles.segmented}>
                            {Object.keys(FORMATS).map(key => (
                                <button
                                    className={format === key ? styles.segmentActive : styles.segment}
                                    key={key}
                                    type="button"
                                    onClick={() => setFormat(key)}
                                >
                                    {key === 'wide' ?
                                        intl.formatMessage(messages.layoutWide) :
                                        intl.formatMessage(messages.layoutSquare)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.field}>
                        <span className={styles.fieldLabel}>{intl.formatMessage(messages.theme)}</span>
                        <div className={styles.themes}>
                            {Object.keys(TEMPLATES).map(key => {
                                const palette = TEMPLATES[key];
                                return (
                                    <button
                                        className={template === key ? styles.themeActive : styles.theme}
                                        key={key}
                                        type="button"
                                        onClick={() => setTemplate(key)}
                                    >
                                        <span
                                            className={styles.swatch}
                                            style={{
                                                background: `linear-gradient(135deg, ${palette.bg1} 0%, ${palette.bg2} 55%, ${palette.accent} 100%)`
                                            }}
                                        />
                                        {intl.formatMessage(TEMPLATE_LABELS[key])}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className={styles.toggles}>
                        <label className={styles.toggle}>
                            <input
                                checked={showStats}
                                type="checkbox"
                                onChange={event => setShowStats(event.target.checked)}
                            />
                            <span>{intl.formatMessage(messages.showStats)}</span>
                        </label>
                        <label className={styles.toggle}>
                            <input
                                checked={showQr}
                                type="checkbox"
                                onChange={event => setShowQr(event.target.checked)}
                            />
                            <span>{intl.formatMessage(messages.showQr)}</span>
                        </label>
                    </div>

                    <div className={styles.summary}>
                        <div className={styles.summaryValue}>{formatBytes(stats.size)}</div>
                        <div className={styles.summaryLabel}>
                            {intl.formatMessage(messages.stats, {
                                sprites: stats.sprites,
                                blocks: stats.blocks,
                                costumes: stats.costumes,
                                sounds: stats.sounds
                            })}
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button
                            className={styles.primaryButton}
                            disabled={!previewUrl}
                            type="button"
                            onClick={handleDownload}
                        >
                            <Download size={16} />
                            {intl.formatMessage(messages.download)}
                        </button>
                        <div className={styles.secondaryActions}>
                            <button
                                className={styles.secondaryButton}
                                disabled={!previewUrl}
                                type="button"
                                onClick={handleCopyImage}
                            >
                                {copied === 'image' ? <Check size={15} /> : <ImageIcon size={15} />}
                                {intl.formatMessage(messages.copyImage)}
                            </button>
                            <button
                                className={styles.secondaryButton}
                                disabled={!previewUrl}
                                type="button"
                                onClick={handleCopyText}
                            >
                                {copied === 'text' ? <Check size={15} /> : <Share2 size={15} />}
                                {intl.formatMessage(messages.copyText)}
                            </button>
                        </div>
                    </div>

                    {error ? (
                        <div className={styles.error}>{intl.formatMessage(messages.error)}</div>
                    ) : null}
                    {copyLabel ? (
                        <div className={copied === 'failed' ? styles.error : styles.copied}>{copyLabel}</div>
                    ) : null}
                </aside>
            </div>
        </Modal>
    );
};

ShareStudio.propTypes = {
    intl: intlShape.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    projectTitle: PropTypes.string,
    vm: PropTypes.shape({
        renderer: PropTypes.object,
        runtime: PropTypes.object,
        toJSON: PropTypes.func
    })
};

ShareStudio.defaultProps = {
    projectTitle: '',
    vm: null
};

export default injectIntl(ShareStudio);
