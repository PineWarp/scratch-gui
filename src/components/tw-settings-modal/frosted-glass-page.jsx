/**
 * 毛玻璃设置页 v2 —— 重构版
 *
 * 相对 legacy 版新增：一键预设（轻盈/标准/浓郁）、饱和度滑块、边缘高光开关、
 * 作用范围多选（7 类界面元素）。所有变更即时保存并生效。
 * 旧版页面完整备份于 frosted-glass-page-legacy.jsx。
 *
 * 鸣谢：PYC5635（勇敢的菠萝🍍）
 */
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage, intlShape, injectIntl} from 'react-intl';
import bindAll from 'lodash.bindall';
import Box from '../box/box.jsx';
import styles from './settings-modal.css';

import {
    getFrostedGlassSettings,
    setFrostedGlassSettings,
    applyFrostedGlass,
    DEFAULT_SETTINGS,
    PRESETS,
    TARGETS
} from '../../lib/bl-frosted-glass.js';

class FrostedGlassPage extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'applyAndSave',
            'handleEnabledChange',
            'handleBlurRadiusChange',
            'handleOpacityChange',
            'handleThemeBoostChange',
            'handleSaturationChange',
            'handleEdgeHighlightChange',
            'handleLowPowerChange',
            'handleTargetChange',
            'handlePreset',
            'handleResetDefaults'
        ]);
        // 兼容 legacy 设置：缺省字段按默认值补全
        const saved = getFrostedGlassSettings() || DEFAULT_SETTINGS;
        this.state = {
            enabled: !!saved.enabled,
            blurRadius: saved.blurRadius || DEFAULT_SETTINGS.blurRadius,
            opacity: saved.opacity || DEFAULT_SETTINGS.opacity,
            themeBoost: saved.themeBoost != null ? saved.themeBoost : DEFAULT_SETTINGS.themeBoost,
            saturation: saved.saturation || DEFAULT_SETTINGS.saturation,
            edgeHighlight: saved.edgeHighlight !== undefined ?
                !!saved.edgeHighlight :
                DEFAULT_SETTINGS.edgeHighlight,
            lowPower: saved.lowPower !== undefined ?
                !!saved.lowPower :
                DEFAULT_SETTINGS.lowPower,
            // targets: null = 全部；数组 = 所选集合
            targets: Array.isArray(saved.targets) ? saved.targets : null
        };
    }

    applyAndSave (patch) {
        const newSettings = {
            ...this.state,
            ...patch
        };
        this.setState(newSettings);
        setFrostedGlassSettings(newSettings);
        applyFrostedGlass(newSettings);
    }

    handleEnabledChange (e) {
        this.applyAndSave({enabled: e.target.checked});
    }

    handleBlurRadiusChange (e) {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 4 && value <= 30) {
            this.applyAndSave({blurRadius: value});
        }
    }

    handleOpacityChange (e) {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value >= 0.05 && value <= 0.4) {
            this.applyAndSave({opacity: value});
        }
    }

    handleThemeBoostChange (e) {
        const value = parseFloat(e.target.value);
        if (!isNaN(value) && value >= 0.1 && value <= 0.55) {
            this.applyAndSave({themeBoost: value});
        }
    }

    handleSaturationChange (e) {
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value >= 100 && value <= 220) {
            this.applyAndSave({saturation: value});
        }
    }

    handleEdgeHighlightChange (e) {
        this.applyAndSave({edgeHighlight: e.target.checked});
    }

    handleLowPowerChange (e) {
        this.applyAndSave({lowPower: e.target.checked});
    }

    /** 勾选 / 取消某个作用范围；全部勾选时归一化回 null（全选语义） */
    handleTargetChange (targetId, checked) {
        const current = this.state.targets === null ?
            TARGETS.map(t => t.id) :
            this.state.targets.slice();
        const next = checked ?
            (current.includes(targetId) ? current : current.concat(targetId)) :
            current.filter(id => id !== targetId);
        this.applyAndSave({targets: next.length === TARGETS.length ? null : next});
    }

    /** 一键预设：保留 enabled 与 targets，替换视觉参数组 */
    handlePreset (presetKey) {
        const preset = PRESETS[presetKey];
        if (!preset) return;
        this.applyAndSave({
            enabled: true,
            blurRadius: preset.blurRadius,
            opacity: preset.opacity,
            themeBoost: preset.themeBoost,
            saturation: preset.saturation,
            edgeHighlight: preset.edgeHighlight
        });
    }

    handleResetDefaults () {
        this.applyAndSave({
            enabled: DEFAULT_SETTINGS.enabled,
            blurRadius: DEFAULT_SETTINGS.blurRadius,
            opacity: DEFAULT_SETTINGS.opacity,
            themeBoost: DEFAULT_SETTINGS.themeBoost,
            saturation: DEFAULT_SETTINGS.saturation,
            edgeHighlight: DEFAULT_SETTINGS.edgeHighlight,
            targets: DEFAULT_SETTINGS.targets
        });
    }

    isTargetChecked (targetId) {
        return this.state.targets === null || this.state.targets.includes(targetId);
    }

    render () {
        const {
            enabled,
            blurRadius,
            opacity,
            themeBoost,
            saturation,
            edgeHighlight,
            lowPower
        } = this.state;

        return (
            <Box className={styles.body}>
                <div className={styles.settingHeader}>
                    <FormattedMessage
                        id="bl.frostedGlass.pageTitle"
                        defaultMessage="Frosted Glass"
                    />
                </div>

                {/* 开关 */}
                <div className={styles.setting}>
                    <div className={styles.label}>
                        <label>
                            <input
                                type="checkbox"
                                checked={enabled}
                                onChange={this.handleEnabledChange}
                                className={styles.checkbox}
                            />
                            <FormattedMessage
                                id="bl.frostedGlass.enabled"
                                defaultMessage="Enable Frosted Glass"
                            />
                        </label>
                    </div>
                </div>

                {/* 一键预设 */}
                {enabled && (
                    <div className={styles.setting}>
                        <div className={styles.label}>
                            <FormattedMessage
                                id="bl.frostedGlass.presets"
                                defaultMessage="Presets"
                            />
                        </div>
                        <div className={styles.buttonRow}>
                            <button
                                className={styles.button}
                                onClick={() => this.handlePreset('light')}
                            >
                                <FormattedMessage
                                    id="bl.frostedGlass.preset.light"
                                    defaultMessage="Light"
                                />
                            </button>
                            <button
                                className={styles.button}
                                onClick={() => this.handlePreset('standard')}
                            >
                                <FormattedMessage
                                    id="bl.frostedGlass.preset.standard"
                                    defaultMessage="Standard"
                                />
                            </button>
                            <button
                                className={styles.button}
                                onClick={() => this.handlePreset('rich')}
                            >
                                <FormattedMessage
                                    id="bl.frostedGlass.preset.rich"
                                    defaultMessage="Rich"
                                />
                            </button>
                            <button
                                className={styles.button}
                                onClick={this.handleResetDefaults}
                            >
                                <FormattedMessage
                                    id="bl.frostedGlass.resetDefaults"
                                    defaultMessage="Reset Defaults"
                                />
                            </button>
                        </div>
                    </div>
                )}

                {enabled && (
                    <React.Fragment>
                        {/* 模糊强度 */}
                        <div className={styles.setting}>
                            <div className={styles.label}>
                                <FormattedMessage
                                    id="bl.frostedGlass.blurRadius"
                                    defaultMessage="Blur Intensity"
                                />
                                <span className={styles.settingValue}>{blurRadius}px</span>
                            </div>
                            <input
                                type="range"
                                min="4"
                                max="30"
                                step="1"
                                value={blurRadius}
                                onChange={this.handleBlurRadiusChange}
                                className={styles.gcSlider}
                            />
                            <div className={styles.rangeLabels}>
                                <span>4px</span>
                                <span>30px</span>
                            </div>
                        </div>

                        {/* 不透明度 */}
                        <div className={styles.setting}>
                            <div className={styles.label}>
                                <FormattedMessage
                                    id="bl.frostedGlass.opacity"
                                    defaultMessage="Opacity"
                                />
                                <span className={styles.settingValue}>{opacity.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.05"
                                max="0.4"
                                step="0.01"
                                value={opacity}
                                onChange={this.handleOpacityChange}
                                className={styles.gcSlider}
                            />
                            <div className={styles.rangeLabels}>
                                <span>0.05</span>
                                <span>0.40</span>
                            </div>
                        </div>

                        {/* 深浅补偿 */}
                        <div className={styles.setting}>
                            <div className={styles.label}>
                                <FormattedMessage
                                    id="bl.frostedGlass.themeBoost"
                                    defaultMessage="Dark/Light Difference"
                                />
                                <span className={styles.settingValue}>{themeBoost.toFixed(2)}</span>
                            </div>
                            <input
                                type="range"
                                min="0.1"
                                max="0.55"
                                step="0.05"
                                value={themeBoost}
                                onChange={this.handleThemeBoostChange}
                                className={styles.gcSlider}
                            />
                            <div className={styles.rangeLabels}>
                                <span>0.10</span>
                                <span>0.55</span>
                            </div>
                        </div>

                        {/* 饱和度 */}
                        <div className={styles.setting}>
                            <div className={styles.label}>
                                <FormattedMessage
                                    id="bl.frostedGlass.saturation"
                                    defaultMessage="Saturation"
                                />
                                <span className={styles.settingValue}>{saturation}%</span>
                            </div>
                            <input
                                type="range"
                                min="100"
                                max="220"
                                step="5"
                                value={saturation}
                                onChange={this.handleSaturationChange}
                                className={styles.gcSlider}
                            />
                            <div className={styles.rangeLabels}>
                                <span>100%</span>
                                <span>220%</span>
                            </div>
                        </div>

                        {/* 边缘高光 */}
                        <div className={styles.setting}>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={edgeHighlight}
                                        onChange={this.handleEdgeHighlightChange}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.edgeHighlight"
                                        defaultMessage="Edge Highlight"
                                    />
                                </label>
                            </div>
                        </div>

                        {/* 低负载模式 */}
                        <div className={styles.setting}>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={lowPower}
                                        onChange={this.handleLowPowerChange}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.lowPower"
                                        defaultMessage="Low Power Mode"
                                    />
                                </label>
                            </div>
                            <div className={styles.rangeLabels}>
                                <FormattedMessage
                                    id="bl.frostedGlass.lowPowerHelp"
                                    defaultMessage="Large windows use a solid glass tint instead of GPU blur; menus and popups keep the real frosted effect."
                                />
                            </div>
                        </div>

                        {/* 作用范围（react-intl 消息必须静态可求值，此处逐一展开） */}
                        <div className={styles.setting}>
                            <div className={styles.label}>
                                <FormattedMessage
                                    id="bl.frostedGlass.targetsTitle"
                                    defaultMessage="Apply To"
                                />
                            </div>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.isTargetChecked('window')}
                                        onChange={e => this.handleTargetChange('window', e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.target.window"
                                        defaultMessage="Window"
                                    />
                                </label>
                            </div>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.isTargetChecked('alert')}
                                        onChange={e => this.handleTargetChange('alert', e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.target.alert"
                                        defaultMessage="Alerts"
                                    />
                                </label>
                            </div>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.isTargetChecked('notification')}
                                        onChange={e => this.handleTargetChange('notification', e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.target.notification"
                                        defaultMessage="Notification"
                                    />
                                </label>
                            </div>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.isTargetChecked('toast')}
                                        onChange={e => this.handleTargetChange('toast', e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.target.toast"
                                        defaultMessage="Toast"
                                    />
                                </label>
                            </div>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.isTargetChecked('menu-bar-menu')}
                                        onChange={e => this.handleTargetChange('menu-bar-menu', e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.target.menuBarMenu"
                                        defaultMessage="Menu Bar Menus"
                                    />
                                </label>
                            </div>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.isTargetChecked('context-menu')}
                                        onChange={e => this.handleTargetChange('context-menu', e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.target.contextMenu"
                                        defaultMessage="Context Menu"
                                    />
                                </label>
                            </div>
                            <div className={styles.label}>
                                <label>
                                    <input
                                        type="checkbox"
                                        checked={this.isTargetChecked('popover')}
                                        onChange={e => this.handleTargetChange('popover', e.target.checked)}
                                        className={styles.checkbox}
                                    />
                                    <FormattedMessage
                                        id="bl.frostedGlass.target.popover"
                                        defaultMessage="Popover / Panels"
                                    />
                                </label>
                            </div>
                        </div>
                    </React.Fragment>
                )}
            </Box>
        );
    }
}

FrostedGlassPage.propTypes = {
    intl: intlShape.isRequired
};

export default injectIntl(FrostedGlassPage);
