import React, {useMemo} from 'react';
import PropTypes from 'prop-types';
import styles from './data-url.css';

// Reused for every preview: TextDecoder is stateless when called without
// {stream: true}, and creating one per render is unnecessary work.
const utf8Decoder = new TextDecoder('utf-8');

/**
 * @param {string} data Base64-encoded data
 * @returns {string} The decoded text, interpreted as UTF-8
 */
const decodeBase64 = data => {
    // atob() returns a binary string (one char per byte), not text. Feeding it
    // straight to the UI turns any non-ASCII characters into mojibake, so the
    // bytes must go through a UTF-8 decoder.
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return utf8Decoder.decode(bytes);
};

/**
 * @param {string} dataURI data: URI
 * @returns {string} A hopefully human-readable version
 */
const decodeDataURI = dataURI => {
    const delimeter = dataURI.indexOf(',');
    if (delimeter === -1) {
        return dataURI;
    }
    const contentType = dataURI.substring(0, delimeter);
    const data = dataURI.substring(delimeter + 1);
    if (contentType.endsWith(';base64')) {
        try {
            return decodeBase64(data);
        } catch (e) {
            return dataURI;
        }
    }
    try {
        return decodeURIComponent(data);
    } catch (e) {
        return dataURI;
    }
};

const DataURL = props => {
    // Decoding can be expensive for large extensions, so only redo it when the
    // URL actually changes instead of on every (e.g. checkbox) re-render.
    const code = useMemo(() => decodeDataURI(props.url), [props.url]);

    return (
        <textarea
            className={styles.code}
            value={code}
            readOnly
            spellCheck={false}
            autoComplete="off"
        />
    );
};

DataURL.propTypes = {
    url: PropTypes.string.isRequired
};

export default DataURL;
