import downloadBlob from '../utils/download-blob';
import {getEmbedGitOnSave} from '../mw-embed-git-on-save.js';

// Saving always downloads a new .sb3: it never overwrites a local file that
// was saved before, and it never overwrites a published online project. The
// browser renames a repeated download, so an existing file is left untouched.
const smartSave = async ({vm, title, onSaved = () => {}}) => {
    const filename = `${title || 'project'}.sb3`;

    // Embedding the repository is opt-in (Experimental → Embed Git Repository
    // on Save, off by default): it needs the whole zip in memory.
    if (getEmbedGitOnSave()) {
        const {embedRepoIntoSb3Blob} = await import('../git/browser-git.js');
        downloadBlob(filename, await embedRepoIntoSb3Blob(await vm.saveProjectSb3()));
    } else {
        downloadBlob(filename, await vm.saveProjectSb3());
    }

    onSaved();
};

export default smartSave;
