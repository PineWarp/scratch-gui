import './public-path';
import '../lib/utils/tw-polyfill';
import '../lib/normalize.css';

// Block all network access to the Bilup Accounts / Bilup API hosts.
// Any request (fetch) to these hosts is rejected as a network failure so the
// calling code takes its offline fallback path.
const BLOCKED_HOST_SUFFIXES = [
    'accounts.bilup.org', // covers api.accounts.bilup.org, avatars.accounts.bilup.org, ...
    'accounts.api.bilup.org',
    'api.bilup.org'
];

const isBlockedUrl = url => {
    try {
        const hostname = new URL(url, window.location.href).hostname.toLowerCase();
        return BLOCKED_HOST_SUFFIXES.some(suffix =>
            hostname === suffix || hostname.endsWith(`.${suffix}`));
    } catch (_) {
        return false;
    }
};

const originalFetch = window.fetch;
window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url);
    if (typeof url === 'string' && isBlockedUrl(url)) {
        return Promise.reject(new TypeError('Failed to fetch'));
    }
    return originalFetch(input, init);
};
