/**
 * Regression tests for the "右下角 toast 丢失" report.
 *
 * Both failures below were reproduced in the built editor before the fix
 * (temp/probe-toast.js, cases [3] and [4]):
 *
 *   [3] a toast that arrives while the previous one is playing its 300ms exit
 *       animation was closed ~300ms later by the *previous* toast's timer, so
 *       it never really appeared;
 *   [4] re-showing the exact same message within 3s did not restart the dwell
 *       timer, so the second showing vanished early — which is exactly the
 *       shape of a user re-clicking "Commit"/"Push" after the same failure.
 *
 * `seq` (bumped by reducers/toast.js on every SHOW_TOAST) is what lets the
 * component tell "shown again" from "still the same one".
 */

import React from 'react';
import {mountWithIntl} from '../../helpers/intl-helpers.jsx';

import ToastNotification from '../../../src/components/toast-notification/toast-notification.jsx';

const DWELL = 3000;
const EXIT = 300;

// Mirrors what menu-bar-hoc does with the redux state: HIDE_TOAST on close.
class Host extends React.Component {
    constructor (props) {
        super(props);
        this.state = {visible: true};
        this.handleClose = this.handleClose.bind(this);
    }
    handleClose () {
        this.setState({visible: false});
        if (this.props.onClose) this.props.onClose();
    }
    render () {
        const {onClose, ...rest} = this.props; // eslint-disable-line no-unused-vars
        return (
            <ToastNotification
                {...rest}
                visible={this.state.visible}
                onClose={this.handleClose}
            />
        );
    }
}

const mountToast = (props = {}) => mountWithIntl(
    <Host
        message="提交信息不能为空"
        type="error"
        position="bottom-right"
        seq={1}
        {...props}
    />
);

const isShowing = wrapper => wrapper.find('[role="alert"]').length > 0;

describe('ToastNotification lifecycle', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    test('shows the message and closes itself after the dwell time', () => {
        const onClose = jest.fn();
        const wrapper = mountToast({onClose});
        expect(isShowing(wrapper)).toBe(true);

        jest.runTimersToTime(DWELL - 100);
        expect(onClose).not.toHaveBeenCalled();

        jest.runTimersToTime(100 + EXIT);
        expect(onClose).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    test('a toast arriving during the previous exit animation is not closed by it', () => {
        const onClose = jest.fn();
        const wrapper = mountToast({message: '第一条：旧错误', onClose});

        // Land inside the exit window of the first toast.
        jest.runTimersToTime(DWELL + 50);
        expect(isShowing(wrapper)).toBe(true);
        expect(onClose).not.toHaveBeenCalled();

        // A new showing arrives while the old one is animating out.
        wrapper.setProps({seq: 2, message: '第二条：新错误'});
        jest.runTimersToTime(EXIT + 100);

        // Before the fix this was gone (the old timer called onClose).
        expect(onClose).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('第二条：新错误');

        // ...and it still gets its own full dwell time.
        jest.runTimersToTime(DWELL - 500);
        expect(onClose).not.toHaveBeenCalled();
        jest.runTimersToTime(500 + EXIT);
        expect(onClose).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    test('re-showing the same message restarts the dwell timer', () => {
        const onClose = jest.fn();
        const wrapper = mountToast({message: '同一句话', onClose});

        jest.runTimersToTime(DWELL - 1000);
        wrapper.setProps({seq: 2}); // 同一条文案，再弹一次
        jest.runTimersToTime(1500); // 距第二次发送 1.5s

        // Before the fix the first timer had already fired and closed it.
        expect(isShowing(wrapper)).toBe(true);
        expect(onClose).not.toHaveBeenCalled();

        jest.runTimersToTime(DWELL - 1500 + EXIT);
        expect(onClose).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    test('the close button starts the exit animation', () => {
        const onClose = jest.fn();
        const wrapper = mountToast({onClose, message: '手动关闭'});

        wrapper.find('button').simulate('click');
        jest.runTimersToTime(EXIT);
        expect(onClose).toHaveBeenCalledTimes(1);
        wrapper.unmount();
    });

    test('new content also restarts the dwell timer', () => {
        const onClose = jest.fn();
        const wrapper = mountToast({message: '旧的', onClose});

        jest.runTimersToTime(DWELL - 1000);
        wrapper.setProps({seq: 2, message: '新的'});
        jest.runTimersToTime(DWELL - 500);
        expect(onClose).not.toHaveBeenCalled();
        wrapper.unmount();
    });
});
