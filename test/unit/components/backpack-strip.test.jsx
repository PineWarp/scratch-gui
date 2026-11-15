import React from 'react';
import {mount} from 'enzyme';
import {IntlProvider} from 'react-intl';
import {Provider} from 'react-redux';
import configureStore from 'redux-mock-store';

import Backpack from '../../../src/components/backpack/backpack.jsx';
import BackpackItem from '../../../src/components/backpack/backpack-item.jsx';

const store = configureStore()({
    scratchGui: {
        assetDrag: {dragging: false, currentOffset: null}
    }
});

const contents = [
    {id: '1', name: 'Jump', type: 'script', thumbnailUrl: 'data:image/svg+xml,<svg/>'},
    {id: '2', name: 'Cat', type: 'sprite', thumbnailUrl: null}
];

const noop = () => {};

const itemProps = {
    onClick: noop,
    onDelete: noop,
    onRenameCancel: noop,
    onRenameStart: noop,
    onRenameSubmit: noop
};

const mountBackpack = extra => mount(
    <Provider store={store}>
        <IntlProvider locale="en">
            <Backpack {...extra} />
        </IntlProvider>
    </Provider>
);

describe('书包底部条渲染', () => {
    test('折叠时只渲染抬头，显示总数', () => {
        const wrapper = mountBackpack({contents, totalCount: 2});
        expect(wrapper.find('button[aria-expanded=false]').length).toBe(1);
        expect(wrapper.text()).toContain('Backpack');
        expect(wrapper.text()).toContain('2');
        expect(wrapper.text()).not.toContain('Jump');
    });

    test('展开时渲染筛选、搜索与条目', () => {
        const wrapper = mountBackpack({
            contents,
            expanded: true,
            totalCount: 2,
            height: 200
        });
        expect(wrapper.find('input[type="search"]').length).toBe(1);
        expect(wrapper.find('button[aria-expanded=true]').length).toBe(1);
        expect(wrapper.text()).toContain('Jump');
        expect(wrapper.text()).toContain('Cat');
        // 筛选按钮：全部 / 脚本 / 角色 / 造型 / 声音
        expect(wrapper.find('button[aria-pressed]').length).toBeGreaterThanOrEqual(5);
    });

    test('空书包展开时给出提示', () => {
        const wrapper = mountBackpack({contents: [], expanded: true, totalCount: 0});
        expect(wrapper.text()).toContain('Backpack is empty');
    });

    test('搜索无结果时提示不同文案', () => {
        const wrapper = mountBackpack({
            contents: [],
            expanded: true,
            searchQuery: 'zzz',
            totalCount: 0
        });
        expect(wrapper.text()).toContain('No matching backpack items');
    });

    test('加载态与错误态互斥显示', () => {
        const loading = mountBackpack({contents: [], expanded: true, loading: true});
        expect(loading.text()).toContain('Loading...');
        const failed = mountBackpack({contents: [], expanded: true, error: 'boom'});
        expect(failed.text()).toContain('Error loading backpack');
    });
});

describe('书包条目渲染', () => {
    const mountItem = extra => mount(
        <Provider store={store}>
            <IntlProvider locale="en">
                <BackpackItem
                    item={{id: '1', name: '', type: 'script'}}
                    {...itemProps}
                    {...extra}
                />
            </IntlProvider>
        </Provider>
    );

    test('未命名脚本显示 Script', () => {
        const wrapper = mountItem({});
        expect(wrapper.text()).toContain('Script');
    });

    test('重命名态渲染输入框', () => {
        const wrapper = mountItem({
            item: {id: '1', name: 'Jump', type: 'script'},
            renaming: true,
            canRename: true
        });
        expect(wrapper.find('input[type="text"]').length).toBe(1);
    });

    test('点击瓦片插入条目', () => {
        const onClick = jest.fn();
        const wrapper = mountItem({item: {id: '7', name: 'Jump', type: 'script'}, onClick});
        wrapper.find('BackpackItem').instance()
            .handleTileClick({detail: 1, stopPropagation: noop});
        expect(onClick).toHaveBeenCalledWith('7');
    });

    test('回车键插入条目', () => {
        const onClick = jest.fn();
        const wrapper = mountItem({item: {id: '9', name: 'Jump', type: 'script'}, onClick});
        const preventDefault = jest.fn();
        wrapper.find('BackpackItem').instance()
            .handleKeyDown({key: 'Enter', preventDefault});
        expect(onClick).toHaveBeenCalledWith('9');
        expect(preventDefault).toHaveBeenCalled();
    });
});
