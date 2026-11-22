/**
 * 「加载作品时忽略造型」核心逻辑
 *
 * 两级实现（按 VM 能力自动选择）：
 * 1. PineWarp fork VM：原生 vm.setLoadAssetsLazily(enabled)
 * 2. Bilup VM（含 JIT 编译器的上游）：配合 scratch-vm PR
 *    「runtime.lazyAssetInstall flag」——设置标志后，sb3 解析器走
 *    installWithCurrentCostume 快速路径：作品打开只等当前造型就绪，
 *    其余造型/声音后台装载，到达后经 requestTargetsUpdate 刷新 GUI。
 */
const STORAGE_KEY = 'mw:skip-asset-loading';

const getSkipAssetLoading = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (err) {
        return false;
    }
};

const applySkipAssetLoading = vm => {
    if (!vm) return;
    const enabled = getSkipAssetLoading();
    // 1) PineWarp fork VM 的原生 API
    if (typeof vm.setLoadAssetsLazily === 'function') {
        vm.setLoadAssetsLazily(enabled);
        return;
    }
    // 2) Bilup VM：lazyAssetInstall 标志（需要配套的 scratch-vm PR）
    try {
        if (vm.runtime) {
            vm.runtime.lazyAssetInstall = enabled;
        }
    } catch (err) {
        // ignore
    }
};

const setSkipAssetLoading = (vm, enabled) => {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (err) {
        // ignore
    }
    applySkipAssetLoading(vm);
};

export {
    getSkipAssetLoading,
    applySkipAssetLoading,
    setSkipAssetLoading
};
