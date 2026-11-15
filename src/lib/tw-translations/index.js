import twTranslations from './generated-translations.json';
import localMessages from './local-messages.js';

const addAdditionalTranslations = editorMessages => {
    for (const locale of Object.keys(editorMessages)) {
        const toMixIn = twTranslations[locale.toLowerCase()];
        if (toMixIn) {
            Object.assign(editorMessages[locale], toMixIn);
        }
    }

    // 本仓库自建文案（跟着组件一起新增的 message id）最后合并，
    // 优先级高于 l10n 包与上面那份 tw 补丁。见 local-messages.js 顶部说明。
    for (const locale of Object.keys(localMessages)) {
        const target = editorMessages[locale];
        if (!target) continue;
        Object.assign(target, localMessages[locale]);
    }

    // We reuse our `es` translations for `es-419` instead of maintaining separate translations.
    // Object.assign(editorMessages['es-419'], twTranslations.es);
};

export default addAdditionalTranslations;
