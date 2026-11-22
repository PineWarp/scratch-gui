/**
 * 可视化节点编辑器 · 解析器（JS → graph）
 *
 * 两级策略：
 * 1. 完美往返：编译产物头部有 /* VE-GRAPH v1 <encoded> * / 注释，
 *    直接还原完整节点图（含全部参数/坐标/连线）。
 * 2. 外部代码导入：逐语句扫描 → misc-statement（任意 JS 语句）节点串；
 *    识别常见事件特征（PROJECT_START / broadcast / addEventListener …）
 *    生成对应事件节点，其余语句挂在其 exec 链上。
 */
import {createGraph, createNode, addNode, connect} from './graph-model.js';

/** 从代码提取 VE-GRAPH 头 */
const extractVeGraph = code => {
    const m = code.match(/\/\*\s*VE-GRAPH v1 ([^*]+?)\s*\*\//);
    if (!m) return null;
    try {
        const data = JSON.parse(decodeURIComponent(m[1]));
        if (data && data.graph && Array.isArray(data.graph.nodes)) {
            return data; // {mode, meta, graph}
        }
    } catch (e) { /* 损坏则回退普通导入 */ }
    return null;
};

/** 简易语句切分：按顶层 ; 与 {} 分块（不追求完整 JS 语法） */
const splitStatements = code => {
    const out = [];
    let buf = '';
    let depth = 0;
    let inStr = null;
    let inLine = false;
    let inBlock = false;
    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        const next = code[i + 1];
        if (inLine) {
            if (c === '\n') inLine = false;
            buf += c;
            continue;
        }
        if (inBlock) {
            buf += c;
            if (c === '*' && next === '/') { inBlock = false; buf += next; i++; }
            continue;
        }
        if (c === '/' && next === '/') { inLine = true; buf += c; continue; }
        if (c === '/' && next === '*') { inBlock = true; buf += c; continue; }
        if (inStr) {
            buf += c;
            if (c === '\\') { buf += next || ''; i++; continue; }
            if (c === inStr || (inStr === '`' && c === '`')) {
                if (c === inStr) inStr = null;
            }
            continue;
        }
        if (c === '"' || c === "'" || c === '`') { inStr = c; buf += c; continue; }
        if (c === '{' || c === '[' || c === '(') { depth++; buf += c; continue; }
        if (c === '}' || c === ']' || c === ')') { depth--; buf += c; continue; }
        if (c === '\n' && depth === 0 && buf.trim() &&
            /[)}\]'"`]$/.test(buf.trim())) {
            out.push(buf.trim());
            buf = '';
            continue;
        }
        if (c === ';' && depth === 0) {
            buf += c;
            out.push(buf.trim());
            buf = '';
            continue;
        }
        buf += c;
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
};

/** 事件特征识别：返回事件节点 typeId 或 null */
const sniffEvent = stmt => {
    if (/PROJECT_START/.test(stmt)) return 'event-green-flag';
    if (/PROJECT_STOP_ALL/.test(stmt)) return 'event-stop';
    if (/PROJECT_CHANGED/.test(stmt)) return 'event-project-changed';
    if (/BROADCAST_MESSAGE_RECEIVED/.test(stmt)) {
        const m = stmt.match(/BROADCAST_MESSAGE_RECEIVED_(\w*)/);
        return {type: 'event-broadcast', name: m ? m[1] : '消息1'};
    }
    if (/KEY_PRESSED/.test(stmt)) {
        const m = stmt.match(/k\s*===\s*['"](.+?)['"]/);
        return {type: 'event-key', key: m ? m[1] : 'a'};
    }
    if (/TARGET_CLICKED/.test(stmt)) return 'event-sprite-click';
    if (/BEFORE_STEP/.test(stmt)) return 'event-tick';
    if (/addEventListener\s*\(\s*['"](\w+)['"]/.test(stmt)) {
        const m = stmt.match(/querySelector(?:All)?\s*\(\s*['"](.+?)['"]/);
        const ev = stmt.match(/addEventListener\s*\(\s*['"](\w+)['"]/);
        if (m && ev) return {type: 'event-dom', selector: m[1], event: ev[1]};
    }
    return null;
};

/** 事件命中后：提取包装语句的函数体内部语句（尽力而为） */
const extractBodyStmts = stmt => {
    // 匹配 (...) => { body } 或 function () { body } 的最深 { body }（尾部）
    const m = stmt.match(/(?:=>|function\s*\([^)]*\))\s*\{([\s\S]*)\}\s*\);?\s*$/);
    if (!m) return [];
    const inner = m[1];
    if (!inner.trim()) return [];
    return splitStatements(inner);
};

/** 外部代码 → 图（尽力而为） */
const importCode = (code, mode) => {
    const graph = createGraph();
    const stmts = splitStatements(code);
    let anchorX = 40;
    let anchorY = 60;
    let lastExecNode = null;
    let fallbackEvent = null;
    let eventCount = 0;

    // 先找事件特征语句，把其余语句挂到最近事件
    const entries = [];
    for (const stmt of stmts) {
        const ev = sniffEvent(stmt);
        entries.push({stmt, ev});
    }

    for (const {stmt, ev} of entries) {
        if (ev) {
            const spec = typeof ev === 'string' ? {type: ev} : ev;
            const node = createNode(spec.type, anchorX, anchorY, {
                name: spec.name, key: spec.key,
                selector: spec.selector, event: spec.event
            });
            // 清洗 null 参数
            for (const k of Object.keys(node.params)) {
                if (node.params[k] === undefined) delete node.params[k];
            }
            addNode(graph, node);
            lastExecNode = node;
            eventCount++;
            anchorY += 90;
            // 包装语句的函数体内部语句 → misc-statement 链
            let innerAnchor = lastExecNode;
            for (const inner of extractBodyStmts(stmt)) {
                const sNode = createNode('misc-statement', anchorX + 280, anchorY - 90, {code: inner});
                addNode(graph, sNode);
                if (innerAnchor) connect(graph, innerAnchor.id, 'exec', sNode.id, 'exec');
                innerAnchor = sNode;
                anchorY += 80;
            }
            continue;
        }
        // 普通语句 → misc-statement
        const node = createNode('misc-statement', anchorX + 280, anchorY, {code: stmt});
        addNode(graph, node);
        if (lastExecNode) {
            connect(graph, lastExecNode.id, 'exec', node.id, 'exec');
            anchorY += 80;
        } else {
            // 还没有事件：先攒着，最后挂 fallback 事件
            if (!fallbackEvent) {
                fallbackEvent = createNode('event-start', anchorX, anchorY - 90, {});
                addNode(graph, fallbackEvent);
                eventCount++;
            }
            connect(graph, fallbackEvent.id, 'exec', node.id, 'exec');
            anchorY += 80;
        }
    }
    if (eventCount === 0) {
        // 全是散语句：补一个启动事件
        fallbackEvent = createNode('event-start', 40, 40, {});
        addNode(graph, fallbackEvent);
        // 挂到已有第一个语句
        const firstStmt = graph.nodes.find(n => n.type === 'misc-statement');
        if (firstStmt) connect(graph, fallbackEvent.id, 'exec', firstStmt.id, 'exec');
    }
    return {graph, partial: true};
};

/** 主入口：js 代码 → {graph, meta, mode, partial} */
const parse = code => {
    const ve = extractVeGraph(code);
    if (ve) {
        return {
            graph: ve.graph,
            meta: ve.meta || {},
            mode: ve.mode || 'extension',
            partial: false
        };
    }
    const sniffed = /export const manifest/.test(code) ? 'addon' :
        (/Scratch\.extensions\.register/.test(code) ? 'extension' : null);
    const mode = sniffed || 'extension';
    const res = importCode(code, mode);
    // addon 代码：尽力提取 manifest 字段
    let meta = {};
    const nameM = code.match(/name:\s*['"]([^'"]+)['"]/);
    const descM = code.match(/description:\s*['"]([^'"]+)['"]/);
    if (nameM) meta.name = nameM[1];
    if (descM) meta.description = descM[1];
    return {
        graph: res.graph,
        meta,
        mode,
        partial: true
    };
};

export {parse, extractVeGraph, splitStatements};
