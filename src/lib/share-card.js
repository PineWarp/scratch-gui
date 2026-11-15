import qrcode from 'qrcode-generator';

/**
 * PineWarp Share Studio card renderer.
 *
 * Everything here runs locally in the browser: the stage snapshot, the stats
 * and the QR code are drawn onto a canvas and exported as a PNG. Nothing is
 * uploaded anywhere.
 */

const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Segoe UI",sans-serif';
const MONO_STACK = '"JetBrains Mono","Cascadia Code","SFMono-Regular",Consolas,monospace';

export const TEMPLATES = {
    forest: {
        label: 'Forest',
        bg1: '#04100c',
        bg2: '#0b2a20',
        glow: 'rgba(94,234,212,0.20)',
        accent: '#9af5cf',
        accent2: '#7dd3fc',
        text: '#f2fbf6',
        muted: '#a7c4b5',
        faint: '#6d8b7d',
        panel: 'rgba(255,255,255,0.055)',
        line: 'rgba(154,245,207,0.24)',
        dot: 'rgba(154,245,207,0.16)',
        overlay: 'rgba(4,16,12,0.92)',
        qr: '#04100c'
    },
    dawn: {
        label: 'Dawn',
        bg1: '#fff8ee',
        bg2: '#f1d9b8',
        glow: 'rgba(251,146,60,0.22)',
        accent: '#c2410c',
        accent2: '#d97706',
        text: '#2b1a0e',
        muted: '#7c5a3f',
        faint: '#a98a6c',
        panel: 'rgba(255,255,255,0.58)',
        line: 'rgba(120,72,32,0.20)',
        dot: 'rgba(120,72,32,0.14)',
        overlay: 'rgba(24,12,4,0.88)',
        qr: '#2b1a0e'
    },
    aurora: {
        label: 'Aurora',
        bg1: '#080d24',
        bg2: '#1b1040',
        glow: 'rgba(125,211,252,0.24)',
        accent: '#7dd3fc',
        accent2: '#c084fc',
        text: '#f7f9ff',
        muted: '#b4c0e8',
        faint: '#818cf8',
        panel: 'rgba(255,255,255,0.07)',
        line: 'rgba(125,211,252,0.28)',
        dot: 'rgba(196,181,253,0.16)',
        overlay: 'rgba(8,13,36,0.92)',
        qr: '#080d24'
    }
};

export const FORMATS = {
    wide: {width: 1200, height: 630, label: 'Landscape 16:9'},
    square: {width: 1080, height: 1080, label: 'Square 1:1'}
};

const roundRectPath = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
};

const fillRoundRect = (ctx, x, y, width, height, radius, fillStyle) => {
    roundRectPath(ctx, x, y, width, height, radius);
    ctx.fillStyle = fillStyle;
    ctx.fill();
};

const drawCover = (ctx, image, x, y, width, height) => {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(
        image,
        x + ((width - drawWidth) / 2),
        y + ((height - drawHeight) / 2),
        drawWidth,
        drawHeight
    );
};

const loadImage = source => new Promise((resolve, reject) => {
    if (!source) {
        resolve(null);
        return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
});

export const formatBytes = bytes => {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

export const formatCount = value => {
    try {
        return Number(value || 0).toLocaleString('zh-CN');
    } catch (error) {
        return String(Number(value) || 0);
    }
};

export const getShareUrl = () => {
    if (typeof location === 'undefined') return 'https://pinewarp.github.io/editor.html';
    const {origin, pathname} = location;
    if (/editor\.html$/i.test(pathname)) return `${origin}${pathname}`;
    return `${origin}/editor.html`;
};

export const buildShareText = ({title, author, stats, url}) => {
    const lines = [
        `#《${title}》—— 我在 PineWarp 做的新作品`,
        `作者：${author}`,
        `角色 ${formatCount(stats.sprites)} · 积木 ${formatCount(stats.blocks)} · ` +
            `造型 ${formatCount(stats.costumes)} · 声音 ${formatCount(stats.sounds)} · ${formatBytes(stats.size)}`,
        `来 PineWarp，用积木种出一片森林：${url}`,
        '#PineWarp #Scratch #创意编程'
    ];
    return lines.join('\n');
};

const drawBackground = (ctx, width, height, colors) => {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors.bg1);
    gradient.addColorStop(1, colors.bg2);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(
        width * 0.82, height * 0.10, 0,
        width * 0.82, height * 0.10, Math.max(width, height) * 0.62
    );
    glow.addColorStop(0, colors.glow);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.fillStyle = colors.dot;
    const step = 28;
    for (let y = 18; y < height; y += step) {
        for (let x = 18; x < width; x += step) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
};

const drawPineMark = (ctx, x, y, size, color) => {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + (size / 2), y);
    ctx.lineTo(x + (size * 0.92), y + (size * 0.52));
    ctx.lineTo(x + (size * 0.72), y + (size * 0.52));
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x + (size * 0.28), y + (size * 0.52));
    ctx.lineTo(x + (size * 0.08), y + (size * 0.52));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
};

const drawBrand = (ctx, x, y, colors, scale = 1) => {
    drawPineMark(ctx, x, y, 28 * scale, colors.accent);
    ctx.fillStyle = colors.text;
    ctx.font = `700 ${24 * scale}px ${FONT_STACK}`;
    ctx.fillText('PineWarp', x + (40 * scale), y + (21 * scale));
    ctx.fillStyle = colors.faint;
    ctx.font = `600 ${11 * scale}px ${MONO_STACK}`;
    ctx.fillText('SHARE STUDIO', x + (40 * scale), y + (39 * scale));
};

const wrapLines = (ctx, text, maxWidth, maxLines) => {
    const characters = Array.from(String(text || '').trim());
    const lines = [];
    let line = '';
    for (let i = 0; i < characters.length; i++) {
        const next = line + characters[i];
        if (line && ctx.measureText(next).width > maxWidth) {
            lines.push(line);
            line = characters[i];
            if (lines.length === maxLines) {
                let last = lines[maxLines - 1];
                const hasMore = i < characters.length - 1;
                if (hasMore) {
                    while (last && ctx.measureText(`${last}…`).width > maxWidth) {
                        last = last.slice(0, -1);
                    }
                    lines[maxLines - 1] = `${last}…`;
                }
                return lines;
            }
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
};

const drawStats = (ctx, x, y, width, stats, colors, scale = 1) => {
    const items = [
        {value: stats.sprites, label: 'Sprites'},
        {value: stats.blocks, label: 'Blocks'},
        {value: stats.costumes, label: 'Costumes'},
        {value: stats.sounds, label: 'Sounds'}
    ];
    const columnWidth = width / items.length;
    items.forEach((item, index) => {
        const columnX = x + (columnWidth * index);
        if (index > 0) {
            ctx.strokeStyle = colors.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(columnX - (18 * scale), y + (2 * scale));
            ctx.lineTo(columnX - (18 * scale), y + (58 * scale));
            ctx.stroke();
        }
        ctx.fillStyle = colors.text;
        ctx.font = `700 ${34 * scale}px ${FONT_STACK}`;
        ctx.fillText(formatCount(item.value), columnX, y + (34 * scale));
        ctx.fillStyle = colors.muted;
        ctx.font = `500 ${13 * scale}px ${FONT_STACK}`;
        ctx.fillText(item.label, columnX, y + (56 * scale));
    });
};

const drawQr = (ctx, x, y, size, url, colors) => {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const count = qr.getModuleCount();
    const quiet = 4;
    const cell = size / (count + (quiet * 2));
    fillRoundRect(ctx, x, y, size, size, 14, '#ffffff');
    ctx.fillStyle = colors.qr;
    for (let row = 0; row < count; row++) {
        for (let column = 0; column < count; column++) {
            if (qr.isDark(row, column)) {
                ctx.fillRect(
                    x + ((quiet + column) * cell),
                    y + ((quiet + row) * cell),
                    cell + 0.4,
                    cell + 0.4
                );
            }
        }
    }
};

const drawStagePanel = (ctx, image, x, y, width, height, colors) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 42;
    ctx.shadowOffsetY = 18;
    fillRoundRect(ctx, x, y, width, height, 26, colors.panel);
    ctx.restore();

    if (image) {
        ctx.save();
        roundRectPath(ctx, x, y, width, height, 26);
        ctx.clip();
        drawCover(ctx, image, x, y, width, height);
        ctx.restore();
    } else {
        const placeholder = ctx.createLinearGradient(x, y, x + width, y + height);
        placeholder.addColorStop(0, colors.panel);
        placeholder.addColorStop(1, 'rgba(0,0,0,0.18)');
        fillRoundRect(ctx, x, y, width, height, 26, placeholder);
        ctx.fillStyle = colors.muted;
        ctx.font = `600 20px ${FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.fillText('Stage preview', x + (width / 2), y + (height / 2));
        ctx.textAlign = 'left';
    }

    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, width, height, 26);
    ctx.stroke();
};

const drawFooter = (ctx, width, height, colors) => {
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, height - 42);
    ctx.lineTo(width - 64, height - 42);
    ctx.stroke();

    ctx.fillStyle = colors.faint;
    ctx.font = `500 13px ${MONO_STACK}`;
    ctx.fillText('PINEWARP.GITHUB.IO', 64, height - 20);

    ctx.textAlign = 'right';
    ctx.fillStyle = colors.faint;
    ctx.font = `500 13px ${FONT_STACK}`;
    ctx.fillText('让灵感破土，让创作成林', width - 64, height - 20);
    ctx.textAlign = 'left';
};

const drawWide = (ctx, image, options, colors) => {
    const {width, height} = FORMATS.wide;
    const {title, author, stats, showStats, showQr, url} = options;

    drawBackground(ctx, width, height, colors);
    drawBrand(ctx, 64, 54, colors);

    drawStagePanel(ctx, image, 620, 78, 516, 387, colors);

    ctx.fillStyle = colors.accent;
    ctx.font = `600 14px ${MONO_STACK}`;
    ctx.fillText('PINE WARP · PROJECT CARD', 64, 152);

    let titleY = 214;
    ctx.font = `700 56px ${FONT_STACK}`;
    const titleLines = wrapLines(ctx, title, 520, 2);
    titleLines.forEach(line => {
        ctx.fillStyle = colors.text;
        ctx.fillText(line, 64, titleY);
        titleY += 64;
    });

    const authorY = Math.max(titleY + 12, 344);
    ctx.fillStyle = colors.muted;
    ctx.font = `500 17px ${FONT_STACK}`;
    ctx.fillText('Author', 64, authorY);
    ctx.fillStyle = colors.accent;
    ctx.font = `600 19px ${FONT_STACK}`;
    ctx.fillText(author, 110, authorY);

    ctx.fillStyle = colors.muted;
    ctx.font = `500 14px ${FONT_STACK}`;
    ctx.fillText(`Project size ${formatBytes(stats.size)}`, 64, authorY + 28);

    if (showStats) {
        drawStats(ctx, 64, authorY + 62, 520, stats, colors);
    }

    if (showQr) {
        drawQr(ctx, 620, 492, 88, url, colors);
        ctx.fillStyle = colors.text;
        ctx.font = `600 16px ${FONT_STACK}`;
        ctx.fillText('Scan to open the editor', 724, 520);
        ctx.fillStyle = colors.muted;
        ctx.font = `500 12px ${MONO_STACK}`;
        ctx.fillText(url.replace(/^https?:\/\//, ''), 724, 542);
        ctx.fillStyle = colors.faint;
        ctx.font = `500 12px ${FONT_STACK}`;
        ctx.fillText('Post this card to the community and invite friends to create.', 724, 564);
    }

    drawFooter(ctx, width, height, colors);
};

const drawSquare = (ctx, image, options, colors) => {
    const {width, height} = FORMATS.square;
    const {title, author, stats, showStats, showQr, url} = options;

    drawBackground(ctx, width, height, colors);

    if (image) {
        drawCover(ctx, image, 0, 0, width, height);
    } else {
        const placeholder = ctx.createLinearGradient(0, 0, width, height);
        placeholder.addColorStop(0, colors.bg1);
        placeholder.addColorStop(1, colors.bg2);
        ctx.fillStyle = placeholder;
        ctx.fillRect(0, 0, width, height);
    }

    const overlay = ctx.createLinearGradient(0, height * 0.24, 0, height);
    overlay.addColorStop(0, 'rgba(0,0,0,0)');
    overlay.addColorStop(0.55, colors.overlay);
    overlay.addColorStop(1, 'rgba(0,0,0,0.96)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);

    drawBrand(ctx, 72, 62, colors, 1.1);

    let titleY = 636;
    ctx.font = `700 62px ${FONT_STACK}`;
    const titleLines = wrapLines(ctx, title, 880, 2);
    titleLines.forEach(line => {
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, 72, titleY);
        titleY += 70;
    });

    const authorY = Math.max(titleY + 6, 790);
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `500 20px ${FONT_STACK}`;
    ctx.fillText('Author', 72, authorY);
    ctx.fillStyle = colors.accent;
    ctx.font = `600 22px ${FONT_STACK}`;
    ctx.fillText(author, 124, authorY);

    ctx.fillStyle = 'rgba(255,255,255,0.64)';
    ctx.font = `500 16px ${FONT_STACK}`;
    ctx.fillText(`Project size ${formatBytes(stats.size)}`, 72, authorY + 32);

    if (showStats) {
        drawStats(ctx, 72, authorY + 72, 700, stats, colors, 1.05);
    }

    if (showQr) {
        drawQr(ctx, 876, 894, 116, url, colors);
        ctx.fillStyle = 'rgba(255,255,255,0.64)';
        ctx.font = `500 13px ${FONT_STACK}`;
        ctx.fillText('Scan to open the editor', 876, 1032);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(72, 1004);
    ctx.lineTo(836, 1004);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.font = `500 14px ${MONO_STACK}`;
    ctx.fillText('PINEWARP.GITHUB.IO', 72, 1038);
};

/**
 * Draw a share card and return its canvas.
 * @param {object} options Card content and appearance.
 * @returns {Promise<HTMLCanvasElement>} Rendered card.
 */
export const createShareCardCanvas = async options => {
    const {format = 'wide', template = 'forest'} = options;
    const {width, height} = FORMATS[format] || FORMATS.wide;
    const colors = TEMPLATES[template] || TEMPLATES.forest;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (document.fonts && document.fonts.ready) {
        try {
            await document.fonts.ready;
        } catch (error) {
            // Rendering with fallback fonts is fine.
        }
    }

    const image = await loadImage(options.stageImage);

    if (format === 'square') {
        drawSquare(ctx, image, options, colors);
    } else {
        drawWide(ctx, image, options, colors);
    }

    return canvas;
};

export const dataUrlToBlob = dataUrl => {
    const [header, base64] = String(dataUrl).split(',');
    const mime = (header.match(/:(.*?);/) || [])[1] || 'image/png';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], {type: mime});
};
