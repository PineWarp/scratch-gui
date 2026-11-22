/**
 * 可视化节点编辑器 · 数据模型（graph model）
 * 节点图：nodes + edges；端口分 exec（控制流）/ data（数据流）。
 * 连线规则：exec→exec（一进多出按序号）、data→data；data 端口无连线时取 params 字面量。
 */

let nextId = 1;
const genId = () => `n${(nextId++).toString(36)}${Date.now().toString(36).slice(-4)}`;

const createGraph = () => ({
    nodes: [],
    edges: []
});

const createNode = (typeId, x, y, params) => ({
    id: genId(),
    type: typeId,
    x: Math.round(x),
    y: Math.round(y),
    params: params || null
});

const addNode = (graph, node) => {
    graph.nodes.push(node);
    return node;
};

const removeNode = (graph, nodeId) => {
    graph.nodes = graph.nodes.filter(n => n.id !== nodeId);
    graph.edges = graph.edges.filter(e => e.from.node !== nodeId && e.to.node !== nodeId);
};

const moveNode = (graph, nodeId, x, y) => {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (node) {
        node.x = Math.round(x);
        node.y = Math.round(y);
    }
};

/** 端口占用查询：一个 data 输入端口只能接一根线 */
const findEdgeTo = (graph, nodeId, portName) =>
    graph.edges.find(e => e.to.node === nodeId && e.to.port === portName);

const findEdgesFrom = (graph, nodeId, portName) =>
    graph.edges.filter(e => e.from.node === nodeId && e.from.port === portName)
        .sort((a, b) => (a.order || 0) - (b.order || 0));

const connect = (graph, fromNode, fromPort, toNode, toPort) => {
    // 禁止自连
    if (fromNode === toNode) return null;
    // data 输入端口独占：先移除旧线
    if (toPort !== 'exec') {
        graph.edges = graph.edges.filter(e => !(e.to.node === toNode && e.to.port === toPort));
    } else {
        // 同一 exec 输出口到同一目标去重
        graph.edges = graph.edges.filter(
            e => !(e.from.node === fromNode && e.from.port === fromPort && e.to.node === toNode)
        );
    }
    graph.edges.push({
        from: {node: fromNode, port: fromPort},
        to: {node: toNode, port: toPort},
        order: findEdgesFrom(graph, fromNode, fromPort).length
    });
    return graph.edges[graph.edges.length - 1];
};

const disconnect = (graph, edge) => {
    const idx = graph.edges.indexOf(edge);
    if (idx !== -1) graph.edges.splice(idx, 1);
};

/** 返回 data 输入端口的取值来源：连线则回节点 id，否则 params 字面量 */
const inputOf = (graph, node, portName) => {
    const edge = findEdgeTo(graph, node.id, portName);
    if (edge) return {connected: true, node: edge.from.node};
    const fallback = (node.params && node.params[portName]) !== undefined ?
        node.params[portName] :
        null;
    return {connected: false, value: fallback};
};

const getNode = (graph, id) => graph.nodes.find(n => n.id === id);

export {
    createGraph,
    createNode,
    addNode,
    removeNode,
    moveNode,
    getNode,
    findEdgeTo,
    findEdgesFrom,
    connect,
    disconnect,
    inputOf,
    genId
};
