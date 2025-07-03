type Metric = {
  value: number | string;
  name: string;
  unit: string;
};

const resultsToMarkdownTable = (data: Record<string, Metric[]>): string => {
  const rows = Object.entries(data).map(([section, metrics]) => {
    const row: Record<string, string | number> = { Section: section };

    for (const metric of metrics) {
      row[metric.name] =
        `${typeof metric.value === 'number' && metric.value > 0 ? '+' : ''}${typeof metric.value === 'number' && metric.value.toString().includes('.') ? metric.value.toFixed(2) : metric.value} ${metric.unit}`;
    }

    return row;
  });

  const largestRow = rows.reduce(
    (max, row) => {
      const rowLength = Object.keys(row).length;

      return rowLength > Object.keys(max).length ? row : max;
    },
    { section: '' }
  );

  const headers = [
    'Section',
    ...Object.keys(largestRow).filter(key => key !== 'Section'),
  ];
  // Remove Section title, is just used to group keys of the json object
  const headerRow = `| ${headers.map(header => (header === 'Section' ? '' : header)).join(' | ')} |\n`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |\n`;

  // Make sure empty rows are handled correctly
  const bodyRows = rows
    .map(row => {
      return `| ${headers.map(header => row[header] ?? '').join(' | ')} |\n`;
    })
    .join('');

  return `${headerRow}${separatorRow}${bodyRows}`;
};

export default resultsToMarkdownTable;
