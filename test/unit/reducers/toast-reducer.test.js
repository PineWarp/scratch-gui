/**
 * The toast reducer carries the extra `position` field A3 introduced: git
 * failures are reported in the bottom-right corner (marked ❌️ by the component)
 * while every other notification keeps the original top-right slot.
 *
 * The field has to survive SHOW_TOAST *and* be reset by HIDE_TOAST's sibling
 * behaviour — a stale position would move unrelated toasts to the corner the
 * git window asked for.
 */

import reducer, {toastInitialState} from '../../../src/reducers/toast';

const show = (message, type, position) => reducer(undefined, {
    type: 'scratch-gui/SHOW_TOAST',
    message,
    toastType: type,
    position
});

describe('toast reducer', () => {
    test('defaults to the top-right corner', () => {
        expect(toastInitialState.position).toBe('top-right');
        const state = reducer(undefined, {
            type: 'scratch-gui/SHOW_TOAST',
            message: 'Saved'
        });
        expect(state).toMatchObject({
            visible: true,
            message: 'Saved',
            type: 'info',
            position: 'top-right'
        });
    });

    test('carries an explicit bottom-right position (git errors)', () => {
        const state = show('拉取失败', 'error', 'bottom-right');
        expect(state.type).toBe('error');
        expect(state.position).toBe('bottom-right');
    });

    test('does not leak a previous position into the next toast', () => {
        const first = show('拉取失败', 'error', 'bottom-right');
        const next = reducer(first, {
            type: 'scratch-gui/SHOW_TOAST',
            message: 'Saved'
        });
        expect(next.position).toBe('top-right');
    });

    test('hide only flips visibility', () => {
        const shown = show('拉取失败', 'error', 'bottom-right');
        const hidden = reducer(shown, {type: 'scratch-gui/HIDE_TOAST'});
        expect(hidden.visible).toBe(false);
        expect(hidden.message).toBe('拉取失败');
        expect(hidden.position).toBe('bottom-right');
    });

    // The notification component keys its 3s dwell timer and its exit animation
    // on `seq`, so that "shown again" is distinguishable from "still the same
    // one" even when the text is identical (a retried failure re-reports the
    // same message). If seq stops advancing, a repeated toast inherits the
    // remainder of the previous timer and vanishes almost immediately.
    test('bumps seq on every show, even for an identical message', () => {
        const first = show('提交信息不能为空', 'error', 'bottom-right');
        expect(first.seq).toBe(1);
        const second = reducer(first, {
            type: 'scratch-gui/SHOW_TOAST',
            message: '提交信息不能为空',
            toastType: 'error',
            position: 'bottom-right'
        });
        expect(second.seq).toBe(2);
        expect(second.seq).not.toBe(first.seq);
    });

    test('hiding does not bump seq (only a new showing does)', () => {
        const shown = show('Saved');
        const hidden = reducer(shown, {type: 'scratch-gui/HIDE_TOAST'});
        expect(hidden.seq).toBe(shown.seq);
    });

    test('survives a state without seq instead of producing NaN', () => {
        const legacy = {visible: false, message: null, type: 'info', position: 'top-right'};
        const next = reducer(legacy, {type: 'scratch-gui/SHOW_TOAST', message: 'Saved'});
        expect(next.seq).toBe(1);
    });

    test('ignores unrelated actions', () => {
        const state = show('Saved');
        expect(reducer(state, {type: 'scratch-gui/SOMETHING_ELSE'})).toBe(state);
    });
});
