/**
 * 可视化节点编辑器 · 属性面板（右侧）
 * 选中节点的参数编辑（text/number/bool/select/code/graph）。
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {getType} from '../../lib/visual-node-engine/node-types.js';
import styles from './visual-editor-modal.css';

class NodeInspector extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleChange', 'renderParam', 'renderMeta']);
    }

    handleChange (name, value) {
        this.props.onParamChange(this.props.node.id, name, value);
    }

    renderMeta () {
        const {mode, meta, onMetaChange} = this.props;
        const metaFields = mode === 'addon' ? [
            ['name', '插件名称'],
            ['description', '插件描述']
        ] : [
            ['name', '扩展名称'],
            ['id', '扩展 ID'],
            ['description', '扩展描述']
        ];
        return (
            <div>
                <h4 className={styles.veInspectorTitle}>信息</h4>
                {metaFields.map(([k, label]) => (
                    <div className={styles.veParam} key={k}>
                        <label className={styles.veParamLabel}>{label}</label>
                        <input
                            className={styles.veParamInput}
                            type="text"
                            value={meta[k] || ''}
                            onChange={e => onMetaChange(k, e.target.value)}
                        />
                    </div>
                ))}
                <div className={styles.veInspHint} />
            </div>
        );
    }

    renderParam (p, node) {
        const value = node.params ? node.params[p.name] : null;
        switch (p.type) {
        case 'bool':
            return (
                <div className={styles.veParam} key={p.name}>
                    <label className={styles.veParamLabel}>{p.label}</label>
                    <div className={styles.veBoolRow}>
                        <input
                            type="checkbox"
                            checked={!!value}
                            onChange={e => this.handleChange(p.name, e.target.checked)}
                        />
                        <span>{value ? '开' : '关'}</span>
                    </div>
                </div>
            );
        case 'number':
            return (
                <div className={styles.veParam} key={p.name}>
                    <label className={styles.veParamLabel}>{p.label}</label>
                    <input
                        className={styles.veParamInput}
                        type="number"
                        value={value === null || value === undefined ? p.default : value}
                        onChange={e => this.handleChange(p.name, Number(e.target.value))}
                    />
                </div>
            );
        case 'select':
            return (
                <div className={styles.veParam} key={p.name}>
                    <label className={styles.veParamLabel}>{p.label}</label>
                    <select
                        className={styles.veParamSelect}
                        value={value === null || value === undefined ? p.default : value}
                        onChange={e => this.handleChange(p.name, e.target.value)}
                    >
                        {(p.options || []).map(o => (
                            <option key={String(o)} value={o}>{String(o)}</option>
                        ))}
                    </select>
                </div>
            );
        case 'code':
            return (
                <div className={styles.veParam} key={p.name}>
                    <label className={styles.veParamLabel}>{p.label}</label>
                    <textarea
                        className={styles.veParamTextarea}
                        value={value === null || value === undefined ? p.default : value}
                        onChange={e => this.handleChange(p.name, e.target.value)}
                        spellCheck={false}
                    />
                </div>
            );
        case 'graph':
            return (
                <div className={styles.veParam} key={p.name}>
                    <label className={styles.veParamLabel}>{p.label}</label>
                    <button
                        className={`${styles.veBtn} ${styles.veBtnSecondary}`}
                        onClick={this.props.onOpenSubGraph}
                    >
                        双击节点进入子图编辑
                    </button>
                </div>
            );
        default:
            return (
                <div className={styles.veParam} key={p.name}>
                    <label className={styles.veParamLabel}>{p.label}</label>
                    <input
                        className={styles.veParamInput}
                        type="text"
                        value={value === null || value === undefined ? p.default : value}
                        placeholder={p.placeholder}
                        onChange={e => this.handleChange(p.name, e.target.value)}
                    />
                </div>
            );
        }
    }

    render () {
        const {node, mode, meta} = this.props;
        return (
            <div className={styles.veInspector}>
                {this.renderMeta()}
                {!node ? (
                    <div>
                        <h4 className={styles.veInspectorTitle}>属性</h4>
                        <div className={styles.veInspHint}>点击节点查看参数</div>
                    </div>
                ) : (
                    (() => {
                        const def = getType(node.type);
                        if (!def) {
                            return (
                                <div>
                                    <h4 className={styles.veInspectorTitle}>未知节点</h4>
                                    <div className={styles.veInspHint}>类型 {node.type} 不存在</div>
                                </div>
                            );
                        }
                        return (
                            <div>
                                <h4 className={styles.veInspectorTitle}>{def.title}</h4>
                                <div className={styles.veInspHint}>
                                    {def.category} · 节点 id {node.id}
                                </div>
                                {(def.params || []).map(p => this.renderParam(p, node))}
                                <button
                                    className={`${styles.veBtn} ${styles.veBtnDanger} ${styles.veDeleteBtn}`}
                                    onClick={() => this.props.onRemoveNode(node.id)}
                                >
                                    删除节点
                                </button>
                            </div>
                        );
                    })()
                )}
                </div>
        );
    }
}

NodeInspector.propTypes = {
    node: PropTypes.object,
    mode: PropTypes.oneOf(['extension', 'addon']),
    meta: PropTypes.object,
    onMetaChange: PropTypes.func,
    onParamChange: PropTypes.func,
    onRemoveNode: PropTypes.func,
    onOpenSubGraph: PropTypes.func
};

export default NodeInspector;
