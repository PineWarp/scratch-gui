import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import ProjectAssetsManager from '../components/project-assets-manager/project-assets-manager.jsx';
import {closeProjectAssetsManagerModal, openProjectAssetsManagerModal} from '../reducers/modals.js';

class TWProjectAssetsManager extends React.Component {
    componentDidMount () {
        window.__bilupProjectAssetsManagerToggle = this.handleToggle;
    }

    componentWillUnmount () {
        if (window.__bilupProjectAssetsManagerToggle === this.handleToggle) {
            window.__bilupProjectAssetsManagerToggle = null;
        }
    }

    handleToggle = () => {
        if (this.props.visible) this.props.onClose();
        else this.props.onOpen();
    };

    render () {
        if (!this.props.visible) return null;
        return (
            <ProjectAssetsManager
                projectTitle={this.props.projectTitle}
                vm={this.props.vm}
                onClose={this.props.onClose}
            />
        );
    }
}

TWProjectAssetsManager.propTypes = {
    onClose: PropTypes.func.isRequired,
    onOpen: PropTypes.func.isRequired,
    projectTitle: PropTypes.string,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};

TWProjectAssetsManager.defaultProps = {
    projectTitle: ''
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle,
    visible: state.scratchGui.modals.projectAssetsManagerModal,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onOpen: () => dispatch(openProjectAssetsManagerModal()),
    onClose: () => dispatch(closeProjectAssetsManagerModal())
});

export {TWProjectAssetsManager};
export default connect(mapStateToProps, mapDispatchToProps)(TWProjectAssetsManager);
