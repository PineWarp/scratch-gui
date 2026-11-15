import {getItem, setItem} from './utils/safe-storage.js';

const DISABLE_CLOUD_VARIABLES_KEY = 'mw:disable-cloud-variables';

const getDisableCloudVariables = () => {
    try {
        return getItem(DISABLE_CLOUD_VARIABLES_KEY) === 'true';
    } catch (e) {
        return false;
    }
};

const setDisableCloudVariables = value => {
    try {
        setItem(DISABLE_CLOUD_VARIABLES_KEY, value ? 'true' : 'false');
    } catch (e) {
        // ignore
    }
};

export {
    getDisableCloudVariables,
    setDisableCloudVariables
};
