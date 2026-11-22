/**
 * 可视化节点编辑器 · 编译器（graph → JS）
 *
 * 输出结构：
 * - 头部注释 /* VE-GRAPH ... * / 内嵌完整图 JSON（往返转换的锚点）
 * - 每个语句节点输出行尾标记 // ⟦id⟧（调试/对位用）
 * - extension 模式：Scratch.extensions.register 类模板
 * - addon 模式：manifest + default async function 模板
 */
import {getType, lit, q} from './node-types.js';

const MARK = id => ` /*⟦${id}⟧*/`;

const makeCtx = (graph, opts) => {
    const {mode, level = 0, funcNames, blockBodyArgs, scopeGraph} = opts;
    const indent = n => '    '.repeat(level + n);
    const getNode = id => graph.nodes.find(n => n.id === id);

    const ctx = {
        graph,
        mode,
        level,
        indent,

        // ---- 参数读取 ----
        param: (node, name) => node.params ? node.params[name] : null,
        paramStr: (node, name) => q(String(node.params ? node.params[name] : '')),
        ident: (node, name) => {
            const raw = String(node.params && node.params[name] || '');
            const m = raw.match(/^[A-Za-z_$][A-Za-z0-9_$]*$/);
            return m ? m[0] : null;
        },

        // ---- 表达式求值（递归内联） ----
        expr: (node, portName) => {
            const type = getType(node.type);
            if (!type) return 'null';
            // 有连线：找源节点
            const edge = graph.edges.find(
                e => e.to.node === node.id && e.to.port === portName
            );
            if (edge) {
                const src = getNode(edge.from.node);
                if (src) {
                    const srcType = getType(src.type);
                    if (srcType && srcType.isExpression) {
                        return srcType.compileExpr(ctx, src);
                    }
                    return 'null';
                }
            }
            // 无连线：params 字面量 / 代码片段
            const raw = node.params ? node.params[portName] : null;
            const def = (type.params || []).find(p => p.name === portName);
            if (def && def.type === 'number') return `(${raw === '' || raw == null ? def.default : Number(raw) || 0})`;
            if (def && def.type === 'bool') return String(!!raw);
            if (def && (def.type === 'code' || def.type === 'json')) return `(${raw === '' || raw == null ? def.default : String(raw)})`;
            return lit(raw === undefined ? def.default : raw);
        },

        // ---- 语句链生成 ----
        chainStatements: (node, outPort = 'exec') => {
            const outgoing = graph.edges
                .filter(e => e.from.node === node.id && e.from.port === outPort)
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            const lines = [];
            for (const edge of outgoing) {
                const target = getNode(edge.to.node);
                if (!target) continue;
                const targetType = getType(target.type);
                if (!targetType || targetType.isExpression || targetType.isFunction || targetType.isExtensionBlock) continue;
                lines.push(...ctx.statements(target));
            }
            return lines;
        },

        // 生成单个语句节点的语句（含行尾标记）
        statements: node => {
            const type = getType(node.type);
            if (!type || !type.compile) return [];
            const out = type.compile(ctx, node);
            const flat = Array.isArray(out) ? out : String(out).split('\n');
            return flat.map(line => line.trim() === '' ? line : `${line}${MARK(node.id)}`);
        },

        // 控制流节点用：生成嵌套体（已缩进字符串块）
        chain: (node, outPort = 'exec', depth = 1) => {
            const lines = ctx.chainStatements(node, outPort);
            return lines.map(l => indent(depth) + l).join('\n');
        },

        // 子图编译（函数体/积木回调/定时器回调）
        subGraph: (node, paramName, depth) => {
            const body = node.params && node.params[paramName];
            if (!body || !body.nodes || body.nodes.length === 0) {
                return indent(depth) + '// (空)';
            }
            const sub = makeCtx(body, {
                mode,
                level: level + depth,
                funcNames,
                blockBodyArgs
            });
            return sub.compileTop().map(l => '    '.repeat(depth) + l).join('\n');
        },

        // ---- 函数相关（func-call 用） ----
        funcName: node => {
            const refId = node.params && node.params.funcNodeId;
            const target = refId && getNode(refId);
            if (target && target.params && target.params.name) {
                return `fn_${String(target.params.name).replace(/[^A-Za-z0-9_]/g, '_')}`;
            }
            return 'fn_unknown';
        },
        argsList: (node, portName = 'args') => {
            // 收集连入本节点指定输入端口的多根线 + 无连线时的文本参数
            const incoming = graph.edges
                .filter(e => e.to.node === node.id && e.to.port === portName)
                .sort((a, b) => (a.order || 0) - (b.order || 0));
            const parts = [];
            for (const edge of incoming) {
                const srcNode = getNode(edge.from.node);
                const srcT = srcNode && getType(srcNode.type);
                if (srcNode && srcT && srcT.isExpression) {
                    parts.push(srcT.compileExpr(ctx, srcNode));
                }
            }
            const text = node.params && (node.params.argsText !== undefined ? node.params.argsText : node.params[portName]);
            if (text) String(text).split(',').map(s => s.trim()).filter(Boolean).forEach(s => parts.push(s));
            return parts.join(', ');
        },

        // ---- 箭头函数（func-arrow） ----
        argsOfArrow: node => String(node.params && node.params.args || '').trim(),
        bodyOfArrow: node => {
            const body = node.params && node.params.bodyGraph;
            if (!body || !body.nodes || body.nodes.length === 0) return 'null';
            const sub = makeCtx(body, {mode, level: 0, funcNames, blockBodyArgs});
            const lines = sub.compileTop();
            if (lines.length === 1 && !lines[0].includes('\n') && /;$/.test(lines[0])) {
                return `(${lines[0].slice(0, -1)})`;
            }
            return `{\n${lines.map(l => '    ' + l).join('\n')}\n}`;
        },

        // 顶层：事件节点 + 语句孤儿 → 代码
        compileTop: () => {
            const lines = [];
            const covered = new Set();
            // 1) 事件节点（含函数/积木定义在顶层展开处理）
            for (const node of graph.nodes) {
                const type = getType(node.type);
                if (!type) continue;
                if (type.isEvent) {
                    covered.add(node.id);
                    const out = type.compile ? type.compile(ctx, node) : [];
                    (Array.isArray(out) ? out : String(out).split('\n'))
                        .forEach(l => lines.push(l));
                } else if (type.isFunction) {
                    covered.add(node.id);
                    lines.push(...compileFunctionDef(ctx, node, graph, mode, level));
                } else if (type.isExtensionBlock) {
                    covered.add(node.id);
                    // 积木定义收集到块清单（由模板层聚合）
                    (opts.blocks = opts.blocks || []).push(node);
                }
            }
            // 2) 顶层散落语句（有 exec 输入且不是事件，且无入边）
            for (const node of graph.nodes) {
                if (covered.has(node.id)) continue;
                const type = getType(node.type);
                if (!type || type.isExpression || type.isEvent || type.isFunction || type.isExtensionBlock) continue;
                const hasIn = type.inputs && type.inputs.some(i => i.kind === 'exec') &&
                    graph.edges.some(e => e.to.node === node.id && e.to.port === 'exec');
                if (!hasIn) {
                    covered.add(node.id);
                    lines.push(...ctx.statements(node));
                    // 该节点后续链已由 statements 内 chain 生成
                }
            }
            return lines;
        }
    };
    void scopeGraph;
    void funcNames;
    void blockBodyArgs;
    return ctx;
};

/** 函数定义：在顶层展开为 async/normal 函数声明 */
const compileFunctionDef = (ctx, node, graph, mode, level) => {
    const name = `fn_${String(node.params.name || 'myFunction').replace(/[^A-Za-z0-9_]/g, '_')}`;
    const args = String(node.params.args || '').split(',').map(s => s.trim()).filter(Boolean);
    const isAsync = !!node.params.isAsync;
    const body = node.params.bodyGraph;
    const lines = [`${isAsync ? 'async ' : ''}function ${name}(${args.join(', ')}) {`];
    if (body && body.nodes && body.nodes.length) {
        const sub = makeCtx(body, {mode, level: level + 1, blocks: ctx.__opts && ctx.__opts.blocks});
        sub.compileTop().forEach(l => lines.push('    ' + l));
    } else {
        lines.push('    // (空函数体)');
    }
    lines.push(`}${MARK(node.id)}`);
    return lines;
};

/** 事件节点包 async：PROJECT_START 等回调里允许 await */
const wrapAsync = fnHeader => `${fnHeader}`;

/**
 * 主入口：graph → 完整 JS 文件内容
 * @param {object} graph {nodes, edges}
 * @param {string} mode 'extension' | 'addon'
 * @param {object} meta {name, description, blockCount...}（插件 manifest / 扩展信息）
 */
const compile = (graph, mode, meta) => {
    const opts = {mode, blocks: []};
    const ctx = makeCtx(graph, opts);
    ctx.__opts = opts;
    const bodyLines = ctx.compileTop();
    const graphJson = JSON.stringify({mode, meta, graph});
    const header = `/* VE-GRAPH v1 ${encodeURIComponent(graphJson)} */`;

    if (mode === 'extension') {
        return buildExtension(header, bodyLines, opts.blocks, meta);
    }
    return buildAddon(header, bodyLines, meta);
};

// ---- 扩展模板 ----
const buildExtension = (header, bodyLines, blockNodes, meta) => {
    const name = (meta && meta.name) || 'MyExtension';
    const id = (meta && meta.id) || 'myExtension';
    const blockDefs = (blockNodes || []).map(node => {
        const p = node.params || {};
        const args = p.args || '[]';
        const blockType = p.blockType || 'command';
        return `    {
        opcode: ${q(p.opcode || 'myBlock')},
        blockType: Scratch.BlockType.${blockType.toUpperCase()},
        text: ${q(p.text || '我的积木')},
        arguments: ${args}
    }`;
    }).join(',\n');

    const blocksCode = blockDefs ? `\n    getInfo () {\n        return {\n            id: ${q(id)},\n            name: ${q(name)},\n            blocks: [\n${blockDefs}\n            ]\n        };\n    }` : '';

    const blockBodies = (blockNodes || []).map(node => {
        const p = node.params || {};
        const body = p.bodyGraph;
        let inner = '        // (空)';
        if (body && body.nodes && body.nodes.length) {
            const sub = makeCtx(body, {mode: 'extension', level: 2});
            inner = sub.compileTop().map(l => '        ' + l).join('\n');
        }
        return `    async ${p.opcode || 'myBlock'} (args, util) {\n${inner}\n    }${MARK(node.id)}`;
    }).join('\n');

    return `${header}
// 可视化扩展编辑器生成 —— ${name}
// 由节点图编译；顶部 VE-GRAPH 注释保存完整节点图（导入即可回到可视化编辑）
class ${id.replace(/[^A-Za-z0-9_]/g, '_')} {
    constructor () {
        this.vm = typeof vm !== 'undefined' ? vm : (typeof window !== 'undefined' && window.vm);
    }${blocksCode}
${blockBodies}
}

(function register () {
    const instance = new ${id.replace(/[^A-Za-z0-9_]/g, '_')}();
    if (typeof Scratch !== 'undefined' && Scratch.extensions) {
        Scratch.extensions.register(instance);
    } else if (typeof window !== 'undefined' && window.__mwExtensionRegistrar) {
        window.__mwExtensionRegistrar(instance);
    }
})();

// ---- 顶层事件/逻辑 ----
(async function main () {
${bodyLines.map(l => '    ' + l).join('\n')}
})();
`;
};

// ---- 插件模板 ----
const buildAddon = (header, bodyLines, meta) => {
    const m = meta || {};
    const settingsJson = JSON.stringify(m.settings || [], null, 8)
        .replace(/^/gm, ' '.repeat(0)).replace(/\n/g, '\n        ');
    const manifest = `export const manifest = {
    name: ${q(m.name || '我的插件')},
    description: ${q(m.description || '由可视化插件编辑器生成')},
    tags: ['custom'],
    enabledByDefault: ${!!m.enabledByDefault},${m.css ? `\n    css: ${q(m.css)},` : ''}
    settings: ${settingsJson}
};`;

    return `${header}
// 可视化插件编辑器生成 —— ${m.name || '我的插件'}
// 由节点图编译；顶部 VE-GRAPH 注释保存完整节点图（导入即可回到可视化编辑）

${manifest}

export default async function ({addon, console, msg}) {
${bodyLines.map(l => '    ' + l).join('\n')}
    return Promise.resolve();
};
`;
};

export {compile, MARK};
