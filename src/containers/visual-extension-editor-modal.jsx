/**
 * 可视化扩展编辑器容器：接 redux modal 开关 + vm 注入。
 */
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {closeVisualExtensionEditor} from '../reducers/modals';

const VisualEditorModal = React.lazy(() => import('../components/visual-editor/visual-editor-modal.jsx'));

const mapStateToProps = state => ({
    visible: state.scratchGui.modals.visualExtensionEditor,
    vm: state.scratchGui.vm
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeVisualExtensionEditor())
});

const VisualExtensionEditorContainer = props => (
    props.visible ? (
        <React.Suspense fallback={null}>
            <VisualEditorModal
                mode="extension"
                vm={props.vm}
                onClose={props.onClose}
            />
        </React.Suspense>
    ) : null
);

VisualExtensionEditorContainer.propTypes = {
    visible: PropTypes.bool,
    vm: PropTypes.shape({}),
    onClose: PropTypes.func
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(VisualExtensionEditorContainer);
