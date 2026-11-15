import React from 'react';
import {mount} from 'enzyme';
import IntlMessageFormat from 'intl-messageformat';

import ProjectAnalysis from '../../../src/components/menu-bar/project-analysis.jsx';
import en from '../../../src/addons/addons-l10n/en.json';

// 用真实的 addon 语言包做 msg，顺带验证键名没有拼错
const msg = (id, values) => {
    const template = en[`block-count/${id}`] || id;
    return new IntlMessageFormat(template, 'en').format(values);
};

const makeBlocks = () => ({
    hat: {
        id: 'hat', opcode: 'event_whenflagclicked', next: 'say', parent: null,
        topLevel: true, inputs: {}, fields: {}
    },
    say: {
        id: 'say', opcode: 'looks_say', next: null, parent: 'hat',
        inputs: {}, fields: {}
    }
});

const makeVm = ({empty = false} = {}) => {
    const blocks = empty ? {} : makeBlocks();
    const runtime = {
        targets: empty ? [] : [{
            id: 'target1',
            isStage: false,
            isOriginal: true,
            getName: () => 'Cat',
            blocks: {_blocks: blocks, getScripts: () => (empty ? [] : ['hat'])},
            variables: {},
            sprite: {name: 'Cat', costumes: [{}], sounds: []}
        }],
        on: () => {},
        off: () => {}
    };
    return {
        on: () => {},
        off: () => {},
        runtime
    };
};

const mountPanel = (props = {}) => mount(
    <ProjectAnalysis
        msg={msg}
        onShowScript={() => {}}
        vm={makeVm()}
        {...props}
    />
);

describe('项目复杂度面板', () => {
    test('渲染侧栏与概览页', () => {
        const wrapper = mountPanel();
        const text = wrapper.text();
        expect(text).toContain('Overview');
        expect(text).toContain('Total Blocks');
        expect(text).toContain('Complexity');
        expect(text).toContain('Refresh');
        // 两份积木 / 一个脚本
        expect(text).toContain('2');
    });

    test('侧栏按钮带 value，点击可切页', () => {
        const wrapper = mountPanel();
        const items = wrapper.find('button[value]');
        expect(items.length).toBeGreaterThanOrEqual(2);
        const codeItem = items.filterWhere(node => node.prop('value') === 'code');
        expect(codeItem.length).toBe(1);
        codeItem.first().simulate('click');
        expect(wrapper.text()).toContain('Block distribution');
    });

    test('空项目显示空状态', () => {
        const wrapper = mountPanel({vm: makeVm({empty: true})});
        expect(wrapper.text()).toContain('No blocks yet');
        expect(wrapper.text()).toContain('Add blocks to a sprite and the analysis will update.');
    });

    test('点击最复杂脚本时回调编辑器跳转', () => {
        const onShowScript = jest.fn();
        const wrapper = mountPanel({onShowScript});
        wrapper.find('button[value="scripts"]').first().simulate('click');
        const rows = wrapper.find('button[data-script-id]');
        expect(rows.length).toBeGreaterThanOrEqual(1);
        rows.first().simulate('click');
        expect(onShowScript).toHaveBeenCalledTimes(1);
        expect(onShowScript.mock.calls[0][0]).toEqual(
            expect.objectContaining({id: 'hat', targetId: 'target1'}));
    });

    test('分类名走翻译而不是原始 opcode', () => {
        const wrapper = mountPanel();
        const codeItem = wrapper.find('button[value="code"]').first();
        codeItem.simulate('click');
        const text = wrapper.text();
        expect(text).toContain('Events');
        expect(text).toContain('Looks');
        expect(text).not.toContain('event_whenflagclicked');
    });
});
