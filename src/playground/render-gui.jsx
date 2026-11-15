import React from 'react';
import GUI from '../containers/gui.jsx';

const searchParams = new URLSearchParams(location.search);
<<<<<<< eea4f3f
const cloudHost = searchParams.get('cloud_host') || 'wss://clouddata.pinewarp.org';
=======
const cloudHost = searchParams.get('cloud_host') || 'wss://clouddata.turbowarp.org';
>>>>>>> bilup/develop

const RenderGUI = props => (
    <GUI
        cloudHost={cloudHost}
        canUseCloud
        hasCloudPermission
        canSave={false}
        basePath={process.env.ROOT}
        canEditTitle
        enableCommunity
        {...props}
    />
);

export default RenderGUI;
