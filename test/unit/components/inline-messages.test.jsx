/**
 * 「保存作品 / 创建还原点没有右下角提示」的回归测试。
 *
 * 这批提示（saving / saveSuccess / twSaveToDiskSuccess /
 * twCreatingRestorePoint / twRestorePoint*）都是 AlertTypes.INLINE，唯一的 UI
 * 出口是 `containers/inline-messages.jsx` → `lib/notification-manager.js` →
 * 右下角通知。
 *
 * 之前 inline-messages 只挂在 menu-bar/save-status.jsx 里，而那个组件的
 * import 在 menu-bar.jsx 被注释掉（menu bar rewrite），于是 alert 进了 store
 * 却没有任何东西把它画出来 —— 保存、还原点全部静默。实测（build + CDP，
 * temp/probe-inline-alerts.js）：dispatch 之后
 * `alertsList=[{id:'saveSuccess', type:'INLINE'}]`，但
 * `notificationManager.notifications=[]`、DOM 里 0 个通知。
 */

import React from 'react';
import fs from 'fs';
import path from 'path';
import {Provider} from 'react-redux';
import {createStore, combineReducers} from 'redux';

import {mountWithIntl} from '../../helpers/intl-helpers.jsx';
import InlineMessages from '../../../src/containers/inline-messages.jsx';
import alertsReducer from '../../../src/reducers/alerts';
import notificationManager from '../../../src/lib/notification-manager.js';

const SHOW_ALERT = 'scratch-gui/alerts/SHOW_ALERT';
const CLOSE_ALERT_WITH_ID = 'scratch-gui/alerts/CLOSE_ALERT_WITH_ID';

const makeStore = () => createStore(combineReducers({
    scratchGui: combineReducers({alerts: alertsReducer})
}));

const mountInline = () => {
    const store = makeStore();
    const wrapper = mountWithIntl(
        <Provider store={store}>
            <InlineMessages />
        </Provider>
    );
    return {store, wrapper};
};

const flushEffects = () => new Promise(resolve => setTimeout(resolve, 0));

describe('inline alerts reach the bottom-right notification', () => {
    beforeEach(() => {
        notificationManager.dismissAll();
    });
    afterEach(() => {
        notificationManager.dismissAll();
    });

    test('saveSuccess becomes a success notification', async () => {
        const {store, wrapper} = mountInline();

        store.dispatch({type: SHOW_ALERT, alertId: 'saveSuccess'});
        await flushEffects();

        const shown = notificationManager.notifications;
        expect(shown).toHaveLength(1);
        expect(shown[0].type).toBe('success');
        expect(shown[0].message).toBe('Project saved.');
        wrapper.unmount();
    });

    test('saving becomes an info notification', async () => {
        const {store, wrapper} = mountInline();

        store.dispatch({type: SHOW_ALERT, alertId: 'saving'});
        await flushEffects();

        const shown = notificationManager.notifications;
        expect(shown).toHaveLength(1);
        expect(shown[0].type).toBe('info');
        expect(shown[0].message).toBe('Saving project…');
        wrapper.unmount();
    });

    test('restore point success and failure reach the corner too', async () => {
        const {store, wrapper} = mountInline();

        store.dispatch({type: SHOW_ALERT, alertId: 'twRestorePointSuccess'});
        await flushEffects();
        expect(notificationManager.notifications).toHaveLength(1);
        expect(notificationManager.notifications[0].type).toBe('success');

        store.dispatch({type: SHOW_ALERT, alertId: 'twRestorePointError'});
        await flushEffects();
        // 新的 alert 顶掉旧的（只显示最新一条），不能两条叠着
        expect(notificationManager.notifications).toHaveLength(1);
        expect(notificationManager.notifications[0].type).toBe('warning');
        expect(notificationManager.notifications[0].message).toBe('Could not create restore point');
        wrapper.unmount();
    });

    test('clearing the alert dismisses the notification', async () => {
        const {store, wrapper} = mountInline();

        store.dispatch({type: SHOW_ALERT, alertId: 'twSaveToDiskSuccess'});
        await flushEffects();
        expect(notificationManager.notifications).toHaveLength(1);

        store.dispatch({type: CLOSE_ALERT_WITH_ID, alertId: 'twSaveToDiskSuccess'});
        await flushEffects();
        expect(notificationManager.notifications).toHaveLength(0);
        wrapper.unmount();
    });
});

// The tests above only prove the bridge works — they mount it themselves. The
// actual outage was that nothing mounted it: it lived inside
// menu-bar/save-status.jsx, whose import got commented out during the menu bar
// rewrite, so the alert reached the store and stopped there (silent, no error).
// gui.jsx cannot be mounted in a unit test (it pulls in the editor), so the
// wiring is asserted on the source instead: one mount point, at the GUI root.
describe('InlineMessages wiring', () => {
    const read = relative => fs.readFileSync(
        path.join(__dirname, '../../../src', relative), 'utf8');

    test('is mounted once at the GUI root', () => {
        const gui = read('components/gui/gui.jsx');
        expect(gui).toMatch(/^\s*<InlineMessages \/>/m);
        expect(gui).toMatch(/^import InlineMessages from '\.\.\/\.\.\/containers\/inline-messages\.jsx';$/m);
    });

    test('is not also mounted by the menu bar (that would double every toast)', () => {
        // The prose in that file mentions InlineMessages on purpose (so nobody
        // puts it back); what must not come back is the import.
        expect(read('components/menu-bar/save-status.jsx')).not.toMatch(/import InlineMessages/);
    });
});
