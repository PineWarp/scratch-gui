/**
 * 可视化节点编辑器 · 画布（UE 蓝图风格）
 * 平移、Ctrl+滚轮缩放、节点拖动、端口拖拽连线、点选节点/连线、双击子图节点。
 * 样式经 CSS Modules（styles.xxx）；分类色标题栏 + 类型着色端口。
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {getType} from '../../lib/visual-node-engine/node-types.js';
import styles from './visual-editor-modal.css';

// 分类标题栏颜色（UE 蓝图式分类色带）
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

// 数据端口类型 → 颜色（近似 UE：exec 灰白、number 绿、string 品红、bool 红、any 青）
const PORT_TYPE_COLORS = {
    number: '#7ce87c',
    string: '#ff7ce8',
    bool: '#ff6b6b',
    any: '#56c8f0'
};

const portTypeOf = (def, portName, isInput) => {
    const list = isInput ? (def.inputs || []) : (def.outputs || []);
    const port = list.find(p => p.name === portName);
    if (!port) return 'any';
    if (port.kind === 'exec') return 'exec';
    // 从 params 定义猜类型
    const paramDef = (def.params || []).find(p => p.name === portName);
    if (paramDef) {
        if (paramDef.type === 'number') return 'number';
        if (paramDef.type === 'bool') return 'bool';
        if (paramDef.type === 'text' && portName !== 'condition') return 'string';
    }
    return 'any';
};

const portDotClass = type => {
    switch (type) {
    case 'exec': return styles.vePortDotExec;
    case 'number': return styles.vePortDotNumber;
    case 'string': return styles.vePortDotString;
    case 'bool': return styles.vePortDotBool;
    default: return styles.vePortDotAny;
    }
};

class NodeCanvas extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'toWorld',
            'portPos',
            'onWheel',
            'onCanvasMouseDown',
            'onMouseMove',
            'onMouseUp',
            'onNodeTitleMouseDown',
            'onPortMouseDown',
            'onPortMouseUp',
            'onEdgeClick',
            'onNodeMouseDown',
            'onNodeDoubleClick'
        ]);
        this.wrapRef = React.createRef();
        this.state = {
            pan: {x: 60, y: 40},
            zoom: 1,
            dragNode: null,
            panning: false,
            panStart: null,
            linkFrom: null,
            mouseWorld: null
        };
    }

    toWorld (clientX, clientY) {
        const rect = this.wrapRef.current.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this.state.pan.x) / this.state.zoom,
            y: (clientY - rect.top - this.state.pan.y) / this.state.zoom
        };
    }

    portPos (node, portName, isInput, def) {
        const inputs = (def.inputs || []);
        const outputs = (def.outputs || []);
        const inIdx = inputs.findIndex(p => p.name === portName);
        const outIdx = outputs.findIndex(p => p.name === portName);
        if (isInput && inIdx === -1) return null;
        if (!isInput && outIdx === -1) return null;
        const row = isInput ? inIdx : outIdx;
        return {
            x: node.x + (isInput ? 0 : node.width || 200),
            y: node.y + 31 + 4 + row * 20 + 9
        };
    }

    onWheel (e) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            this.setState(s => ({zoom: Math.min(2.5, Math.max(0.3, s.zoom * factor))}));
        } else {
            this.setState(s => ({pan: {x: s.pan.x - e.deltaX, y: s.pan.y - e.deltaY}}));
        }
    }

    onCanvasMouseDown (e) {
        if (e.target === e.currentTarget || e.target.classList.contains(styles.veViewport)) {
            this.setState({panning: true, panStart: {x: e.clientX, y: e.clientY, base: this.state.pan}});
        }
    }

    onMouseMove (e) {
        if (this.state.panning && this.state.panStart) {
            this.setState({
                pan: {
                    x: this.state.panStart.base.x + (e.clientX - this.state.panStart.x),
                    y: this.state.panStart.base.y + (e.clientY - this.state.panStart.y)
                }
            });
            return;
        }
        if (this.state.dragNode) {
            const world = this.toWorld(e.clientX, e.clientY);
            this.props.onMoveNode(this.state.dragNode.id,
                world.x - this.state.dragNode.dx, world.y - this.state.dragNode.dy);
            return;
        }
        if (this.state.linkFrom) {
            this.setState({mouseWorld: this.toWorld(e.clientX, e.clientY)});
        }
    }

    onMouseUp () {
        if (this.state.panning) this.setState({panning: false, panStart: null});
        if (this.state.dragNode) this.setState({dragNode: null});
        if (this.state.linkFrom) this.setState({linkFrom: null, mouseWorld: null});
    }

    onNodeTitleMouseDown (e, node) {
        e.stopPropagation();
        const world = this.toWorld(e.clientX, e.clientY);
        this.props.onSelectNode(node.id);
        this.setState({dragNode: {id: node.id, dx: world.x - node.x, dy: world.y - node.y}});
    }

    onPortMouseDown (e, node, portName, isInput, def) {
        e.stopPropagation();
        const pos = this.portPos(node, portName, isInput, def);
        this.props.onSelectNode(node.id);
        const w = this.toWorld(e.clientX, e.clientY);
        this.setState({linkFrom: {nodeId: node.id, port: portName, isInput, x: pos.x, y: pos.y}, mouseWorld: w});
    }

    onPortMouseUp (e, node, portName, isInput) {
        e.stopPropagation();
        const link = this.state.linkFrom;
        if (!link) return;
        let fromNode = link.nodeId;
        let fromPort = link.port;
        let toNode = node.id;
        let toPort = portName;
        if (link.isInput && !isInput) {
            fromNode = node.id;
            fromPort = portName;
            toNode = link.nodeId;
            toPort = link.port;
        } else if (link.isInput === isInput) {
            this.setState({linkFrom: null, mouseWorld: null});
            return;
        }
        this.props.onConnect(fromNode, fromPort, toNode, toPort);
        this.setState({linkFrom: null, mouseWorld: null});
    }

    onEdgeClick (e, edge) {
        e.stopPropagation();
        this.props.onRemoveEdge(edge);
    }

    onNodeMouseDown (e, node) {
        e.stopPropagation();
        this.props.onSelectNode(node.id);
    }

    onNodeDoubleClick (e, node) {
        e.stopPropagation();
        this.props.onOpenSubGraph(node.id);
    }

    renderPortDot (node, def, port, isInput) {
        const type = portTypeOf(def, port.name, isInput);
        const isExec = type === 'exec';
        const dotClass = `${styles.vePortDot} ${portDotClass(type)}`;
        const inlineStyle = (!isExec && type !== 'any') ?
            {borderColor: PORT_TYPE_COLORS[type]} : null;
        const key = `${node.id}:${isInput ? 'i' : 'o'}:${port.name}`;
        return (
            <div
                className={`${styles.vePortRow} ${isInput ? '' : styles.vePortRowOutput}`}
                key={key}
            >
                {isInput && (
                    <div
                        className={dotClass}
                        style={inlineStyle}
                        title={`${port.label || port.name}（${type}）`}
                        onMouseDown={e => this.onPortMouseDown(e, node, port.name, true, def)}
                        onMouseUp={e => this.onPortMouseUp(e, node, port.name, true)}
                    />
                )}
                <span className={styles.vePortLabel}>{port.label || port.name}</span>
                {!isInput && (
                    <div
                        className={dotClass}
                        style={inlineStyle}
                        title={`${port.label || port.name}（${type}）`}
                        onMouseDown={e => this.onPortMouseDown(e, node, port.name, false, def)}
                        onMouseUp={e => this.onPortMouseUp(e, node, port.name, false)}
                    />
                )}
            </div>
        );
    }

    render () {
        const {graph, selectedNodeId} = this.props;
        const {pan, zoom, linkFrom, mouseWorld} = this.state;
        const nodes = graph.nodes.map(n => {
            const def = getType(n.type);
            const width = def && (def.isExtensionBlock || def.isFunction) ? 230 : 200;
            return {...n, width, __def: def};
        });

        const edgePaths = graph.edges.map((edge, i) => {
            const fromNode = nodes.find(n => n.id === edge.from.node);
            const toNode = nodes.find(n => n.id === edge.to.node);
            if (!fromNode || !toNode) return null;
            const fromDef = fromNode.__def;
            const toDef = toNode.__def;
            if (!fromDef || !toDef) return null;
            const fromPortDef = (fromDef.outputs || []).find(p => p.name === edge.from.port);
            const toPortDef = (toDef.inputs || []).find(p => p.name === edge.to.port);
            if (!fromPortDef || !toPortDef) return null;
            const a = this.portPos(fromNode, edge.from.port, false, fromDef);
            const b = this.portPos(toNode, edge.to.port, true, toDef);
            if (!a || !b) return null;
            const isExec = fromPortDef.kind === 'exec';
            const type = portTypeOf(fromDef, edge.from.port, false);
            const color = isExec ? '#cfd9e8' : (PORT_TYPE_COLORS[type] || '#56c8f0');
            let path;
            if (isExec) {
                // UE exec：直角折线
                const midX = a.x + Math.max(24, Math.abs(b.x - a.x) / 2);
                path = `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`;
            } else {
                const dx = Math.max(30, Math.abs(b.x - a.x) / 2);
                path = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
            }
            return (
                <path
                    key={`e${i}`}
                    className={styles.veEdgePath}
                    style={{stroke: color, strokeWidth: isExec ? 3 : 2.5}}
                    d={path}
                    onClick={e => this.onEdgeClick(e, edge)}
                />
            );
        });

        let ghost = null;
        if (linkFrom && mouseWorld) {
            const a = linkFrom.isInput ? mouseWorld : {x: linkFrom.x, y: linkFrom.y};
            const b = linkFrom.isInput ? {x: linkFrom.x, y: linkFrom.y} : mouseWorld;
            const dx = Math.max(30, Math.abs(b.x - a.x) / 2);
            ghost = (`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`);
        }

        return (
            <div
                className={`${styles.veCanvasWrap} ${this.state.panning ? styles.veCanvasWrapPanning : ''}`}
                ref={this.wrapRef}
                onWheel={this.onWheel}
                onMouseDown={this.onCanvasMouseDown}
                onMouseMove={this.onMouseMove}
                onMouseUp={this.onMouseUp}
                onMouseLeave={this.onMouseUp}
            >
                <div
                    className={styles.veViewport}
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
                    }}
                >
                    <svg className={styles.veEdgeSvg}>
                        {edgePaths}
                        {ghost ? <path className={styles.veEdgeGhost} d={ghost} /> : null}
                    </svg>
                    {nodes.length === 0 && (
                        <div className={styles.veEmptyNote}>
                            从左侧面板点击/拖入节点开始搭建…
                        </div>
                    )}
                    {nodes.map(node => {
                        const def = node.__def;
                        if (!def) return null;
                        const titleColor = CATEGORY_COLORS[def.category] || '#3c4a6b';
                        return (
                            <div
                                key={node.id}
                                className={`${styles.veNode} ${selectedNodeId === node.id ? styles.veNodeSelected : ''}`}
                                style={{left: node.x, top: node.y, width: node.width}}
                                onMouseDown={e => this.onNodeMouseDown(e, node)}
                                onDoubleClick={e => this.onNodeDoubleClick(e, node)}
                                onContextMenu={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    this.props.onRemoveNode(node.id);
                                }}
                            >
                                <div
                                    className={styles.veNodeTitle}
                                    style={{background: `linear-gradient(180deg, ${titleColor}, ${titleColor}cc)`}}
                                    onMouseDown={e => this.onNodeTitleMouseDown(e, node)}
                                >
                                    <span>{def.title}</span>
                                    <span className={styles.veNodeId}>{node.id}</span>
                                </div>
                                <div className={styles.veNodeBody}>
                                    {(def.inputs || []).map(p => this.renderPortDot(node, def, p, true))}
                                    {(def.outputs || []).map(p => this.renderPortDot(node, def, p, false))}
                                    {(def.params || []).some(p => p.type === 'graph') && (
                                        <div className={styles.veSubGraphHint}>双击节点进入子图</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className={styles.veCanvasHint}>
                    拖空白平移 · Ctrl+滚轮缩放 · 拖端口连线 · 点连线删除 · 右键节点删除 · 双击进子图
                </div>
            </div>
        );
    }
}

NodeCanvas.propTypes = {
    graph: PropTypes.object.isRequired,
    selectedNodeId: PropTypes.string,
    onMoveNode: PropTypes.func,
    onSelectNode: PropTypes.func,
    onConnect: PropTypes.func,
    onRemoveEdge: PropTypes.func,
    onRemoveNode: PropTypes.func,
    onOpenSubGraph: PropTypes.func
};

export default NodeCanvas;
