import { $ } from './dom.js';
import { setupTableColumns } from './table-columns.js';

export function setupHistoryColumns() {
  return setupTableColumns($('history-table'), {
    key: 'crystal-observatory.history-columns.v1',
    minimums: [44, 80, 80],
    defaults: (width) => [72, width * 0.61 - 72, width * 0.39],
  });
}
