/**
 * 可视化节点编辑器 · 节点类型目录（node catalog）
 *
 * 约定：
 * - 语句节点：有 exec 输入/输出，compile(ctx, node) 返回代码字符串数组；
 *   ctx.chain(node, outPort) 沿 exec 链继续生成。
 * - 表达式节点：无 exec 端口，compileExpr(ctx, node) 返回表达式字符串；
 *   ctx.expr(node, portName) 递归内联。
 * - 子图：函数体/积木回调的图 JSON 存于 params.bodyGraph，
 *   双击节点进入子图编辑（UI 面包屑导航）。
 * - 万能逃生舱：misc-expression / misc-statement —— 任意 JS 表达式/语句，
 *   保证「JS 能写的节点都能做」。
 */

// ---- 表达式工具：字面量 → JS ----
const lit = v => {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'object') return JSON.stringify(v);
    return JSON.stringify(v);
};

const q = s => JSON.stringify(String(s));

/**
 * 节点目录。category 用于面板分组。
 * inputs/outputs: {name, label, kind: 'exec'|'data'}
 * params: {name, label, type: 'text'|'number'|'bool'|'select'|'code'|'json'|'graph',
 *          default, options?, placeholder?}
 */
const NODE_TYPES = [
    // ============================== 事件 ==============================
    {
        id: 'event-start',
        category: '事件',
        title: '程序启动',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        isEvent: true,
        compile: (ctx, node) => ctx.chain(node)
    },
    {
        id: 'event-green-flag',
        category: '事件',
        title: '当绿旗被点击',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        isEvent: true,
        compile: (ctx, node) => `vm.runtime.on('PROJECT_START', () => {\n${ctx.chain(node, 'exec', 1)}\n});`
    },
    {
        id: 'event-stop',
        category: '事件',
        title: '当停止按钮被点击',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        isEvent: true,
        compile: (ctx, node) => `vm.runtime.on('PROJECT_STOP_ALL', () => {\n${ctx.chain(node, 'exec', 1)}\n});`
    },
    {
        id: 'event-broadcast',
        category: '事件',
        title: '当接收到广播',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'name', label: '广播名称', type: 'text', default: '消息1'}
        ],
        isEvent: true,
        compile: (ctx, node) => `vm.runtime.on('BROADCAST_MESSAGE_RECEIVED_${ctx.param(node, 'name') || ''}', () => {\n${ctx.chain(node, 'exec', 1)}\n});`
    },
    {
        id: 'event-key',
        category: '事件',
        title: '当按下键盘按键',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'key', label: '按键', type: 'text', default: 'a', placeholder: 'a / space / left …'}
        ],
        isEvent: true,
        compile: (ctx, node) => `vm.runtime.on('KEY_PRESSED', k => {\n    if (k === ${ctx.paramStr(node, 'key')}) {\n${ctx.chain(node, 'exec', 2)}\n    }\n});`
    },
    {
        id: 'event-sprite-click',
        category: '事件',
        title: '当角色被点击',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        isEvent: true,
        compile: (ctx, node) => `vm.runtime.on('TARGET_CLICKED', () => {\n${ctx.chain(node, 'exec', 1)}\n});`
    },
    {
        id: 'event-tick',
        category: '事件',
        title: '每帧循环',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        isEvent: true,
        compile: (ctx, node) => `vm.runtime.on('BEFORE_STEP', () => {\n${ctx.chain(node, 'exec', 1)}\n});`
    },
    {
        id: 'event-dom',
        category: '事件',
        title: '当 DOM 元素触发事件',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'selector', label: 'CSS 选择器', type: 'text', default: 'button'},
            {name: 'event', label: '事件类型', type: 'select', default: 'click',
                options: ['click', 'input', 'change', 'keydown', 'keyup', 'mousedown', 'dblclick']}
        ],
        isEvent: true,
        compile: (ctx, node) => `document.querySelectorAll(${ctx.paramStr(node, 'selector')}).forEach(el => {\n    el.addEventListener(${ctx.paramStr(node, 'event')}, () => {\n${ctx.chain(node, 'exec', 2)}\n    });\n});`
    },
    {
        id: 'event-addon-setting',
        category: '事件',
        title: '当插件设置项改变（插件）',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'settingId', label: '设置 ID', type: 'text', default: 'mySetting'}],
        isEvent: true,
        addonOnly: true,
        compile: (ctx, node) => `addon.settings.addEventListener('change', e => {\n    if (e.detail && e.detail.id === ${ctx.paramStr(node, 'settingId')}) {\n${ctx.chain(node, 'exec', 2)}\n    }\n});`
    },
    {
        id: 'event-project-changed',
        category: '事件',
        title: '当作品内容改变',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        isEvent: true,
        compile: (ctx, node) => `vm.runtime.on('PROJECT_CHANGED', () => {\n${ctx.chain(node, 'exec', 1)}\n});`
    },

    // ============================== 流程控制 ==============================
    {
        id: 'control-if',
        category: '流程控制',
        title: '如果…就…',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'condition', label: '条件', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'condition', label: '条件（无连线时）', type: 'code', default: 'true'}],
        compile: (ctx, node) => [
            `if (${ctx.expr(node, 'condition')}) {`,
            ctx.chain(node, 'exec', 1),
            `}`
        ]
    },
    {
        id: 'control-if-else',
        category: '流程控制',
        title: '如果…否则…',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'condition', label: '条件', kind: 'data'}
        ],
        outputs: [
            {name: 'exec', label: '真', kind: 'exec'},
            {name: 'execFalse', label: '假', kind: 'exec'}
        ],
        params: [{name: 'condition', label: '条件（无连线时）', type: 'code', default: 'true'}],
        compile: (ctx, node) => [
            `if (${ctx.expr(node, 'condition')}) {`,
            ctx.chain(node, 'exec', 1),
            `} else {`,
            ctx.chain(node, 'execFalse', 1),
            `}`
        ]
    },
    {
        id: 'control-for',
        category: '流程控制',
        title: '循环…次',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'from', label: '起始', kind: 'data'},
            {name: 'to', label: '结束', kind: 'data'},
            {name: 'by', label: '步长', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'from', label: '起始', type: 'number', default: 1},
            {name: 'to', label: '结束', type: 'number', default: 10},
            {name: 'by', label: '步长', type: 'number', default: 1},
            {name: 'varName', label: '循环变量名', type: 'text', default: 'i'}
        ],
        compile: (ctx, node) => {
            const v = ctx.ident(node, 'varName') || 'i';
            return [
                `for (let ${v} = ${ctx.expr(node, 'from')}; ${v} <= ${ctx.expr(node, 'to')}; ${v} += ${ctx.expr(node, 'by')}) {`,
                ctx.chain(node, 'exec', 1),
                `}`
            ];
        }
    },
    {
        id: 'control-while',
        category: '流程控制',
        title: '重复执行 当…',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'condition', label: '条件', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'condition', label: '条件（无连线时）', type: 'code', default: 'true'}],
        compile: (ctx, node) => [
            `while (${ctx.expr(node, 'condition')}) {`,
            ctx.chain(node, 'exec', 1),
            `}`
        ]
    },
    {
        id: 'control-for-each',
        category: '流程控制',
        title: '遍历列表…',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'list', label: '列表', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'list', label: '列表（无连线时）', type: 'code', default: '[1, 2, 3]'},
            {name: 'varName', label: '元素变量名', type: 'text', default: 'item'}
        ],
        compile: (ctx, node) => {
            const v = ctx.ident(node, 'varName') || 'item';
            return [
                `for (const ${v} of ${ctx.expr(node, 'list')}) {`,
                ctx.chain(node, 'exec', 1),
                `}`
            ];
        }
    },
    {
        id: 'control-break',
        category: '流程控制',
        title: '跳出循环',
        inputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        compile: () => ['break;']
    },
    {
        id: 'control-continue',
        category: '流程控制',
        title: '继续下一次循环',
        inputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        compile: () => ['continue;']
    },
    {
        id: 'control-return',
        category: '流程控制',
        title: '返回值',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'value', label: '返回值', kind: 'data'}
        ],
        params: [{name: 'value', label: '返回值（无连线时）', type: 'code', default: 'null'}],
        compile: (ctx, node) => [`return ${ctx.expr(node, 'value')};`]
    },
    {
        id: 'control-wait',
        category: '流程控制',
        title: '等待…秒（异步）',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'seconds', label: '秒数', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'seconds', label: '秒数', type: 'number', default: 1}],
        compile: (ctx, node) => [
            `await new Promise(r => setTimeout(r, ${ctx.expr(node, 'seconds')} * 1000));`,
            ...ctx.chainStatements(node)
        ]
    },
    {
        id: 'control-try-catch',
        category: '流程控制',
        title: '尝试 / 捕获错误',
        inputs: [{name: 'exec', label: '', kind: 'exec'}],
        outputs: [
            {name: 'exec', label: '尝试', kind: 'exec'},
            {name: 'execCatch', label: '捕获', kind: 'exec'}
        ],
        params: [{name: 'errVar', label: '错误变量名', type: 'text', default: 'e'}],
        compile: (ctx, node) => {
            const v = ctx.ident(node, 'errVar') || 'e';
            return [
                'try {',
                ctx.chain(node, 'exec', 1),
                `} catch (${v}) {`,
                ctx.chain(node, 'execCatch', 1),
                '}'
            ];
        }
    },
    {
        id: 'control-comment',
        category: '流程控制',
        title: '注释（仅文档）',
        inputs: [{name: 'exec', label: '', kind: 'exec'}],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'text', label: '注释内容', type: 'text', default: '说明…', multiline: true}],
        compile: (ctx, node) => [`/* ${String(ctx.param(node, 'text') || '').replace('*/', '* /')} */`, ...ctx.chainStatements(node)]
    },

    // ============================== 变量 ==============================
    {
        id: 'data-set-var',
        category: '变量',
        title: '设置变量',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'value', label: '值', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'name', label: '变量名', type: 'text', default: 'myVar'},
            {name: 'value', label: '值（无连线时）', type: 'code', default: '0'},
            {name: 'scope', label: '声明方式', type: 'select', default: 'let',
                options: ['let', 'const', 'var', '赋值(不声明)']}
        ],
        compile: (ctx, node) => {
            const name = ctx.ident(node, 'name') || 'myVar';
            const val = ctx.expr(node, 'value');
            const how = ctx.param(node, 'scope') || 'let';
            return [how === '赋值(不声明)' ? `${name} = ${val};` : `${how} ${name} = ${val};`];
        }
    },
    {
        id: 'data-get-var',
        category: '变量',
        title: '读取变量',
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [{name: 'name', label: '变量名', type: 'text', default: 'myVar'}],
        isExpression: true,
        compileExpr: (ctx, node) => ctx.ident(node, 'name') || 'undefined'
    },
    {
        id: 'data-literal',
        category: '变量',
        title: '字面量',
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [
            {name: 'literalType', label: '类型', type: 'select', default: 'number',
                options: ['number', 'string', 'boolean', 'null', 'undefined', '对象/数组(JSON]']},
            {name: 'value', label: '值', type: 'code', default: '0'}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            const t = ctx.param(node, 'literalType');
            const v = ctx.param(node, 'value');
            if (t === 'number') return `(${v === '' || v == null ? 0 : v})`;
            if (t === 'string') return lit(String(v == null ? '' : v));
            if (t === 'boolean') return String(!!v);
            if (t === 'null') return 'null';
            if (t === 'undefined') return 'undefined';
            return `(${v || '{}'})`; // 对象/数组：直接当 JS 表达式
        }
    },
    {
        id: 'data-object-field',
        category: '变量',
        title: '取对象字段',
        inputs: [{name: 'object', label: '对象', kind: 'data'}],
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [
            {name: 'object', label: '对象（无连线时）', type: 'code', default: '{}'},
            {name: 'field', label: '字段名', type: 'text', default: 'name'},
            {name: 'optional', label: '可选链 ?.', type: 'bool', default: false}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            const f = ctx.ident(node, 'field') || 'x';
            return `${ctx.expr(node, 'object')}${ctx.param(node, 'optional') ? '?.' : '.'}${f}`;
        }
    },
    {
        id: 'data-array-index',
        category: '变量',
        title: '取数组元素',
        inputs: [
            {name: 'array', label: '数组', kind: 'data'},
            {name: 'index', label: '下标', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [
            {name: 'array', label: '数组（无连线时）', type: 'code', default: '[]'},
            {name: 'index', label: '下标', type: 'number', default: 0}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `${ctx.expr(node, 'array')}[${ctx.expr(node, 'index')}]`
    },

    // ============================== 运算 ==============================
    {
        id: 'op-math',
        category: '运算',
        title: '算术运算',
        inputs: [
            {name: 'a', label: 'A', kind: 'data'},
            {name: 'b', label: 'B', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'a', label: 'A', type: 'code', default: '0'},
            {name: 'b', label: 'B', type: 'code', default: '0'},
            {name: 'operator', label: '运算符', type: 'select', default: '+',
                options: ['+', '-', '*', '/', '%', '**']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `(${ctx.expr(node, 'a')} ${ctx.param(node, 'operator')} ${ctx.expr(node, 'b')})`
    },
    {
        id: 'op-compare',
        category: '运算',
        title: '比较',
        inputs: [
            {name: 'a', label: 'A', kind: 'data'},
            {name: 'b', label: 'B', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'a', label: 'A', type: 'code', default: '0'},
            {name: 'b', label: 'B', type: 'code', default: '0'},
            {name: 'operator', label: '运算符', type: 'select', default: '===',
                options: ['===', '!==', '==', '!=', '<', '>', '<=', '>=']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `(${ctx.expr(node, 'a')} ${ctx.param(node, 'operator')} ${ctx.expr(node, 'b')})`
    },
    {
        id: 'op-logic',
        category: '运算',
        title: '逻辑运算',
        inputs: [
            {name: 'a', label: 'A', kind: 'data'},
            {name: 'b', label: 'B', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'a', label: 'A', type: 'code', default: 'true'},
            {name: 'b', label: 'B', type: 'code', default: 'true'},
            {name: 'operator', label: '运算符', type: 'select', default: '&&',
                options: ['&&', '||']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `(${ctx.expr(node, 'a')} ${ctx.param(node, 'operator')} ${ctx.expr(node, 'b')})`
    },
    {
        id: 'op-not',
        category: '运算',
        title: '取反 !',
        inputs: [{name: 'a', label: 'A', kind: 'data'}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [{name: 'a', label: 'A', type: 'code', default: 'false'}],
        isExpression: true,
        compileExpr: (ctx, node) => `(!(${ctx.expr(node, 'a')}))`
    },
    {
        id: 'op-ternary',
        category: '运算',
        title: '三元判断',
        inputs: [
            {name: 'condition', label: '条件', kind: 'data'},
            {name: 'ifTrue', label: '真值', kind: 'data'},
            {name: 'ifFalse', label: '假值', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'condition', label: '条件', type: 'code', default: 'true'},
            {name: 'ifTrue', label: '真值', type: 'code', default: '1'},
            {name: 'ifFalse', label: '假值', type: 'code', default: '0'}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `(${ctx.expr(node, 'condition')} ? (${ctx.expr(node, 'ifTrue')}) : (${ctx.expr(node, 'ifFalse')}))`
    },
    {
        id: 'op-math-fn',
        category: '运算',
        title: '数学函数',
        inputs: [
            {name: 'a', label: '参数', kind: 'data'},
            {name: 'b', label: '第二参数(可选)', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'a', label: '参数', type: 'code', default: '0'},
            {name: 'b', label: '第二参数(可选)', type: 'code', default: ''},
            {name: 'fn', label: '函数', type: 'select', default: 'round',
                options: ['abs', 'ceil', 'floor', 'round', 'trunc', 'sqrt', 'cbrt', 'random',
                    'min', 'max', 'pow', 'sin', 'cos', 'tan', 'atan2', 'log', 'log2', 'log10', 'exp',
                    'sign', 'hypot']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            const fn = ctx.param(node, 'fn') || 'round';
            const a = ctx.expr(node, 'a');
            const b = ctx.param(node, 'b');
            if (b === '' || b === null) {
                if (['min', 'max', 'pow', 'atan2', 'hypot'].includes(fn)) return `Math.${fn}(${a})`;
                return `Math.${fn}(${a})`;
            }
            return `Math.${fn}(${a}, ${ctx.expr(node, 'b')})`;
        }
    },
    {
        id: 'op-string-fn',
        category: '运算',
        title: '字符串操作',
        inputs: [
            {name: 'str', label: '字符串', kind: 'data'},
            {name: 'arg', label: '参数(可选)', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'str', label: '字符串', type: 'code', default: "'文本'"},
            {name: 'arg', label: '参数(可选)', type: 'code', default: ''},
            {name: 'fn', label: '操作', type: 'select', default: 'length',
                options: ['length', 'toUpperCase', 'toLowerCase', 'trim', 'concat', 'includes',
                    'indexOf', 'substring', 'slice', 'replace', 'replaceAll', 'split',
                    'startsWith', 'endsWith', 'padStart', 'padEnd', 'repeat', 'charAt']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            const fn = ctx.param(node, 'fn') || 'length';
            const s = ctx.expr(node, 'str');
            const arg = ctx.param(node, 'arg');
            const noArg = ['length', 'toUpperCase', 'toLowerCase', 'trim'];
            if (noArg.includes(fn) || arg === '' || arg === null) {
                return fn === 'length' ? `${s}.length` : `${s}.${fn}()`;
            }
            return `${s}.${fn}(${ctx.expr(node, 'arg')})`;
        }
    },
    {
        id: 'op-template-string',
        category: '运算',
        title: '模板字符串',
        inputs: [{name: 'parts', label: '拼接值(可多个)', kind: 'data', multi: true}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [{name: 'text', label: '模板（${} 内放表达式）', type: 'code', default: '你好，${name}'}],
        isExpression: true,
        compileExpr: (ctx, node) => '`' + String(ctx.param(node, 'text') || '')
            .replace(/`/g, '\\`').replace(/\$\{/g, '${') + '`'
    },
    {
        id: 'op-json',
        category: '运算',
        title: 'JSON 序列化/解析',
        inputs: [{name: 'value', label: '值', kind: 'data'}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'value', label: '值（无连线时）', type: 'code', default: '{}'},
            {name: 'mode', label: '模式', type: 'select', default: 'stringify',
                options: ['stringify', 'parse']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => ctx.param(node, 'mode') === 'parse' ?
            `JSON.parse(${ctx.expr(node, 'value')})` :
            `JSON.stringify(${ctx.expr(node, 'value')})`
    },
    {
        id: 'op-spread',
        category: '运算',
        title: '展开运算符 …',
        inputs: [{name: 'value', label: '值', kind: 'data'}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [{name: 'value', label: '值（无连线时）', type: 'code', default: '[]'}],
        isExpression: true,
        compileExpr: (ctx, node) => `...(${ctx.expr(node, 'value')})`
    },

    // ============================== 函数 ==============================
    {
        id: 'func-define',
        category: '函数',
        title: '定义函数（子图）',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'name', label: '函数名', type: 'text', default: 'myFunction'},
            {name: 'args', label: '参数名(逗号分隔)', type: 'text', default: ''},
            {name: 'isAsync', label: 'async 函数', type: 'bool', default: false},
            {name: 'bodyGraph', label: '函数体（双击编辑）', type: 'graph'}
        ],
        isFunction: true,
        compile: () => [] // 函数定义在编译器顶层展开（见 compile.js）
    },
    {
        id: 'func-call',
        category: '函数',
        title: '调用函数',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'args', label: '实参(可多个)', kind: 'data', multi: true}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'funcNodeId', label: '目标函数节点', type: 'text', default: ''},
            {name: 'argsText', label: '实参（无连线时，逗号分隔）', type: 'code', default: ''}
        ],
        compile: (ctx, node) => [
            `${ctx.funcName(node)}(${ctx.argsList(node)});`,
            ...ctx.chainStatements(node)
        ]
    },
    {
        id: 'func-call-expr',
        category: '函数',
        title: '调用函数（表达式）',
        inputs: [{name: 'args', label: '实参(可多个)', kind: 'data', multi: true}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'funcNodeId', label: '目标函数节点', type: 'text', default: ''},
            {name: 'argsText', label: '实参（无连线时）', type: 'code', default: ''}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `${ctx.funcName(node)}(${ctx.argsList(node)})`
    },
    {
        id: 'func-arrow',
        category: '函数',
        title: '箭头函数（当回调用）',
        inputs: [{name: 'body', label: '函数体（子图）', kind: 'data'}],
        outputs: [{name: 'value', label: '函数', kind: 'data'}],
        params: [
            {name: 'args', label: '参数名(逗号分隔)', type: 'text', default: ''},
            {name: 'isAsync', label: 'async', type: 'bool', default: false},
            {name: 'bodyGraph', label: '函数体（双击编辑）', type: 'graph'}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `(${ctx.argsOfArrow(node)}) => ${ctx.bodyOfArrow(node)}`
    },

    // ============================== Scratch 交互 ==============================
    {
        id: 'sc-say',
        category: 'Scratch 交互',
        title: '角色说…',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'target', label: '目标角色', kind: 'data'},
            {name: 'text', label: '文本', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'target', label: '目标角色(无连线=当前)', type: 'code', default: ''},
            {name: 'text', label: '文本', type: 'code', default: "'你好'"}
        ],
        compile: (ctx, node) => {
            const tgt = ctx.param(node, 'target');
            const call = tgt === '' || tgt == null ?
                `vm.runtime.targets.find(t => t.isOriginal && !t.isStage)?.postSpriteInfo({say: ${ctx.expr(node, 'text')}, sayType: 'say'});` :
                `(${tgt}).postSpriteInfo({say: ${ctx.expr(node, 'text')}, sayType: 'say'});`;
            return [call, ...ctx.chainStatements(node)];
        }
    },
    {
        id: 'sc-broadcast',
        category: 'Scratch 交互',
        title: '广播消息',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'name', label: '名称', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'name', label: '广播名称', type: 'text', default: '消息1'}],
        compile: (ctx, node) => [
            `vm.runtime.startHats('event_whenbroadcastreceived', { BROADCAST_OPTION: ${ctx.expr(node, 'name')} });`,
            ...ctx.chainStatements(node)
        ]
    },
    {
        id: 'sc-get-var',
        category: 'Scratch 交互',
        title: '读取 Scratch 变量',
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [
            {name: 'name', label: '变量名', type: 'text', default: '我的变量'},
            {name: 'target', label: '目标(空=全部查找)', type: 'code', default: ''}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            const t = ctx.param(node, 'target');
            const scope = (t === '' || t == null) ?
                'vm.runtime.targets.find(t2 => t2.isOriginal && !t2.isStage)' : String(t);
            return `(${scope}?.lookupVariableByName?.(${ctx.paramStr(node, 'name')})?.value)`;
        }
    },
    {
        id: 'sc-set-var',
        category: 'Scratch 交互',
        title: '设置 Scratch 变量',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'value', label: '值', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'name', label: '变量名', type: 'text', default: '我的变量'},
            {name: 'value', label: '值', type: 'code', default: '0'},
            {name: 'target', label: '目标(空=全部查找)', type: 'code', default: ''}
        ],
        compile: (ctx, node) => {
            const t = ctx.param(node, 'target');
            const scope = (t === '' || t == null) ?
                'vm.runtime.targets.find(t2 => t2.isOriginal && !t2.isStage)' : String(t);
            return [`${scope}?.lookupVariableByName?.(${ctx.paramStr(node, 'name')})?.set?.(${ctx.expr(node, 'value')});`,
                ...ctx.chainStatements(node)];
        }
    },
    {
        id: 'sc-get-target',
        category: 'Scratch 交互',
        title: '获取角色/舞台对象',
        outputs: [{name: 'value', label: '对象', kind: 'data'}],
        params: [
            {name: 'which', label: '对象', type: 'select', default: '第一个角色',
                options: ['第一个角色', '舞台', '全部角色列表']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            switch (ctx.param(node, 'which')) {
            case '舞台': return 'vm.runtime.getTargetForStage()';
            case '全部角色列表': return 'vm.runtime.targets.filter(t => t.isOriginal && !t.isStage)';
            default: return 'vm.runtime.targets.find(t => t.isOriginal && !t.isStage)';
            }
        }
    },
    {
        id: 'sc-stage-size',
        category: 'Scratch 交互',
        title: '舞台尺寸',
        outputs: [
            {name: 'width', label: '宽', kind: 'data'},
            {name: 'height', label: '高', kind: 'data'}
        ],
        params: [],
        isExpression: true,
        compileExpr: (ctx, node) => {
            if (node.__outPort === 'height') return 'vm.runtime.stageHeight';
            return 'vm.runtime.stageWidth';
        }
    },
    {
        id: 'sc-timer',
        category: 'Scratch 交互',
        title: '计时器值',
        outputs: [{name: 'value', label: '秒', kind: 'data'}],
        params: [],
        isExpression: true,
        compileExpr: () => 'vm.runtime.ioDevices.clock.projectTimer()'
    },
    {
        id: 'sc-reset-timer',
        category: 'Scratch 交互',
        title: '重置计时器',
        inputs: [{name: 'exec', label: '', kind: 'exec'}],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [],
        compile: (ctx, node) => ['vm.runtime.ioDevices.clock.resetProjectTimer();', ...ctx.chainStatements(node)]
    },
    {
        id: 'sc-create-clone',
        category: 'Scratch 交互',
        title: '克隆角色',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'target', label: '目标', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'target', label: '目标(空=第一个角色)', type: 'code', default: ''}
        ],
        compile: (ctx, node) => {
            const t = ctx.param(node, 'target');
            const tgt = (t === '' || t == null) ? 'vm.runtime.targets.find(t2 => t2.isOriginal && !t2.isStage)' : String(t);
            return [`${tgt}.clone();`, ...ctx.chainStatements(node)];
        }
    },
    {
        id: 'sc-get-answer',
        category: 'Scratch 交互',
        title: '读取「回答」',
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [],
        isExpression: true,
        compileExpr: () => 'vm.runtime._pristineAnswer'
    },

    // ============================== DOM / UI ==============================
    {
        id: 'dom-console',
        category: 'DOM/UI',
        title: '控制台输出',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'value', label: '内容', kind: 'data', multi: true}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'value', label: '内容（无连线时）', type: 'code', default: "'日志'"},
            {name: 'level', label: '级别', type: 'select', default: 'log',
                options: ['log', 'info', 'warn', 'error', 'debug']}
        ],
        compile: (ctx, node) => [
            `console.${ctx.param(node, 'level') || 'log'}(${ctx.argsList(node, 'value')});`,
            ...ctx.chainStatements(node)
        ]
    },
    {
        id: 'dom-alert',
        category: 'DOM/UI',
        title: '弹出警告框',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'text', label: '文本', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'text', label: '文本', type: 'code', default: "'提示'"}],
        compile: (ctx, node) => [`alert(${ctx.expr(node, 'text')});`, ...ctx.chainStatements(node)]
    },
    {
        id: 'dom-prompt',
        category: 'DOM/UI',
        title: '输入框（返回输入值）',
        inputs: [{name: 'text', label: '提示文本', kind: 'data'}],
        outputs: [{name: 'value', label: '输入值', kind: 'data'}],
        params: [
            {name: 'text', label: '提示文本', type: 'code', default: "'输入：'"},
            {name: 'defaultValue', label: '默认值', type: 'code', default: "''"}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => `prompt(${ctx.expr(node, 'text')}, ${ctx.expr(node, 'defaultValue')})`
    },
    {
        id: 'dom-query',
        category: 'DOM/UI',
        title: '查找 DOM 元素',
        outputs: [{name: 'value', label: '元素', kind: 'data'}],
        params: [
            {name: 'selector', label: 'CSS 选择器', type: 'text', default: 'button'},
            {name: 'mode', label: '模式', type: 'select', default: 'querySelector',
                options: ['querySelector', 'querySelectorAll']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => ctx.param(node, 'mode') === 'querySelectorAll' ?
            `Array.from(document.querySelectorAll(${ctx.paramStr(node, 'selector')}))` :
            `document.querySelector(${ctx.paramStr(node, 'selector')})`
    },
    {
        id: 'dom-set-style',
        category: 'DOM/UI',
        title: '设置元素样式/属性',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'element', label: '元素', kind: 'data'},
            {name: 'value', label: '值', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'element', label: '元素（无连线时）', type: 'code', default: 'document.body'},
            {name: 'prop', label: '属性名', type: 'text', default: 'textContent'},
            {name: 'value', label: '值', type: 'code', default: "''"},
            {name: 'target', label: '写到', type: 'select', default: '属性(=)',
                options: ['属性(=)', 'style.样式', 'classList.add', 'classList.remove', 'dataset']}
        ],
        compile: (ctx, node) => {
            const el = ctx.expr(node, 'element');
            const prop = ctx.ident(node, 'prop') || 'textContent';
            const val = ctx.expr(node, 'value');
            let call;
            switch (ctx.param(node, 'target')) {
            case 'style.样式': call = `${el}.style.${prop} = ${val};`; break;
            case 'classList.add': call = `${el}.classList.add(${ctx.paramStr(node, 'prop')});`; break;
            case 'classList.remove': call = `${el}.classList.remove(${ctx.paramStr(node, 'prop')});`; break;
            case 'dataset': call = `${el}.dataset.${prop} = ${val};`; break;
            default: call = `${el}[${ctx.paramStr(node, 'prop')}] = ${val};`;
            }
            return [call, ...ctx.chainStatements(node)];
        }
    },
    {
        id: 'dom-create-element',
        category: 'DOM/UI',
        title: '创建元素并加入页面',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'text', label: '文本内容(可选)', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'tag', label: '标签名', type: 'text', default: 'div'},
            {name: 'text', label: '文本内容', type: 'code', default: "''"},
            {name: 'parent', label: '挂载到(空=body)', type: 'code', default: ''}
        ],
        compile: (ctx, node) => {
            const tag = ctx.ident(node, 'tag') || 'div';
            const parent = ctx.param(node, 'parent');
            const p = (parent === '' || parent == null) ? 'document.body' : String(parent);
            return [
                `(() => { const el = document.createElement(${q(tag)}); el.textContent = ${ctx.expr(node, 'text')}; ${p}.appendChild(el); })();`,
                ...ctx.chainStatements(node)
            ];
        }
    },

    // ============================== 网络 / 存储 / 高级 ==============================
    {
        id: 'net-fetch',
        category: '网络/存储',
        title: 'fetch 网络请求(异步)',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'url', label: 'URL', kind: 'data'},
            {name: 'body', label: '请求体(可选)', kind: 'data'}
        ],
        outputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'value', label: '结果', kind: 'data'}
        ],
        params: [
            {name: 'url', label: 'URL', type: 'text', default: 'https://api.example.com'},
            {name: 'method', label: '方法', type: 'select', default: 'GET',
                options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']},
            {name: 'body', label: '请求体(可选)', type: 'code', default: ''},
            {name: 'respType', label: '响应处理', type: 'select', default: 'json',
                options: ['json', 'text', '无(原始Response]']},
            {name: 'resultVar', label: '结果存入变量', type: 'text', default: 'fetchResult'}
        ],
        compile: (ctx, node) => {
            const method = ctx.param(node, 'method') || 'GET';
            const bodyPart = ['POST', 'PUT', 'PATCH'].includes(method) ?
                `, body: JSON.stringify(${ctx.expr(node, 'body') || 'null'})` : '';
            const rt = ctx.param(node, 'respType');
            const rtPart = rt === 'json' ? '.then(r => r.json())' :
                (rt === 'text' ? '.then(r => r.text())' : '');
            const v = ctx.ident(node, 'resultVar') || 'fetchResult';
            return [
                `${v} = await fetch(${ctx.expr(node, 'url')}, {method: ${q(method)}${bodyPart}})${rtPart};`,
                ...ctx.chainStatements(node)
            ];
        }
    },
    {
        id: 'storage-get',
        category: '网络/存储',
        title: '读取 localStorage',
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [
            {name: 'key', label: '键名', type: 'text', default: 'myKey'},
            {name: 'mode', label: '模式', type: 'select', default: '原样',
                options: ['原样', '解析JSON']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            const get = `localStorage.getItem(${ctx.paramStr(node, 'key')})`;
            return ctx.param(node, 'mode') === '解析JSON' ? `JSON.parse(${get})` : get;
        }
    },
    {
        id: 'storage-set',
        category: '网络/存储',
        title: '写入 localStorage',
        inputs: [
            {name: 'exec', label: '', kind: 'exec'},
            {name: 'value', label: '值', kind: 'data'}
        ],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'key', label: '键名', type: 'text', default: 'myKey'},
            {name: 'value', label: '值', type: 'code', default: "''"},
            {name: 'mode', label: '模式', type: 'select', default: '原样',
                options: ['原样', '序列化JSON']}
        ],
        compile: (ctx, node) => {
            const v = ctx.param(node, 'mode') === '序列化JSON' ?
                `JSON.stringify(${ctx.expr(node, 'value')})` : ctx.expr(node, 'value');
            return [`localStorage.setItem(${ctx.paramStr(node, 'key')}, ${v});`, ...ctx.chainStatements(node)];
        }
    },
    {
        id: 'misc-set-timeout',
        category: '网络/存储',
        title: '定时器（子图回调）',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'mode', label: '模式', type: 'select', default: 'setTimeout',
                options: ['setTimeout', 'setInterval']},
            {name: 'ms', label: '毫秒', type: 'number', default: 1000},
            {name: 'bodyGraph', label: '回调（双击编辑）', type: 'graph'}
        ],
        isEvent: true,
        compile: (ctx, node) => `${ctx.param(node, 'mode') || 'setTimeout'}(() => {
${ctx.subGraph(node, 'bodyGraph', 1)}
}, ${ctx.param(node, 'ms') || 1000});`
    },
    {
        id: 'misc-random',
        category: '网络/存储',
        title: '随机数',
        inputs: [
            {name: 'min', label: '最小', kind: 'data'},
            {name: 'max', label: '最大', kind: 'data'}
        ],
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [
            {name: 'min', label: '最小（无连线时）', type: 'number', default: 1},
            {name: 'max', label: '最大（无连线时）', type: 'number', default: 10},
            {name: 'mode', label: '模式', type: 'select', default: '整数范围',
                options: ['整数范围', '0~1 小数', 'UUID']}
        ],
        isExpression: true,
        compileExpr: (ctx, node) => {
            switch (ctx.param(node, 'mode')) {
            case '0~1 小数': return 'Math.random()';
            case 'UUID': return 'crypto.randomUUID()';
            default: return `Math.floor(Math.random() * ((${ctx.expr(node, 'max')}) - (${ctx.expr(node, 'min')}) + 1) + (${ctx.expr(node, 'min')}))`;
            }
        }
    },
    {
        id: 'misc-expression',
        category: '网络/存储',
        title: '★ 任意 JS 表达式',
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [{name: 'code', label: 'JS 表达式', type: 'code',
            default: 'Date.now()', multiline: true}],
        isExpression: true,
        compileExpr: (ctx, node) => `(${ctx.param(node, 'code') || 'undefined'})`
    },
    {
        id: 'misc-statement',
        category: '网络/存储',
        title: '★ 任意 JS 语句',
        inputs: [{name: 'exec', label: '', kind: 'exec'}],
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [{name: 'code', label: 'JS 语句', type: 'code',
            default: '// 在此写任意 JS', multiline: true}],
        compile: (ctx, node) => [String(ctx.param(node, 'code') || '').trim() || ';']
    },
    {
        id: 'misc-await',
        category: '网络/存储',
        title: 'await 表达式（异步）',
        inputs: [{name: 'value', label: 'Promise', kind: 'data'}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [{name: 'value', label: 'Promise（无连线时）', type: 'code', default: 'Promise.resolve(1)'}],
        isExpression: true,
        compileExpr: (ctx, node) => `(await (${ctx.expr(node, 'value')}))`
    },
    {
        id: 'misc-promise-all',
        category: '网络/存储',
        title: 'Promise.all',
        inputs: [{name: 'value', label: 'Promise 列表', kind: 'data'}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [{name: 'value', label: '列表（无连线时）', type: 'code', default: '[]'}],
        isExpression: true,
        compileExpr: (ctx, node) => `(await Promise.all(${ctx.expr(node, 'value')}))`
    },

    // ============================== 扩展专用（积木定义） ==============================
    {
        id: 'ext-define-block',
        category: '扩展积木',
        title: '定义积木（子图=积木逻辑）',
        outputs: [{name: 'exec', label: '', kind: 'exec'}],
        params: [
            {name: 'opcode', label: '积木 opcode', type: 'text', default: 'myBlock'},
            {name: 'text', label: '积木文本（[参数] 占位）', type: 'text', default: '我的积木 [A]'},
            {name: 'blockType', label: '积木类型', type: 'select', default: 'command',
                options: ['command', 'reporter', 'boolean']},
            {name: 'args', label: '参数定义(JSON数组)', type: 'code',
                default: '[{"type": "input_value", "name": "A", "default": "1"}]'},
            {name: 'bodyGraph', label: '积木逻辑（双击编辑）', type: 'graph'}
        ],
        isExtensionBlock: true,
        compile: () => [] // 由 compile.js 顶层展开
    },
    {
        id: 'ext-block-arg',
        category: '扩展积木',
        title: '积木参数值',
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [{name: 'argName', label: '参数名', type: 'text', default: 'A'}],
        isExpression: true,
        onlyInBlockBody: true,
        compileExpr: (ctx, node) => `args[${ctx.paramStr(node, 'argName')}]`
    },

    // ============================== 插件专用 ==============================
    {
        id: 'addon-api',
        category: '插件 API',
        title: 'addon API 对象',
        outputs: [{name: 'value', label: 'addon', kind: 'data'}],
        params: [],
        isExpression: true,
        addonOnly: true,
        compileExpr: () => 'addon'
    },
    {
        id: 'addon-tab',
        category: '插件 API',
        title: 'addon.tab（编辑器 API）',
        outputs: [{name: 'value', label: 'tab', kind: 'data'}],
        params: [],
        isExpression: true,
        addonOnly: true,
        compileExpr: () => 'addon.tab'
    },
    {
        id: 'addon-scratch',
        category: '插件 API',
        title: 'addon.scratch（vm 等）',
        outputs: [{name: 'value', label: '对象', kind: 'data'}],
        params: [
            {name: 'member', label: '成员', type: 'select', default: 'vm',
                options: ['vm', 'blocks', 'renderer']}
        ],
        isExpression: true,
        addonOnly: true,
        compileExpr: (ctx, node) => `addon.scratch.${ctx.param(node, 'member') || 'vm'}`
    },
    {
        id: 'addon-settings-get',
        category: '插件 API',
        title: '读取插件设置项',
        outputs: [{name: 'value', label: '值', kind: 'data'}],
        params: [{name: 'settingId', label: '设置 ID', type: 'text', default: 'mySetting'}],
        isExpression: true,
        addonOnly: true,
        compileExpr: (ctx, node) => `addon.settings.get(${ctx.paramStr(node, 'settingId')})`
    },
    {
        id: 'addon-wait',
        category: '插件 API',
        title: '等待条件成立(轮询)',
        inputs: [{name: 'condition', label: '条件', kind: 'data'}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [
            {name: 'condition', label: '条件（无连线时）', type: 'code', default: 'true'},
            {name: 'interval', label: '轮询间隔(ms)', type: 'number', default: 100}
        ],
        isExpression: true,
        addonOnly: true,
        compileExpr: (ctx, node) => `(await (async () => { while (!(${ctx.expr(node, 'condition')})) await new Promise(r => setTimeout(r, ${ctx.param(node, 'interval') || 100})); })())`
    },
    {
        id: 'addon-wait-for-element',
        category: '插件 API',
        title: '等待 DOM 元素出现',
        outputs: [{name: 'value', label: '元素', kind: 'data'}],
        params: [
            {name: 'selector', label: 'CSS 选择器', type: 'text', default: 'button'},
            {name: 'mode', label: '模式', type: 'select', default: 'waitForElement',
                options: ['waitForElement']}
        ],
        isExpression: true,
        addonOnly: true,
        compileExpr: (ctx, node) => `(await addon.tab.waitForElement(${ctx.paramStr(node, 'selector')}))`
    },
    {
        id: 'addon-append-css',
        category: '插件 API',
        title: '注入自定义 CSS',
        outputs: [{name: 'value', label: 'style元素', kind: 'data'}],
        params: [{name: 'css', label: 'CSS 文本', type: 'code', default: 'body{color:red}', multiline: true}],
        isExpression: true,
        addonOnly: true,
        compileExpr: (ctx, node) => `(() => { const s = document.createElement('style'); s.textContent = ${ctx.paramStr(node, 'css')}; document.head.appendChild(s); return s; })()`
    },
    {
        id: 'addon-msg',
        category: '插件 API',
        title: '翻译文本 msg()',
        inputs: [{name: 'text', label: '默认文本', kind: 'data'}],
        outputs: [{name: 'value', label: '结果', kind: 'data'}],
        params: [{name: 'text', label: '默认文本', type: 'code', default: "'我的文本'"}],
        isExpression: true,
        addonOnly: true,
        compileExpr: (ctx, node) => `msg(${ctx.expr(node, 'text')})`
    }
];

// 索引与分类
const TYPE_MAP = new Map(NODE_TYPES.map(t => [t.id, t]));
const CATEGORIES = [...new Set(NODE_TYPES.map(t => t.category))];

const getType = id => TYPE_MAP.get(id);

export {NODE_TYPES, TYPE_MAP, CATEGORIES, getType, lit, q};
