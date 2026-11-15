/**
 * 书包/监视器同步验收：模块 import 链完整 + 纯函数行为。
 * 覆盖依赖关系（模块能否加载）比断言细节更重要，扩充时保持这个顺序。
 */
import {filterBackpackContents} from '../../../src/containers/backpack.jsx';
import BackpackComponent from '../../../src/components/backpack/backpack.jsx';
import {BackpackItems} from '../../../src/components/backpack/backpack-controls.jsx';
import BackpackItemComponent from '../../../src/components/backpack/backpack-item.jsx';
import BackpackItemContainer from '../../../src/containers/backpack-item.jsx';
import {getBackpackHeight, setBackpackHeight} from '../../../src/lib/backpack/preferences.js';
import {describeBlocks, humanizeOpcode, isUnnamedScript} from '../../../src/lib/backpack/script-name.js';
import collectStackBlocks from '../../../src/lib/backpack/script-stack.js';
import {safeFilenameBase, projectFilename} from '../../../src/lib/utils/safe-filename.js';
import MonitorContainer from '../../../src/containers/monitor.jsx';
import MonitorComponent from '../../../src/components/monitor/monitor.jsx';
import ListMonitor from '../../../src/components/monitor/list-monitor.jsx';
import ListMonitorScroller from '../../../src/components/monitor/list-monitor-scroller.jsx';
import MonitorList from '../../../src/components/monitor-list/monitor-list.jsx';

describe('书包模块图', () => {
    test('容器与组件都能加载', () => {
        expect(BackpackComponent).toBeTruthy();
        expect(BackpackItems).toBeTruthy();
        expect(BackpackItemComponent).toBeTruthy();
        expect(BackpackItemContainer).toBeTruthy();
    });

    test('搜索过滤按名称前缀排序并支持别名', () => {
        const contents = [
            {id: '1', name: 'My Cat', type: 'sprite'},
            {id: '2', name: 'Cat walk', type: 'script'},
            {id: '3', name: 'Cat', type: 'costume'},
            {id: '4', name: 'Drum', type: 'sound'}
        ];

        expect(filterBackpackContents(contents, '').map(i => i.id)).toEqual(['1', '2', '3', '4']);
        // 完全匹配优先，接着是前缀匹配，最后是包含匹配
        expect(filterBackpackContents(contents, 'cat').map(i => i.id)).toEqual(['3', '2', '1']);
        // 类型别名
        expect(filterBackpackContents(contents, 'audio').map(i => i.id)).toEqual(['4']);
        expect(filterBackpackContents(contents, 'nope')).toEqual([]);
    });

    test('高度偏好只在达到最小值时复用', () => {
        expect(getBackpackHeight(100)).toBe(null);
        expect(setBackpackHeight(320)).toBe(true);
        expect(getBackpackHeight(100)).toBe(320);
        expect(getBackpackHeight(400)).toBe(null);
        window.localStorage.removeItem('mw:backpackHeight');
    });

    test('脚本命名工具能识别老的无名脚本', () => {
        expect(humanizeOpcode('motion_movesteps')).toBe('movesteps');
        expect(humanizeOpcode('control_waitUntil')).toBe('wait until');
        expect(describeBlocks([
            {opcode: 'event_whenflagclicked', topLevel: true},
            {opcode: 'motion_movesteps'},
            {opcode: 'text', shadow: true}
        ])).toEqual({opcode: 'event_whenflagclicked', blockCount: 2});
        expect(isUnnamedScript({type: 'script', name: ''})).toBe(true);
        expect(isUnnamedScript({type: 'script', name: 'code'})).toBe(true);
        expect(isUnnamedScript({type: 'script', name: 'Jump'})).toBe(false);
    });

    test('收集脚本栈时带上输入与盖子积木', () => {
        const stored = {
            hat: {id: 'hat', opcode: 'event_whenflagclicked', next: 'say', inputs: {}, parent: null},
            say: {id: 'say', opcode: 'looks_say', next: null, inputs: {MESSAGE: {block: 'text', shadow: null}}},
            text: {id: 'text', opcode: 'text', inputs: {}}
        };
        const blocks = collectStackBlocks({getBlock: id => stored[id]}, 'hat');
        expect(blocks.map(block => block.id)).toEqual(['hat', 'say', 'text']);
        expect(blocks[0].topLevel).toBe(true);
        expect(blocks[0].parent).toBe(null);
    });

    test('安全文件名挡掉保留名与非法字符', () => {
        expect(safeFilenameBase('my:list?')).toBe('my_list_');
        expect(safeFilenameBase('con')).toBe('_con');
        expect(projectFilename('', 'variable', 'txt')).toBe('variable.txt');
        expect(projectFilename('得分', 'variable', 'txt')).toBe('得分.txt');
    });
});

describe('监视器模块图', () => {
    test('容器与组件都能加载', () => {
        expect(MonitorContainer).toBeTruthy();
        expect(MonitorComponent).toBeTruthy();
        expect(ListMonitor).toBeTruthy();
        expect(ListMonitorScroller).toBeTruthy();
        expect(MonitorList).toBeTruthy();
    });

    test('监视器列表接受任何带 valueSeq 的集合', () => {
        expect(typeof MonitorList.propTypes.monitors).toBe('function');
    });
});
