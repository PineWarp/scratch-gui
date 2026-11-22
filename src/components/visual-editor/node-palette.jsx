/**
 * 可视化节点编辑器 · 节点面板（左侧）
 * 分类分组 + 搜索；点击添加到画布。子图内额外显示「积木参数值」节点。
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {NODE_TYPES, CATEGORIES} from '../../lib/visual-node-engine/node-types.js';
import styles from './visual-editor-modal.css';

// 分类色条（与画布标题栏一致）
const CATEGORY_COLORS = {
    '事件': '#2e5f9e',
    '流程控制': '#2e7d54',
    '变量': '#6d54a0',
    '运算': '#a2701f',
    '函数': '#4a5cc0',
    'Scratch 交互': '#d99e2b',
    'DOM/UI': '#b85c4e',
    '网络/存储': '#3a8e68',
    '扩展积木': '#8e44ad',
    '插件 API': '#16867a'
};

class NodePalette extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleSearch', 'addItem']);
        this.state = {search: ''};
    }

    handleSearch (e) {
        this.setState({search: e.target.value});
    }

    addItem (typeId) {
        this.props.onAddNode(typeId);
    }

    render () {
        const {search} = this.state;
        const {mode, inSubGraph} = this.props;
        const q2 = search.trim().toLowerCase();
        const visible = NODE_TYPES.filter(t => {
            if (t.addonOnly && mode !== 'addon') return false;
            if (t.onlyInBlockBody && !inSubGraph) return false;
            if (t.isExtensionBlock && mode !== 'extension') return false;
            if (q2) {
                return t.title.toLowerCase().includes(q2) ||
                    t.id.toLowerCase().includes(q2) ||
                    t.category.toLowerCase().includes(q2);
            }
            return true;
        });

        return (
            <div className={styles.vePalette}>
                <div className={styles.vePaletteSearch}>
                    <input
                        className={styles.vePaletteSearchInput}
                        placeholder="搜索节点…"
                        value={search}
                        onChange={this.handleSearch}
                    />
                </div>
                <div className={styles.vePaletteList}>
                    {CATEGORIES.map(cat => {
                        const items = visible.filter(t => t.category === cat);
                        if (!items.length) return null;
                        return (
                            <div key={cat}>
                                <div className={styles.vePaletteCat}>{cat}</div>
                                {items.map(t => (
                                    <button
                                        key={t.id}
                                        className={styles.vePaletteItem}
                                        style={{borderLeftColor: CATEGORY_COLORS[t.category] || '#3d5a8c'}}
                                        title={t.id}
                                        onClick={() => this.addItem(t.id)}
                                    >
                                        {t.title}
                                    </button>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
}

NodePalette.propTypes = {
    mode: PropTypes.oneOf(['extension', 'addon']),
    inSubGraph: PropTypes.bool,
    onAddNode: PropTypes.func
};

export default NodePalette;
