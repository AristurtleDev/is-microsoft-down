// Copyright (c) Christopher Whitley. All rights reserved.
// Licensed under the MIT license.
// See LICENSE file in the project root for full license information.

import { dailyHistory, hourlyHistory, observedHistory } from './history.mjs';
const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

function escape(value) {
    const text = String(value ?? '');
    return text.replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

function format(value) {
    if (!value) {
        return 'Not provided';
    }

    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    });
}

function label(service) {
    if (service.state === 'disruption') {
        return service.reportedStatus;
    }

    if (service.state === 'clear') {
        return 'No public outage reported';
    }

    return 'Status unavailable';
}

function excerpt(text, max = 180) {
    return text.length > max
    ? text.slice(0, max)
        .trim() + '…'
    : text;
}

function bucketLabel(key) {
    return key.length === 13
    ? key.replace('T', ' ') + ':00'
    : key;
}

let payload,
    limit = 12,
    busy = false,
    range = 'hourly',
    selectedDay = null;

function render() {
    const { current, events } = payload;
    const disrupted = current.services.filter((s) => s.state === 'disruption');
    const unknown = current.services.some((s) => s.state === 'unknown');

    document.querySelector('#summary').className =
        'summary ' + (disrupted.length
        ? 'disruption'
        : unknown
            ? 'unknown'
            : 'clear');

    document.querySelector('#headline').textContent = disrupted.length
    ? `${disrupted.length} disruption ${disrupted.length === 1
        ? 'report'
        : 'reports'}`
    : unknown
        ? 'Status partially unavailable'
        : 'No public outages reported';

    document.querySelector('#summary-text').textContent = unknown
    ? 'Some sources could not be checked.'
    : '';

    document.querySelector('#checked').textContent = 'Checked ' + format(current.checkedAt);

    if (
        !Number.isFinite(Date.parse(current.checkedAt)) ||
        Date.now() - Date.parse(current.checkedAt) > 2 * 60 * 60000
    ) {
        document.querySelector('#summary').className = 'summary unknown';
        document.querySelector('#headline').textContent = 'Status data is out of date';
        document.querySelector('#summary-text').textContent =
            'Reports below are from the last collection. Check Microsoft for the latest status.';
    }

    document.querySelector('#archive-note').textContent = 'Data last collected: ' + format(current.checkedAt) + '.';

    const services = current.services;

    document.querySelector('#services').innerHTML = services.length
    ? services.map(
                  (s) => `
            <article class="service-card ${s.state}">
              <h3 class="card-title">${escape(s.name)}</h3>
              <div class="status-tag ${s.state}">${escape(label(s))}</div>
              ${
                  s.title
                  ? `
                      <p class="description">${escape(s.title)}</p>
                    `
                  : ''
              }${
                  s.message
                  ? `
                      <details>
                        <summary>Details</summary>
                        <div class="report">${escape(s.message)}</div>
                        <a href="${escape(s.sourceUrl)}" target="_blank" rel="noreferrer">Official source</a>
                      </details>
                    `
                  : ''
              }${
                  s.state === 'disruption'
                  ? `
                      <p class="timestamp">Updated ${escape(format(s.updatedAt))}</p>
                    `
                  : ''
              }
            </article>
          `,
              )
            .join('')
    : '<p class="empty">No disruptions reported.</p>';

    const observations = payload.observations?.length
    ? payload.observations
    : [current];

    const buckets = observedHistory(
        range === 'hourly'
        ? hourlyHistory(events)
        : dailyHistory(events, Number(range)),
        observations,
    );

    document.querySelector('#history').innerHTML = buckets.map((b) => {
            const description =
                `${bucketLabel(b.day)} UTC: ${b.checks} collected checks, ${b.updates} changed updates. ` +
                (b.state === 'disruption'
                ? 'Disruption reported.'
                : b.state === 'clear'
                    ? 'No public outage reported.'
                    : 'Status unconfirmed.');
            return `
        <button
          class="day ${b.state === 'disruption'
          ? 'disruption'
          : b.state === 'clear'
              ? 'cleared'
              : ''}"
          data-day="${b.day}"
          aria-label="${escape(description)}"
          aria-pressed="${b.day === selectedDay}"
          title="${escape(description)}"
        ></button>
      `;
        })
        .join('');

    document.querySelector('#history-start').textContent = bucketLabel(buckets[0].day);

    document.querySelector('#history-end').textContent = bucketLabel(buckets.at(-1).day) + ' (UTC)';

    document.querySelector('#history-selection').textContent = selectedDay
    ? `${bucketLabel(selectedDay)} UTC`
    : 'All dates';

    document.querySelector('#clear-day').hidden = !selectedDay;

    const visibleEvents = events.filter(
        (s) => !selectedDay || new Date(s.observedAt).toISOString()
            .startsWith(selectedDay),
    );

    document.querySelector('#event-count').textContent =
        visibleEvents.length + ' ' + (visibleEvents.length === 1
        ? 'update'
        : 'updates');

    document.querySelector('#timeline').innerHTML = visibleEvents.length
    ? visibleEvents.slice(0, limit)
            .map((s) => {
                  const date = new Date(s.observedAt);
                  const summary =
                      s.message.match(/Current status:\s*([\s\S]*?)(?:\n\n|More info:|Next update by:|$)/i)?.[1] ||
                      s.message;
                  return `
            <article class="event">
              <div class="event-time">
                <strong>${escape(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</strong>
                ${escape(date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))}
                <br />
                Observed
              </div>
              <div>
                <div class="event-label ${s.kind}">
                  ${escape(s.name)} · ${s.kind === 'cleared'
                  ? 'Public report cleared'
                  : 'Official update'}
                </div>
                <h3>
                  ${escape(
                      s.title || (s.kind === 'cleared'
                      ? 'No public outage currently reported'
                      : s.reportedStatus),
                  )}
                </h3>
                <p>${escape(excerpt(summary))}</p>
                ${
                    s.message
                    ? `
                        <details>
                          <summary>Full update</summary>
                          <div class="report">${escape(s.message)}</div>
                        </details>
                      `
                    : ''
                }
              </div>
            </article>
          `;
              })
            .join('')
    : '<p class="empty">No updates recorded.</p>';
    document.querySelector('#more').hidden = visibleEvents.length <= limit;
}

async function loadStatusData() {
    if (busy) {
        return;
    }
    busy = true;
    try {
        const r = await fetch('./data/status.json', { cache: 'no-store' });
        if (!r.ok) {
            throw new Error('Unavailable');
        }
        const next = await r.json();
        if (!next.current || !Array.isArray(next.current.services) || !Array.isArray(next.events)) {
            throw new Error('Invalid status');
        }
        payload = next;
        render();
    } catch {
        document.querySelector('#summary').className = 'summary unknown';
        document.querySelector('#headline').textContent = 'The latest status couldn’t be checked';
        document.querySelector('#summary-text').textContent = payload
        ? 'The service list shows the previous check and may be out of date. Visit Microsoft’s official status page.'
        : 'Visit Microsoft’s official status page. Availability is unconfirmed.';
        if (!payload) {
            document.querySelector('#services').innerHTML =
                '<p class="empty">No live data available. Use the official source links to check Microsoft directly.</p>';
        }
    } finally {
        busy = false;
    }
}

document.querySelector('#history-range')
    .addEventListener('change', (e) => {
    range = e.target.value;
    selectedDay = null;
    limit = 12;
    if (payload) {
        render();
    }
});

document.querySelector('#history')
    .addEventListener('click', (e) => {
    const b = e.target.closest('[data-day]');
    if (!b) {
        return;
    }
    selectedDay = selectedDay === b.dataset.day
    ? null
    : b.dataset.day;
    limit = 12;
    render();
});

document.querySelector('#clear-day')
    .addEventListener('click', () => {
    selectedDay = null;
    limit = 12;
    render();
});

document.querySelector('#more')
    .addEventListener('click', () => {
    limit += 12;
    render();
});

loadStatusData();
setInterval(loadStatusData, 60000);
