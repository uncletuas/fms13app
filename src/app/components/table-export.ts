export type ExportColumn<T> = {
  label: string;
  value: (row: T) => string | number | null | undefined;
};

const csvValue = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const downloadCsv = <T,>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
) => {
  const header = columns.map((col) => csvValue(col.label)).join(',');
  const body = rows
    .map((row) => columns.map((col) => csvValue(col.value(row))).join(','))
    .join('\n');
  const csv = `${header}\n${body}`;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const printTable = <T,>(
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  periodLabel?: string,
) => {
  const header = columns.map((col) => `<th>${col.label}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns.map((col) => `<td>${col.value(row) ?? ''}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; padding: 24px; }
          h1 { font-size: 18px; margin-bottom: 6px; }
          p { font-size: 12px; color: #6b7280; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${periodLabel ? `<p>Period: ${periodLabel}</p>` : ''}
        <table>
          <thead><tr>${header}</tr></thead>
          <tbody>${body || '<tr><td colspan="' + columns.length + '">No data</td></tr>'}</tbody>
        </table>
      </body>
    </html>`;

  const printWindow = window.open('', '_blank', 'width=960,height=720');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

export const printActivityReport = (params: {
  title: string;
  periodLabel?: string;
  userName: string;
  role?: string;
  activities: Array<{
    action: string;
    entityType: string;
    entityId: string;
    userName?: string;
    userRole?: string;
    timestamp: string;
  }>;
}) => {
  const { title, periodLabel, userName, role, activities } = params;
  const total = activities.length;
  const byAction = activities.reduce<Record<string, number>>((acc, activity) => {
    const key = activity.action.replace(/_/g, ' ');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const byEntity = activities.reduce<Record<string, number>>((acc, activity) => {
    const key = activity.entityType;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const topActions = Object.entries(byAction)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => `<li>${label} <span>(${count})</span></li>`)
    .join('');

  const entitySummary = Object.entries(byEntity)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `<li>${label} <span>(${count})</span></li>`)
    .join('');

  const rows = activities.slice(0, 12).map((activity) => `
      <tr>
        <td>${new Date(activity.timestamp).toLocaleString()}</td>
        <td>${activity.action.replace(/_/g, ' ')}</td>
        <td>${activity.entityType}</td>
        <td>${activity.entityId}</td>
      </tr>
    `).join('');

  const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #1f2937; padding: 24px; }
          h1 { font-size: 20px; margin-bottom: 6px; }
          h2 { font-size: 14px; margin: 20px 0 8px; }
          p { font-size: 12px; color: #6b7280; margin: 4px 0; }
          .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-top: 12px; }
          .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          .list { margin: 0; padding-left: 18px; font-size: 12px; color: #374151; }
          .list li { margin-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 12px; text-align: left; }
          th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p>Generated for ${userName}${role ? ` (${role.replace('_', ' ')})` : ''}</p>
        ${periodLabel ? `<p>Period: ${periodLabel}</p>` : ''}
        <div class="summary">
          <div class="card">
            <h2>Total activity</h2>
            <p>${total} recorded actions</p>
          </div>
          <div class="card">
            <h2>Top actions</h2>
            <ul class="list">${topActions || '<li>No activity recorded</li>'}</ul>
          </div>
          <div class="card">
            <h2>Entity focus</h2>
            <ul class="list">${entitySummary || '<li>No activity recorded</li>'}</ul>
          </div>
        </div>
        <h2>Recent activity</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="4">No activity recorded</td></tr>'}</tbody>
        </table>
      </body>
    </html>`;

  const printWindow = window.open('', '_blank', 'width=960,height=720');
  if (!printWindow) return;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};

export const inDateRange = (dateValue: string | undefined, start: string, end: string) => {
  if (!start && !end) return true;
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  if (start) {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    if (date < startDate) return false;
  }
  if (end) {
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    if (date > endDate) return false;
  }
  return true;
};
