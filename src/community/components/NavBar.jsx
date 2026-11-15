import React, {useState, useEffect} from 'react';
import {FormattedMessage} from 'react-intl';
import {Plus} from 'lucide-react';
import {useUser} from '../UserContext.jsx';
import api, {editorUrl} from '../api';
import {fetchNotifications} from '../../lib/rotur/client.js';
import logo from '../assets/bilup-logo.svg';
import setFaviconBadge from '../faviconBadge';
import styles from './NavBar.module.css';

const NavBar = () => {
    const {user} = useUser();
    const [unread, setUnread] = useState(0);
    const [openReports, setOpenReports] = useState(0);

    useEffect(() => {
        if (!user) {
            setUnread(0);
            setOpenReports(0);
            return;
        }
        let stale = false;
        const refresh = () => {
            if (document.hidden) return;
            fetchNotifications()
                .then(items => {
                    if (!stale) setUnread(items.filter(n => !n.read).length);
                })
                .catch(() => {});
            if (user.isAdmin) {
                api.admin.reports()
                    .then(data => {
                        if (!stale) setOpenReports((data.reports || []).filter(r => !r.resolved).length);
                    })
                    .catch(() => {});
            }
        };
        refresh();
        const timer = setInterval(refresh, 300000);
        const onPush = () => {
            setUnread(u => (u > 0 ? u + 1 : 1));
        };
        const onRead = () => setUnread(0);
        const onRemoved = event => {
            if (event.detail && event.detail.read) {
                return;
            }
            setUnread(u => (u > 0 ? u - 1 : 0));
        };
        window.addEventListener('mw:notifications-read', onRead);
        window.addEventListener('mw:notifications-push', onPush);
        window.addEventListener('mw:notifications-removed', onRemoved);
        window.addEventListener('mw:reports-updated', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            stale = true;
            clearInterval(timer);
            window.removeEventListener('mw:notifications-read', onRead);
            window.removeEventListener('mw:notifications-push', onPush);
            window.removeEventListener('mw:notifications-removed', onRemoved);
            window.removeEventListener('mw:reports-updated', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [user]);

    useEffect(() => {
        setFaviconBadge(unread > 0);
    }, [unread]);

    return (
        <header className={styles.bar}>
            <div className={styles.inner}>
                <a
                    href={editorUrl()}
                    className={styles.brand}
                >
                    <img
                        className={styles.logo}
                        src={logo}
                        alt="Bilup"
                    />
                </a>

                <nav className={styles.links}>
                    <a
                        href={editorUrl()}
                        className={styles.link}
                    >
                        <Plus size={17} />
                        <span className={styles.linkLabel}>
                            <FormattedMessage
                                defaultMessage="Create"
                                description="NavBar link to the editor"
                                id="mw.community.nav.create"
                            />
                        </span>
                    </a>
                </nav>
            </div>
        </header>
    );
};

export default NavBar;
