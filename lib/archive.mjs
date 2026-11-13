// Copyright (c) Christopher Whitley. All rights reserved.
// Licensed under the MIT license.
// See LICENSE file in the project root for full license information.

import { changes } from './status.mjs';

function observation(snapshot) {
    return {
        checkedAt: snapshot.checkedAt,
        services: snapshot.services.map(({ key, sourceId, state }) => ({ key, sourceId, state })),
    };
}

export function advanceArchive(previous, current) {
    const failed = new Set(current.sources.filter((s) => !s.ok)
        .map((s) => s.sourceId));

    const baseline = {
        ...current,
        services: [
            ...current.services.filter((s) => !failed.has(s.sourceId)),
            ...(previous?.current?.services || []).filter((s) => failed.has(s.sourceId)),
        ],
    };

    const observations = [...(previous?.observations || [])];

    if (!observations.length && previous?.latest) {
        observations.push(observation(previous.latest));
    }

    if (!observations.some((entry) => entry.checkedAt === current.checkedAt)) {
        observations.push(observation(current));
    }

    return {
        startedAt: previous?.startedAt || current.checkedAt,
        current: baseline,
        latest: current,
        events: [...changes(previous?.current, current), ...(previous?.events || [])],
        observations,
    };
}

export function publicStatus(archive) {
    return {
        current: archive.latest || archive.current,
        events: archive.events,
        startedAt: archive.startedAt,
        observations: archive.observations || [],
    };
}
