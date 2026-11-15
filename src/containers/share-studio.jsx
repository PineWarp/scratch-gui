import {connect} from 'react-redux';

import ShareStudio from '../components/share-studio/share-studio.jsx';
import {closeShareStudioModal} from '../reducers/modals';

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onRequestClose: () => dispatch(closeShareStudioModal())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ShareStudio);
