/**
 * 可视化节点编辑器 · 模板与示例图
 */

/** 新扩展的起始图 */
const extensionStarterGraph = mode => ({
    nodes: [
        {id: 'evt1', type: 'event-start', x: 60, y: 80, params: {}},
        {id: 'stmt1', type: 'misc-statement', x: 380, y: 80,
            params: {code: "console.log('扩展已启动');"}}
    ],
    edges: [
        {from: {node: 'evt1', port: 'exec'}, to: {node: 'stmt1', port: 'exec'}, order: 0}
    ]
});

/** 新插件的起始图 */
const addonStarterGraph = () => ({
    nodes: [
        {id: 'evt1', type: 'event-start', x: 60, y: 80, params: {}},
        {id: 'stmt1', type: 'dom-console', x: 380, y: 80,
            params: {value: "'插件已运行'", level: 'log'}}
    ],
    edges: [
        {from: {node: 'evt1', port: 'exec'}, to: {node: 'stmt1', port: 'exec'}, order: 0}
    ]
});

/** 插件默认 manifest 元信息 */
const defaultMeta = mode => mode === 'addon' ? {
    name: '我的插件',
    description: '由可视化插件编辑器生成',
    enabledByDefault: false,
    settings: [],
    css: ''
} : {
    name: '我的扩展',
    id: 'myExtension',
    description: ''
};

/** 示例：带积木的扩展图（供「载入示例」） */
const extensionDemoGraph = () => ({
    nodes: [
        {id: 'blk1', type: 'ext-define-block', x: 60, y: 60, params: {
            opcode: 'sayHello',
            text: '打个招呼 [TEXT]',
            blockType: 'command',
            args: '[{"type": "input_value", "name": "TEXT", "default": "你好"}]',
            bodyGraph: {
                nodes: [
                    {id: 'b1', type: 'misc-statement', x: 60, y: 60,
                        params: {code: "console.log('积木参数 TEXT =', args.TEXT); return;"}}
                ],
                edges: []
            }
        }},
        {id: 'evt1', type: 'event-green-flag', x: 60, y: 300, params: {}},
        {id: 'stmt1', type: 'misc-statement', x: 400, y: 300,
            params: {code: "console.log('绿旗被点击！');"}}
    ],
    edges: [
        {from: {node: 'evt1', port: 'exec'}, to: {node: 'stmt1', port: 'exec'}, order: 0}
    ]
});

export {extensionStarterGraph, addonStarterGraph, defaultMeta, extensionDemoGraph};
