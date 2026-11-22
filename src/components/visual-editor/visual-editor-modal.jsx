/**
 * 可视化编辑器主组件（扩展 / 插件）
 * - 左：节点面板；中：节点画布；右：属性面板；底：JS 代码面板（双向转换）
 * - 子图栈：双击函数/积木/定时器节点进入其 bodyGraph；面包屑返回
 * - 导出：下载 js / 导入作品（扩展=dataURL+loadExtensionURL；插件=customPlugins.add）
 */
import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import styles from './visual-editor-modal.css';
import NodeCanvas from './node-canvas.jsx';
import NodePalette from './node-palette.jsx';
import NodeInspector from './node-inspector.jsx';
import {
    createNode, addNode, removeNode, moveNode, connect, disconnect, getNode
} from '../../lib/visual-node-engine/graph-model.js';
import {getType} from '../../lib/visual-node-engine/node-types.js';
import {compile} from '../../lib/visual-node-engine/compile.js';
import {parse} from '../../lib/visual-node-engine/parse.js';
import {
    extensionStarterGraph, addonStarterGraph, defaultMeta, extensionDemoGraph
} from '../../lib/visual-node-engine/templates.js';

const subGraphParams = ['bodyGraph'];

class VisualEditorModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAddNode',
            'handleMoveNode',
            'handleSelectNode',
            'handleConnect',
            'handleRemoveEdge',
            'handleRemoveNode',
            'handleParamChange',
            'handleOpenSubGraph',
            'handleBreadcrumb',
            'handleMetaChange',
            'handleGenerateCode',
            'handleApplyCode',
            'handleImportCode',
            'handleDownload',
            'handleImportToProject',
            'handleLoadDemo',
            'handleClear',
            'handleUndo',
            'handleClose',
            'snapshot'
        ]);
        const mode = props.mode || 'extension';
        this.state = {
            mode,
            meta: defaultMeta(mode),
            graphStack: [{
                graph: mode === 'addon' ? addonStarterGraph() : extensionStarterGraph(mode),
                title: '主图',
                ownerNodeId: null
            }],
            selectedNodeId: null,
            code: '',
            codeStatus: '',
            undoStack: []
        };
    }

    get currentFrame () {
        return this.state.graphStack[this.state.graphStack.length - 1];
    }

    get currentGraph () {
        return this.currentFrame.graph;
    }

    get selectedNode () {
        return getNode(this.currentGraph, this.state.selectedNodeId) || null;
    }

    // ---- 快照（undo） ----
    snapshot () {
        this.setState(s => ({
            undoStack: [...s.undoStack.slice(-29), JSON.stringify({
                graphStack: s.graphStack, meta: s.meta
            })]
        }));
    }

    mutateGraph (fn) {
        this.snapshot();
        this.setState(s => {
            const frames = s.graphStack.slice();
            const last = frames[frames.length - 1];
            frames[frames.length - 1] = {title: last.title, ownerNodeId: last.ownerNodeId, graph: fn(last.graph)};
            return {graphStack: frames};
        });
    }

    handleUndo () {
        if (!this.state.undoStack.length) return;
        const snap = JSON.parse(this.state.undoStack[this.state.undoStack.length - 1]);
        this.setState(s => ({
            graphStack: snap.graphStack,
            meta: snap.meta,
            undoStack: s.undoStack.slice(0, -1)
        }));
    }

    // ---- 节点操作 ----
    handleAddNode (typeId) {
        const g = this.currentGraph;
        let x = 360;
        let y = 120;
        for (let i = 0; i < 40; i++) {
            if (!g.nodes.some(n => Math.abs(n.x - x) < 30 && Math.abs(n.y - y) < 30)) break;
            y += 60;
            if (y > 800) { y = 120; x += 60; }
        }
        const def = getType(typeId);
        const node = createNode(typeId, x, y, def && def.params ?
            Object.fromEntries(def.params
                .filter(p => p.type !== 'graph')
                .map(p => [p.name, p.default])) : {});
        this.mutateGraph(graph => {
            addNode(graph, {...node});
            return graph;
        });
        this.setState({selectedNodeId: node.id});
    }

    handleMoveNode (id, x, y) {
        this.mutateGraph(graph => {
            moveNode(graph, id, x, y);
            return graph;
        });
    }

    handleSelectNode (id) {
        this.setState({selectedNodeId: id});
    }

    handleConnect (fromNode, fromPort, toNode, toPort) {
        this.mutateGraph(graph => {
            connect(graph, fromNode, fromPort, toNode, toPort);
            return graph;
        });
    }

    handleRemoveEdge (edge) {
        this.mutateGraph(graph => {
            disconnect(graph, edge);
            return graph;
        });
    }

    handleRemoveNode (id) {
        this.mutateGraph(graph => {
            removeNode(graph, id);
            return graph;
        });
        if (this.state.selectedNodeId === id) this.setState({selectedNodeId: null});
    }

    handleParamChange (id, name, value) {
        this.mutateGraph(graph => {
            const node = getNode(graph, id);
            if (node) {
                node.params = {...(node.params || {}), [name]: value};
            }
            return graph;
        });
    }

    // ---- 子图栈 ----
    handleOpenSubGraph (nodeId) {
        const node = getNode(this.currentGraph, nodeId);
        if (!node) return;
        const def = getType(node.type);
        const hasBody = (def.params || []).some(p => subGraphParams.includes(p.name));
        if (!hasBody) return;
        const body = node.params && node.params.bodyGraph;
        this.setState(s => ({
            graphStack: [...s.graphStack, {
                graph: (body && body.nodes) ? body : {nodes: [], edges: []},
                title: `子图 · ${def.title}`,
                ownerNodeId: nodeId
            }],
            selectedNodeId: null
        }));
    }

    handleBreadcrumb (index) {
        if (index === this.state.graphStack.length - 1) return;
        // 中途跳转时把当前帧写回 owner 节点
        this.setState(s => {
            const frames = s.graphStack.slice(0, index + 1);
            const closed = s.graphStack.slice(index + 1);
            // 把最内层写回
            let carry = null;
            for (const frame of closed) {
                if (frame.ownerNodeId && carry === null) {
                    carry = frame.graph;
                } else if (frame.ownerNodeId && carry !== null) {
                    carry = frame.graph; // 多层时逐层收拢（简化：直接取该层）
                }
            }
            if (carry !== null) {
                const target = frames[frames.length - 1];
                const node = target.graph.nodes.find(n => n.id === closed[0].ownerNodeId);
                if (node) {
                    node.params = {...(node.params || {}), bodyGraph: carry};
                }
            }
            return {graphStack: frames, selectedNodeId: null};
        });
    }

    // ---- meta ----
    handleMetaChange (name, value) {
        this.setState(s => ({meta: {...s.meta, [name]: value}}));
    }

    // ---- 代码 ⇄ 节点 ----
    handleGenerateCode () {
        const code = compile(this.currentGraph, this.state.mode, this.state.meta);
        this.setState({code, codeStatus: '已从节点图生成（含往返标记）'});
    }

    handleApplyCode () {
        const res = parse(this.state.code);
        if (!res.graph) {
            this.setState({codeStatus: '解析失败：无可用图'});
            return;
        }
        this.snapshot();
        this.setState({
            graphStack: [{graph: res.graph, title: '主图', ownerNodeId: null}],
            meta: {...this.state.meta, ...res.meta},
            selectedNodeId: null,
            codeStatus: res.partial ?
                '外部代码已导入为「任意 JS 语句」节点链（尽力解析）' :
                '已还原完整节点图（往返无损）'
        });
    }

    handleImportCode () {
        // textarea 上粘贴外部代码后调用
        this.handleApplyCode();
    }

    // ---- 下载 / 导入作品 ----
    handleDownload () {
        const code = this.state.code || compile(this.currentGraph, this.state.mode, this.state.meta);
        const name = (this.state.meta.name || 'visual').replace(/[\\/:*?"<>|]/g, '_');
        const blob = new Blob([code], {type: 'application/javascript'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${name}.js`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.setState({code, codeStatus: `已下载 ${name}.js`});
    }

    async handleImportToProject () {
        const code = this.state.code || compile(this.currentGraph, this.state.mode, this.state.meta);
        try {
            if (this.state.mode === 'extension') {
                const url = `data:application/javascript,${encodeURIComponent(code)}`;
                const sm = await import('../../containers/tw-security-manager.jsx');
                if (sm.markExtensionAsCustom) sm.markExtensionAsCustom(url);
                if (sm.manuallyTrustExtension) sm.manuallyTrustExtension(url);
                await this.props.vm.extensionManager.loadExtensionURL(url);
                this.setState({code, codeStatus: '✔ 已作为自定义扩展导入作品'});
            } else {
                const cp = (await import('../../addons/custom-plugins.js')).default;
                const meta = {
                    name: this.state.meta.name || '我的插件',
                    description: this.state.meta.description || '可视化插件编辑器生成',
                    settings: this.state.meta.settings || []
                };
                await cp.add(meta, code, true);
                this.setState({code, codeStatus: '✔ 已导入自定义插件（设置→插件 可管理，刷新后生效）'});
            }
        } catch (err) {
            this.setState({codeStatus: `导入失败：${String(err && err.message || err)}`});
        }
    }

    handleLoadDemo () {
        if (this.state.mode === 'extension') {
            this.snapshot();
            this.setState({
                graphStack: [{graph: extensionDemoGraph(), title: '主图', ownerNodeId: null}],
                meta: {name: '示例扩展', id: 'demoExtension', description: '带积木定义的示例'},
                selectedNodeId: null
            });
        } else {
            this.snapshot();
            this.setState({
                graphStack: [{graph: addonStarterGraph(), title: '主图', ownerNodeId: null}],
                meta: {name: '示例插件', description: '基础示例', enabledByDefault: false, settings: [], css: ''},
                selectedNodeId: null
            });
        }
    }

    handleClear () {
        this.snapshot();
        this.setState({
            graphStack: [{
                graph: {nodes: [], edges: []},
                title: '主图',
                ownerNodeId: null
            }],
            selectedNodeId: null
        });
    }

    handleClose () {
        this.props.onClose();
    }

    render () {
        const {mode, meta, code, codeStatus} = this.state;
        const graph = this.currentGraph;
        const selected = this.selectedNode;

        return (
            <div className={styles.veModal}>
                <div className={styles.veTopbar}>
                    <span className={styles.veTitle}>
                        {mode === 'addon' ? '可视化插件编辑器' : '可视化扩展编辑器'}
                    </span>
                    <span className={styles.veModeBadge}>
                        {mode === 'addon' ? '插件 (addon)' : '扩展 (extension)'}
                    </span>
                    <div className={styles.veBreadcrumb}>
                        {this.state.graphStack.map((frame, i) => (
                            <span
                                key={i}
                                className={`${styles.veCrumb} ${i === this.state.graphStack.length - 1 ? styles.veCrumbCurrent : ''}`}
                                onClick={() => this.handleBreadcrumb(i)}
                            >
                                {i > 0 ? '› ' : ''}{frame.title}
                            </span>
                        ))}
                    </div>
                    <div className={styles.veToolbar}>
                        <button className={`${styles.veBtn} ${styles.veBtnSecondary}`} onClick={this.handleUndo}>
                            撤销
                        </button>
                        <button className={`${styles.veBtn} ${styles.veBtnSecondary}`} onClick={this.handleLoadDemo}>
                            载入示例
                        </button>
                        <button className={`${styles.veBtn} ${styles.veBtnSecondary}`} onClick={this.handleClear}>
                            清空
                        </button>
                        <button className={styles.veBtn} onClick={this.handleGenerateCode}>
                            节点图 → 代码
                        </button>
                        <button className={styles.veBtn} onClick={this.handleApplyCode}>
                            代码 → 节点图
                        </button>
                        <button className={`${styles.veBtn} ${styles.veBtnSuccess}`} onClick={this.handleDownload}>
                            下载 .js
                        </button>
                        <button className={`${styles.veBtn} ${styles.veBtnSuccess}`} onClick={this.handleImportToProject}>
                            {mode === 'addon' ? '导入为插件' : '导入到作品'}
                        </button>
                        <button className={`${styles.veBtn} ${styles.veBtnDanger}`} onClick={this.handleClose}>
                            关闭
                        </button>
                    </div>
                </div>

                <div className={styles.veBody}>
                    <NodePalette
                        mode={mode}
                        inSubGraph={this.state.graphStack.length > 1}
                        onAddNode={this.handleAddNode}
                    />
                    <NodeCanvas
                        graph={graph}
                        selectedNodeId={this.state.selectedNodeId}
                        onMoveNode={this.handleMoveNode}
                        onSelectNode={this.handleSelectNode}
                        onConnect={this.handleConnect}
                        onRemoveEdge={this.handleRemoveEdge}
                        onRemoveNode={this.handleRemoveNode}
                        onOpenSubGraph={this.handleOpenSubGraph}
                    />
                    <NodeInspector
                        node={selected}
                        mode={mode}
                        meta={meta}
                        onMetaChange={this.handleMetaChange}
                        onParamChange={this.handleParamChange}
                        onRemoveNode={this.handleRemoveNode}
                        onOpenSubGraph={() => selected && this.handleOpenSubGraph(selected.id)}
                    />
                </div>

                <div className={styles.veCodePane}>
                    <div className={styles.veCodeBar}>
                        <strong>JS 代码</strong>
                        <span className={styles.veCodeNote}>
                            （双向转换：编译产物头部含节点图存档，粘贴回读无损还原）
                        </span>
                        <span className={styles.veCodeStatus}>{codeStatus}</span>
                    </div>
                    <textarea
                        className={styles.veCodeInput}
                        value={code}
                        placeholder={'点「节点图 → 代码」生成；或把任意 JS 粘贴到这里后点「代码 → 节点图」导入'}
                        onChange={e => this.setState({code: e.target.value, codeStatus: '已编辑（未应用）'})}
                        spellCheck={false}
                    />
                </div>
            </div>
        );
    }
}

VisualEditorModal.propTypes = {
    mode: PropTypes.oneOf(['extension', 'addon']),
    vm: PropTypes.shape({
        extensionManager: PropTypes.shape({
            loadExtensionURL: PropTypes.func
        })
    }),
    onClose: PropTypes.func
};

export default VisualEditorModal;
