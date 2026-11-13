// Copyright (c) Christopher Whitley. All rights reserved.
// Licensed under the MIT license.
// See LICENSE file in the project root for full license information.

export const SOURCES = [
    { id: 'business', name: 'Microsoft 365', subtitle: 'Business & enterprise', path: 'mac' },
    { id: 'consumer', name: 'Microsoft 365 Personal', subtitle: 'Outlook, OneDrive & more', path: 'm365Consumer' },
    { id: 'azure', name: 'Azure', subtitle: 'Cloud infrastructure', path: 'azure' },
    { id: 'power', name: 'Power Platform', subtitle: 'Power Apps & Dynamics 365', path: 'ppac' },
];

export function plainText(html = '') {
    return String(html)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')         // Remove script blocks
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')           // Remove style blocks
        .replace(/<br\s*\/?\s*>|<\/?(?:div|p|li)[^>]*>/gi, '\n')    // line break and block element tags to new lines
        .replace(/<[^>]*>/g, '')                                    // Remove remaining tags
        .replace(/&nbsp;/gi, ' ')                                   // nbsp to space
        .replace(/&amp;/gi, '&')                                    // amp to &
        .replace(/&lt;/gi, '<')                                     // &lt to <
        .replace(/&gt;/gi, '>')                                     // &gt to > 
        .replace(/&quot;/gi, '"')                                   // &quote to "
        .replace(/&#39;/gi, "'")                                    // &#39 to '
        .replace(/\n[ \t]+/g, '\n')                                 // remove newline indentions
        .replace(/\n{3,}/g, '\n\n')                                 // Cleanup left over newlines, limit to 2 consecutive
        .trim();
}

export function normalize(source, body, checkedAt) {
    const rows = Array.isArray(body)
    ? body
    : [body];

    if (!rows.length || rows.some((row) => !row || typeof row.Status !== 'string')) {
        throw new Error('Unexpected Microsoft response');
    }

    return rows.map((row) => {
        const status = row.Status.trim();
        const clear = /^(available|operational|service operational|normal)$/i.test(status);
        const recognized = /degrad|outage|disrupt|interrupt|investigat|restor|recover/i.test(status);

        return {
            key: `${source.id}:${row.ServiceWorkloadName || source.path}`,
            sourceId: source.id,
            name: row.ServiceDisplayName || source.name,
            subtitle: source.subtitle,
            state: clear
            ? 'clear'
            : recognized
                ? 'disruption'
                : 'unknown',
            reportedStatus: status,
            title: plainText(row.Title),
            message: plainText(row.Message),
            upstreamId: row.Id || null,
            updatedAt: row.LastUpdatedTime && !row.LastUpdatedTime.startsWith('0001')
            ? row.LastUpdatedTime
            : null,
            checkedAt,
            sourceUrl: 'https://status.cloud.microsoft/',
        };
    });
}

export async function collect(fetcher = fetch) {
    const checkedAt = new Date().toISOString();
    const results = await Promise.all(
        SOURCES.map(async (source) => {
            try {
                const response = await fetcher(`https://status.cloud.microsoft/api/posts/${source.path}`, {
                    signal: AbortSignal.timeout(18000),
                    headers: { Accept: 'application/json' },
                });

                if (!response.ok) {
                    throw new Error(`Microsoft returned HTTP ${response.status}`);
                }

                return { sourceId: source.id, ok: true, services: normalize(source, await response.json(), checkedAt) };
            } catch {
                return {
                    sourceId: source.id,
                    ok: false,
                    services: [
                        {
                            key: source.id,
                            sourceId: source.id,
                            name: source.name,
                            subtitle: source.subtitle,
                            state: 'unknown',
                            title: 'Status source unavailable',
                            message:
                                'The latest public status could not be retrieved. This does not confirm an outage.',
                            checkedAt,
                            sourceUrl: 'https://status.cloud.microsoft/',
                        },
                    ],
                };
            }
        }),
    );

    return {
        checkedAt,
        sources: results.map(({ sourceId, ok }) => ({ sourceId, ok })),
        services: results.flatMap((r) => r.services),
    };
}

export function changes(previous, current) {
    const old = new Map((previous?.services || []).map((s) => [s.key, s]));

    return current.services.filter((s) => s.state !== 'unknown')
        .filter((s) => {
            const p = old.get(s.key);

            if (!p) {
                return s.state === 'disruption';
            }

            return s.state !== p.state || s.title !== p.title || s.message !== p.message;
        })
        .map((s) => ({ ...s, observedAt: current.checkedAt, kind: s.state === 'clear'
        ? 'cleared'
        : 'update' }));
}
