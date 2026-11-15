// Bilup Accounts integration is disabled: no rotur-sdk dependency.
// Icon payloads come from the (now blocked) accounts API; a raw SVG string
// is parsed and sanitized directly, anything else renders nothing.

const ALLOWED_TAGS = new Set(['svg', 'path', 'line', 'circle', 'rect', 'polyline', 'polygon']);
const ALLOWED_ATTRIBUTES = new Set([
    'xmlns', 'viewBox', 'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'width', 'height', 'points',
    'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill'
]);

const safeIconSvg = (icon, options) => {
    if (!icon) return '';
    if (typeof icon !== 'string') return '';
    const document = new DOMParser().parseFromString(icon, 'image/svg+xml');
    if (document.querySelector('parsererror')) return '';
    const root = document.documentElement;
    if (root.tagName !== 'svg') return '';
    const sanitize = element => {
        for (const child of Array.from(element.children)) {
            if (!ALLOWED_TAGS.has(child.tagName)) {
                child.remove();
            } else {
                sanitize(child);
            }
        }
        for (const attribute of Array.from(element.attributes)) {
            if (!ALLOWED_ATTRIBUTES.has(attribute.name)) element.removeAttribute(attribute.name);
        }
    };
    sanitize(root);
    return new XMLSerializer().serializeToString(root);
};

export default safeIconSvg;
