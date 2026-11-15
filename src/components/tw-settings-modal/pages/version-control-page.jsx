import {defineMessages, FormattedMessage, intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import Box from '../../box/box.jsx';
import Input from '../../forms/input.jsx';
import BufferedInputHOC from '../../forms/buffered-input-hoc.jsx';
import Header from '../settings-header.jsx';
import styles from '../settings-modal.css';
import {
    getAuthorName, getAuthorEmail, setAuthorName, setAuthorEmail,
    getDefaultBranch, setDefaultBranch
} from '../../../lib/git/config.js';

const BufferedInput = BufferedInputHOC(Input);

const messages = defineMessages({
    header: {
        defaultMessage: 'Version Control',
        id: 'mw.settings.versionControlHeader'
    },
    authorNamePlaceholder: {
        defaultMessage: 'User',
        id: 'mw.settings.vc.authorNamePlaceholder'
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

const TextSetting = ({label, help, value, onSubmit, placeholder}) => (
    <div className={styles.setting}>
        <div className={styles.textSettingLabel}>{label}</div>
        <BufferedInput
            className={styles.textInput}
            type="text"
            value={value}
            placeholder={placeholder}
            onSubmit={onSubmit}
        />
        {help && <p className={styles.detail}>{help}</p>}
    </div>
);
TextSetting.propTypes = {
    label: PropTypes.node,
    help: PropTypes.node,
    value: PropTypes.string,
    onSubmit: PropTypes.func.isRequired,
    placeholder: PropTypes.string
};

class UnwrappedVersionControlPage extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleNameChange',
            'handleEmailChange',
            'handleBranchChange'
        ]);
        this.state = {
            authorName: getAuthorName(),
            authorEmail: getAuthorEmail(),
            defaultBranch: getDefaultBranch()
        };
    }
    handleNameChange (value) {
        setAuthorName(value);
        this.setState({authorName: getAuthorName()});
    }
    handleEmailChange (value) {
        setAuthorEmail(value);
        this.setState({authorEmail: getAuthorEmail()});
    }
    handleBranchChange (value) {
        setDefaultBranch(value);
        this.setState({defaultBranch: getDefaultBranch()});
    }
    render () {
        const {intl} = this.props;
        return (
            <Box className={styles.body}>
                <Header>{intl.formatMessage(messages.header)}</Header>
                <TextSetting
                    label={<FormattedMessage
                        defaultMessage="Author name"
                        id="mw.settings.vc.authorName"
                    />}
                    help={<FormattedMessage
                        // eslint-disable-next-line max-len
                        defaultMessage="Used as the commit author and as your username when pushing to private repositories."
                        id="mw.settings.vc.authorNameHelp"
                    />}
                    value={this.state.authorName}
                    onSubmit={this.handleNameChange}
                    placeholder={intl.formatMessage(messages.authorNamePlaceholder)}
                />
                <TextSetting
                    label={<FormattedMessage
                        defaultMessage="Author email"
                        id="mw.settings.vc.authorEmail"
                    />}
                    help={<FormattedMessage
                        defaultMessage="Recorded as the email address on each commit you make."
                        id="mw.settings.vc.authorEmailHelp"
                    />}
                    value={this.state.authorEmail}
                    onSubmit={this.handleEmailChange}
                    placeholder={intl.formatMessage(messages.authorEmailPlaceholder)}
                />
                <TextSetting
                    label={<FormattedMessage
                        defaultMessage="Default branch name"
                        id="mw.settings.vc.defaultBranch"
                    />}
                    help={<FormattedMessage
                        defaultMessage="Branch created when a new repository is initialized."
                        id="mw.settings.vc.defaultBranchHelp"
                    />}
                    value={this.state.defaultBranch}
                    onSubmit={this.handleBranchChange}
                    placeholder={intl.formatMessage(messages.defaultBranchPlaceholder)}
                />
            </Box>
        );
    }
}
UnwrappedVersionControlPage.propTypes = {
    intl: intlShape.isRequired
};
const VersionControlPage = injectIntl(UnwrappedVersionControlPage);

export default VersionControlPage;
