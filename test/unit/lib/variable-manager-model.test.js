import VM from 'scratch-vm';
import Sprite from 'scratch-vm/src/sprites/sprite';
import RenderedTarget from 'scratch-vm/src/sprites/rendered-target';

import {
    collectVariables,
    createVariable,
    ERROR_CODES,
    monitorVisible,
    normalizeName,
    setMonitorVisible,
    validateName
} from '../../../src/lib/variable-manager/model.js';
import VariableManager from '../../../src/components/variable-manager/variable-manager.jsx';
import TWVariableManager from '../../../src/containers/tw-variable-manager.jsx';

const makeVm = () => {
    const vm = new VM();
    const stage = new RenderedTarget(new Sprite({name: 'Stage'}), vm.runtime);
    stage.isStage = true;
    vm.runtime.addTarget(stage);

    const sprite = new RenderedTarget(new Sprite({name: '甲虫'}), vm.runtime);
    sprite.sprite.name = '甲虫';
    vm.runtime.addTarget(sprite);

    stage.createVariable('g1', '我的变量', '');
    stage.createVariable('g2', '全局列表', 'list');
    sprite.createVariable('l1', '局部变量', '');
    vm.runtime.setEditingTarget(sprite);

    stage.variables.g1.value = 42;
    stage.variables.g2.value = ['苹果', '香蕉'];
    sprite.variables.l1.value = '你好';

    return {vm, stage, sprite};
};

describe('变量管理器数据层', () => {
    test('收集当前角色局部变量与全局变量', () => {
        const {vm} = makeVm();
        const records = collectVariables(vm);
        expect(records.map(record => record.id).sort()).toEqual(['g1', 'g2', 'l1']);
        const global = records.find(record => record.id === 'g1');
        expect(global.scope).toBe('global');
        expect(global.type).toBe('variable');
        expect(global.value).toBe(42);
        const list = records.find(record => record.id === 'g2');
        expect(list.type).toBe('list');
        expect(list.value).toEqual(['苹果', '香蕉']);
        const local = records.find(record => record.id === 'l1');
        expect(local.scope).toBe('local');
        expect(local.targetName).toBe('甲虫');
    });

    test('按名称排序（大小写不敏感的 localeCompare）', () => {
        const {vm, stage} = makeVm();
        stage.createVariable('g3', 'aaa', '');
        stage.createVariable('g4', 'BBB', '');
        const names = collectVariables(vm).map(record => record.name);
        const expected = names.slice().sort((a, b) => (
            a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())
        ));
        expect(names).toEqual(expected);
        // 大小写不敏感：aaa 必须排在 BBB 之前
        expect(names.indexOf('aaa')).toBeLessThan(names.indexOf('BBB'));
    });

    test('名称校验返回语义码而不是文案', () => {
        const {vm} = makeVm();
        const records = collectVariables(vm);
        expect(validateName(records, '   ')).toEqual({ok: false, error: ERROR_CODES.NAME_REQUIRED});
        expect(validateName(records, '我的变量')).toEqual({ok: false, error: ERROR_CODES.NAME_TAKEN});
        // 类型不同可以重名
        expect(validateName(records, '我的变量', {type: 'list'}).ok).toBe(true);
        // 排除自身
        expect(validateName(records, '我的变量', {excludeId: 'g1'}).ok).toBe(true);
        expect(validateName(records, '新名字')).toEqual({ok: true, name: '新名字'});
    });

    test('云变量名带 ☁ 前缀且不重复叠加', () => {
        expect(normalizeName('积分', true)).toBe('☁ 积分');
        expect(normalizeName('☁ 积分', true)).toBe('☁ 积分');
        expect(normalizeName('积分', false)).toBe('积分');
    });

    test('监视器开关在缺少 monitor 积木时返回 false', () => {
        const {vm} = makeVm();
        const record = collectVariables(vm).find(item => item.id === 'g1');
        expect(monitorVisible(vm, 'g1')).toBe(false);
        expect(setMonitorVisible(vm, record, true)).toBe(false);
    });

    test('有 monitor 积木时能显示监视器', () => {
        const {vm} = makeVm();
        vm.runtime.monitorBlocks.createBlock({
            id: 'g1',
            opcode: 'data_variable',
            fields: {VARIABLE: {id: 'g1', name: '我的变量'}},
            isMonitored: false,
            topLevel: false,
            shadow: false
        });
        const record = collectVariables(vm).find(item => item.id === 'g1');
        expect(setMonitorVisible(vm, record, true)).toBe(true);
        expect(monitorVisible(vm, 'g1')).toBe(true);
        setMonitorVisible(vm, record, false);
        expect(monitorVisible(vm, 'g1')).toBe(false);
    });

    test('没有代码工作区时创建变量会给出语义码', () => {
        const {vm} = makeVm();
        const records = collectVariables(vm);
        expect(() => createVariable(null, records, {name: 'x', type: 'variable', scope: 'global'}))
            .toThrow();
        try {
            createVariable(null, records, {name: 'x', type: 'variable', scope: 'global'});
        } catch (e) {
            expect(e.code).toBe(ERROR_CODES.WORKSPACE_NOT_READY);
        }
    });
});

describe('变量管理器组件', () => {
    test('组件与容器可以被加载', () => {
        expect(VariableManager).toBeTruthy();
        expect(TWVariableManager).toBeTruthy();
    });
});
