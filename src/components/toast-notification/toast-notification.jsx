import {intlShape, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import styles from './toast-notification.css';

// One glyph per level, so the corner toast reads at a glance: ❌ marks a
// failure (the git layer's only channel for errors — see A3), which is why the
// icon lives next to the message rather than being baked into its text.
const ICONS = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
};

const ToastNotificationComponent = props => {
    const {message, type = 'info', position = 'top-right', visible, seq, onClose} = props;
    const intl = props.intl;

    // `closingFor` records the `seq` that started its own exit animation rather
    // than a plain boolean, so "is this toast leaving?" is answered per showing.
    // A toast that arrives while the previous one is animating out therefore
    // reads as *not* closing (closingFor !== seq): it slides in, and — because
    // `closing` flips back to false — the outgoing toast's 300ms timer is
    // cleaned up instead of calling onClose() on the new one. With a boolean
    // here, the second toast inherited the exit animation and was unmounted
    // ~300ms later, i.e. it silently never showed.
    const [closingFor, setClosingFor] = React.useState(null);
    const closing = closingFor !== null && closingFor === seq;

    const handleClose = React.useCallback(() => {
        setClosingFor(seq);
    }, [seq]);

    // Dwell timer, keyed on `seq` so re-showing the exact same message restarts
    // the full 3s instead of inheriting what is left of the previous showing.
    React.useEffect(() => {
        if (!visible || !message) {
            setClosingFor(null);
            return () => {};
        }
        const timeout = setTimeout(() => {
            setClosingFor(seq);
        }, 3000);
        return () => clearTimeout(timeout);
    }, [visible, message, type, seq]);

    // Exit animation, owned by the showing that started it (see above).
    React.useEffect(() => {
        if (!closing) return () => {};
        const timeout = setTimeout(() => {
            onClose();
            setClosingFor(null);
        }, 300);
        return () => clearTimeout(timeout);
    }, [closing, onClose, seq]);

    if (!visible || !message) return null;

    return (
        <div
            className={classNames(
                styles.toast,
                styles[type],
                position === 'bottom-right' ? styles.bottomRight : styles.topRight,
                closing ? styles.closing : null
            )}
            role="alert"
            aria-live="polite"
        >
            <span
                className={styles.icon}
                aria-hidden="true"
            >{ICONS[type] || ICONS.info}</span>
            <span className={styles.message}>
                {message}
            </span>
            <button
                className={styles.closeButton}
                onClick={handleClose}
                aria-label={intl.formatMessage({
                    defaultMessage: 'Close notification',
                    id: 'tw.toast.close'
                })}
            >
                {'×'}
            </button>
        </div>
    );
};

ToastNotificationComponent.propTypes = {
    intl: intlShape,
    message: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
    type: PropTypes.oneOf(['success', 'error', 'info', 'warning']),
    position: PropTypes.oneOf(['top-right', 'bottom-right']),
    // Bumped by every SHOW_TOAST (reducers/toast.js). Optional so the component
    // still behaves when used outside the store.
    seq: PropTypes.number,
    visible: PropTypes.bool,
    onClose: PropTypes.func.isRequired
};

export default injectIntl(ToastNotificationComponent);
