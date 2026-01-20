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
