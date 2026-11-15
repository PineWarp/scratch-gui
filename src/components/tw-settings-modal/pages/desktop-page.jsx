import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Box from '../../box/box.jsx';
import {BooleanSetting, Setting} from '../setting.jsx';
import styles from '../settings-modal.css';

const messages = defineMessages({
    systemDefault: {
        defaultMessage: 'System default',
        id: 'mw.settingsModal.desktop.systemDefault'
    },
    updateAll: {
        defaultMessage: 'All updates',
        id: 'mw.settingsModal.desktop.updateAll'
    },
    updateStable: {
        defaultMessage: 'Stable releases only',
        id: 'mw.settingsModal.desktop.updateStable'
    },
    updateSecurity: {
        defaultMessage: 'Security updates only',
        id: 'mw.settingsModal.desktop.updateSecurity'
    },
    updateNever: {
        defaultMessage: 'Never',
        id: 'mw.settingsModal.desktop.updateNever'
    }
});

const DesktopSelectSetting = ({label, help, value, options, onChange}) => (
    <Setting
        help={help}
        primary={
            <div className={styles.label}>
                <span className={styles.settingText}>{label}</span>
                <select
                    className={styles.select}
                    value={value}
                    onChange={onChange}
                >
                    {options.map(option => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
        }
    />
);
DesktopSelectSetting.propTypes = {
    label: PropTypes.node,
    help: PropTypes.node,
    value: PropTypes.string,
    options: PropTypes.arrayOf(PropTypes.shape({
        value: PropTypes.string,
        label: PropTypes.node
    })),
    onChange: PropTypes.func
};

class DesktopPage extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            settings: null,
            devices: []
        };
    }

    componentDidMount () {
        try {
            this.setState({settings: window.EditorPreload.getDesktopSettings()});
        } catch (e) {
            this.setState({settings: null});
        }
        if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
            navigator.mediaDevices.enumerateDevices()
                .then(devices => this.setState({devices}))
                .catch(() => {});
        }
    }

    set (key, value) {
        this.setState(prevState => ({
            settings: {
                ...prevState.settings,
                [key]: value
            }
        }));
        const result = window.EditorPreload.setDesktopSetting(key, value);
        if (result && typeof result.catch === 'function') {
            result.catch(error => console.error('Failed to set desktop setting:', key, error));
        }
    }

    renderDeviceSelect (key, label, help, kind) {
        const {intl} = this.props;
        const devices = this.state.devices.filter(device => device.kind === kind);
        return (
            <DesktopSelectSetting
                label={label}
                help={help}
                value={this.state.settings[key] || ''}
                options={[
                    {
                        value: '',
                        label: intl.formatMessage(messages.systemDefault)
                    },
                    ...devices.map(device => ({
                        value: device.deviceId,
                        label: device.label || device.deviceId
                    }))
                ]}
                onChange={e => this.set(key, e.target.value || null)}
            />
        );
    }

    render () {
        const s = this.state.settings;
        const {intl} = this.props;
        if (!s) {
            return null;
        }
        return (
            <Box className={styles.pageContent}>
                {s.updateCheckerAllowed ? (
                    <DesktopSelectSetting
                        label={<FormattedMessage
                            defaultMessage="Update notifications"
                            id="mw.settingsModal.desktop.updateChecker"
                        />}
                        help={<FormattedMessage
                            // eslint-disable-next-line max-len
                            defaultMessage="Controls which app updates you are notified about. Security updates only shows the most important releases; Never disables the update check entirely."
                            id="mw.settingsModal.desktop.updateCheckerHelp"
                        />}
                        value={s.updateChecker}
                        options={[
                            {value: 'unstable',
                                label: intl.formatMessage(messages.updateAll)},
                            {value: 'stable',
                                label: intl.formatMessage(messages.updateStable)},
                            {value: 'security',
                                label: intl.formatMessage(messages.updateSecurity)},
                            {value: 'never',
                                label: intl.formatMessage(messages.updateNever)}
                        ]}
                        onChange={e => this.set('updateChecker', e.target.value)}
                    />
                ) : null}
                {this.renderDeviceSelect('microphone', (<FormattedMessage
                    defaultMessage="Microphone"
                    id="mw.settingsModal.desktop.microphone"
                />), (<FormattedMessage
                    defaultMessage="The input device projects use to record audio, such as the microphone extension."
                    id="mw.settingsModal.desktop.microphoneHelp"
                />), 'audioinput')}
                {this.renderDeviceSelect('camera', (<FormattedMessage
                    defaultMessage="Camera"
                    id="mw.settingsModal.desktop.camera"
                />), (<FormattedMessage
                    defaultMessage="The camera projects use for video sensing."
                    id="mw.settingsModal.desktop.cameraHelp"
                />), 'videoinput')}
                <BooleanSetting
                    value={!!s.backgroundThrottling}
                    onChange={event => this.set('backgroundThrottling', event.target.checked)}
                    label={<FormattedMessage
                        defaultMessage="Pause when the window is not visible"
                        id="mw.settingsModal.desktop.backgroundThrottling"
                    />}
                    help={<FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Slows down projects while the window is hidden or minimized to save power. Disable this if projects need to keep running in the background."
                        id="mw.settingsModal.desktop.backgroundThrottlingHelp"
                    />}
                />
                <BooleanSetting
                    value={!!s.bypassCORS}
                    onChange={event => this.set('bypassCORS', event.target.checked)}
                    label={<FormattedMessage
                        defaultMessage="Allow projects to access any website (requires restart, dangerous)"
                        id="mw.settingsModal.desktop.bypassCORS"
                    />}
                    help={<FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Lets projects fetch data from websites that would normally block them. Only enable this for projects you trust, as it removes a security protection."
                        id="mw.settingsModal.desktop.bypassCORSHelp"
                    />}
                />
                <BooleanSetting
                    value={!!s.spellchecker}
                    onChange={event => this.set('spellchecker', event.target.checked)}
                    label={<FormattedMessage
                        defaultMessage="Spellchecker (requires restart)"
                        id="mw.settingsModal.desktop.spellchecker"
                    />}
                    help={<FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Underlines misspelled words in text fields like the ask block prompt and costume names."
                        id="mw.settingsModal.desktop.spellcheckerHelp"
                    />}
                />
                <BooleanSetting
                    value={!!s.exitFullscreenOnEscape}
                    onChange={event => this.set('exitFullscreenOnEscape', event.target.checked)}
                    label={<FormattedMessage
                        defaultMessage="Exit fullscreen when escape is pressed"
                        id="mw.settingsModal.desktop.exitFullscreenOnEscape"
                    />}
                    help={<FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Lets the Escape key leave fullscreen mode. Disable this if your project uses Escape for its own controls."
                        id="mw.settingsModal.desktop.exitFullscreenOnEscapeHelp"
                    />}
                />
                <BooleanSetting
                    value={!!s.cloudExtensions}
                    onChange={event => this.set('cloudExtensions', event.target.checked)}
                    label={<FormattedMessage
                        defaultMessage="Load extensions from the cloud"
                        id="mw.settingsModal.desktop.cloudExtensions"
                    />}
                    help={<FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Loads extensions from the internet when possible, falling back to local copies when offline or unreachable."
                        id="mw.settingsModal.desktop.cloudExtensionsHelp"
                    />}
                />
                <button
                    className={styles.button}
                    onClick={() => window.EditorPreload.openUserData()}
                >
                    <FormattedMessage
                        defaultMessage="Open user data folder"
                        id="mw.settingsModal.desktop.openUserData"
                    />
                </button>
            </Box>
        );
    }
}

DesktopPage.propTypes = {
    intl: intlShape.isRequired
};

export default injectIntl(DesktopPage);
