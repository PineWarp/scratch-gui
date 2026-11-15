import React from 'react';
import {mount, shallow} from 'enzyme';
import {IntlProvider} from 'react-intl';

import ListMonitor from '../../../src/components/monitor/list-monitor.jsx';
import MonitorList from '../../../src/components/monitor-list/monitor-list.jsx';
import MonitorContainer from '../../../src/containers/monitor.jsx';

const mountWithIntl = node => mount(<IntlProvider locale="en">{node}</IntlProvider>);

const noop = () => {};

describe('列表监视器', () => {
    const baseProps = {
        label: 'mylist',
        width: 120,
        height: 200,
        value: ['a', 'b'],
        categoryColor: {background: '#fff', text: '#000'},
        activeIndex: null,
        activeValue: '',
        onActivate: () => {},
        onDeactivate: () => {},
        onFocus: () => {},
        onInput: () => {},
        onKeyPress: () => {},
        onRemove: () => {},
        onResizeMouseDown: () => {},
        onAdd: () => {}
    };

    test('可拖拽时 + 按钮可点击并带无障碍标签', () => {
        const onAdd = jest.fn();
        const wrapper = mountWithIntl(
            <ListMonitor
                {...baseProps}
                draggable
                onAdd={onAdd}
            />
        );
        const addButton = wrapper.find('button[aria-label="Add list item"]');
        expect(addButton.length).toBe(1);
        expect(addButton.prop('disabled')).toBe(false);
        addButton.simulate('click');
        expect(onAdd).toHaveBeenCalled();
    });

    test('不可拖拽时 + 按钮禁用', () => {
        const wrapper = mountWithIntl(<ListMonitor {...baseProps} />);
        const addButton = wrapper.find('button[aria-label="Add list item"]');
        expect(addButton.prop('disabled')).toBe(true);
    });

    test('值渲染成可编辑按钮，点击进入编辑', () => {
        const onActivate = jest.fn();
        const wrapper = mountWithIntl(
            <ListMonitor
                {...baseProps}
                draggable
                onActivate={onActivate}
            />
        );
        const scroller = wrapper.find('ListMonitorScroller').instance();
        const tree = scroller.rowRenderer({index: 0, key: 'k', style: {}});
        const valueCell = tree.props.children[1];
        expect(valueCell.type).toBe('button');
        expect(valueCell.props['aria-label']).toBe('Edit list item 1');
        valueCell.props.onClick();
        expect(onActivate).toHaveBeenCalledWith(0);
    });

    test('编辑态渲染输入框与删除按钮', () => {
        const onRemove = jest.fn();
        const wrapper = mountWithIntl(
            <ListMonitor
                {...baseProps}
                draggable
                activeIndex={0}
                activeValue={'a'}
                onRemove={onRemove}
            />
        );
        const scroller = wrapper.find('ListMonitorScroller').instance();
        const tree = scroller.rowRenderer({index: 0, key: 'k', style: {}});
        const cell = tree.props.children[1];
        expect(cell.type).toBe('div');
        const inputWrapper = cell.props.children;
        expect(inputWrapper.props.children[0].type).toBe('input');
        const remove = inputWrapper.props.children[1];
        expect(remove.type).toBe('button');
        expect(remove.props['aria-label']).toBe('Delete list item');
        remove.props.onMouseDown();
        expect(onRemove).toHaveBeenCalled();
    });

    test('不可拖拽时不渲染按钮', () => {
        const wrapper = mountWithIntl(<ListMonitor {...baseProps} />);
        const scroller = wrapper.find('ListMonitorScroller').instance();
        const tree = scroller.rowRenderer({index: 0, key: 'k', style: {}});
        expect(tree.props.children[1].type).toBe('div');
    });
});

describe('监视器列表', () => {
    test('monitors 为空时不渲染且不崩溃', () => {
        const wrapper = shallow(
            <MonitorList
                draggable
                monitors={null}
                stageSize={{width: 480, height: 360}}
                onMonitorChange={noop}
            />
        );
        expect(wrapper.find(MonitorContainer).length).toBe(0);
    });

    test('接受任何带 valueSeq 的集合（不再要求 Immutable OrderedMap）', () => {
        const monitors = {
            valueSeq: () => [
                {
                    id: 'v1',
                    visible: true,
                    mode: 'default',
                    opcode: 'data_variable',
                    targetId: 't1',
                    value: 1,
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 30
                }
            ]
        };
        const wrapper = shallow(
            <MonitorList
                draggable
                monitors={monitors}
                stageSize={{width: 480, height: 360}}
                onMonitorChange={noop}
            />
        );
        expect(wrapper.find(MonitorContainer).length).toBe(1);
    });
});
