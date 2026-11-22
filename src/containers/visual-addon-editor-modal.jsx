/**
 * 可视化插件编辑器容器：接 redux modal 开关 + vm 注入。
 */
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {closeVisualAddonEditor} from '../reducers/modals';

const VisualEditorModal = React.lazy(() => import('../components/visual-editor/visual-editor-modal.jsx'));

const mapStateToProps = state => ({
    visible: state.scratchGui.modals.visualAddonEditor,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeVisualAddonEditor())
});

const VisualAddonEditorContainer = props => (
    props.visible ? (
        <React.Suspense fallback={null}>
            <VisualEditorModal
                mode="addon"
                vm={props.vm}
                onClose={props.onClose}
            />
        </React.Suspense>
    ) : null
);

VisualAddonEditorContainer.propTypes = {
    visible: PropTypes.bool,
    vm: PropTypes.shape({}),
    onClose: PropTypes.func
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(VisualAddonEditorContainer);
