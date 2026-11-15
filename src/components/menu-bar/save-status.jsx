import {connect} from 'react-redux';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';

import {
    manualUpdateProject
} from '../../reducers/project-state';

import styles from './save-status.css';

// Wrapper for the "Save Now" link in the nav bar.
//
// This unit used to host <InlineMessages /> as well, because the nav bar was
// where inline save alerts ("Saving…", "Saved", "Restored…") were rendered.
// They are now routed to the bottom-right notification instead, and that bridge
// is mounted once at the GUI root (containers/inline-messages.jsx). A second
// copy here would post every notification twice, so it must not come back.
//
// Note this component is also currently unused (menu-bar.jsx has its import
// commented out since the menu bar rewrite) — it is kept because the settings
// modal still lists it as a menu-bar layout unit.
const SaveStatus = ({
    projectChanged,
    onClickSave
}) => (
    projectChanged && (
        <div
            className={styles.saveNow}
            onClick={onClickSave}
        >
            <span className={styles.saveLabel}>
                <FormattedMessage
                    defaultMessage="Save Now"
                    description="Title bar link for saving now"
                    id="gui.menuBar.saveNowLink"
                />
            </span>
        </div>
    ));

SaveStatus.propTypes = {
    onClickSave: PropTypes.func,
    projectChanged: PropTypes.bool
};

const mapStateToProps = state => ({
    projectChanged: state.scratchGui.projectChanged
});

const mapDispatchToProps = dispatch => ({
    onClickSave: () => dispatch(manualUpdateProject())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SaveStatus);
