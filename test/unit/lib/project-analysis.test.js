import {analyzeProject, humanizeOpcode} from '../../../src/lib/menu-bar/project-analysis-data.js';

const makeBlocks = (extra = {}) => Object.assign({
    hat: {
        id: 'hat', opcode: 'event_whenflagclicked', next: 'loop', parent: null,
        topLevel: true, inputs: {}, fields: {}
    },
    loop: {
        id: 'loop', opcode: 'control_repeat', next: null, parent: 'hat',
        inputs: {SUBSTACK: {block: 'say'}}, fields: {}
    },
    say: {
        id: 'say', opcode: 'looks_say', next: null, parent: 'loop',
        inputs: {}, fields: {}
    },
    text: {
        id: 'text', opcode: 'text', next: null, parent: 'say', shadow: true,
        inputs: {}, fields: {TEXT: {value: 'hi'}}
    }
}, extra);

const makeTarget = (overrides = {}) => {
    const blocks = makeBlocks(overrides.blocks || {});
    return Object.assign({
        id: 'target1',
        isStage: false,
        isOriginal: true,
        getName: () => 'Cat',
        blocks: {
            _blocks: blocks,
            getScripts: () => ['hat']
        },
        variables: {
            v1: {id: 'v1', name: 'score', type: ''},
            l1: {id: 'l1', name: 'items', type: 'list'}
        },
        sprite: {name: 'Cat', costumes: [{}, {}], sounds: [{}]}
    }, overrides.target || {});
};

const makeRuntime = targets => ({targets});

describe('项目分析数据', () => {
    test('统计积木、脚本、造型、声音与数据', () => {
        const metrics = analyzeProject(makeRuntime([makeTarget()]));
        // 影子积木不计入
        expect(metrics.blockCount).toBe(3);
        expect(metrics.scriptCount).toBe(1);
        expect(metrics.spriteCount).toBe(1);
        expect(metrics.costumeCount).toBe(2);
        expect(metrics.soundCount).toBe(1);
        expect(metrics.scalarCount).toBe(1);
        expect(metrics.listCount).toBe(1);
        expect(metrics.conditionalCount).toBe(0);
        expect(metrics.loopCount).toBe(1);
        expect(metrics.eventCount).toBe(1);
        expect(metrics.maxDepth).toBe(1);
        expect(metrics.longestScript).toBe(3);
    });

    test('复杂度评分在 0-100 之间且随规模上升', () => {
        const small = analyzeProject(makeRuntime([makeTarget()]));
        const many = {};
        for (let i = 0; i < 40; i++) {
            many[`b${i}`] = {
                id: `b${i}`, opcode: i % 2 ? 'motion_movesteps' : 'control_if',
                next: null, parent: null, topLevel: true, inputs: {}, fields: {}
            };
        }
        const big = analyzeProject(makeRuntime([makeTarget({blocks: many})]));
        expect(small.complexityScore).toBeGreaterThanOrEqual(0);
        expect(big.complexityScore).toBeLessThanOrEqual(100);
        expect(big.complexityScore).toBeGreaterThan(small.complexityScore);
    });

    test('按角色统计并剔除舞台', () => {
        const stage = makeTarget({
            target: {id: 'stage', isStage: true, getName: () => 'Stage', blocks: {}}
        });
        stage.blocks = {_blocks: {}, getScripts: () => []};
        const metrics = analyzeProject(makeRuntime([makeTarget(), stage]));
        expect(metrics.spriteCount).toBe(1);
        expect(metrics.targets).toHaveLength(2);
        // 按积木数降序
        expect(metrics.targets[0].blocks).toBeGreaterThanOrEqual(metrics.targets[1].blocks);
    });

    test('给出嵌套与长度的改进建议', () => {
        const deep = makeBlocks({
            loop2: {id: 'loop2', opcode: 'control_forever', next: null, parent: 'loop',
                inputs: {SUBSTACK: {block: 'loop3'}}, fields: {}},
            loop3: {id: 'loop3', opcode: 'control_forever', next: null, parent: 'loop2',
                inputs: {SUBSTACK: {block: 'loop4'}}, fields: {}},
            loop4: {id: 'loop4', opcode: 'control_forever', next: null, parent: 'loop3',
                inputs: {SUBSTACK: {block: 'say'}}, fields: {}}
        });
        deep.loop.inputs.SUBSTACK = {block: 'loop2'};
        const metrics = analyzeProject(makeRuntime([makeTarget({blocks: deep})]));
        expect(metrics.maxDepth).toBeGreaterThanOrEqual(4);
        expect(metrics.recommendations.map(item => item.id)).toContain('nesting');
        expect(metrics.scripts[0].depth).toBeUndefined();
        expect(metrics.scripts[0].maxDepth).toBeGreaterThanOrEqual(4);
    });

    test('空项目不报错', () => {
        const metrics = analyzeProject({targets: []});
        expect(metrics.blockCount).toBe(0);
        expect(metrics.scriptCount).toBe(0);
        expect(metrics.complexityScore).toBe(0);
        expect(metrics.categories).toEqual([]);
        expect(metrics.scripts).toEqual([]);
    });

    test('积木名可读化', () => {
        expect(humanizeOpcode('event_whenflagclicked')).toBe('Green flag');
        expect(humanizeOpcode('motion_movesteps')).toBe('Movesteps');
    });
});
