// 注意：这里必须是 author-store，不能是 browser-git。
// browser-git 会静态引入 isomorphic-git / lightning-fs / jszip / fractch，
// 而本模块被「设置」窗口引用（作者名 / 邮箱 / 默认分支）。
// 之前从 browser-git 取值，导致打开设置窗口就要额外下载整个 git 工具链
// （打包后数百 KB），窗口首屏因此明显变慢。
import {getDefaultAuthor, setDefaultAuthor} from './author-store.js';
import {getItem as getStorageItem} from '../utils/safe-storage.js';

const DEFAULT_BRANCH_KEY = 'mw:git-default-branch';

const readLocal = (key, fallback) => {
    try {
        const value = getStorageItem(key);
        return value === null ? fallback : value;
    } catch (e) {
        return fallback;
    }
};

const writeLocal = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // ignore
    }
};

const getAuthorName = () => getDefaultAuthor().name;
const getAuthorEmail = () => getDefaultAuthor().email;

const setAuthorName = name => {
    const author = getDefaultAuthor();
    setDefaultAuthor({name, email: author.email});
};

const setAuthorEmail = email => {
    const author = getDefaultAuthor();
    setDefaultAuthor({name: author.name, email});
};

const getDefaultBranch = () => readLocal(DEFAULT_BRANCH_KEY, 'main');
const setDefaultBranch = branch => writeLocal(DEFAULT_BRANCH_KEY, branch);

export {
    getAuthorName,
    getAuthorEmail,
    setAuthorName,
    setAuthorEmail,
    getDefaultBranch,
    setDefaultBranch
};
