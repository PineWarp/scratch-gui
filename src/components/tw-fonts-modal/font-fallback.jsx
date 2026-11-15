import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import styles from './fonts-modal.css';
import bindAll from 'lodash.bindall';
import classNames from 'classnames';

// These are font names, not UI text: they must never be translated, because
// they are used directly as the CSS font-family for each preview.
const FALLBACK_FONTS = [
    'Sans Serif',
    'Serif',
    'Handwriting',
    'Marker',
    'Curly',
    'Pixel',
    'Scratch'
];

class FontFallback extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClick'
        ]);
    }

    handleClick (family) {
        this.props.onChange(family);
    }

    render () {
        return (
            <div className={styles.fallbackContainer}>
                <div className={styles.fallbackLabel}>
                    <FormattedMessage
                        defaultMessage="Choose a fallback font to use if the font fails to load or is deleted:"
                        description="Part of font management modal."
                        id="tw.fonts.fallback"
                    />
                </div>

                <div className={styles.fallbackList}>
                    {FALLBACK_FONTS.map(family => (
                        <div
                            key={family}
                            className={classNames(styles.fallbackItem, {
                                [styles.fallbackItemSelected]: this.props.fallback === family
                            })}
                            onClick={() => this.handleClick(family)}
                            style={{fontFamily: family}}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => {
                                if (e.key === 'Enter') this.handleClick(family);
                            }}
                        >
                            <span>{family}</span>
                            {this.props.fallback === family && (
                                <span className={styles.fallbackCheckmark}>{'✓'}</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

FontFallback.DEFAULT = 'Sans Serif';

FontFallback.propTypes = {
    fallback: PropTypes.string.isRequired,
    onChange: PropTypes.func.isRequired
};

export default FontFallback;
