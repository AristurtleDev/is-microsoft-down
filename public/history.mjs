// Copyright (c) Christopher Whitley. All rights reserved.
// Licensed under the MIT license.
// See LICENSE file in the project root for full license information.

export function dailyHistory(events, days, now = new Date()) {
    const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const buckets = Array.from({ length: days }, (_, i) => ({
        day: new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
        updates: 0,
        disruptions: 0,
        cleared: 0,
    }));
    const byDay = new Map(buckets.map((b) => [b.day, b]));

    for (const event of events) {
        const time = new Date(event.observedAt);

        if (!Number.isFinite(time.getTime())) {
            continue;
        }

        const bucket = byDay.get(time.toISOString()
            .slice(0, 10));

        if (!bucket) {
            continue;
        }

        bucket.updates++;

        if (event.state === 'disruption') {
            bucket.disruptions++;
        }

        if (event.kind === 'cleared') {
            bucket.cleared++;
        }
    }

    return buckets;
}

export function hourlyHistory(events, now = new Date()) {
    const hour = 60 * 60 * 1000;
    const end = Math.floor(now.getTime() / hour) * hour;
    const buckets = Array.from({ length: 24 }, (_, index) => ({
        day: new Date(end - (23 - index) * hour).toISOString()
            .slice(0, 13),
        updates: 0,
        disruptions: 0,
        cleared: 0,
    }));
    const byHour = new Map(buckets.map((bucket) => [bucket.day, bucket]));

    for (const event of events) {
        const time = new Date(event.observedAt);

        if (!Number.isFinite(time.getTime())) {
            continue;
        }

        const bucket = byHour.get(time.toISOString()
            .slice(0, 13));

        if (!bucket) {
            continue;
        }

        bucket.updates++;

        if (event.state === 'disruption') {
            bucket.disruptions++;
        }

        if (event.kind === 'cleared') {
            bucket.cleared++;
        }
    }

    return buckets;
}

export function observedHistory(buckets, observations) {
    const result = buckets.map((bucket) => ({
        ...bucket,
        checks: 0,
        state: bucket.disruptions
        ? 'disruption'
        : bucket.cleared
            ? 'clear'
            : 'unknown',
    }));
    const byPeriod = new Map(result.map((bucket) => [bucket.day, bucket]));
    const keyLength = result[0]?.day.length;

    for (const observation of observations) {
        const time = new Date(observation.checkedAt);

        if (!Number.isFinite(time.getTime()) || !observation.services.length) {
            continue;
        }

        const bucket = byPeriod.get(time.toISOString()
            .slice(0, keyLength));

        if (!bucket) {
            continue;
        }

        const state = observation.services.some((service) => service.state === 'disruption')
        ? 'disruption'
        : observation.services.some((service) => service.state === 'unknown')
            ? 'unknown'
            : 'clear';

        if (bucket.state !== 'disruption') {
            bucket.state =
                state === 'disruption' || !bucket.checks
                ? state
                : bucket.state === 'unknown' || state === 'unknown'
                    ? 'unknown'
                    : 'clear';
        }

        bucket.checks++;
    }

    return result;
}
