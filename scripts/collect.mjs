// Copyright (c) Christopher Whitley. All rights reserved.
// Licensed under the MIT license.
// See LICENSE file in the project root for full license information.

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collect } from '../lib/status.mjs';
import { advanceArchive, publicStatus } from '../lib/archive.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function collectAndSave() {
    const archivePath = path.join(root, 'data/archive.json');
    let previous = null;

    try {
        previous = JSON.parse(await readFile(archivePath, 'utf8'));
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
    }

    const current = await collect();
    const archive = advanceArchive(previous, current);

    await mkdir(path.dirname(archivePath), { recursive: true });
    await mkdir(path.join(root, 'public/data'), { recursive: true });

    await writeFile(archivePath + '.tmp', JSON.stringify(archive, null, 2) + '\n');
    await rename(archivePath + '.tmp', archivePath);

    const outputPath = path.join(root, 'public/data/status.json');

    await writeFile(outputPath + '.tmp', JSON.stringify(publicStatus(archive)) + '\n');
    await rename(outputPath + '.tmp', outputPath);

    console.log(
        `Checked ${current.sources.filter((s) => s.ok).length}/${current.sources.length} sources; ${archive.events.length} archived updates.`,
    );

    return publicStatus(archive);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await collectAndSave();
}
