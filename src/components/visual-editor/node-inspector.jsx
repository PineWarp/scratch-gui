/**
 * 可视化节点编辑器 · 属性面板（右侧）
 * 选中节点的参数编辑（text/number/bool/select/code/graph）。
 * graph 类型参数（子图）显示「双击节点进入编辑」提示 + 清空按钮。
 */
import React from 'react';
import PropTypes from 'prop-types';
import {getType} from '../../lib/visual-node-engine/node-types.js';

class NodeInspector extends React.Component {
    handleChange (name, value) {
        this.props.onParamChange(this.props.node.id, name, value);
    }

    renderParam (p, node) {
        const value = node.params ? node.params[p.name] : null;
        switch (p.type) {
        case 'bool':
            return (
                <div className="ve-param" key={p.name}>
                    <label>{p.label}</label>
                    <div className="ve-bool-row">
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
                <div className="ve-param" key={p.name}>
                    <label>{p.label}</label>
                    <input
                        type="number"
                        value={value === null || value === undefined ? p.default : value}
                        onChange={e => this.handleChange(p.name, Number(e.target.value))}
                    />
                </div>
            );
        case 'select':
            return (
                <div className="ve-param" key={p.name}>
                    <label>{p.label}</label>
                    <select
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
                <div className="ve-param" key={p.name}>
                    <label>{p.label}</label>
                    <textarea
                        value={value === null || value === undefined ? p.default : value}
                        onChange={e => this.handleChange(p.name, e.target.value)}
                        spellCheck={false}
                    />
                </div>
            );
        case 'graph':
            return (
                <div className="ve-param" key={p.name}>
                    <label>{p.label}</label>
                    <button
                        className="ve-btn ve-btn-secondary"
                        onClick={this.props.onOpenSubGraph}
                    >
                        双击节点进入子图编辑
                    </button>
                </div>
            );
        default:
            return (
                <div className="ve-param" key={p.name}>
                    <label>{p.label}</label>
                    <input
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
        const {node} = this.props;
        if (!node) {
            return (
                <div className="ve-inspector">
                    <h4>属性</h4>
                    <div className="ve-insp-hint">点击节点查看参数；meta 信息在最上方。</div>
                </div>
            );
        }
        const def = getType(node.type);
        if (!def) {
            return (
                <div className="ve-inspector">
                    <h4>未知节点</h4>
                    <div className="ve-insp-hint">类型 {node.type} 不存在（可能来自旧文件）。</div>
                </div>
            );
        }
        return (
            <div className="ve-inspector">
                <h4>{def.title}</h4>
                <div className="ve-insp-hint">
                    {def.category} · id {node.id}
                </div>
                {(def.params || []).map(p => this.renderParam(p, node))}
                <button
                    className="ve-btn ve-btn-danger"
                    onClick={() => this.props.onRemoveNode(node.id)}
                    style={{marginTop: 8}}
                >
                    删除节点
                </button>
            </div>
        );
    }
}

NodeInspector.propTypes = {
    node: PropTypes.object,
    onParamChange: PropTypes.func,
    onRemoveNode: PropTypes.func,
    onOpenSubGraph: PropTypes.func
};

export default NodeInspector;
