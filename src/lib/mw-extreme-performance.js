/**
 * 极致性能模式（Extreme Performance Mode）
 *
 * 一键舍弃一切视觉开销，榨干每一分性能：
 * - 打开作品：跳过造型/声音的同步加载，素材后台渐进加载，作品秒开
 * - 编辑器：禁用动画、过渡、毛玻璃（backdrop-filter）、阴影、滤镜与 text-shadow
 * - 运行时：关闭插值渲染与高清画笔，大幅减少每帧渲染工作量
 *
 * 保存与打包保持完整保真（不做有损优化）；关闭本模式时尽量恢复原有渲染设置。
 *
 * 鸣谢：PYC5635（勇敢的菠萝🍍）
 */
const STORAGE_KEY = 'mw:extreme-performance';
const STYLE_ID = 'mw-extreme-performance-style';

const EXTREME_CSS = [
    '*, *::before, *::after {',
    '    transition: none !important;',
    '    animation: none !important;',
    '    backdrop-filter: none !important;',
    '    box-shadow: none !important;',
    '    filter: none !important;',
    '    text-shadow: none !important;',
    '    will-change: auto !important;',
    '}'
].join('\n');

// 记录开启前的渲染器状态，关闭模式时恢复
let savedRendererState = null;

const getExtremePerformance = () => {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
        return false;
    }
};

const toggleStyle = enabled => {
    let style = document.getElementById(STYLE_ID);
    if (enabled && !style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = EXTREME_CSS;
        document.head.appendChild(style);
    } else if (!enabled && style) {
        style.remove();
    }
};

const applyExtremePerformance = (vm, enabled) => {
    toggleStyle(enabled);
    if (!vm) return;
    try {
        const renderer = vm.renderer;
        if (renderer) {
            if (enabled && !savedRendererState) {
                savedRendererState = {
                    interpolation: typeof renderer._interpolation === 'boolean' ? renderer._interpolation : true,
                    highQuality: typeof renderer._useHighQualityRender === 'boolean' ? renderer._useHighQualityRender : true
                };
            }
            if (typeof renderer.setInterpolation === 'function') {
                renderer.setInterpolation(
                    enabled ? false : (savedRendererState ? savedRendererState.interpolation : true)
                );
            }
            if (typeof renderer.setUseHighQualityRender === 'function') {
                renderer.setUseHighQualityRender(
                    enabled ? false : (savedRendererState ? savedRendererState.highQuality : true)
                );
            }
        }
        // 打开作品时跳过资源同步加载（与「加载作品时忽略造型」同一 VM API）
        if (typeof vm.setLoadAssetsLazily === 'function') {
            vm.setLoadAssetsLazily(enabled);
        }
        if (!enabled) {
            savedRendererState = null;
        }
    } catch (e) {
        // 渲染器 API 缺失时静默忽略
    }
};

const setExtremePerformance = (vm, enabled) => {
    try {
        localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (e) {
        // ignore
    }
    applyExtremePerformance(vm, enabled);
};

export {
    getExtremePerformance,
    applyExtremePerformance,
    setExtremePerformance
};
