/**
 * 可视化节点编辑器 · 节点面板（左侧）
 * 分类分组 + 搜索；点击添加到画布中心附近。
 */
import React from 'react';
import PropTypes from 'prop-types';
import {NODE_TYPES, CATEGORIES} from '../../lib/visual-node-engine/node-types.js';

class NodePalette extends React.Component {
    constructor (props) {
        super(props);
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
        const {mode} = this.props;
        const q2 = search.trim().toLowerCase();
        const visible = NODE_TYPES.filter(t => {
            if (t.addonOnly && mode !== 'addon') return false;
            if (t.onlyInBlockBody && !this.props.blockBodyContext) return false;
            if (t.isExtensionBlock && mode !== 'extension') return false;
            if (q2) {
                return t.title.toLowerCase().includes(q2) ||
                    t.id.toLowerCase().includes(q2) ||
                    t.category.toLowerCase().includes(q2);
            }
            return true;
        });

        return (
            <div className="ve-palette">
                <div className="ve-palette-search">
                    <input
                        placeholder="搜索节点…"
                        value={search}
                        onChange={e => this.handleSearch(e)}
                    />
                </div>
                <div className="ve-palette-list">
                    {CATEGORIES.map(cat => {
                        const items = visible.filter(t => t.category === cat);
                        if (!items.length) return null;
                        return (
                            <div key={cat}>
                                <div className="ve-palette-cat">{cat}</div>
                                {items.map(t => (
                                    <button
                                        key={t.id}
                                        className="ve-palette-item"
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
    blockBodyContext: PropTypes.bool,
    onAddNode: PropTypes.func
};

export default NodePalette;
