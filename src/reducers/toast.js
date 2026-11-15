const initialState = {
    visible: false,
    message: null,
    type: 'info',
    // Which corner the toast slides into. Errors raised by the git layer ask
    // for 'bottom-right' (A3) — they are triggered from inside the git window,
    // and the bottom corner keeps them clear of the window header, while the
    // rest of the app keeps the original top-right position.
    position: 'top-right',
    // Identity of the *current showing*, bumped by every SHOW_TOAST. The text
    // alone cannot identify it: the same failure is routinely re-reported
    // ("Commit message is required" on the second click, the same network error
    // on a retry), and a toast that cannot tell "shown again" from "still the
    // same one" keeps the remainder of the previous 3s timer — it disappears
    // almost immediately, which reads as the toast never appearing at all.
    seq: 0
};

const reducer = function (state, action) {
    if (typeof state === 'undefined') state = initialState;
    switch (action.type) {
    case 'scratch-gui/SHOW_TOAST':
        return Object.assign({}, state, {
            visible: true,
            message: action.message,
            type: action.toastType || 'info',
            position: action.position || initialState.position,
            // `|| 0` keeps a state object without `seq` (an old snapshot, a test
            // fixture) from turning the counter into NaN.
            seq: (state.seq || 0) + 1
        });
    case 'scratch-gui/HIDE_TOAST':
        return Object.assign({}, state, {
            visible: false
        });
    default:
        return state;
    }
};

export {
    reducer as default,
    initialState as toastInitialState
};
