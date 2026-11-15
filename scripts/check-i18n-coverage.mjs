#!/usr/bin/env node
/**
 * 检查界面文案的翻译覆盖率。
 *
 * 用法：node scripts/check-i18n-coverage.mjs [目录...]（默认 src）
 *
 * 三处翻译来源合并后，任何在代码里出现、却不在其中任一处的中文缺失 id 都会被列出来。
 * 加新文案后跑一遍，避免再出现「中文界面上蹦出一句英文」。
 */
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, extname} from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);

const ROOTS = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const SKIP_DIRS = new Set(['node_modules', 'generated', 'dist', 'build', '.git']);

// 只认「消息 id」形状：至少带一个点，且以常见前缀开头，避免把 block id / 列表 id 当文案
const MESSAGE_PREFIX = /^(mw|gui|tw|bl)\./;

const walk = target => {
    const stat = statSync(target);
    if (stat.isFile()) return ['.js', '.jsx'].includes(extname(target)) ? [target] : [];
    const out = [];
    for (const entry of readdirSync(target)) {
        if (SKIP_DIRS.has(entry)) continue;
        out.push(...walk(join(target, entry)));
    }
    return out;
};

const usedIds = new Map();
for (const root of ROOTS) {
    for (const file of walk(root)) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/\bid:\s*'([^']+)'/g)) {
            if (MESSAGE_PREFIX.test(match[1])) usedIds.set(match[1], file);
        }
        for (const match of source.matchAll(/\bid="([^"]+)"/g)) {
            if (MESSAGE_PREFIX.test(match[1])) usedIds.set(match[1], file);
        }
    }
}

const editorMessages = require('@bilup/scratch-l10n/locales/editor-msgs').default;
const l10nZh = new Set(Object.keys(editorMessages['zh-cn'] || {}));

const generated = JSON.parse(readFileSync('src/lib/tw-translations/generated-translations.json', 'utf8'));
const generatedZh = new Set(Object.keys(generated['zh-cn'] || {}));

const localSource = readFileSync('src/lib/tw-translations/local-messages.js', 'utf8');
const localZh = new Set(
    [...localSource.matchAll(/'((?:mw|gui|tw|bl)\.[\w.]+)':/g)].map(match => match[1])
);

const missing = [...usedIds.entries()]
    .filter(([id]) => !l10nZh.has(id) && !generatedZh.has(id) && !localZh.has(id))
    .sort(([a], [b]) => a.localeCompare(b));

console.log(`扫描到消息 id：${usedIds.size}`);
console.log(`已有中文：l10n ${l10nZh.size} 条 / generated ${generatedZh.size} 条 / local ${localZh.size} 条`);

if (missing.length === 0) {
    console.log('没有缺失翻译。');
    process.exit(0);
}

console.log(`\n缺失中文的 id（${missing.length}）：`);
for (const [id, file] of missing) {
    console.log(`  ${id}  <- ${file}`);
}
process.exit(1);
