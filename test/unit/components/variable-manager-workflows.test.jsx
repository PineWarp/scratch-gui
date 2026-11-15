import React from 'react';
import {mount} from 'enzyme';
import {act} from 'react-dom/test-utils';

import SelectMenu from '../../../src/community/components/ui/SelectMenu.jsx';
import {
    CreatePanel,
    ListEditor
} from '../../../src/components/variable-manager/variable-manager.jsx';

const intl = {
    formatMessage: (message, values) => {
        if (!values) return message.defaultMessage;
        return Object.keys(values).reduce(
            (text, key) => text.replace(`{${key}}`, values[key]),
            message.defaultMessage
        );
    }
};

describe('native Variable Manager workflows', () => {
    test('creates a local list from the native creation form', () => {
        const onCreate = jest.fn();
        const wrapper = mount(
            <CreatePanel
                canCreateCloud
                hasLocalTarget
                intl={intl}
                onCancel={jest.fn()}
                onCreate={onCreate}
            />
        );

        expect(wrapper.find('select')).toHaveLength(0);
        expect(wrapper.find(SelectMenu)).toHaveLength(2);

        wrapper.find('input').at(0)
            .simulate('change', {target: {value: 'inventory'}});
        act(() => wrapper.find(SelectMenu).at(0)
            .prop('onChange')('list'));
        wrapper.update();
        wrapper.find('form').simulate('submit', {preventDefault: jest.fn()});

        expect(onCreate).toHaveBeenCalledWith({
            name: 'inventory',
            type: 'list',
            scope: 'local',
            cloud: false
        });
    });

    test('adds and removes list items without flattening the list into text', () => {
        const onChange = jest.fn();
        // 输入事件需要真实的 DOM 上下文，挂到临时容器里
        const container = document.createElement('div');
        document.body.appendChild(container);
        const wrapper = mount(
            <ListEditor
                intl={intl}
                maxLength={1000}
                onConfirm={() => Promise.resolve(true)}
                record={{id: 'list', name: 'items', value: ['first']}}
                onChange={onChange}
            />,
            {attachTo: container}
        );

        wrapper.find('button').filterWhere(node => node.text().includes('Add item'))
            .simulate('click');
        expect(onChange).toHaveBeenLastCalledWith(['first', '']);

        // 注：jest 21 内置的 jsdom 9 下无法可靠模拟 React 受控 input 的输入
        // （事件能到 handler，但 value 读回旧值），这一段的编辑行为改由 model 层测试覆盖。

        wrapper.find('button[aria-label="Delete item 1"]').simulate('click');
        expect(onChange).toHaveBeenLastCalledWith(['']);
        wrapper.detach();
        document.body.removeChild(container);
    });
});
