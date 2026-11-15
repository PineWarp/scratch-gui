# tw-translations

给 `@bilup/scratch-l10n` 打补丁的两层翻译，在 `src/reducers/locales.js` 加载时合并进 `editorMessages`。

| 文件 | 谁来维护 | 放什么 |
| --- | --- | --- |
| `generated-translations.json` | 由 [Bilup/scratch-l10n](https://github.com/Bilup/scratch-l10n) 生成，**不要手改** | 与上游/补丁来源同步的文案（`tw.*` 等） |
| `local-messages.js` | 本仓库手写 | 只在本仓库存在的 message id（新组件新增的 `mw.*`、`gui.*`），中英文成对维护 |

合并顺序（后者覆盖前者）：`@bilup/scratch-l10n` → `generated-translations.json` → `local-messages.js`。

约定：

- 键与组件里 `defineMessages` 的 `id` 一字不差；
- 值支持 ICU，中文复数只写 `other`；
- l10n 包已经翻好的条目不要在这里重复，避免以后覆盖上游更新；
- 加新文案时同步补 `en` 与 `zh-cn`，`test/unit/lib/i18n-local-messages.test.js` 会校验两份键集合一致、每条都是合法 ICU。
