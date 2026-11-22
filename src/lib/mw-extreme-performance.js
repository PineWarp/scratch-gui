/**
 * 极致性能模式 v2（审查修复版）
 *
 * 一键舍弃一切视觉开销，榨干每一分性能：
 * - 打开作品：跳过非当前造型的同步等待，作品立即打开
 *   （PineWarp fork VM 走原生 setLoadAssetsLazily；Bilup VM 走
 *   runtime.lazyAssetInstall 标志，配合 Bilup/scratch-vm#1）
 * - 编辑器：禁用动画、过渡、阴影、滤镜；毛玻璃通过模块 API 整体关闭
 *   （CSS * 选择器特异性压不过毛玻璃自带 !important 规则，必须走 API）
 * - 运行时：关闭插值渲染（vm.setInterpolation）与高清画笔
 *   （renderer.setUseHighQualityRender），字段经源码核实
 * - 关闭时恢复原状：插值原值读 runtime.interpolationEnabled，
 *   高清画笔原值读 renderer.useHighQualityRender，毛玻璃恢复原设置
 *
 * 保存与打包保持完整保真（不做有损优化）。
 *
 * 鸣谢：PYC5635（勇敢的菠萝🍍）
 */
import {getFrostedGlassSettings, setFrostedGlassSettings, applyFrostedGlass} from './bl-frosted-glass.js';

const STORAGE_KEY = 'mw:extreme-performance';
const STYLE_ID = 'mw-extreme-performance-style';

const EXTREME_CSS = [
    '*, *::before, *::after {',
    '    transition: none !important;',
    '    animation: none !important;',
    '    will-change: auto !important;',
    '    text-shadow: none !important;',
    '    box-shadow: none !important;',
    '    filter: none !important;',
    '    backdrop-filter: none !important;',
    '}'
].join('\n');

// 开启前的状态快照，关闭模式时恢复
let savedState = null;

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

/** 关闭/恢复毛玻璃（走 bl-frosted-glass 模块 API，v1/v2 通用） */
const setFrostedGlassOff = off => {
    setFrostedGlassSettings(off);
    applyFrostedGlass(off);
};

const applyExtremePerformance = (vm, enabled) => {
    toggleStyle(enabled);
    if (!vm) return;
    try {
        // 1) 打开作品提速：跳过非当前造型的同步等待
        if (typeof vm.setLoadAssetsLazily === 'function') {
            // PineWarp fork VM 原生 API
            vm.setLoadAssetsLazily(enabled);
        } else if (vm.runtime) {
            // Bilup VM：配合 scratch-vm#1 的 runtime.lazyAssetInstall
            vm.runtime.lazyAssetInstall = enabled;
        }

        // 2) 渲染层：插值 + 高清画笔（原值快照用于恢复）
        if (enabled && !savedState && vm.runtime) {
            savedState = {
                interpolation: !!vm.runtime.interpolationEnabled,
                highQuality: vm.renderer && typeof vm.renderer.useHighQualityRender === 'boolean' ?
                    vm.renderer.useHighQualityRender :
                    true,
                frostedGlass: null
            };
            // 毛玻璃快照（模块不可用时静默跳过）
            try {
                savedState.frostedGlass = getFrostedGlassSettings();
            } catch (e) {
                savedState.frostedGlass = null;
            }
        }
        if (typeof vm.setInterpolation === 'function') {
            vm.setInterpolation(enabled ? false : (savedState ? savedState.interpolation : true));
        }
        if (vm.renderer && typeof vm.renderer.setUseHighQualityRender === 'function') {
            vm.renderer.setUseHighQualityRender(
                enabled ? false : (savedState ? savedState.highQuality : true)
            );
        }

        // 3) 毛玻璃：API 级整体关闭/恢复（CSS 兜底只压制无 !important 的来源）
        if (enabled && savedState && savedState.frostedGlass && savedState.frostedGlass.enabled) {
            setFrostedGlassOff(Object.assign({}, savedState.frostedGlass, {enabled: false}));
        } else if (!enabled && savedState && savedState.frostedGlass) {
            setFrostedGlassOff(savedState.frostedGlass);
        }

        if (!enabled) {
            savedState = null;
        }
    } catch (e) {
        // 渲染器/模块 API 缺失时静默忽略
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
