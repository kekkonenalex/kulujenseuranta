// ============================================================
//  YHTEENVETO-nakyma: valitun kuukauden kulut kategorioittain,
//  kokonaissumma ja vertailu edelliseen kuukauteen.
// ============================================================

import { summaryFor, monthTotalCents } from './state.js';
import { state } from './state.js';
import { formatMoney, addMonths, monthLabel } from './format.js';
import { qs, show, escapeHtml } from './ui-common.js';

function comparisonText(currentCents, previousMonth) {
  const previousCents = monthTotalCents(previousMonth);
  if (previousCents === 0) {
    return `Ei kuluja kuussa ${monthLabel(previousMonth)}.`;
  }
  const diff = currentCents - previousCents;
  const share = Math.round((Math.abs(diff) / previousCents) * 100);
  if (diff === 0) return `Sama kuin ${monthLabel(previousMonth)}.`;
  const direction = diff > 0 ? 'enemmän' : 'vähemmän';
  return `${formatMoney(Math.abs(diff))} (${share} %) ${direction} kuin ${monthLabel(previousMonth)}.`;
}

export function renderSummaryView() {
  const summary = summaryFor(state.month);

  qs('#sum-total').textContent = formatMoney(summary.total);
  qs('#sum-count').textContent = summary.count === 1
    ? '1 kirjaus'
    : `${summary.count} kirjausta`;
  qs('#sum-compare').textContent = comparisonText(summary.total, addMonths(state.month, -1));

  show(qs('#sum-empty'), summary.rows.length === 0);

  const maxCents = summary.rows.reduce((max, row) => Math.max(max, row.cents), 0);

  qs('#sum-rows').innerHTML = summary.rows.map((row) => {
    const barWidth = maxCents ? Math.max(2, (row.cents / maxCents) * 100) : 0;
    return `
      <div class="sum-row">
        <div class="sum-row-top">
          <span class="dot" style="background:${escapeHtml(row.color)}"></span>
          <span class="sum-name">${escapeHtml(row.name)}</span>
          <span class="sum-amount">${escapeHtml(formatMoney(row.cents))}</span>
        </div>
        <div class="bar">
          <div class="bar-fill" style="width:${barWidth.toFixed(1)}%;background:${escapeHtml(row.color)}"></div>
        </div>
        <div class="sum-meta">
          <span>${row.share.toFixed(0)} % kuukauden kuluista</span>
          <span>${row.count} ${row.count === 1 ? 'kirjaus' : 'kirjausta'}</span>
        </div>
      </div>`;
  }).join('');
}

export function initSummaryView() {
  // Nakyma on puhtaasti laskennallinen - ei omia tapahtumakuuntelijoita.
}
