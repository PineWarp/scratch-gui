import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import Box from '../box/box.jsx';
import Modal from '../../containers/windowed-modal.jsx';
import FancyCheckbox from '../tw-fancy-checkbox/checkbox.jsx';
import Input from '../forms/input.jsx';
import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import DocumentationLink from '../tw-documentation-link/documentation-link.jsx';
import {
    ModalSidebar,
    ModalSidebarCollapsibleGroup,
    ModalSidebarContent,
    ModalSidebarItem,
    ModalSidebarLayout
} from '../modal-sidebar/modal-sidebar.jsx';
import styles from './settings-modal.css';
import helpIcon from './help-icon.svg';
import {APP_NAME} from '../../lib/constants/brand.js';
import isScratchDesktop from '../../lib/utils/isScratchDesktop';
import {STYLE_GROUPS} from '../../lib/mw-style-settings';
import StylePreview from './style-preview.jsx';
import MenuBarLayoutSetting from './menu-bar-layout.jsx';
import MenuBarFeatureSettings from './menu-bar-settings.jsx';

// ---------------------------------------------------------------------------
// 页面级按需加载
//
// 设置窗口默认停在「常规」页，但下面这几页各自带着一整套编辑器：主题页挂着
// 自定义主题编辑器 + 渐变生成器，字体页带着字体管理窗口，快捷键页带着整张
// 快捷键表。它们原先在模块顶部静态引入，于是「打开设置」必须先下载并解析
// 这些代码——哪怕你从来不点这些页。
//
// 改成 React.lazy 之后，窗口首屏只需要「常规」页的代码；某一页第一次被点开
// 时才拉取它自己的分块。渲染位置见下方 SettingsRouter 外的 Suspense。
// ---------------------------------------------------------------------------
const lazyNamedPage = (loader, name) => React.lazy(() => (
    loader().then(module => ({default: module[name]}))
));

const LanguagePage = lazyNamedPage(() => import('./appearance-pages.jsx'), 'LanguagePage');
const ThemePage = lazyNamedPage(() => import('./appearance-pages.jsx'), 'ThemePage');
const WallpaperPage = lazyNamedPage(() => import('./appearance-pages.jsx'), 'WallpaperPage');
const FontsPage = lazyNamedPage(() => import('./appearance-pages.jsx'), 'FontsPage');
const ColorThemePage = lazyNamedPage(() => import('./color-theme-page.jsx'), 'ColorThemePage');
const CustomThemesPage = React.lazy(() => import('./custom-themes-page.jsx'));
const VersionControlPage = React.lazy(() => import('./pages/version-control-page.jsx'));
const AutosavePage = React.lazy(() => import('./pages/autosave-page.jsx'));
const VariableManagerPage = React.lazy(() => import('./pages/variable-manager-page.jsx'));
const DesktopPage = React.lazy(() => import('./pages/desktop-page.jsx'));
const LoadingScreenPage = React.lazy(() => import('./loading-screen-page.jsx'));
const FrostedGlassPage = React.lazy(() => import('./frosted-glass-page.jsx'));
const ShortcutManager = React.lazy(() => import('../shortcut-manager/shortcut-manager.jsx'));
import {takeSettingsModalInitialView} from '../../lib/settings/modal-view.js';
import {getSettingsSidebarGroups} from './settings-navigation.js';
import {searchSettingsPages} from './settings-search.js';

import {ChevronLeft, Search} from 'lucide-react';

import {DEFINITIONS as DEBUGGER_SETTINGS, getSetting as getDebuggerSetting,
    setSetting as setDebuggerSetting} from '../../lib/debugger/settings.js';

const BufferedInput = BufferedInputHOC(Input);

const messages = defineMessages({
    title: {
        defaultMessage: 'Settings',
        description: 'Title of settings modal',
        id: 'tw.settingsModal.title'
    },
    help: {
        defaultMessage: 'Click for help',
        description: 'Hover text of help icon in settings',
        id: 'tw.settingsModal.help'
    },
    settingsSectionsAria: {
        defaultMessage: 'Settings sections',
        description: 'Aria label for the settings sidebar',
        id: 'mw.settings.ariaLabel'
    },
    search: {
        defaultMessage: 'Search settings',
        description: 'Placeholder for the search box at the top of the settings window sidebar',
        id: 'mw.settingsModal.search'
    },
    noResults: {
        defaultMessage: 'No settings match',
        description: 'Shown in the settings window sidebar when a search finds nothing',
        id: 'mw.settingsModal.noResults'
    },
    desktopSystemDefault: {
        defaultMessage: 'System default',
        id: 'mw.settingsModal.desktop.systemDefault'
    },
    desktopUpdateAll: {
        defaultMessage: 'All updates, including betas',
        id: 'mw.settingsModal.desktop.updateAll'
    },
    desktopUpdateStable: {
        defaultMessage: 'Stable updates',
        id: 'mw.settingsModal.desktop.updateStable'
    },
    desktopUpdateSecurity: {
        defaultMessage: 'Security updates only',
        id: 'mw.settingsModal.desktop.updateSecurity'
    },
    desktopUpdateNever: {
        defaultMessage: 'Never',
        id: 'mw.settingsModal.desktop.updateNever'
    },
    headerFeatured: {
        defaultMessage: 'Featured',
        description: 'Settings modal section',
        id: 'tw.settingsModal.featured'
    },
    headerRemoveLimits: {
        defaultMessage: 'Remove Limits',
        description: 'Settings modal section',
        id: 'tw.settingsModal.removeLimits'
    },
    headerDangerZone: {
        defaultMessage: 'Danger Zone',
        description: 'Settings modal section',
        id: 'tw.settingsModal.dangerZone'
    },
    headerCloud: {
        defaultMessage: 'Cloud Service',
        description: 'Settings modal section',
        id: 'tw.settingsModal.cloud'
    },
    headerExperimental: {
        defaultMessage: 'Experimental',
        id: 'mw.settings.experimental'
    },
    headerEditor: {
        defaultMessage: 'Editor',
        id: 'mw.settings.editor'
    },
    headerInterface: {
        defaultMessage: 'Interface',
        id: 'mw.settings.interface'
    },
    headerStage: {
        defaultMessage: 'Stage',
        id: 'mw.settings.stageHeader'
    },
    headerBlockPalette: {
        defaultMessage: 'Block Palette',
        id: 'mw.settings.blockPaletteHeader'
    },
    headerStyles: {
        defaultMessage: 'Styles',
        id: 'mw.settings.stylesHeader'
    },
    headerMenuBar: {
        defaultMessage: 'Menu Bar',
        id: 'mw.settings.menuBarHeader'
    },
    headerMenuBarLayout: {
        defaultMessage: 'Layout',
        id: 'mw.settings.menuBarLayoutHeader'
    },
    headerMenuBarItems: {
        defaultMessage: 'Menu Items',
        id: 'mw.settings.menuBarItemsHeader'
    },
    headerAutosave: {
        defaultMessage: 'Autosave',
        id: 'mw.settings.autosaveHeader'
    },
    headerDebugger: {
        defaultMessage: 'Debugger',
        id: 'mw.settings.debuggerHeader'
    },
    headerVersionControl: {
        defaultMessage: 'Version Control',
        id: 'mw.settings.versionControlHeader'
    },
    headerVariableManager: {
        defaultMessage: 'Variable Manager',
        id: 'mw.settings.variableManagerHeader'
    },
    cloudServerPlaceholder: {
        defaultMessage: 'ws://localhost:8000',
        id: 'mw.settings.cloudServerPlaceholder'
    },
    authorEmailPlaceholder: {
        defaultMessage: 'user@example.com',
        id: 'mw.settings.vc.authorEmailPlaceholder'
    },
    defaultBranchPlaceholder: {
        defaultMessage: 'main',
        id: 'mw.settings.vc.defaultBranchPlaceholder'
    }
});

const LearnMore = props => (
    <React.Fragment>
        {' '}
        <DocumentationLink {...props}>
            <FormattedMessage
                defaultMessage="Learn more."
                id="gui.alerts.cloudInfoLearnMore"
            />
        </DocumentationLink>
    </React.Fragment>
);

const Header = ({children}) => (
    <div className={styles.header}>
        {children}
        <div className={styles.divider} />
    </div>
);
Header.propTypes = {
    children: PropTypes.node
};

class UnwrappedSetting extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClickHelp'
        ]);
        this.state = {
            helpVisible: false
        };
    }
    componentDidUpdate (prevProps) {
        if (this.props.active && !prevProps.active) {
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({
                helpVisible: true
            });
        }
    }
    handleClickHelp () {
        this.setState(prevState => ({
            helpVisible: !prevState.helpVisible
        }));
    }
    render () {
        const {active, primary, secondary, help, slug, intl} = this.props;
        const {helpVisible} = this.state;

        return (
            <div
                className={classNames(styles.setting, {
                    [styles.active]: active
                })}
            >
                <div className={styles.label}>
                    {primary}
                    <button
                        className={styles.helpIcon}
                        onClick={this.handleClickHelp}
                        title={intl.formatMessage(messages.help)}
                    >
                        <img
                            src={helpIcon}
                            draggable={false}
                        />
                    </button>
                </div>
                {helpVisible && (
                    <div className={styles.detail}>
                        {help}
                        {slug && <LearnMore slug={slug} />}
                    </div>
                )}
                {secondary}
            </div>
        );
    }
}

UnwrappedSetting.propTypes = {
    intl: intlShape,
    active: PropTypes.bool,
    help: PropTypes.node,
    primary: PropTypes.node,
    secondary: PropTypes.node,
    slug: PropTypes.string
};

const Setting = injectIntl(UnwrappedSetting);

const BooleanSetting = ({value, onChange, label, ...props}) => (
    <Setting
        {...props}
        active={value}
        primary={
            <label className={styles.label}>
                <FancyCheckbox
                    className={styles.checkbox}
                    checked={value}
                    onChange={onChange}
                />
                {label}
            </label>
        }
    />
);

BooleanSetting.propTypes = {
    onChange: PropTypes.func.isRequired,
    value: PropTypes.bool.isRequired,
    label: PropTypes.node.isRequired
};

const settingDefinitions = {
    highQualityPen: {
        label: {
            defaultMessage: 'High Quality Pen',
            description: 'High quality pen setting',
            id: 'tw.settingsModal.highQualityPen'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Allows pen projects to render at higher resolutions and disables some coordinate rounding in the editor. Not all projects benefit from this setting and it may impact performance.',
            description: 'High quality pen setting help',
            id: 'tw.settingsModal.highQualityPenHelp'
        },
        slug: 'high-quality-pen'
    },
    interpolation: {
        label: {
            defaultMessage: 'Interpolation',
            description: 'Interpolation setting',
            id: 'tw.settingsModal.interpolation'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Makes projects appear smoother by interpolating sprite motion. Interpolation should not be used on 3D projects, raytracers, pen projects, and laggy projects as interpolation will make them run slower without making them appear smoother.',
            description: 'Interpolation setting help',
            id: 'tw.settingsModal.interpolationHelp'
        },
        slug: 'interpolation'
    },
    infiniteClones: {
        label: {
            defaultMessage: 'Infinite Clones',
            description: 'Infinite Clones setting',
            id: 'tw.settingsModal.infiniteClones'
        },
        help: {
            defaultMessage: 'Disables Scratch\'s 300 clone limit.',
            description: 'Infinite Clones setting help',
            id: 'tw.settingsModal.infiniteClonesHelp'
        },
        slug: 'infinite-clones'
    },
    removeFencing: {
        label: {
            defaultMessage: 'Remove Fencing',
            description: 'Remove Fencing setting',
            id: 'tw.settingsModal.removeFencing'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Allows sprites to move offscreen, become as large or as small as they want, and makes touching blocks work offscreen.',
            description: 'Remove Fencing setting help',
            id: 'tw.settingsModal.removeFencingHelp'
        },
        slug: 'remove-fencing'
    },
    removeMiscLimits: {
        label: {
            defaultMessage: 'Remove Miscellaneous Limits',
            description: 'Remove Miscellaneous Limits setting',
            id: 'tw.settingsModal.removeMiscLimits'
        },
        help: {
            defaultMessage: 'Removes sound effect limits and pen size limits.',
            description: 'Remove Miscellaneous Limits setting help',
            id: 'tw.settingsModal.removeMiscLimitsHelp'
        },
        slug: 'remove-limits'
    },
    disableCompiler: {
        label: {
            defaultMessage: 'Disable Compiler',
            description: 'Disable Compiler setting',
            id: 'tw.settingsModal.disableCompiler'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Disables the {APP_NAME} compiler. You may want to enable this while editing projects so that scripts update immediately. Otherwise, you should never enable this.',
            description: 'Disable Compiler help',
            id: 'tw.settingsModal.disableCompilerHelp'
        },
        slug: 'disable-compiler'
    },
    disableCloudVariables: {
        label: {
            defaultMessage: 'Disable Cloud Variables',
            description: 'Disable Cloud Variables setting',
            id: 'mw.settingsModal.disableCloudVariables'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Disables cloud variables by default. Projects keep their cloud variables, but they will not connect until this setting is turned off.',
            description: 'Disable Cloud Variables help',
            id: 'mw.settingsModal.disableCloudVariablesHelp'
        }
    },
    warpTimer: {
        label: {
            defaultMessage: 'Warp Timer',
            description: 'Warp Timer setting',
            id: 'tw.settingsModal.warpTimer'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Makes scripts check if they are stuck in a long or infinite loop and run at a low framerate instead of getting stuck until the loop finishes. This fixes most crashes but has a significant performance impact, so it\'s only enabled by default in the editor.',
            description: 'Warp Timer help',
            id: 'tw.settingsModal.warpTimerHelp'
        },
        slug: 'warp-timer'
    },
    caseSensitiveLists: {
        label: {
            defaultMessage: 'Case Sensitive Lists',
            description: 'Case Sensitive Lists setting',
            id: 'tw.settingsModal.caseSensitiveLists'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Makes lists case sensitive. This means that \'a\' and \'A\' are different values. This is not recommended for most projects but can improve speed massively for list heavy projects.',
            description: 'Case Sensitive Lists help',
            id: 'tw.settingsModal.caseSensitiveListsHelp'
        }
    },
    realLayerIndexes: {
        label: {
            defaultMessage: 'Real Layer Indexes',
            description: 'Real Layer Indexes label',
            id: 'tw.settingsModal.realLayerIndexes'
        },
        help: {
            // eslint-disable-next-line max-len
            defaultMessage: 'Changes layer indexes to change the position in the render order array without limiting the number of layers to the number of drawables.',
            description: 'Real Layer Indexes help',
            id: 'tw.settingsModal.realLayerIndexesHelp'
        }
    },
    enableStageResize: {
        label: {
            defaultMessage: 'Enable Stage Resize',
            description: 'Enable Stage Resize setting',
            id: 'mw.settingsModal.enableStageResize'
        },
        help: {
            defaultMessage: 'Enables the stage resize feature, allowing you to drag to resize the stage panel.(Refreshing required)',
            description: 'Enable Stage Resize setting help',
            id: 'mw.settingsModal.enableStageResizeHelp'
        }
    },
    windowAnimation: {
        label: {
            defaultMessage: 'Window Animation',
            description: 'Enable window open/close animation',
            id: 'mw.settingsModal.windowAnimation'
        },
        help: {
            defaultMessage: 'Enables fade and scale animations when opening or closing windows.',
            description: 'Window Animation setting help',
            id: 'mw.settingsModal.windowAnimationHelp'
        }
    },
    scriptLazyLoading: {
        label: {
            defaultMessage: 'Block Lazy Loading',
            description: 'Only render blocks near the visible area of the editor',
            id: 'mw.settingsModal.scriptLazyLoading'
        },
        help: {
            defaultMessage: 'Only renders blocks on screen and in the area around it ' +
                '(the ring outside the screen is three times its area). Blocks beyond that ' +
                'stop being rendered to save performance, and render again when you scroll back.',
            description: 'Block Lazy Loading setting help',
            id: 'mw.settingsModal.scriptLazyLoadingHelp'
        }
    },
    embedGitOnSave: {
        label: {
            defaultMessage: 'Embed Git Repository on Save',
            description: 'Include the git repository in files saved to the computer',
            id: 'mw.settingsModal.embedGitOnSave'
        },
        help: {
            defaultMessage: 'Packs the git repository (the fractch tree and .git) into the ' +
                '.sb3 when you save to your computer. Leave this off to save a plain project ' +
                'file: saving then streams straight to disk instead of buffering the whole ' +
                'archive, and opening the file back will not import a repository.',
            description: 'Embed Git Repository on Save setting help',
            id: 'mw.settingsModal.embedGitOnSaveHelp'
        }
    },
    squareStageCorners: {
        label: {
            defaultMessage: 'Square Stage Corners',
            id: 'mw.settingsModal.squareStageCorners'
        },
        help: {
            defaultMessage: 'Removes the rounded corners from the stage.',
            id: 'mw.settingsModal.squareStageCornersHelp'
        }
    },
    hideDeleteButton: {
        label: {
            defaultMessage: 'Hide Delete Button',
            id: 'mw.settingsModal.hideDeleteButton'
        },
        help: {
            defaultMessage: 'Hides the delete button on sprites, costumes, and sounds.',
            id: 'mw.settingsModal.hideDeleteButtonHelp'
        }
    },
    hideExtensionButton: {
        label: {
            defaultMessage: 'Hide Extension Button',
            id: 'mw.settingsModal.hideExtensionButton'
        },
        help: {
            defaultMessage: 'Hides the add extension button in the bottom-left of the block palette.',
            id: 'mw.settingsModal.hideExtensionButtonHelp'
        }
    },
    hideBackpack: {
        label: {
            defaultMessage: 'Hide Backpack',
            id: 'mw.settingsModal.hideBackpack'
        },
        help: {
            defaultMessage: 'Hides the backpack bar at the bottom of the editor.',
            id: 'mw.settingsModal.hideBackpackHelp'
        }
    },
    hideOperatorArrows: {
        label: {
            defaultMessage: 'Hide Extendable Operator Arrows',
            id: 'mw.settingsModal.hideOperatorArrows'
        },
        help: {
            defaultMessage: 'Hides the arrows used to add or remove inputs on extendable ' +
                'operator blocks like +, and, or and join. You can still add or remove inputs ' +
                'by right-clicking the block.',
            id: 'mw.settingsModal.hideOperatorArrowsHelp'
        }
    },
    vanillaPalette: {
        label: {
            defaultMessage: 'Vanilla Compatible Blocks Only',
            id: 'mw.settingsModal.vanillaPalette'
        },
        help: {
            defaultMessage: 'Hides blocks that vanilla Scratch cannot run, such as the return block, ' +
                'the switch/case blocks, extra Strings blocks and the whole Assets category. ' +
                'Extendable operators stay ' +
                'visible because they are saved in a vanilla compatible way.',
            id: 'mw.settingsModal.vanillaPaletteHelp'
        }
    },
    unclipPalette: {
        label: {
            defaultMessage: 'Unclip Block Palette',
            id: 'mw.settingsModal.unclipPalette'
        },
        help: {
            defaultMessage: 'While the block palette is hovered, blocks that are wider than the ' +
                'palette overflow past its edge instead of being cut off.',
            id: 'mw.settingsModal.unclipPaletteHelp'
        }
    },
    showPauseButton: {
        label: {
            defaultMessage: 'Show Pause Button',
            id: 'mw.settingsModal.showPauseButton'
        },
        help: {
            defaultMessage: 'Adds a pause/play button between the green flag and stop button that ' +
                'freezes the project in place. The project can also be paused with Alt+X (Option+X on macOS).',
            id: 'mw.settingsModal.showPauseButtonHelp'
        }
    },
    showStepButton: {
        label: {
            defaultMessage: 'Show Frame Step Button',
            id: 'mw.settingsModal.showStepButton'
        },
        help: {
            defaultMessage: 'While the project is paused, adds a button that advances it by exactly one ' +
                'frame so you can watch behavior change step by step.',
            id: 'mw.settingsModal.showStepButtonHelp'
        }
    }
};

const createBooleanSetting = (key, definition) => {
    const SettingComponent = props => (
        <BooleanSetting
            value={typeof props.value === 'undefined' ? false : props.value}
            onChange={props.onChange}
            label={<FormattedMessage {...definition.label} />}
            help={<FormattedMessage {...definition.help} />}
            slug={definition.slug}
        />
    );

    SettingComponent.propTypes = {
        value: PropTypes.bool,
        onChange: PropTypes.func.isRequired
    };

    SettingComponent.displayName = key;
    return SettingComponent;
};

// 这里传进来的文案有两种形态：
//   1. defineMessages 的描述符 `{id, defaultMessage}`（settings-modal 自己的 settingDefinitions）；
//   2. 只有 id 字符串（lib/debugger/settings.js 的 DEFINITIONS 就是纯 id）。
// 第 2 种没有英文兜底文案，某个语种缺条目时 formatMessage 会把 id 原样吐到界面上，
// 表现就是「设置项标题显示成一串 mw.xxx」。所以下面统一收敛成描述符再格式化。
const toMessageDescriptor = message => (
    typeof message === 'string' ? {id: message, defaultMessage: message} : message
);

class DebuggerBooleanSetting extends React.Component {
    constructor (props) {
        super(props);
        this.handleChange = this.handleChange.bind(this);
        this.state = {value: getDebuggerSetting(props.settingId)};
    }
    handleChange (e) {
        const value = e.target.checked;
        setDebuggerSetting(this.props.settingId, value);
        this.setState({value});
    }
    render () {
        const {intl, label, help} = this.props;
        const translatedLabel = intl.formatMessage(toMessageDescriptor(label));
        const translatedHelp = help ? intl.formatMessage(toMessageDescriptor(help)) : null;
        return (
            <BooleanSetting
                value={this.state.value}
                onChange={this.handleChange}
                label={translatedLabel}
                help={translatedHelp}
            />
        );
    }
}

DebuggerBooleanSetting.propTypes = {
    settingId: PropTypes.string.isRequired,
    label: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({id: PropTypes.string.isRequired})
    ]).isRequired,
    help: PropTypes.oneOfType([
        PropTypes.string,
        PropTypes.shape({id: PropTypes.string.isRequired})
    ]),
    intl: intlShape.isRequired
};

const HighQualityPen = createBooleanSetting('HighQualityPen', settingDefinitions.highQualityPen);
const Interpolation = createBooleanSetting('Interpolation', settingDefinitions.interpolation);
const InfiniteClones = createBooleanSetting('InfiniteClones', settingDefinitions.infiniteClones);
const RemoveFencing = createBooleanSetting('RemoveFencing', settingDefinitions.removeFencing);
const RemoveMiscLimits = createBooleanSetting('RemoveMiscLimits', settingDefinitions.removeMiscLimits);
const WarpTimer = createBooleanSetting('WarpTimer', settingDefinitions.warpTimer);
const CaseSensitiveLists = createBooleanSetting('CaseSensitiveLists', settingDefinitions.caseSensitiveLists);
const RealLayerIndexes = createBooleanSetting('RealLayerIndexes', settingDefinitions.realLayerIndexes);
const EnableStageResize = createBooleanSetting('EnableStageResize', settingDefinitions.enableStageResize);
const WindowAnimation = createBooleanSetting('WindowAnimation', settingDefinitions.windowAnimation);
const ScriptLazyLoading = createBooleanSetting('ScriptLazyLoading', settingDefinitions.scriptLazyLoading);
const EmbedGitOnSave = createBooleanSetting('EmbedGitOnSave', settingDefinitions.embedGitOnSave);
const SquareStageCorners = createBooleanSetting('SquareStageCorners', settingDefinitions.squareStageCorners);
const HideDeleteButton = createBooleanSetting('HideDeleteButton', settingDefinitions.hideDeleteButton);
const HideExtensionButton = createBooleanSetting('HideExtensionButton', settingDefinitions.hideExtensionButton);
const HideBackpack = createBooleanSetting('HideBackpack', settingDefinitions.hideBackpack);
const HideOperatorArrows = createBooleanSetting('HideOperatorArrows', settingDefinitions.hideOperatorArrows);
const UnclipPalette = createBooleanSetting('UnclipPalette', settingDefinitions.unclipPalette);
const VanillaPalette = createBooleanSetting('VanillaPalette', settingDefinitions.vanillaPalette);
const DisableCloudVariables = createBooleanSetting('DisableCloudVariables', settingDefinitions.disableCloudVariables);

const DisableCompiler = props => (
    <BooleanSetting
        {...props}
        label={
            <FormattedMessage
                defaultMessage="Disable Compiler"
                description="Disable Compiler setting"
                id="tw.settingsModal.disableCompiler"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Disables the {APP_NAME} compiler. You may want to enable this while editing projects so that scripts update immediately. Otherwise, you should never enable this."
                description="Disable Compiler help"
                id="tw.settingsModal.disableCompilerHelp"
                values={{
                    APP_NAME
                }}
            />
        }
        slug="disable-compiler"
    />
);

DisableCompiler.propTypes = {
    value: PropTypes.bool,
    onChange: PropTypes.func.isRequired
};
const STYLE_OPTIONS = {
    'tab-style': [
        {value: 'mistwarp', labelId: 'mw.settingsModal.tabStyle.mistwarp', label: 'MistWarp'},
        {value: 'turbowarp', labelId: 'mw.settingsModal.tabStyle.turbowarp', label: 'TurboWarp'},
        {value: 'scratchbox', labelId: 'mw.settingsModal.tabStyle.scratchbox', label: 'ScratchBox'}
    ],
    'tab-looks': [
        {value: 'default', labelId: 'mw.settingsModal.tabLooks.default', label: 'Default'},
        {value: 'icon-only', labelId: 'mw.settingsModal.tabLooks.iconOnly', label: 'Icon Only'},
        {value: 'text-only', labelId: 'mw.settingsModal.tabLooks.textOnly', label: 'Text Only'}
    ],
    'window-style': [
        {value: 'mistwarp', labelId: 'mw.settingsModal.windowStyle.mistwarp', label: 'MistWarp'},
        {value: 'macos', labelId: 'mw.settingsModal.windowStyle.macos', label: 'macOS'},
        {value: 'windows10', labelId: 'mw.settingsModal.windowStyle.windows10', label: 'Windows 10'}
    ]
};

const getOptionCss = (groupId, value) => {
    const group = STYLE_GROUPS.find(g => g.id === groupId);
    if (!group) return null;
    const option = group.options.find(o => o.value === value);
    return option ? option.css : null;
};

const StyleOption = ({groupId, option, selected, onSelect, intl}) => (
    <button
        type="button"
        className={classNames(styles.styleOption, {[styles.styleOptionSelected]: selected})}
        onClick={() => onSelect(option.value)}
    >
        <div className={styles.stylePreview}>
            <StylePreview
                type={groupId === 'window-style' ? 'window' : 'tabs'}
                variant={option.value}
                css={getOptionCss(groupId, option.value)}
                intl={intl}
            />
        </div>
        <span className={styles.styleOptionLabel}>
            {option.labelId && intl ? intl.formatMessage({id: option.labelId, defaultMessage: option.label}) : option.label}
        </span>
    </button>
);
StyleOption.propTypes = {
    groupId: PropTypes.string.isRequired,
    option: PropTypes.shape({
        value: PropTypes.string,
        label: PropTypes.string,
        labelId: PropTypes.string
    }).isRequired,
    selected: PropTypes.bool,
    onSelect: PropTypes.func.isRequired,
    intl: intlShape
};

const StyleSelect = ({groupId, label, value, onChange, intl}) => (
    <div className={styles.setting}>
        <div className={styles.label}>{label}</div>
        <div className={styles.stylePicker}>
            {STYLE_OPTIONS[groupId].map(option => (
                <StyleOption
                    key={option.value}
                    groupId={groupId}
                    option={option}
                    selected={value === option.value}
                    onSelect={onChange}
                    intl={intl}
                />
            ))}
        </div>
    </div>
);
StyleSelect.propTypes = {
    groupId: PropTypes.string.isRequired,
    label: PropTypes.node,
    value: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    intl: intlShape
};

const TabStyleSelect = props => (
    <StyleSelect
        groupId="tab-style"
        label={<FormattedMessage
            defaultMessage="Tab Style"
            id="mw.settingsModal.tabStyle"
        />}
        value={props.value}
        onChange={props.onChange}
        intl={props.intl}
    />
);
TabStyleSelect.propTypes = {value: PropTypes.string, onChange: PropTypes.func, intl: intlShape};

const TabLooksSelect = props => (
    <StyleSelect
        groupId="tab-looks"
        label={<FormattedMessage
            defaultMessage="Tab Looks"
            id="mw.settingsModal.tabLooks"
        />}
        value={props.value}
        onChange={props.onChange}
        intl={props.intl}
    />
);
TabLooksSelect.propTypes = {value: PropTypes.string, onChange: PropTypes.func, intl: intlShape};

const WindowStyleSelect = props => {
    if (typeof window.EditorPreload !== 'undefined') {
        return (
            <p>
                <FormattedMessage
                    defaultMessage="Cannot set custom window styling on desktop"
                    id="mw.settingsModal.windowStyleDesktop"
                />
            </p>
        );
    }
    return (
        <StyleSelect
            groupId="window-style"
            label={<FormattedMessage
                defaultMessage="Window Style"
                id="mw.settingsModal.windowStyle"
            />}
            value={props.value}
            onChange={props.onChange}
            intl={props.intl}
        />
    );
};
WindowStyleSelect.propTypes = {value: PropTypes.string, onChange: PropTypes.func, intl: intlShape};

const CustomFPS = ({framerate, onChange, onCustomizeFramerate}) => (
    <BooleanSetting
        value={framerate !== 30}
        onChange={onChange}
        label={
            <FormattedMessage
                defaultMessage="60 FPS (Custom FPS)"
                description="FPS setting"
                id="tw.settingsModal.fps"
            />
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Runs scripts 60 times per second instead of 30. Most projects will not work properly with this enabled. You should try Interpolation with 60 FPS mode disabled if that is the case. {customFramerate}."
                description="FPS setting help"
                id="tw.settingsModal.fpsHelp"
                values={{
                    customFramerate: (
                        <a
                            onClick={onCustomizeFramerate}
                            tabIndex="0"
                        >
                            <FormattedMessage
                                defaultMessage="Click to use a framerate other than 30 or 60"
                                description="FPS settings help"
                                id="tw.settingsModal.fpsHelp.customFramerate"
                            />
                        </a>
                    )
                }}
            />
        }
        slug="custom-fps"
    />
);

CustomFPS.propTypes = {
    framerate: PropTypes.number,
    onChange: PropTypes.func,
    onCustomizeFramerate: PropTypes.func
};

const CustomStageSize = ({
    customStageSizeEnabled,
    stageWidth,
    onStageWidthChange,
    stageHeight,
    onStageHeightChange
}) => (
    <Setting
        active={customStageSizeEnabled}
        primary={
            <div className={classNames(styles.label, styles.customStageSize)}>
                <FormattedMessage
                    defaultMessage="Custom Stage Size:"
                    description="Custom Stage Size option"
                    id="tw.settingsModal.customStageSize"
                />
                <BufferedInput
                    value={stageWidth}
                    onSubmit={onStageWidthChange}
                    className={styles.customStageSizeInput}
                    type="number"
                    min="0"
                    max="1024"
                    step="1"
                />
                <span>{'×'}</span>
                <BufferedInput
                    value={stageHeight}
                    onSubmit={onStageHeightChange}
                    className={styles.customStageSizeInput}
                    type="number"
                    min="0"
                    max="1024"
                    step="1"
                />
            </div>
        }
        secondary={
            (stageWidth >= 1000 || stageHeight >= 1000) && (
                <div className={styles.warning}>
                    <FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Using a custom stage size this large is not recommended! Instead, use a lower size with the same aspect ratio and let fullscreen mode upscale it to match the user's display."
                        description="Warning about using stages that are too large in settings modal"
                        id="tw.settingsModal.largeStageWarning"
                    />
                    <LearnMore slug="custom-stage-size" />
                </div>
            )
        }
        help={
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="Changes the size of the Scratch stage from 480x360 to something else. Try 640x360 to make the stage widescreen. Very few projects will handle this properly."
                description="Custom Stage Size option"
                id="tw.settingsModal.customStageSizeHelp"
            />
        }
        slug="custom-stage-size"
    />
);
CustomStageSize.propTypes = {
    customStageSizeEnabled: PropTypes.bool,
    stageWidth: PropTypes.number,
    onStageWidthChange: PropTypes.func,
    stageHeight: PropTypes.number,
    onStageHeightChange: PropTypes.func
};

const CloudVariableServer = props => {
    const {intl} = props;
    return (
        <Setting
            primary={
                <div className={classNames(styles.label, styles['cloud-variable-server'])}>
                    <FormattedMessage
                        defaultMessage="Cloud Variable Server"
                        description="Cloud Variable Server setting"
                        id="tw.settingsModal.cloudVariableServer"
                    />
                    <BufferedInput
                        value={props.cloudVariableServer}
                        onSubmit={props.onCloudVariableServerChange}
                        className={styles['cloud-variable-server-input']}
                        type="text"
                        placeholder={intl.formatMessage(messages.cloudServerPlaceholder)}
                    />
                </div>
            }
            help={
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="Changes the server used for cloud variables. The URL must start with ws:// or wss://."
                    description="Cloud Variable Server setting help"
                    id="tw.settingsModal.cloudVariableServerHelp"
                />
            }
        />
    );
};

CloudVariableServer.propTypes = {
    cloudVariableServer: PropTypes.string,
    onCloudVariableServerChange: PropTypes.func,
    intl: intlShape
};

const StoreProjectOptions = ({
    onStoreProjectOptions,
    storeThemeInProject,
    onStoreThemeInProjectChange
}) => (
    <div className={styles.setting}>
        <div>
            <button
                onClick={onStoreProjectOptions}
                className={styles.button}
            >
                <FormattedMessage
                    defaultMessage="Store settings in project"
                    description="Button in settings modal"
                    id="tw.settingsModal.storeProjectOptions"
                />
            </button>
            <p>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="Stores the selected settings in the project so they will be automatically applied when {APP_NAME} loads this project. Warp timer and disable compiler will not be saved."
                    description="Help text for the store settings in project button"
                    id="tw.settingsModal.storeProjectOptionsHelp"
                    values={{
                        APP_NAME
                    }}
                />
            </p>

            <label className={styles.label}>
                <FancyCheckbox
                    className={styles.checkbox}
                    checked={storeThemeInProject}
                    onChange={onStoreThemeInProjectChange}
                />
                <FormattedMessage
                    defaultMessage="Store theme in project"
                    description="Checkbox under the store settings in project button"
                    id="tw.settingsModal.storeThemeInProject"
                />
            </label>
            <p>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage='When enabled, clicking "Store settings in project" will also store the current {APP_NAME} theme so it can be applied when this project is loaded.'
                    description="Help text for the store theme in project checkbox"
                    id="mw.settingsModal.storeThemeInProjectHelp"
                    values={{
                        APP_NAME
                    }}
                />
            </p>
        </div>
    </div>
);
StoreProjectOptions.propTypes = {
    onStoreProjectOptions: PropTypes.func,
    storeThemeInProject: PropTypes.bool,
    onStoreThemeInProjectChange: PropTypes.func
};

// 按需加载的页面在首次点击时需要一帧到几十毫秒去取分块。
// 这里给一个极轻的占位（纯 CSS 转圈），避免侧边栏旁边整块空白。
const PageLoadingFallback = () => (
    <Box className={styles.body}>
        <div className={styles.pageLoading}>
            <span className={styles.pageLoadingSpinner} />
        </div>
    </Box>
);

const pageConfigurations = {
    general: {
        sections: [
            {
                headerMessage: 'headerFeatured',
                settings: [
                    {
                        component: CustomFPS,
                        props: props => ({
                            framerate: props.framerate,
                            onChange: props.onFramerateChange,
                            onCustomizeFramerate: props.onCustomizeFramerate
                        })
                    },
                    {
                        component: Interpolation,
                        props: props => ({
                            value: props.interpolation,
                            onChange: props.onInterpolationChange
                        })
                    },
                    {
                        component: HighQualityPen,
                        props: props => ({
                            value: props.highQualityPen,
                            onChange: props.onHighQualityPenChange
                        })
                    },
                    {
                        component: WarpTimer,
                        props: props => ({
                            value: props.warpTimer,
                            onChange: props.onWarpTimerChange
                        })
                    }
                ]
            },
            {
                headerMessage: 'headerRemoveLimits',
                settings: [
                    {
                        component: InfiniteClones,
                        props: props => ({
                            value: props.infiniteClones,
                            onChange: props.onInfiniteClonesChange
                        })
                    },
                    {
                        component: RemoveFencing,
                        props: props => ({
                            value: props.removeFencing,
                            onChange: props.onRemoveFencingChange
                        })
                    },
                    {
                        component: RemoveMiscLimits,
                        props: props => ({
                            value: props.removeLimits,
                            onChange: props.onRemoveLimitsChange
                        })
                    },
                    {
                        component: DisableCompiler,
                        props: props => ({
                            value: props.disableCompiler,
                            onChange: props.onDisableCompilerChange
                        })
                    },
                    {
                        component: DisableCloudVariables,
                        props: props => ({
                            value: props.disableCloudVariables,
                            onChange: props.onDisableCloudVariablesChange
                        }),
                        condition: () => !isScratchDesktop()
                    }
                ]
            },
            {
                headerMessage: 'headerCloud',
                settings: [
                    {
                        component: CloudVariableServer,
                        props: props => ({
                            cloudVariableServer: props.cloudVariableServer,
                            onCloudVariableServerChange: props.onCloudVariableServerChange
                        })
                    }
                ]
            },
            {
                headerMessage: 'headerDangerZone',
                settings: [
                    {
                        component: CustomStageSize,
                        props: props => props,
                        condition: props => !props.isEmbedded
                    },
                    {
                        component: StoreProjectOptions,
                        props: props => props,
                        condition: props => !props.isEmbedded
                    }
                ]
            }
        ]
    },
    editor: {
        sections: [
            {
                headerMessage: 'headerStage',
                settings: [
                    {
                        component: DebuggerBooleanSetting,
                        props: () => ({
                            settingId: 'stage_pause_button',
                            label: settingDefinitions.showPauseButton.label,
                            help: settingDefinitions.showPauseButton.help
                        })
                    },
                    {
                        component: DebuggerBooleanSetting,
                        props: () => ({
                            settingId: 'stage_step_button',
                            label: settingDefinitions.showStepButton.label,
                            help: settingDefinitions.showStepButton.help
                        })
                    },
                    {
                        component: SquareStageCorners,
                        props: props => ({
                            value: props.squareStageCorners,
                            onChange: props.onSquareStageCornersChange
                        })
                    }
                ]
            },
            {
                headerMessage: 'headerBlockPalette',
                settings: [
                    {
                        component: HideExtensionButton,
                        props: props => ({
                            value: props.hideExtensionButton,
                            onChange: props.onHideExtensionButtonChange
                        })
                    },
                    {
                        component: HideOperatorArrows,
                        props: props => ({
                            value: props.hideOperatorArrows,
                            onChange: props.onHideOperatorArrowsChange
                        })
                    },
                    {
                        component: UnclipPalette,
                        props: props => ({
                            value: props.unclipPalette,
                            onChange: props.onUnclipPaletteChange
                        })
                    },
                    {
                        component: VanillaPalette,
                        props: props => ({
                            value: props.vanillaPalette,
                            onChange: props.onVanillaPaletteChange
                        })
                    }
                ]
            },
            {
                headerMessage: 'headerInterface',
                settings: [
                    {
                        component: HideDeleteButton,
                        props: props => ({
                            value: props.hideDeleteButton,
                            onChange: props.onHideDeleteButtonChange
                        })
                    },
                    {
                        component: HideBackpack,
                        props: props => ({
                            value: props.hideBackpack,
                            onChange: props.onHideBackpackChange
                        })
                    }
                ]
            }
        ]
    },
    styles: {
        sections: [
            {
                headerMessage: 'headerStyles',
                settings: [
                    {
                        component: TabStyleSelect,
                        props: props => ({
                            value: props.tabStyle,
                            onChange: props.onTabStyleChange
                        })
                    },
                    {
                        component: TabLooksSelect,
                        props: props => ({
                            value: props.tabLooks,
                            onChange: props.onTabLooksChange
                        })
                    },
                    {
                        component: WindowStyleSelect,
                        props: props => ({
                            value: props.windowStyle,
                            onChange: props.onWindowStyleChange
                        })
                    }
                ]
            }
        ]
    },
    menuBar: {
        sections: [
            {
                headerMessage: 'headerMenuBarLayout',
                settings: [
                    {
                        component: MenuBarLayoutSetting,
                        props: () => ({})
                    }
                ]
            },
            {
                headerMessage: 'headerMenuBarItems',
                settings: [
                    {
                        component: MenuBarFeatureSettings,
                        props: () => ({
                            ids: [
                                'menu_labels',
                                'show_block_count',
                                'show_costume_count',
                                'show_sound_count',
                                'show_complexity_score',
                                'show_media_recorder'
                            ]
                        })
                    }
                ]
            }
        ]
    },
    experimental: {
        groups: [
            {
                settings: [
                    {
                        component: RealLayerIndexes,
                        props: props => ({
                            value: props.realLayerIndexes,
                            onChange: props.onRealLayerIndexesChange
                        })
                    },
                    {
                        component: CaseSensitiveLists,
                        props: props => ({
                            value: props.caseSensitiveLists,
                            onChange: props.onCaseSensitiveListsChange
                        })
                    }
                ]
            },
            {
                settings: [
                    {
                        component: EnableStageResize,
                        props: props => ({
                            value: props.enableStageResize,
                            onChange: props.onEnableStageResizeChange
                        })
                    },
                    {
                        component: WindowAnimation,
                        props: props => ({
                            value: props.windowAnimation,
                            onChange: props.onWindowAnimationChange
                        })
                    }
                ]
            },
            {
                settings: [
                    {
                        component: ScriptLazyLoading,
                        props: props => ({
                            value: props.scriptLazyLoading,
                            onChange: props.onScriptLazyLoadingChange
                        })
                    },
                    {
                        component: EmbedGitOnSave,
                        props: props => ({
                            value: props.embedGitOnSave,
                            onChange: props.onEmbedGitOnSaveChange
                        })
                    }
                ]
            }
        ]
    }
};

const UnwrappedPageRenderer = ({config, intl, ...props}) => (
    <Box className={styles.body}>
        {config.sections.map((section, sectionIdx) => (
            <React.Fragment key={sectionIdx}>
                <Header>
                    {intl.formatMessage(messages[section.headerMessage])}
                </Header>
                {section.settings.map((setting, settingIdx) => {
                    if (setting.condition && !setting.condition(props)) {
                        return null;
                    }

                    const SettingComponent = setting.component;
                    const settingProps = setting.props(props);

                    return (<SettingComponent
                        key={settingIdx}
                        {...settingProps}
                        intl={intl}
                    />);
                })}
            </React.Fragment>
        ))}
    </Box>
);

UnwrappedPageRenderer.propTypes = {
    config: PropTypes.object.isRequired,
    intl: intlShape.isRequired
};
const PageRenderer = injectIntl(UnwrappedPageRenderer);

const UnwrappedExperimentalRenderer = ({config, intl, ...props}) => (
    <Box className={styles.body}>
        <Header>{intl.formatMessage(messages.headerExperimental)}</Header>
        {config.groups.map((group, groupIdx) => (
            <div
                key={groupIdx}
                className={styles.experimentalGroup}
            >
                {group.settings.map((setting, settingIdx) => {
                    if (setting.condition && !setting.condition(props)) {
                        return null;
                    }
                    const SettingComponent = setting.component;
                    const settingProps = setting.props(props);
                    return (
                        <SettingComponent
                            key={settingIdx}
                            {...settingProps}
                            intl={intl}
                        />
                    );
                })}
            </div>
        ))}
    </Box>
);

UnwrappedExperimentalRenderer.propTypes = {
    config: PropTypes.object.isRequired,
    intl: intlShape.isRequired
};
const ExperimentalRenderer = injectIntl(UnwrappedExperimentalRenderer);

const GeneralPage = props => (<PageRenderer
    config={pageConfigurations.general}
    {...props}
/>);
const ExperimentalPage = props => (<ExperimentalRenderer
    config={pageConfigurations.experimental}
    {...props}
/>);
const EditorPage = props => (<PageRenderer
    config={pageConfigurations.editor}
    {...props}
/>);
const StylesPage = props => (<PageRenderer
    config={pageConfigurations.styles}
    {...props}
/>);
const MenuBarPage = props => (<PageRenderer
    config={pageConfigurations.menuBar}
    {...props}
/>);

const STAGE_CONTROL_SETTINGS = ['stage_pause_button', 'stage_step_button'];

const UnwrappedDebuggerPage = ({intl}) => (
    <Box className={styles.body}>
        <Header>{intl.formatMessage(messages.headerDebugger)}</Header>
        {DEBUGGER_SETTINGS.filter(setting => !STAGE_CONTROL_SETTINGS.includes(setting.id)).map(setting => (
            <DebuggerBooleanSetting
                key={setting.id}
                settingId={setting.id}
                label={setting.label}
                help={setting.help}
                intl={intl}
            />
        ))}
    </Box>
);

UnwrappedDebuggerPage.propTypes = {
    intl: intlShape.isRequired
};

const DebuggerPage = injectIntl(UnwrappedDebuggerPage);

const SettingsRouter = ({view, ...handlers}) => {
    switch (view) {
    case 'general':
        return <GeneralPage {...handlers} />;
    case 'language':
        return <LanguagePage />;
    case 'shortcuts':
        return <ShortcutManager />;
    case 'theme':
        return <ColorThemePage />;
    case 'customThemes':
        return <CustomThemesPage {...handlers} />;
    case 'appearance':
        return <StylesPage {...handlers} />;
    case 'blocks':
        return <ThemePage />;
    case 'wallpaper':
        return <WallpaperPage />;
    case 'fonts':
        return <FontsPage />;
    case 'frostedGlass':
        return <FrostedGlassPage />;
    case 'loadingScreen':
        return <LoadingScreenPage />;
    case 'debugger':
        return <DebuggerPage {...handlers} />;
    case 'versionControl':
        return <VersionControlPage {...handlers} />;
    case 'autosave':
        return <AutosavePage {...handlers} />;
    case 'variableManager':
        return <VariableManagerPage {...handlers} />;
    case 'editor':
        return <EditorPage {...handlers} />;
    case 'menuBar':
        return <MenuBarPage {...handlers} />;
    case 'desktop':
        return <DesktopPage {...handlers} />;
    case 'experimental':
        return <ExperimentalPage {...handlers} />;
    default:
        return null;
    }
};

SettingsRouter.propTypes = {
    view: PropTypes.string.isRequired,
    onStoreProjectOptions: PropTypes.func
};

class SettingsModalComponent extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleNavigate',
            'handleStoreProjectOptions',
            'handleSearchChange',
            'handleSearchKeyDown',
            'handleMobileBack'
        ]);

        this.state = {
            currentView: takeSettingsModalInitialView() || 'general',
            mobileView: 'list',
            searchQuery: ''
        };
    }

    handleNavigate (category) {
        this.setState({currentView: category, mobileView: 'content'});
    }

    handleSearchChange (e) {
        this.setState({searchQuery: e.target.value});
    }

    handleSearchKeyDown (e) {
        if (e.key !== 'Enter') return;
        const sidebarGroups = getSettingsSidebarGroups(
            this.props.intl,
            typeof window.EditorPreload !== 'undefined'
        );
        const pages = sidebarGroups.reduce((all, group) => all.concat(group.items), []);
        const [firstResult] = searchSettingsPages(pages, this.state.searchQuery);
        if (firstResult) {
            e.preventDefault();
            this.handleNavigate(firstResult.id);
        }
    }

    handleMobileBack () {
        this.setState({mobileView: 'list'});
    }

    handleStoreProjectOptions () {
        this.props.onStoreProjectOptions();
    }

    render () {
        const {intl} = this.props;
        const {currentView} = this.state;

        const sidebarGroups = getSettingsSidebarGroups(
            intl,
            typeof window.EditorPreload !== 'undefined'
        );
        const pages = sidebarGroups.reduce((all, group) => all.concat(group.items), []);
        const searchResults = this.state.searchQuery.trim() ?
            searchSettingsPages(pages, this.state.searchQuery) : null;

        return (
            <Modal
                className={styles.modalContent}
                onRequestClose={this.props.onClose}
                contentLabel={intl.formatMessage(messages.title)}
                id="settingsModal"
                width={880}
                height={550}
            >
                <ModalSidebarLayout mobileView={this.state.mobileView}>
                    <ModalSidebar
                        ariaLabel={intl.formatMessage(messages.settingsSectionsAria)}
                        header={
                            <div className={styles.sidebarSearch}>
                                <Search
                                    aria-hidden="true"
                                    className={styles.sidebarSearchIcon}
                                    size={15}
                                />
                                <input
                                    aria-label={intl.formatMessage(messages.search)}
                                    className={styles.sidebarSearchInput}
                                    placeholder={intl.formatMessage(messages.search)}
                                    type="search"
                                    value={this.state.searchQuery}
                                    onChange={this.handleSearchChange}
                                    onKeyDown={this.handleSearchKeyDown}
                                />
                            </div>
                        }
                        width="wide"
                    >
                        {searchResults ? (
                            searchResults.length > 0 ? searchResults.map(result => (
                                <ModalSidebarItem
                                    key={result.id}
                                    icon={result.icon}
                                    label={result.label}
                                    selected={currentView === result.id}
                                    onClick={() => this.handleNavigate(result.id)}
                                />
                            )) : (
                                <p
                                    className={styles.sidebarNoResults}
                                    role="status"
                                >
                                    {intl.formatMessage(messages.noResults)}
                                </p>
                            )
                        ) : sidebarGroups.map(group => (
                            <ModalSidebarCollapsibleGroup
                                key={group.id}
                                label={group.label}
                            >
                                {group.items.map(cat => (
                                    <ModalSidebarItem
                                        key={cat.id}
                                        icon={cat.icon}
                                        label={cat.label}
                                        selected={currentView === cat.id}
                                        onClick={() => this.handleNavigate(cat.id)}
                                    />
                                ))}
                            </ModalSidebarCollapsibleGroup>
                        ))}
                    </ModalSidebar>
                    <ModalSidebarContent className={styles.contentArea}>
                        <button
                            className={styles.mobileBackButton}
                            onClick={this.handleMobileBack}
                        >
                            <ChevronLeft size={18} />
                            <FormattedMessage
                                defaultMessage="Back"
                                description="Back button in the settings window on mobile"
                                id="mw.settingsModal.back"
                            />
                        </button>
                        <React.Suspense fallback={<PageLoadingFallback />}>
                            <SettingsRouter
                                view={currentView}
                                {...this.props}
                                onStoreProjectOptions={this.handleStoreProjectOptions}
                            />
                        </React.Suspense>
                    </ModalSidebarContent>
                </ModalSidebarLayout>
            </Modal>
        );
    }
}

SettingsModalComponent.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func,
    isEmbedded: PropTypes.bool,
    framerate: PropTypes.number,
    onFramerateChange: PropTypes.func,
    onCustomizeFramerate: PropTypes.func,
    highQualityPen: PropTypes.bool,
    onHighQualityPenChange: PropTypes.func,
    interpolation: PropTypes.bool,
    onInterpolationChange: PropTypes.func,
    infiniteClones: PropTypes.bool,
    onInfiniteClonesChange: PropTypes.func,
    removeFencing: PropTypes.bool,
    onRemoveFencingChange: PropTypes.func,
    removeLimits: PropTypes.bool,
    onRemoveLimitsChange: PropTypes.func,
    warpTimer: PropTypes.bool,
    onWarpTimerChange: PropTypes.func,
    disableCompiler: PropTypes.bool,
    onDisableCompilerChange: PropTypes.func,
    disableCloudVariables: PropTypes.bool,
    onDisableCloudVariablesChange: PropTypes.func,
    caseSensitiveLists: PropTypes.bool,
    onCaseSensitiveListsChange: PropTypes.func,
    realLayerIndexes: PropTypes.bool,
    onRealLayerIndexesChange: PropTypes.func,
    squareStageCorners: PropTypes.bool,
    onSquareStageCornersChange: PropTypes.func,
    hideDeleteButton: PropTypes.bool,
    onHideDeleteButtonChange: PropTypes.func,
    hideExtensionButton: PropTypes.bool,
    onHideExtensionButtonChange: PropTypes.func,
    unclipPalette: PropTypes.bool,
    onUnclipPaletteChange: PropTypes.func,
    hideBackpack: PropTypes.bool,
    onHideBackpackChange: PropTypes.func,
    hideOperatorArrows: PropTypes.bool,
    onHideOperatorArrowsChange: PropTypes.func,
    vanillaPalette: PropTypes.bool,
    onVanillaPaletteChange: PropTypes.func,
    tabStyle: PropTypes.string,
    onTabStyleChange: PropTypes.func,
    tabLooks: PropTypes.string,
    onTabLooksChange: PropTypes.func,
    windowStyle: PropTypes.string,
    onWindowStyleChange: PropTypes.func,
    customStageSizeEnabled: PropTypes.bool,
    stageWidth: PropTypes.number,
    onStageWidthChange: PropTypes.func,
    stageHeight: PropTypes.number,
    onStageHeightChange: PropTypes.func,
    onStoreProjectOptions: PropTypes.func,
    storeThemeInProject: PropTypes.bool,
    onStoreThemeInProjectChange: PropTypes.func,
    optimizeAnimations: PropTypes.bool,
    onOptimizeAnimationsChange: PropTypes.func,
    debugMode: PropTypes.bool,
    onDebugModeChange: PropTypes.func,
    showFPSCounter: PropTypes.bool,
    onShowFPSCounterChange: PropTypes.func,
    cloudVariableServer: PropTypes.string,
    onCloudVariableServerChange: PropTypes.func,
    windowAnimation: PropTypes.bool,
    onWindowAnimationChange: PropTypes.func,
    scriptLazyLoading: PropTypes.bool,
    onScriptLazyLoadingChange: PropTypes.func,
    embedGitOnSave: PropTypes.bool,
    onEmbedGitOnSaveChange: PropTypes.func
};

export default injectIntl(SettingsModalComponent);
