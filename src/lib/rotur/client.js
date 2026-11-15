// Bilup Accounts integration is disabled: no rotur-sdk dependency.
// All methods are stubbed to the "not logged in" path so downstream UI
// automatically degrades (no sessions, no notifications, no credits).

<<<<<<< eea4f3f
const TOKEN_KEY = 'mw:rotur-token';
const REQUIRED_PERMISSIONS = [
    ...resolvePermissions([
        'me.checkAuth',
        'following.follow',
        'following.unfollow',
        'validators.generate',
        'me.transfer',
        'me.claimDaily',
        'notifications.list'
    ]),
    'credits:view'
];
const PRESENCE_PERMISSION = 'account:profile';
const LOGIN_PERMISSIONS = [...REQUIRED_PERMISSIONS, PRESENCE_PERMISSION];
const ACTIVITY_ID = 'PineWarp';
const APP_URL = 'https://com.pinewarp.org/';
const APP_IMAGE = 'https://raw.githubusercontent.com/PineWarp/desktop/master/art/icon.png';
=======
const ACTIVITY_ID = 'Bilup';
const APP_URL = 'https://com.bilup.org/';
const APP_IMAGE = 'https://raw.githubusercontent.com/Bilup/desktop/master/art/icon.png';
>>>>>>> bilup/develop

const createStubClient = () => ({
    loggedIn: false,
    token: null,
    socket: null,
    me: {},
    notifications: {},
    setToken: () => {},
    logout: () => {},
    connectSocket: async () => {},
    login: async () => {}
});

/** @type {ReturnType<typeof createStubClient>|null} */
let client = null;

const getClient = () => {
    if (!client) {
        client = createStubClient();
    }
    return client;
};

/**
 * Stable avatar URL derived only from username.
 * @param {string} username - Account username
 * @returns {string} Avatar URL
 */
const getAvatarUrl = username => (
    `https://avatars.accounts.pinewarp.org/${encodeURIComponent(String(username).toLowerCase())}`
);

<<<<<<< eea4f3f
/**
 * Normalize me.get() / profile payloads into a stable shape.
 * @param {object} data - Raw profile payload
 * @returns {object|null} Normalized user or null
 */
const normalizeUser = data => {
    if (!data || typeof data !== 'object' || data.error) {
        return null;
    }
    const username = data.username || data.name || data.user;
    if (!username || typeof username !== 'string') {
        return null;
    }
    const id = data['sys.id'] || data.id || data.key || data.sys_id || null;
    return {
        username,
        id: id === null ? null : String(id),
        avatarUrl: getAvatarUrl(username),
        bio: typeof data.bio === 'string' ? data.bio : null
    };
};

const fetchCurrentUser = async () => {
    const rotur = getClient();
    if (!rotur.loggedIn) {
        return null;
    }
    let sawNetworkError = false;
    try {
        const user = normalizeUser(await rotur.me.get());
        if (user) return user;
    } catch (_) {
        sawNetworkError = true;
    }
    try {
        const auth = await rotur.me.checkAuth();
        if (auth && auth.username) {
            return normalizeUser({username: auth.username});
        }
        return null;
    } catch (_) {
        sawNetworkError = true;
    }
    if (sawNetworkError) {
        const error = new Error('Could not reach PineWarp Accounts');
        error.transient = true;
        throw error;
    }
    return null;
};

const tokenHasRequiredPermissions = async () => {
    const rotur = getClient();
    try {
        const abilities = await rotur.me.abilities();
        if (!abilities || abilities.error || abilities.token_type === 'main') {
            return true;
        }
        const granted = Array.isArray(abilities.permissions) ? abilities.permissions : [];
        if (granted.includes('full')) {
            return true;
        }
        for (const permission of REQUIRED_PERMISSIONS) {
            if (!granted.includes(permission)) {
                return false;
            }
        }
        return true;
    } catch (_) {
        return true;
    }
};

/** Whether the current token may publish status/activity over the status socket. */
const presenceSupported = async () => {
    const rotur = getClient();
    if (!rotur.loggedIn) {
        return false;
    }
    try {
        const abilities = await rotur.me.abilities();
        if (!abilities || abilities.error || abilities.token_type === 'main') {
            return true;
        }
        const granted = Array.isArray(abilities.permissions) ? abilities.permissions : [];
        return granted.includes('full') || granted.includes(PRESENCE_PERMISSION);
    } catch (_) {
        return true;
    }
};

const RESTORE_CACHE_KEY = 'mw:rotur-restore';
const RESTORE_CACHE_TTL = 5 * 60 * 1000;

const readRestoreCache = token => {
    try {
        const raw = sessionStorage.getItem(RESTORE_CACHE_KEY);
        if (!raw) return null;
        const {user, at, token: cachedToken} = JSON.parse(raw);
        if (cachedToken !== token || !at || Date.now() - at > RESTORE_CACHE_TTL) return null;
        return user || null;
    } catch (_) {
        return null;
    }
};

const writeRestoreCache = (token, user) => {
    try {
        if (user) {
            sessionStorage.setItem(RESTORE_CACHE_KEY, JSON.stringify({user, token, at: Date.now()}));
        } else {
            sessionStorage.removeItem(RESTORE_CACHE_KEY);
        }
    } catch (_) {
        // ignore
    }
};

=======
>>>>>>> bilup/develop
/** Restore a previous session from localStorage. */
const restoreSession = async () => null;

const buildAuthUrl = (returnTo = (typeof window === 'undefined' ? '' : window.location.href)) => {
    const params = new URLSearchParams({
        system: 'web',
        return_to: returnTo
    });
    return `https://accounts.pinewarp.org/auth?${params.toString()}`;
};

<<<<<<< eea4f3f
/** Open the PineWarp Accounts login flow (popup, with iframe fallback for Electron). */
const login = async () => {
    const rotur = getClient();
    await rotur.login({
        system: 'web',
        timeout: 120000,
        requires: LOGIN_PERMISSIONS
    });
    storeToken(rotur.token);
    const user = await fetchCurrentUser();
    if (!user) {
        throw new Error('Logged in but could not load PineWarp Accounts profile');
    }
    writeRestoreCache(rotur.token, user);
    return user;
=======
/** Open the Bilup Accounts login flow (disabled). */
const login = async () => {
    const error = new Error('登录已禁用');
    error.needsReauth = true;
    throw error;
>>>>>>> bilup/develop
};

const clearActivity = () => {};

const logout = () => {
    getClient().logout();
};

/** Whether the current token may publish status/activity over the status socket. */
const presenceSupported = async () => false;

const subscribeNotifications = () => () => {};
const subscribeNotificationRemovals = () => () => {};

/**
<<<<<<< eea4f3f
 * Publish PineWarp editing presence.
 * Title/status are fixed strings; edit duration uses start_time only.
 * @param {object|string} projectTitleOrCtx - Project title or activity context.
 * @param {object} [extra] - Extra activity fields.
=======
 * Publish Bilup editing presence (disabled).
>>>>>>> bilup/develop
 */
const syncActivity = async () => {};

const isLoggedIn = () => getClient().loggedIn;
const getRotur = () => getClient();

const fetchNotifications = async () => [];

const markNotificationsRead = async () => false;

const ensureScopes = async () => false;

const getBalance = async () => null;

const getAccountSummary = async () => null;

const payUser = async () => {
    const error = new Error('Log in to send credits');
    error.needsReauth = true;
    throw error;
};

<<<<<<< eea4f3f
const markNotificationsRead = async () => {
    const rotur = getClient();
    if (!rotur.loggedIn) {
        return false;
    }
    try {
        await rotur.notifications.markRead();
        return true;
    } catch (_) {
        return false;
    }
};

// Ensure the current session token can exercise every scope in `scopes`. If the
// token is already sufficient (or is a full-access main token) this is a no-op;
// otherwise it re-runs the PineWarp Accounts login popup requesting the union of the existing
// login scopes plus the requested ones, broadening the same session in place. No
// separate per-project sub-token is minted.
const ensureScopes = async scopes => {
    const rotur = getClient();
    if (!rotur.loggedIn) {
        return false;
    }
    const wanted = Array.isArray(scopes) ? scopes.filter(Boolean) : [];
    if (!wanted.length) {
        return true;
    }
    let granted = null;
    try {
        const abilities = await rotur.me.abilities();
        if (!abilities || abilities.error || abilities.token_type === 'main') {
            return true;
        }
        granted = Array.isArray(abilities.permissions) ? abilities.permissions : [];
    } catch (_) {
        return true;
    }
    if (granted.includes('full')) {
        return true;
    }
    const missing = wanted.filter(scope => !granted.includes(scope));
    if (!missing.length) {
        return true;
    }
    await rotur.login({
        system: 'rotur',
        timeout: 120000,
        requires: [...new Set([...LOGIN_PERMISSIONS, ...wanted])]
    });
    storeToken(rotur.token);
    return true;
};

const isPaymentPermissionError = error => {
    const message = String((error && error.message) || error || '').toLowerCase();
    return message.includes('permission') ||
        message.includes('scope') ||
        message.includes('not allowed') ||
        message.includes('unauthorized') ||
        message.includes('token');
};

// Read the current PineWarp Accounts credit balance, or null if the token can't see it.
const getBalance = async () => {
    const rotur = getClient();
    if (!rotur.loggedIn) {
        return null;
    }
    try {
        const me = await rotur.me.get();
        return me && typeof me['sys.currency'] === 'number' ? me['sys.currency'] : null;
    } catch (_) {
        return null;
    }
};

// Read balance plus donation totals from the account's transaction history.
// Returns null if the token can't see credits. Fields default to 0/null.
const getAccountSummary = async () => {
    const rotur = getClient();
    if (!rotur.loggedIn) {
        return null;
    }
    try {
        const me = await rotur.me.get();
        if (!me || me.error) {
            return null;
        }
        const balance = typeof me['sys.currency'] === 'number' ? me['sys.currency'] : null;
        const txns = me['sys.transactions'] || me.transactions || [];
        let donationsReceived = 0;
        let donationsGiven = 0;
        if (Array.isArray(txns)) {
            for (const t of txns) {
                const note = String(t.note || '').toLowerCase();
                if (!note.includes('donation')) continue;
                if (t.type === 'in') donationsReceived += Number(t.amount) || 0;
                else if (t.type === 'out') donationsGiven += Number(t.amount) || 0;
            }
        }
        const round = value => Math.round(value * 100) / 100;
        return {
            balance,
            donationsReceived: round(donationsReceived),
            donationsGiven: round(donationsGiven),
            hasTransactions: Array.isArray(txns)
        };
    } catch (_) {
        return null;
    }
};

// Transfer credits to another PineWarp Accounts user. Throws an Error; if the failure is a
// missing-permission on the current (sub-)token, the error carries needsReauth.
const payUser = async (to, amount, note) => {
    const rotur = getClient();
    if (!rotur.loggedIn) {
        const error = new Error('Log in to send credits');
        error.needsReauth = true;
        throw error;
    }
    const result = await rotur.me.transfer(to, amount, note);
    if (result && result.error) {
        const error = new Error(result.error);
        if (isPaymentPermissionError(result.error)) {
            error.needsReauth = true;
        }
        throw error;
    }
    return result;
};

// Claim the account's daily credits. Throws on failure; the error carries
// needsReauth when the token lacks the credits:daily permission, and waitHours
// when the daily claim is not yet available.
=======
>>>>>>> bilup/develop
const claimDaily = async () => {
    const error = new Error('Log in to claim daily credits');
    error.needsReauth = true;
    throw error;
};

const fetchCurrentUser = async () => null;

export {
    ACTIVITY_ID,
    APP_URL,
    APP_IMAGE,
    getAvatarUrl,
    buildAuthUrl,
    restoreSession,
    login,
    logout,
    subscribeNotifications,
    subscribeNotificationRemovals,
    syncActivity,
    clearActivity,
    isLoggedIn,
    presenceSupported,
    getRotur,
    fetchCurrentUser,
    getBalance,
    getAccountSummary,
    payUser,
    claimDaily,
    ensureScopes,
    fetchNotifications,
    markNotificationsRead
};
