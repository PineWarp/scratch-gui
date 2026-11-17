import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {projectTitleInitialState} from '../reducers/project-title';
import downloadBlob from '../lib/utils/download-blob';
import {setProjectUnchanged} from '../reducers/project-changed';
import {showStandardAlert, showAlertWithTimeout} from '../reducers/alerts';
import {getIsShowingProject} from '../reducers/project-state';
import log from '../lib/utils/log';
import {getEmbedGitOnSave} from '../lib/mw-embed-git-on-save';

/**
 * Wait until the browser has actually painted. Serializing a large project
 * blocks the main thread for hundreds of milliseconds right after the "saving"
 * alert is dispatched, which means the alert never gets a frame to appear and
 * saving looks like a freeze. Yielding two frames first guarantees the alert is
 * on screen before the work starts.
 * @returns {Promise} Resolved after the next paint.
 */
const afterNextPaint = () => new Promise(resolve => {
    let settled = false;
    const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
    };
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(finish));
    }
    // Animation frames do not run in a hidden tab, so a save must never wait on
    // one forever.
    setTimeout(finish, 100);
});

/**
 * Project saver component passes a downloadProject function to its child.
 * It expects this child to be a function with the signature
 *     function (downloadProject, props) {}
 * The component can then be used to attach project saving functionality
 * to any other component:
 *
 * <SB3Downloader>{(downloadProject, props) => (
 *     <MyCoolComponent
 *         onClick={downloadProject}
 *         {...props}
 *     />
 * )}</SB3Downloader>
 */
class SB3Downloader extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'downloadProject'
        ]);
    }
    startedSaving () {
        this.props.onShowSavingAlert();
    }
    finishedSaving () {
        this.props.onProjectUnchanged();
        this.props.onShowSaveSuccessAlert();
        if (this.props.onSaveFinished) {
            this.props.onSaveFinished();
        }
    }
    async downloadProject () {
        if (!this.props.canSaveProject) {
            return;
        }
        this.startedSaving();
        await afterNextPaint();
        return this.props.saveProjectSb3().then(content => {
            this.finishedSaving();
            downloadBlob(this.props.projectFilename, content);
        })
            .catch(e => {
                this.handleSaveError(e);
            });
    }
    handleSaveError (e) {
        // AbortError can happen when someone cancels the file selector dialog
        if (e && e.name === 'AbortError') {
            return;
        }
        log.error(e);
        this.props.onShowSaveErrorAlert();
    }
    render () {
        const {
            children
        } = this.props;
        // Every save entry point downloads a new file. Nothing writes back to a
        // previously chosen file, so "save", "save as copy" and the shortcut
        // system all share the same behaviour.
        return children(
            this.props.className,
            this.downloadProject,
            {
                available: true,
                smartSave: this.downloadProject
            }
        );
    }
}

const getProjectFilename = (curTitle, defaultTitle) => {
    let filenameTitle = curTitle;
    if (!filenameTitle || filenameTitle.length === 0) {
        filenameTitle = defaultTitle;
    }
    return `${filenameTitle.substring(0, 100)}.sb3`;
};

SB3Downloader.propTypes = {
    children: PropTypes.func,
    className: PropTypes.string,
    onSaveFinished: PropTypes.func,
    projectFilename: PropTypes.string,
    saveProjectSb3: PropTypes.func,
    canSaveProject: PropTypes.bool,
    onShowSavingAlert: PropTypes.func,
    onShowSaveSuccessAlert: PropTypes.func,
    onShowSaveErrorAlert: PropTypes.func,
    onProjectUnchanged: PropTypes.func
};
SB3Downloader.defaultProps = {
    className: ''
};

const mapStateToProps = state => ({
    // Wrap the VM save so the .sb3 can also carry the git repo (fractch tree +
    // .git) under GIT_EMBED_DIR while keeping project.json/assets at the top
    // level. Opt-in via Experimental → Embed Git Repository on Save.
    saveProjectSb3: (...args) =>
        state.scratchGui.vm.saveProjectSb3(...args).then(async content => {
            if (!getEmbedGitOnSave()) return content;
            const {embedRepoIntoSb3Blob} = await import('../lib/git/browser-git');
            return embedRepoIntoSb3Blob(content);
        }),
    canSaveProject: getIsShowingProject(state.scratchGui.projectState.loadingState),
    projectFilename: getProjectFilename(state.scratchGui.projectTitle, projectTitleInitialState)
});

const mapDispatchToProps = dispatch => ({
    onShowSavingAlert: () => showAlertWithTimeout(dispatch, 'saving'),
    onShowSaveSuccessAlert: () => showAlertWithTimeout(dispatch, 'twSaveToDiskSuccess'),
    onShowSaveErrorAlert: () => dispatch(showStandardAlert('savingError')),
    onProjectUnchanged: () => dispatch(setProjectUnchanged())
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SB3Downloader);
