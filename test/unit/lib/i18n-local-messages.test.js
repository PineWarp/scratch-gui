import IntlMessageFormat from 'intl-messageformat';

import localMessages from '../../../src/lib/tw-translations/local-messages.js';
import addAdditionalTranslations from '../../../src/lib/tw-translations/index.js';

const buildMessages = () => ({
    'en': {
        // 模拟 l10n 包已有的条目
        'gui.backpack.header': 'Backpack'
    },
    'zh-cn': {
        'gui.backpack.header': '书包',
        'gui.monitors.importListColumnPrompt': '使用第几列(1-{numberOfColumns})?'
    }
});

describe('本地新增文案', () => {
    test('合并进 locales 的 messages（优先于 l10n 包）', () => {
        const messages = buildMessages();
        addAdditionalTranslations(messages);
        expect(messages['zh-cn']['mw.backpack.addToBackpack']).toBe('添加到书包');
        expect(messages['zh-cn']['gui.monitors.listImportError']).toContain('列表导入失败');
        expect(messages.en['mw.backpack.addToBackpack']).toBe('Add to backpack');
    });

    test('l10n 包已有的翻译不被覆盖', () => {
        // 这两个由 @bilup/scratch-l10n 提供，local-messages 里刻意没写
        expect(localMessages['zh-cn']['gui.backpack.header']).toBeUndefined();
        const messages = buildMessages();
        addAdditionalTranslations(messages);
        expect(messages['zh-cn']['gui.backpack.header']).toBe('书包');
        expect(messages['zh-cn']['gui.monitors.importListColumnPrompt']).toContain('{numberOfColumns}');
    });

    test('缺少目标语种时不报错', () => {
        const messages = {en: {}};
        expect(() => addAdditionalTranslations(messages)).not.toThrow();
        expect(messages.en['mw.backpack.addToBackpack']).toBe('Add to backpack');
        expect(messages['zh-cn']).toBeUndefined();
    });

    test('英文键都必须在中文里有对应条目', () => {
        // 中英成对维护是默认要求；但允许「只有中文」的条目：
        // 上游 zh-cn 漏翻时（值仍是英文）我们只补中文，英文由 l10n 包或组件的
        // defaultMessage 提供，不该在本仓库里重复一份英文。反过来（只有英文、
        // 中文缺失）是不允许的——那会让中文界面回退成英文。
        const zhKeys = Object.keys(localMessages['zh-cn']).sort();
        const enKeys = Object.keys(localMessages.en).sort();
        const missingInZh = enKeys.filter(key => !zhKeys.includes(key));
        expect(missingInZh).toEqual([]);
    });

    test('每条文案都是合法的 ICU 消息（含占位符的复数）', () => {
        for (const locale of Object.keys(localMessages)) {
            for (const message of Object.values(localMessages[locale])) {
                expect(() => new IntlMessageFormat(message, locale)).not.toThrow();
            }
        }
    });

    test('脚本自动命名的复数形态', () => {
        const zhFormat = new IntlMessageFormat(localMessages['zh-cn']['mw.backpack.scriptAutoName'], 'zh-cn');
        expect(zhFormat.format({block: '移动 10 步', count: 3})).toBe('移动 10 步 · 3 个积木');
        const enFormat = new IntlMessageFormat(localMessages.en['mw.backpack.scriptAutoName'], 'en');
        expect(enFormat.format({block: 'move steps', count: 1})).toBe('move steps · 1 block');
        expect(enFormat.format({block: 'move steps', count: 2})).toBe('move steps · 2 blocks');
    });

    test('无障碍标签带名称与类型', () => {
        const format = new IntlMessageFormat(localMessages['zh-cn']['mw.backpack.itemLabel'], 'zh-cn');
        expect(format.format({name: '跳跃', type: '脚本'})).toBe('跳跃，脚本。按回车键添加到当前角色。');
    });
});
