import VM from 'scratch-vm';
import Sprite from 'scratch-vm/src/sprites/sprite';
import RenderedTarget from 'scratch-vm/src/sprites/rendered-target';

/**
 * 变量管理器里新增的「舞台监视器」开关依赖两条 VM 行为，这里把它们钉住：
 * 1. 变量/列表的 monitor block id 就是变量 id，改它的 checkbox 等价于勾选积木面板里的复选框；
 * 2. 监视器工作区里没有对应积木时 changeBlock 会静默失效，需要 requestAddMonitor 兜底。
 */
const makeRuntime = () => {
    const vm = new VM();
    const stage = new RenderedTarget(new Sprite({name: 'Stage'}), vm.runtime);
    stage.isStage = true;
    vm.runtime.addTarget(stage);
    stage.createVariable('var1', 'score', '');
    stage.createVariable('list1', 'items', 'list');
    return {vm, stage};
};

const monitorFor = (vm, id) => {
    const state = vm.runtime.getMonitorState();
    return state && typeof state.get === 'function' ? state.get(id) : state[id];
};

describe('舞台监视器开关', () => {
    test('变量与列表都建好了', () => {
        const {stage} = makeRuntime();
        expect(stage.variables.var1.name).toBe('score');
        expect(stage.variables.list1.type).toBe('list');
    });

    test('有 monitor 积木时，勾选 checkbox 会点亮监视器', () => {
        const {vm} = makeRuntime();
        vm.runtime.monitorBlocks.createBlock({
            id: 'var1',
            opcode: 'data_variable',
            fields: {VARIABLE: {id: 'var1', name: 'score'}},
            isMonitored: false,
            topLevel: false,
            shadow: false
        });
        vm.runtime.monitorBlocks.changeBlock({id: 'var1', element: 'checkbox', value: true}, vm.runtime);
        const monitor = monitorFor(vm, 'var1');
        expect(monitor).toBeTruthy();
        expect(monitor.visible).toBe(true);
        expect(monitor.opcode).toBe('data_variable');
        expect(monitor.mode).toBe('default');
    });

    test('取消勾选只隐藏，不删除记录', () => {
        const {vm} = makeRuntime();
        vm.runtime.monitorBlocks.createBlock({
            id: 'var1',
            opcode: 'data_variable',
            fields: {VARIABLE: {id: 'var1', name: 'score'}},
            isMonitored: false,
            topLevel: false,
            shadow: false
        });
        vm.runtime.monitorBlocks.changeBlock({id: 'var1', element: 'checkbox', value: true}, vm.runtime);
        vm.runtime.monitorBlocks.changeBlock({id: 'var1', element: 'checkbox', value: false}, vm.runtime);
        const monitor = monitorFor(vm, 'var1');
        expect(monitor).toBeTruthy();
        expect(monitor.visible).toBe(false);
    });

    test('列表勾选后是列表模式', () => {
        const {vm} = makeRuntime();
        vm.runtime.monitorBlocks.createBlock({
            id: 'list1',
            opcode: 'data_listcontents',
            fields: {LIST: {id: 'list1', name: 'items'}},
            isMonitored: false,
            topLevel: false,
            shadow: false
        });
        vm.runtime.monitorBlocks.changeBlock({id: 'list1', element: 'checkbox', value: true}, vm.runtime);
        const monitor = monitorFor(vm, 'list1');
        expect(monitor.visible).toBe(true);
        expect(monitor.mode).toBe('list');
        expect(monitor.opcode).toBe('data_listcontents');
    });

    test('没有 monitor 积木时 changeBlock 静默失效（因此需要兜底）', () => {
        const {vm} = makeRuntime();
        vm.runtime.monitorBlocks.changeBlock({id: 'var1', element: 'checkbox', value: true}, vm.runtime);
        expect(monitorFor(vm, 'var1')).toBeFalsy();
    });

    test('兜底：直接补一条监视器记录也能显示', () => {
        const {vm, stage} = makeRuntime();
        vm.runtime.requestAddMonitor({
            id: 'var1',
            targetId: null,
            spriteName: null,
            opcode: 'data_variable',
            params: {VARIABLE: stage.variables.var1.name},
            visible: true,
            mode: 'default',
            value: '',
            x: 5,
            y: 5,
            width: 0,
            height: 0,
            sliderMin: 0,
            sliderMax: 100,
            isDiscrete: true
        });
        const monitor = monitorFor(vm, 'var1');
        expect(monitor).toBeTruthy();
        expect(monitor.visible).toBe(true);
    });
});
