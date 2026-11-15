import React, {useState, useEffect} from 'react';
import {getItem as getStorageItem} from '../../lib/utils/safe-storage.js';
import {useIntl} from '../../lib/tw-use-intl.jsx';
import {Menu, Palette, SwatchBook, Brush} from 'lucide-react';
import {applyTheme, detectTheme} from '../../lib/themes/themePersistance.js';
import {ThemeAccentPanel} from '../../components/tw-settings-modal/theme-accent-panel.jsx';
import CustomThemesPage from '../../components/tw-settings-modal/custom-themes-page.jsx';
import Sidebar from '../components/Sidebar.jsx';
import {
    getAccentMenuBar,
    setAccentMenuBar,
    getMenuBarText,
    setMenuBarText,
    MENU_BAR_TEXT_OPTIONS
} from '../../lib/themes/menu-bar-accent.js';
import styles from './Settings.module.css';

const PROJECT_THEME_MODE_KEY = 'mw:project-theme-mode';
const PROJECT_THEME_MODES = [
    {value: 'all', labelKey: 'mw.community.settings.all', labelDefault: 'All projects'},
    {value: 'followed', labelKey: 'mw.community.settings.followed', labelDefault: 'Only creators I follow'},
    {value: 'hearted', labelKey: 'mw.community.settings.hearted', labelDefault: 'Only projects I have hearted'},
    {value: 'none', labelKey: 'mw.community.settings.none', labelDefault: 'Never'}
];
const getProjectThemeMode = () => {
    try {
        return getStorageItem(PROJECT_THEME_MODE_KEY) || 'all';
    } catch (e) {
        return 'all';
    }
};

const ALL_SECTIONS = [
    {key: 'theme', labelKey: 'mw.community.settings.section.theme', labelDefault: 'Theme', icon: Palette},
    {key: 'project-themes', labelKey: 'mw.community.settings.section.project-themes', labelDefault: 'Project themes', icon: Brush},
    {key: 'custom-themes', labelKey: 'mw.community.settings.section.custom-themes', labelDefault: 'Custom themes', icon: SwatchBook},
    {key: 'menu-bar', labelKey: 'mw.community.settings.section.menu-bar', labelDefault: 'Menu bar', icon: Menu}
];

const MENU_BAR_TEXT_LABEL_KEYS = {
    auto: 'mw.community.settings.menuBarText.auto',
    light: 'mw.community.settings.menuBarText.light',
    dark: 'mw.community.settings.menuBarText.dark'
};

const Settings = () => {
    const intl = useIntl();
    const t = (id, defaultMessage, values) => intl.formatMessage({id, defaultMessage}, values);
    const sections = ALL_SECTIONS
        .map(section => ({...section, label: t(section.labelKey, section.labelDefault)}));
    const [theme, setTheme] = useState(detectTheme());
    const [accentMenuBar, setAccentMenuBarState] = useState(getAccentMenuBar());
    const [menuBarText, setMenuBarTextState] = useState(getMenuBarText());
    const [projectThemeMode, setProjectThemeMode] = useState(getProjectThemeMode());
    const [activeSection, setActiveSection] = useState(sections[0].key);

    const changeProjectThemeMode = value => {
        setProjectThemeMode(value);
        try {
            localStorage.setItem(PROJECT_THEME_MODE_KEY, value);
        } catch (e) {
            // ignore
        }
    };

    useEffect(() => {
        setTheme(detectTheme());
        setAccentMenuBarState(getAccentMenuBar());
        setMenuBarTextState(getMenuBarText());
    }, []);

    const applyAndPersist = next => {
        applyTheme(next);
        setTheme(detectTheme());
    };
    const changeAccentMenuBar = enabled => {
        setAccentMenuBar(enabled);
        setAccentMenuBarState(enabled);
        applyTheme(detectTheme());
    };
    const changeMenuBarText = value => {
        setMenuBarText(value);
        setMenuBarTextState(value);
        applyTheme(detectTheme());
    };

    const menuBarTextLabel = option => t(
        MENU_BAR_TEXT_LABEL_KEYS[option] || 'mw.community.settings.menuBarText.auto',
        option[0].toUpperCase() + option.slice(1)
    );

    return (
        <main className={styles.page}>
            <h1>{t('mw.community.settings.title', 'Settings')}</h1>
            <p className={styles.lead}>
                {t('mw.community.settings.lead',
                    'These settings apply across all of Bilup, including the editor and site.')}
            </p>

            <div className={styles.layout}>
                <Sidebar
                    sections={sections}
                    active={activeSection}
                    onChange={setActiveSection}
                    ariaLabel={t('mw.community.settings.ariaLabel', 'Settings sections')}
                />

                <div className={styles.content}>
                    {activeSection === 'theme' ? (
                        <section className={styles.card}>
                            <ThemeAccentPanel
                                theme={theme}
                                onChangeTheme={applyAndPersist}
                            />
                        </section>
                    ) : null}

                    {activeSection === 'custom-themes' ? (
                        <section className={styles.card}>
                            <h2>{t('mw.community.settings.customThemes', 'Custom themes')}</h2>
                            <CustomThemesPage
                                theme={theme}
                                onChangeTheme={applyAndPersist}
                            />
                        </section>
                    ) : null}

                    {activeSection === 'menu-bar' ? (
                        <section className={styles.card}>
                            <h2>{t('mw.community.settings.menuBar', 'Menu bar')}</h2>
                            <div className={styles.settingRows}>
                                <label className={styles.settingRow}>
                                    <span>{t('mw.community.settings.accentMenuBar', 'Accent-colored menu bar')}</span>
                                    <input
                                        className={styles.checkbox}
                                        type="checkbox"
                                        checked={accentMenuBar}
                                        onChange={event => changeAccentMenuBar(event.target.checked)}
                                    />
                                </label>
                                <label className={styles.settingRow}>
                                    <span>{t('mw.community.settings.menuBarText', 'Menu bar text')}</span>
                                    <select
                                        className={styles.select}
                                        value={menuBarText}
                                        onChange={event => changeMenuBarText(event.target.value)}
                                    >
                                        {MENU_BAR_TEXT_OPTIONS.map(option => (
                                            <option
                                                key={option}
                                                value={option}
                                            >
                                                {menuBarTextLabel(option)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>
                        </section>
                    ) : null}

                    {activeSection === 'project-themes' ? (
                        <section className={styles.card}>
                            <h2>{t('mw.community.settings.projectThemes', 'Project themes')}</h2>
                            <p className={styles.lead}>
                                {t('mw.community.settings.projectThemesLead',
                                    'Some projects come with their own Bilup theme. Choose when the player should switch to a project\'s theme automatically.')}
                            </p>
                            <label className={styles.field}>
                                <span>{t('mw.community.settings.applyProjectThemesFor', 'Apply project themes for')}</span>
                                <select
                                    className={styles.input}
                                    value={projectThemeMode}
                                    onChange={event => changeProjectThemeMode(event.target.value)}
                                >
                                    {PROJECT_THEME_MODES.map(mode => (
                                        <option
                                            key={mode.value}
                                            value={mode.value}
                                        >{t(mode.labelKey, mode.labelDefault)}</option>
                                    ))}
                                </select>
                            </label>
                        </section>
                    ) : null}
                </div>
            </div>
        </main>
    );
};

export default Settings;
