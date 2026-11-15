// Bilup Accounts integration is disabled: no rotur-sdk dependency.
// All methods are stubbed to the "not logged in" path so downstream UI
// automatically degrades (no sessions, no notifications, no credits).

const ACTIVITY_ID = 'Bilup';
const APP_URL = 'https://com.bilup.org/';
const APP_IMAGE = 'https://raw.githubusercontent.com/Bilup/desktop/master/art/icon.png';

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
    `https://avatars.accounts.bilup.org/${encodeURIComponent(String(username).toLowerCase())}`
);

/** Restore a previous session from localStorage. */
const restoreSession = async () => null;

const buildAuthUrl = (returnTo = (typeof window === 'undefined' ? '' : window.location.href)) => {
    const params = new URLSearchParams({
        system: 'web',
        return_to: returnTo
    });
    return `https://accounts.bilup.org/auth?${params.toString()}`;
};

/** Open the Bilup Accounts login flow (disabled). */
const login = async () => {
    const error = new Error('登录已禁用');
    error.needsReauth = true;
    throw error;
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
 * Publish Bilup editing presence (disabled).
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
