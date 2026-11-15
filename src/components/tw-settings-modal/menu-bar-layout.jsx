import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import classNames from 'classnames';
import {AlignLeft, AlignCenter, ChevronDown, ChevronUp, GripVertical} from 'lucide-react';
import FancyCheckbox from '../tw-fancy-checkbox/checkbox.jsx';
import styles from './settings-modal.css';
import {
    ZONES,
    ALWAYS_SHOW,
    getZoneDisplayOrder,
    getZoneExtras,
    setZoneOrder,
    moveMenuItem,
    getHidden,
    setHidden,
    getPresentOrderedIds,
    getMenuBarLayout
} from '../../lib/mw-menu-bar-layout';
import {Theme} from '../../lib/themes/index.js';
import {setTheme} from '../../reducers/theme.js';
import {applyTheme} from '../../lib/themes/themePersistance.js';
import {onSettingsChanged} from '../../lib/menu-bar/settings.js';

const messages = defineMessages({
    moveUp: {defaultMessage: 'Move {item} up', id: 'mw.settings.menuBar.moveUp'},
    moveDown: {defaultMessage: 'Move {item} down', id: 'mw.settings.menuBar.moveDown'}
});

// 每个菜单项的可显示名称。这里刻意存完整描述符（id + 英文 defaultMessage）而不是裸 id：
// 裸 id 只能靠 `defaultMessage: id` 兜底，某个语种缺条目时会把 `mw.menuBar.xxx` 原样显示出来
// （`mw.menuBar.addons` 曾经就是这样漏翻的）。带上英文文案后，任何语种缺条目都会退回英文。
const LABELS = {
    'file': {id: 'mw.menuBar.file', defaultMessage: 'File'},
    'bookmarks': {id: 'mw.menuBar.bookmarks', defaultMessage: 'Bookmarks'},
    'edit': {id: 'mw.menuBar.edit', defaultMessage: 'Edit'},
    'tools': {id: 'mw.menuBar.tools', defaultMessage: 'Tools'},
    'mode': {id: 'mw.menuBar.mode', defaultMessage: 'Mode'},
    'block-count': {id: 'mw.menuBar.blockCount', defaultMessage: 'Block Count'},
    'media-recorder': {id: 'mw.settings.menuBar.videoRecorder', defaultMessage: 'Video Recorder'},
    'save-status': {id: 'mw.menuBar.saveStatus', defaultMessage: 'Save Status'},
    'addons': {id: 'mw.menuBar.addons', defaultMessage: 'Addons'},
    'settings': {id: 'mw.menuBar.settings', defaultMessage: 'Settings'},
    'about': {id: 'mw.menuBar.about', defaultMessage: 'About'},
    'project-title': {id: 'mw.menuBar.projectTitle', defaultMessage: 'Project Title'},
    'rotur-account': {id: 'mw.menuBar.roturAccount', defaultMessage: 'Bilup Accounts Profile'},
    'collab-presence': {id: 'mw.menuBar.collabPresence', defaultMessage: 'Collaboration Presence'}
};

const ALIGN_OPTIONS = [
    {
        id: 'left',
        icon: AlignLeft,
        label: (
            <FormattedMessage
                defaultMessage="Left aligned"
                description="Menu bar alignment option"
                id="mw.settings.menuBar.alignLeft"
            />
        )
    },
    {
        id: 'center',
        icon: AlignCenter,
        label: (
            <FormattedMessage
                defaultMessage="Middle aligned"
                description="Menu bar alignment option"
                id="mw.settings.menuBar.alignMiddle"
            />
        )
    }
];
const isVisibleItem = id => !id.startsWith('__');

class UnwrappedMenuBarLayoutSetting extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleDragEnd', 'handleDragOver', 'handleAlignChange', 'handleMove', 'persistAppearance']);
        const present = getPresentOrderedIds();
        this.state = {
            present,
            orders: this.readOrders(present),
            hidden: getHidden(),
            dragId: null,
            dragZone: null
        };
    }
    componentDidMount () {
        this.disposeSettingsListener = onSettingsChanged(() => {
            requestAnimationFrame(() => {
                const present = getPresentOrderedIds();
                this.setState({
                    present,
                    orders: this.readOrders(present),
                    hidden: getHidden()
                });
            });
        });
    }
    componentWillUnmount () {
        if (this.disposeSettingsListener) this.disposeSettingsListener();
    }
    readOrders (present) {
        const orders = {};
        for (const zone of ZONES) {
            orders[zone.id] = getZoneDisplayOrder(zone.id, present);
        }
        return orders;
    }
    persistAppearance () {
        if (!this.props.theme) return;
        this.props.onChangeTheme(this.props.theme.setAppearance({menuBarLayout: getMenuBarLayout()}));
    }
    handleToggle (id) {
        return e => {
            setHidden(id, !e.target.checked);
            this.setState({hidden: getHidden()}, this.persistAppearance);
        };
    }
    handleDragStart (zoneId, id) {
        return e => {
            try {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
            } catch (err) {
                // ignore
            }
            this.setState({dragId: id, dragZone: zoneId});
        };
    }
    handleDragEnd () {
        this.setState({dragId: null, dragZone: null});
    }
    handleDragOver (e) {
        e.preventDefault();
    }
    handleDrop (zoneId, overId) {
        return e => {
            e.preventDefault();
            const {dragId, dragZone} = this.state;
            if (!dragId || dragZone !== zoneId || dragId === overId) return;
            const order = this.state.orders[zoneId].slice();
            const from = order.indexOf(dragId);
            const to = order.indexOf(overId);
            if (from === -1 || to === -1) return;
            order.splice(from, 1);
            order.splice(to, 0, dragId);
            setZoneOrder(zoneId, order);
            this.setState(prev => ({
                orders: {...prev.orders, [zoneId]: order},
                dragId: null,
                dragZone: null
            }), this.persistAppearance);
        };
    }
    handleAlignChange (id) {
        return () => {
            if (!this.props.theme || this.props.theme.menuBarAlign === id) return;
            this.props.onChangeTheme(this.props.theme.set('menuBarAlign', id));
        };
    }
    handleMove (zoneId, id, direction) {
        return () => {
            const order = moveMenuItem(this.state.orders[zoneId], id, direction);
            setZoneOrder(zoneId, order);
            this.setState(prev => ({orders: {...prev.orders, [zoneId]: order}}), this.persistAppearance);
        };
    }
    renderRow (zoneId, id, draggable) {
        const {intl} = this.props;
        const visible = !this.state.hidden.includes(id);
        const labelDescriptor = LABELS[id];
        const label = labelDescriptor ? intl.formatMessage(labelDescriptor) : id;
        const canHide = !ALWAYS_SHOW.includes(id);
        const order = draggable ? (this.state.orders[zoneId] || []) : [];
        const index = order.indexOf(id);
        return (
            <div
                key={id}
                className={styles.menuBarRow}
                onDragOver={draggable ? this.handleDragOver : null}
                onDrop={draggable ? this.handleDrop(zoneId, id) : null}
            >
                {draggable && (
                    <span
                        className={styles.menuBarGrip}
                        draggable
                        onDragEnd={this.handleDragEnd}
                        onDragStart={this.handleDragStart(zoneId, id)}
                    >
                        <GripVertical size={16} />
                    </span>
                )}
                <span className={styles.menuBarRowLabel}>{label}</span>
                {draggable && (
                    <span className={styles.menuBarMoveButtons}>
                        <button
                            aria-label={intl.formatMessage(messages.moveUp, {item: label})}
                            className={styles.menuBarMoveButton}
                            disabled={index <= 0}
                            type="button"
                            onClick={this.handleMove(zoneId, id, -1)}
                        >
                            <ChevronUp size={16} />
                        </button>
                        <button
                            aria-label={intl.formatMessage(messages.moveDown, {item: label})}
                            className={styles.menuBarMoveButton}
                            disabled={index < 0 || index >= order.length - 1}
                            type="button"
                            onClick={this.handleMove(zoneId, id, 1)}
                        >
                            <ChevronDown size={16} />
                        </button>
                    </span>
                )}
                <FancyCheckbox
                    className={styles.checkbox}
                    checked={canHide ? visible : true}
                    disabled={!canHide}
                    onChange={canHide ? this.handleToggle(id) : null}
                />
            </div>
        );
    }
    renderZone (zoneId) {
        const ids = (this.state.orders[zoneId] || []).filter(isVisibleItem);
        const extras = getZoneExtras(zoneId, this.state.present).filter(isVisibleItem);
        return (
            <React.Fragment key={zoneId}>
                {ids.map(id => this.renderRow(zoneId, id, true))}
                {extras.map(id => this.renderRow(null, id, false))}
            </React.Fragment>
        );
    }
    sectionRowCount (section) {
        return section.zones.reduce((count, zoneId) => (
            count +
            (this.state.orders[zoneId] || []).filter(isVisibleItem).length +
            getZoneExtras(zoneId, this.state.present).filter(isVisibleItem).length
        ), 0);
    }
    render () {
        const {intl} = this.props;
        const currentAlign = (this.props.theme && this.props.theme.menuBarAlign) || 'center';
        return (
            <div className={styles.menuBarLayout}>
                <div className={styles.menuBarZoneLabel}>
                    <FormattedMessage
                        defaultMessage="Alignment"
                        description="Label for menu bar alignment selector in settings"
                        id="mw.settings.menuBar.alignment"
                    />
                </div>
                <div
                    className={styles.alignSelector}
                    role="radiogroup"
                    aria-label={intl.formatMessage({
                        id: 'mw.settings.menuBar.alignment',
                        defaultMessage: 'Menu bar alignment'
                    })}
                >
                    {ALIGN_OPTIONS.map(option => {
                        const Icon = option.icon;
                        const selected = currentAlign === option.id;
                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={classNames(styles.alignOption, {
                                    [styles.alignOptionSelected]: selected
                                })}
                                onClick={this.handleAlignChange(option.id)}
                            >
                                <Icon size={18} />
                                <span>{option.label}</span>
                            </button>
                        );
                    })}
                </div>

                <div className={styles.menuBarHint}>
                    <FormattedMessage
                        defaultMessage="Drag to reorder items within each group. Uncheck to hide."
                        id="mw.settingsModal.menuBarHint"
                    />
                </div>
                {[
                    {id: 'mw.settingsModal.leftMenus', defaultMessage: 'Left Menus', zones: ['left']},
                    {id: 'mw.settingsModal.topRightButtons', defaultMessage: 'Top Right Buttons', zones: ['right']}
                ].map(section => {
                    if (this.sectionRowCount(section) === 0) return null;
                    return (
                        <div key={section.id}>
                            <div className={styles.menuBarZoneLabel}>
                                {intl.formatMessage({id: section.id, defaultMessage: section.defaultMessage})}
                            </div>
                            {section.zones.map(zoneId => this.renderZone(zoneId))}
                        </div>
                    );
                })}
            </div>
        );
    }
}

UnwrappedMenuBarLayoutSetting.propTypes = {
    intl: intlShape.isRequired,
    theme: PropTypes.instanceOf(Theme),
    onChangeTheme: PropTypes.func
};

const mapStateToProps = state => ({
    theme: state.scratchGui.theme.theme
});

const mapDispatchToProps = dispatch => ({
    onChangeTheme: theme => {
        dispatch(setTheme(theme));
        applyTheme(theme);
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(injectIntl(UnwrappedMenuBarLayoutSetting));
