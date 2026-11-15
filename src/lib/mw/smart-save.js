import openMistWarpShareWindow from './open-mw-share-window.js';
import {getRememberedPlatformProjectState, publishToMistWarp} from '../community/publish.js';
import {request} from '../community/api.js';
import communityEnabled from '../community/enabled.js';
import downloadBlob from '../utils/download-blob';
import {getEmbedGitOnSave} from '../mw-embed-git-on-save.js';

const agreementAccepted = async () => {
    try {
        const {agreement} = await request('/agreement');
        return !(agreement.version > 0 && !agreement.accepted);
    } catch (e) {
        return true;
    }
};

// Ctrl+S / save button. Own project already on PineWarp -> upload the current
// version silently. Someone else's project -> the window (remix makes a copy).
// Not on PineWarp yet -> download an sb3. The window only reappears for an
// update when a new upload agreement needs accepting, or the silent upload fails.
const smartSave = async ({vm, title, onSaved = () => {}}) => {
    const platform = communityEnabled ? getRememberedPlatformProjectState() : null;

    if (!platform) {
        // Embedding the repository is opt-in (Experimental → Embed Git Repository
        // on Save, off by default): it needs the whole zip in memory, and it makes
        // the saved file carry a repository most people never asked for.
        if (!getEmbedGitOnSave()) {
            downloadBlob(`${title || 'project'}.sb3`, await vm.saveProjectSb3());
            return;
        }
        const {embedRepoIntoSb3Blob} = await import('../git/browser-git.js');
        const blob = await embedRepoIntoSb3Blob(await vm.saveProjectSb3());
        downloadBlob(`${title || 'project'}.sb3`, blob);
        return;
    }

    if (platform.isOwner === false) {
        openMistWarpShareWindow({vm, initialTitle: title, action: 'remix', onPublished: onSaved});
        return;
    }

    if (!(await agreementAccepted())) {
        openMistWarpShareWindow({vm, initialTitle: title, action: 'update', onPublished: onSaved});
        return;
    }

    try {
        onSaved(await publishToMistWarp({vm, title: null, updateOnly: true}));
    } catch (e) {
        openMistWarpShareWindow({
            vm,
            initialTitle: title,
            initialError: e,
            action: 'update',
            onPublished: onSaved
        });
    }
};

export default smartSave;
