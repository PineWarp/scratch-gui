/**
 * 常开弹窗的空闲预热。
 *
 * 编辑器里体积较大的弹窗（设置、自定义扩展……）都是 React.lazy 按需加载的：
 * 首屏因此变轻，但代价全落在「点开」那一下——点击之后才开始下载分块、解析、
 * 执行模块，期间 Suspense 的 fallback 是 null，窗口并不出现。
 * 网络稍差或换个新版本号之后，这一下就是几百毫秒到一两秒的空白。
 *
 * 这里在浏览器空闲时把它们提前 import() 一次。webpack 对同一个 import()
 * 只保留一份模块记录，React.lazy 之后拿到的是同一个已经 resolve 的 promise，
 * 于是「点击 → 出窗口」之间只剩一次微任务，不再等网络。
 *
 * 注意：
 * - 只预热、绝不 eagar 渲染，失败（离线、分块 404）静默忽略，不影响正常打开。
 * - 串行执行，避免一次把多个分块塞进同一帧的下载队列，和编辑器自身的懒加载
 *   （积木、paint 编辑器）抢带宽。
 */

const LOADERS = {
    settings: () => import('../../containers/tw-settings-modal.jsx'),
    customExtension: () => import('../../containers/tw-custom-extension-modal.jsx')
};

const started = new Set();

// 诊断开关：URL 带 no-modal-prefetch 时不预热，用来对比「预热 / 不预热」
// 两种情况下点开弹窗的耗时（见 temp/probe-settings-steps.json）。
const prefetchDisabled = () => (
    typeof window !== 'undefined' &&
    typeof window.location !== 'undefined' &&
    /(?:^|[?&])no-modal-prefetch(?:[=&]|$)/.test(window.location.search)
);

const whenIdle = callback => {
    if (typeof window === 'undefined') return;
    if (typeof window.requestIdleCallback === 'function') {
        // timeout 保证即便一直不空闲，也会在几秒内跑完，避免用户第一次点开时
        // 预热还没开始。
        window.requestIdleCallback(callback, {timeout: 4000});
        return;
    }
    window.setTimeout(callback, 1200);
};

/**
 * 预热单个弹窗。可重复调用，只有第一次会真正发起 import()。
 * @param {string} name 弹窗标识，见 LOADERS 的键（'settings' | 'customExtension'）
 * @returns {Promise} 永不 reject；预热失败时会把该名字移出已预热集合，允许重试
 */
const prefetchModal = name => {
    const loader = LOADERS[name];
    if (!loader || started.has(name)) {
        return Promise.resolve();
    }
    started.add(name);
    return loader().then(
        // 成功：模块已进入 webpack 的模块缓存，React.lazy 之后直接命中
        () => {},
        () => {
            // 预热失败不是错误：真正的打开动作会再 import 一次并自行报错。
            started.delete(name);
        }
    );
};

/**
 * 在空闲时依次预热给定弹窗（默认：设置 → 自定义扩展）。
 * @param {Array<string>} [names] 要预热的弹窗标识列表，按顺序串行执行
 * @returns {Promise} 整条队列跑完后 resolve
 */
const scheduleModalPrefetch = (names = ['settings', 'customExtension']) => new Promise(resolve => {
    if (prefetchDisabled()) {
        resolve();
        return;
    }
    whenIdle(() => {
        let chain = Promise.resolve();
        for (const name of names) {
            chain = chain.then(() => prefetchModal(name));
        }
        chain.then(resolve, resolve);
    });
});

export {prefetchModal, scheduleModalPrefetch};
