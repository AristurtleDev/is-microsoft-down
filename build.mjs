// Copyright (c) Christopher Whitley. All rights reserved.
// Licensed under the MIT license.
// See LICENSE file in the project root for full license information.

import { cp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function assetVersion(content) {
    return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

const root = new URL('./', import.meta.url);
const data = JSON.parse(await readFile(new URL('public/data/status.json', root), 'utf8'));

if (!data.current || !Array.isArray(data.events)) {
    throw new Error('Run npm run collect before building.');
}

await rm(new URL('dist/', root), { recursive: true, force: true });
await mkdir(new URL('dist/', root), { recursive: true });

for (const file of ['index.html', 'styles.css', 'app.js', 'history.mjs', 'data']) {
    await cp(new URL('public/' + file, root), new URL('dist/' + file, root), { recursive: true });
}

const history = await readFile(new URL('dist/history.mjs', root), 'utf8');
const appPath = new URL('dist/app.js', root);
const app = (await readFile(appPath, 'utf8')).replace(
    "'./history.mjs'",
    "'./history.mjs?v=" + assetVersion(history) + "'",
);

await writeFile(appPath, app);

const styles = await readFile(new URL('dist/styles.css', root), 'utf8');
const indexPath = new URL('dist/index.html', root);
const index = (await readFile(indexPath, 'utf8')).replace('./app.js', './app.js?v=' + assetVersion(app))
                                                 .replace('./styles.css', './styles.css?v=' + assetVersion(styles));

await writeFile(indexPath, index);

await writeFile(new URL('dist/.nojekyll', root), '');
await cp(new URL('LICENSE', root), new URL('dist/LICENSE', root));
console.log('Built static GitHub Pages site in dist/.');
