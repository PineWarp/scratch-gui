/**
 * 可视化节点编辑器 · 画布
 * 平移（按住空白拖动 / 鼠标中键）、缩放（ctrl+滚轮）、节点拖动、
 * 端口拖拽连线、点选节点/连线、双击子图节点。
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {getType} from '../../lib/visual-node-engine/node-types.js';

const PORT_COLORS_CLASS = kind => (kind === 'exec' ? 'exec' : 'expr');

// 节点配色 class
const nodeClass = typeDef => {
    if (typeDef.isEvent) return 've-node-event';
    if (typeDef.isExpression) return 've-node-expr';
    if (typeDef.isFunction) return 've-node-func';
    if (typeDef.isExtensionBlock) return 've-node-block';
    if (typeDef.addonOnly) return 've-node-addon';
    return 've-node-flow';
};

// 端口几何：行高 19px，节点标题 29px，顶部 padding 4px
const PORT_H = 19;
const TITLE_H = 29;

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
            dragNode: null,        // {id, dx, dy}
            panning: false,
            panStart: null,
            linkFrom: null,        // {nodeId, port, isInput, x, y}（世界坐标）
            mouseWorld: null
        };
    }

    // ---- 世界坐标换算 ----
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
            y: node.y + TITLE_H + 4 + row * PORT_H + 8
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

    // ---- 画布空白：pan ----
    onCanvasMouseDown (e) {
        if (e.target === e.currentTarget || e.target.classList.contains('ve-canvas-wrap')) {
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
        if (this.state.linkFrom) {
            this.setState({linkFrom: null, mouseWorld: null});
        }
    }

    // ---- 节点拖动 ----
    onNodeTitleMouseDown (e, node) {
        e.stopPropagation();
        const world = this.toWorld(e.clientX, e.clientY);
        this.props.onSelectNode(node.id);
        this.setState({dragNode: {id: node.id, dx: world.x - node.x, dy: world.y - node.y}});
    }

    // ---- 端口拖拽连线 ----
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
        // 方向归一：输出 → 输入
        let fromNode = link.nodeId;
        let fromPort = link.port;
        let toNode = node.id;
        let toPort = portName;
        if (link.isInput && !isInput) {
            // 从输入端口拖到输出端口：反向
            fromNode = node.id;
            fromPort = portName;
            toNode = link.nodeId;
            toPort = link.port;
        } else if (link.isInput === isInput) {
            // 同向端口：无效
            this.setState({linkFrom: null, mouseWorld: null});
            return;
        }
        this.props.onConnect(fromNode, fromPort, toNode, toPort);
        this.setState({linkFrom: null, mouseWorld: null});
    }

    // ---- 连线点击删除 ----
    onEdgeClick (e, edge) {
        e.stopPropagation();
        this.props.onRemoveEdge(edge);
    }

    // ---- 节点点击（选中） ----
    onNodeMouseDown (e, node) {
        e.stopPropagation();
        this.props.onSelectNode(node.id);
    }

    onNodeDoubleClick (e, node) {
        e.stopPropagation();
        this.props.onOpenSubGraph(node.id);
    }

    renderPortDot (node, def, port, isInput) {
        const key = `${node.id}:${isInput ? 'i' : 'o'}:${port.name}`;
        return (
            <div
                className={`ve-port-row ${isInput ? '' : 'output'}`}
                key={key}
            >
                {isInput && (
                    <div
                        className={`ve-port-dot ${PORT_COLORS_CLASS(port.kind)}`}
                        title={port.label || port.name}
                        onMouseDown={e => this.onPortMouseDown(e, node, port.name, true, def)}
                        onMouseUp={e => this.onPortMouseUp(e, node, port.name, true)}
                    />
                )}
                <span>{port.label || port.name}</span>
                {!isInput && (
                    <div
                        className={`ve-port-dot ${PORT_COLORS_CLASS(port.kind)}`}
                        title={port.label || port.name}
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
            const dx = Math.max(30, Math.abs(b.x - a.x) / 2);
            const path = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
            const cls = `ve-edge-path ${fromPortDef.kind === 'exec' ? 'exec' : ''}`;
            return (
                <path
                    key={`e${i}`}
                    className={cls}
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
                className={`ve-canvas-wrap ${this.state.panning ? 'panning' : ''}`}
                ref={this.wrapRef}
                onWheel={this.onWheel}
                onMouseDown={this.onCanvasMouseDown}
                onMouseMove={this.onMouseMove}
                onMouseUp={this.onMouseUp}
                onMouseLeave={this.onMouseUp}
            >
                <div
                    className="ve-viewport"
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
                    }}
                >
                    <svg className="ve-edge-svg">
                        {edgePaths}
                        {ghost ? <path className="ve-ghost-path" d={ghost} /> : null}
                    </svg>
                    {nodes.length === 0 && (
                        <div className="ve-empty-note">
                            从左侧面板拖入节点开始搭建…
                        </div>
                    )}
                    {nodes.map(node => {
                        const def = node.__def;
                        if (!def) return null;
                        return (
                            <div
                                key={node.id}
                                className={`ve-node ${nodeClass(def)} ${selectedNodeId === node.id ? 've-node-selected' : ''}`}
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
                                    className="ve-node-title"
                                    onMouseDown={e => this.onNodeTitleMouseDown(e, node)}
                                >
                                    <span>{def.title}</span>
                                    <span className="ve-node-id">{def.category}</span>
                                </div>
                                <div className="ve-node-ports">
                                    {(def.inputs || []).map(p => this.renderPortDot(node, def, p, true))}
                                    {(def.outputs || []).map(p => this.renderPortDot(node, def, p, false))}
                                    {(def.params || []).some(p => p.type === 'graph') && (
                                        <div className="ve-port-row">
                                            <span style={{opacity: .6}}>双击编辑子图</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="ve-canvas-hint">
                    拖动空白平移 · Ctrl+滚轮缩放 · 拖端口连线 · 右键节点删除 · 双击进入子图
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
