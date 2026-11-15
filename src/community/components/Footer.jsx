import React from 'react';
import {Link} from 'react-router-dom';
import {FormattedMessage} from 'react-intl';
import {Github} from 'lucide-react';
import {editorUrl} from '../api';
import logo from '../assets/bilup-logo.svg';
import styles from './Footer.module.css';

const Footer = () => (
    <footer className={styles.footer}>
        <div className={styles.inner}>
            <div className={styles.brand}>
                <img
                    className={styles.logo}
                    src={logo}
                    alt="Bilup"
                />
                <div>
                    <p className={styles.tagline}>
                        <FormattedMessage
                            defaultMessage="Elevate your creation."
                            description="Footer tagline"
                            id="mw.community.footer.tagline"
                        />
                    </p>
                </div>
            </div>

            <div className={styles.columns}>
                <div className={styles.column}>
                    <span className={styles.columnTitle}>
                        <FormattedMessage
                            defaultMessage="Create"
                            description="Footer column title"
                            id="mw.community.nav.create"
                        />
                    </span>
                    <a href={editorUrl()}>
                        <FormattedMessage
                            defaultMessage="Editor"
                            description="Footer link to the editor"
                            id="mw.community.footer.editor"
                        />
                    </a>
                </div>
                <div className={styles.column}>
                    <span className={styles.columnTitle}>
                        <FormattedMessage
                            defaultMessage="More"
                            description="Footer column title"
                            id="mw.community.footer.more"
                        />
                    </span>
                    <a
                        href="https://github.com/bilup"
                        target="_blank"
                        rel="noreferrer"
                        className={styles.iconRow}
                    >
                        <Github size={14} />
                        GitHub
                    </a>
                    <Link to="/credits">
                        <FormattedMessage
                            defaultMessage="Credits"
                            description="Footer link to credits"
                            id="mw.community.footer.credits"
                        />
                    </Link>
                </div>
            </div>
        </div>
        <div className={styles.legal}>
            <FormattedMessage
                defaultMessage="Bilup is a mod of TurboWarp and Scratch. Not affiliated with Scratch or the Scratch Foundation."
                description="Footer legal text"
                id="mw.community.footer.legal"
            />
        </div>
    </footer>
);

export default Footer;
