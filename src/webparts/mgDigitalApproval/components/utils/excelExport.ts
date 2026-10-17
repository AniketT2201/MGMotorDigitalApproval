import * as XLSX from 'xlsx';

type ExcelRow = Record<string, string | number | null | undefined>;

/**
 * Exports rows of data to an .xlsx file and triggers a browser download.
 *
 * The rows should already be plain objects keyed by their Excel column headers.
 */
export function exportRowsToExcel(
  fileName: string,
  rows: ExcelRow[],
  sheetName: string = 'Sheet1'
): void {
  if (!rows.length) {
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // ---------------------------------------------------------
  // Auto-size columns based on header + cell content
  // ---------------------------------------------------------
  const headers = Object.keys(rows[0]);

  worksheet['!cols'] = headers.map((header) => {
    const maxLength = Math.max(
      header.length,
      ...rows.map((row) => {
        const value = row[header];

        if (value === null || value === undefined) {
          return 0;
        }

        return String(value).length;
      })
    );

    return {
      wch: Math.min(Math.max(maxLength + 2, 12), 40),
    };
  });

  // ---------------------------------------------------------
  // Freeze the header row
  // ---------------------------------------------------------
  worksheet['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
  };

  // ---------------------------------------------------------
  // Add AutoFilter
  // ---------------------------------------------------------
  worksheet['!autofilter'] = {
    ref: worksheet['!ref'] || `A1:${XLSX.utils.encode_col(headers.length - 1)}${rows.length + 1}`,
  };

  // ---------------------------------------------------------
  // Create workbook
  // ---------------------------------------------------------
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    sheetName
  );

  // ---------------------------------------------------------
  // Clean filename
  // ---------------------------------------------------------
  const safeFileName = fileName
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-');

  XLSX.writeFile(
    workbook,
    `${safeFileName || 'Export'}.xlsx`
  );
}