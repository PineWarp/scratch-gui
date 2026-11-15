import React from 'react';
import {act} from 'react-dom/test-utils';
import {mount} from 'enzyme';

import Dropdown from '../../../src/community/components/ui/Dropdown.jsx';
import SelectMenu from '../../../src/community/components/ui/SelectMenu.jsx';

const OPTIONS = [
    {value: 'variable', label: '变量'},
    {value: 'list', label: '列表'}
];

const mountSelect = (props = {}) => mount(
    <SelectMenu
        align="left"
        ariaLabel="类型"
        className="mistwarp-select"
        compact
        options={OPTIONS}
        value="variable"
        onChange={() => {}}
        width="100%"
        {...props}
    />
);

describe('SelectMenu / Dropdown 渲染', () => {
    // 关闭走"退场动画播完再卸载"的流程，用假计时器推进
    beforeEach(() => {
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.runAllTimers();
        jest.useRealTimers();
    });

    test('外部 className 会落在下拉根节点上（令牌桥接依赖它）', () => {
        const wrapper = mountSelect();
        const root = wrapper.find('div').first();
        expect(root.prop('className')).toContain('mistwarp-select');
        wrapper.unmount();
    });

    test('menuClassName 会落在菜单节点上', () => {
        const wrapper = mountSelect({menuClassName: 'my-menu'});
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        const menu = wrapper.find('div.my-menu');
        expect(menu.length).toBe(1);
        wrapper.unmount();
    });

    test('点击触发器展开全部选项，并标记当前项', () => {
        const wrapper = mountSelect();
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(0);
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        const items = wrapper.find('button[role="menuitemradio"]');
        expect(items.length).toBe(2);
        expect(items.at(0).prop('aria-checked')).toBe(true);
        expect(items.at(1).prop('aria-checked')).toBe(false);
        wrapper.unmount();
    });

    test('选中后回调并收起菜单', () => {
        const onChange = jest.fn();
        const wrapper = mountSelect({onChange});
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        wrapper.find('button[role="menuitemradio"]').at(1)
            .simulate('click');
        expect(onChange).toHaveBeenCalledWith('list');
        // 先进退场动画（元素还在），计时器走完才卸载
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(2);
        expect(wrapper.find('div[data-mw-dropdown]').prop('data-closing')).toBe('true');
        act(() => {
            jest.runAllTimers();
        });
        wrapper.update();
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(0);
        wrapper.unmount();
    });

    test('Esc 收起菜单', () => {
        const wrapper = mountSelect();
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(2);
        act(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
        });
        wrapper.update();
        expect(wrapper.find('div[data-mw-dropdown]').prop('data-closing')).toBe('true');
        act(() => {
            jest.runAllTimers();
        });
        wrapper.update();
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(0);
        wrapper.unmount();
    });

    test('点击菜单外部收起，点击菜单内部不收起', () => {
        const wrapper = mountSelect();
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        const item = wrapper.find('button[role="menuitemradio"]').at(0)
            .getDOMNode();

        act(() => {
            item.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
        });
        wrapper.update();
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(2);

        act(() => {
            document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
        });
        wrapper.update();
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(2);
        expect(wrapper.find('div[data-mw-dropdown]').prop('data-closing')).toBe('true');
        act(() => {
            jest.runAllTimers();
        });
        wrapper.update();
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(0);
        wrapper.unmount();
    });

    test('退场动画途中再点触发器会直接重新展开', () => {
        const wrapper = mountSelect();
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        expect(wrapper.find('div[data-mw-dropdown]').prop('data-closing')).toBe('true');

        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        wrapper.update();
        const menu = wrapper.find('div[data-mw-dropdown]');
        expect(menu.length).toBe(1);
        expect(menu.prop('data-closing')).toBe(null);

        // 计时器已被取消：走了远超退场时长的时间也不会卸载
        act(() => {
            jest.runAllTimers();
        });
        wrapper.update();
        expect(wrapper.find('button[role="menuitemradio"]').length).toBe(2);
        wrapper.unmount();
    });

    test('关闭「窗口动画」时立即卸载，不进退场', () => {
        document.documentElement.classList.add('no-window-animation');
        try {
            const wrapper = mountSelect();
            wrapper.find('button[aria-haspopup="menu"]').simulate('click');
            act(() => {
                document.body.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
            });
            wrapper.update();
            expect(wrapper.find('button[role="menuitemradio"]').length).toBe(0);
            wrapper.unmount();
        } finally {
            document.documentElement.classList.remove('no-window-animation');
        }
    });

    test('渲染触发器时把 open/close 一起交给调用方', () => {
        const wrapper = mount(
            <Dropdown
                renderTrigger={({open, toggle, close}) => (
                    <button
                        type="button"
                        id="trigger"
                        onClick={() => {
                            if (open) close();
                            else toggle();
                        }}
                    >
                        {open ? 'open' : 'closed'}
                    </button>
                )}
            >
                <span id="body">menu</span>
            </Dropdown>
        );
        expect(wrapper.find('#trigger').text()).toBe('closed');
        wrapper.find('#trigger').simulate('click');
        expect(wrapper.find('#trigger').text()).toBe('open');
        wrapper.find('#trigger').simulate('click');
        expect(wrapper.find('#trigger').text()).toBe('closed');
        act(() => {
            jest.runAllTimers();
        });
        wrapper.update();
        expect(wrapper.find('#body').length).toBe(0);
        wrapper.unmount();
    });

    test('下方空间不足时菜单向上展开', () => {
        const original = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function () {
            const className = typeof this.className === 'string' ? this.className : '';
            if (className.indexOf('flip-probe') !== -1) {
                // 菜单本身：高 100，贴到视口底部之外
                return {top: 740, bottom: 840, left: 0, right: 200, width: 200, height: 100};
            }
            if (this.querySelector && this.querySelector('[aria-haspopup="menu"]')) {
                // 触发器容器：靠近视口底部，上方还有空间
                return {top: 700, bottom: 740, left: 0, right: 200, width: 200, height: 40};
            }
            return {top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0};
        };

        const wrapper = mountSelect({menuClassName: 'flip-probe'});
        wrapper.find('button[aria-haspopup="menu"]').simulate('click');
        wrapper.update();

        const menu = wrapper.find('div.flip-probe');
        expect(menu.length).toBe(1);
        // jest 里 css module 是空对象，类名不可断言，用 data-flipped 作为稳定钩子
        expect(menu.prop('data-flipped')).toBe('true');

        wrapper.unmount();
        Element.prototype.getBoundingClientRect = original;
    });
});
