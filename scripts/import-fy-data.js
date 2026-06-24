const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { ensureDir, gradeKey, writeFile } = require('./data-utils');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DEFAULT_WORKBOOK_RE = /Grade distribution FY22-25.*\.xlsx$/i;
const CANONICAL_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'P+', 'P', 'F', 'W', 'WF', 'I'];
const GPA_GRADES = new Set(['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D']);
const TOTAL_RE = /^(grand\s*)?total$/i;

function main() {
  ensureDir(DATA_DIR);
  const workbookPath = process.env.WORKBOOK
    ? path.resolve(ROOT, process.env.WORKBOOK)
    : findWorkbook();

  const result = importWorkbook(workbookPath);
  const csvPath = path.join(DATA_DIR, 'grade-distributions-fy22-fy25.csv');
  const jsonPath = path.join(DATA_DIR, 'grade-distributions-fy22-fy25.json');
  const reportPath = path.join(DATA_DIR, 'grade-distributions-fy22-fy25-report.md');

  writeFile(csvPath, toCsv(result.rows));
  writeFile(jsonPath, `${JSON.stringify(result.rows, null, 2)}\n`);
  writeFile(reportPath, renderReport(workbookPath, result));

  console.log(`Imported ${result.rows.length} rows from ${path.basename(workbookPath)}`);
  console.log(`Wrote ${path.relative(ROOT, csvPath)}`);
  console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, reportPath)}`);
  if (result.issues.length) {
    console.log(`Reported ${result.issues.length} data issue(s) in ${path.relative(ROOT, reportPath)}`);
  }
}

function findWorkbook() {
  const matches = fs.readdirSync(ROOT).filter(name => DEFAULT_WORKBOOK_RE.test(name));
  if (matches.length === 0) {
    throw new Error('No FY22-25 grade distribution workbook found. Set WORKBOOK=/path/to/file.xlsx.');
  }
  if (matches.length > 1) {
    throw new Error(`Multiple matching workbooks found: ${matches.join(', ')}. Set WORKBOOK explicitly.`);
  }
  return path.join(ROOT, matches[0]);
}

function importWorkbook(workbookPath) {
  const workbook = xlsx.readFile(workbookPath, { cellDates: false, cellNF: false, cellText: false });
  const expectedSheets = ['FY22', 'FY23', 'FY24', 'FY25'];
  const rows = [];
  const issues = [];
  const sheetSummaries = [];
  const unknownHeaders = new Set();
  let aPlusCount = 0;

  expectedSheets.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      issues.push(issue(sheetName, null, 'missing_sheet', `Missing expected sheet ${sheetName}`));
      return;
    }

    const matrix = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
    const headerIndex = findHeaderRow(matrix);
    if (headerIndex === -1) {
      issues.push(issue(sheetName, null, 'missing_header', 'Could not find the Fiscal year/Department/Course header row'));
      return;
    }

    const headers = matrix[headerIndex].map((value, index) => normalizeHeader(value, index));
    const fiscalIndex = headers.indexOf('fiscal_year');
    const departmentIndex = headers.indexOf('department');
    const courseNumberIndex = headers.indexOf('course_number');
    const courseNameIndex = headers.indexOf('course_name');
    const gradeColumns = gradeColumnIndexes(headers);
    const totalColumns = headers.map((header, index) => TOTAL_RE.test(header) ? index : -1).filter(index => index !== -1);

    gradeColumns
      .filter(column => column.grade.startsWith('unlabeled_'))
      .forEach(column => unknownHeaders.add(`${sheetName}:${column.grade}`));

    let fiscalYear = '';
    let department = '';
    let dataRows = 0;

    for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex++) {
      const row = matrix[rowIndex];
      const nextFiscalYear = clean(row[fiscalIndex]);
      const nextDepartment = clean(row[departmentIndex]);
      if (nextFiscalYear) fiscalYear = nextFiscalYear;
      if (nextDepartment) department = nextDepartment;

      const courseNumber = clean(row[courseNumberIndex]);
      const courseName = clean(row[courseNameIndex]);
      const counts = {};
      const rowIssues = [];
      let knownCount = 0;
      let unknownCount = 0;

      CANONICAL_GRADES.forEach(grade => {
        counts[gradeKey(grade)] = 0;
      });

      gradeColumns.forEach(column => {
        const cell = clean(row[column.index]);
        if (!cell) return;
        const parsed = Number(cell);
        if (!Number.isFinite(parsed)) {
          rowIssues.push(issue(sheetName, rowIndex + 1, 'nonnumeric_count', `Nonnumeric count "${cell}" in ${column.grade}`));
          return;
        }
        if (!Number.isInteger(parsed) || parsed < 0) {
          rowIssues.push(issue(sheetName, rowIndex + 1, 'malformed_count', `Count "${cell}" in ${column.grade} is not a nonnegative integer`));
          return;
        }
        if (column.grade.startsWith('unlabeled_')) {
          counts[column.grade] = (counts[column.grade] || 0) + parsed;
          unknownCount += parsed;
        } else {
          counts[gradeKey(column.grade)] += parsed;
          knownCount += parsed;
          if (column.grade === 'A+') aPlusCount += parsed;
        }
      });

      const totalFromWorkbook = totalColumns.reduce((sum, index) => sum + numberOrIssue(row[index], sheetName, rowIndex + 1, headers[index], rowIssues), 0);
      if (totalColumns.length && totalFromWorkbook !== knownCount + unknownCount) {
        rowIssues.push(issue(
          sheetName,
          rowIndex + 1,
          'total_mismatch',
          `Workbook total ${totalFromWorkbook} does not match grade-count sum ${knownCount + unknownCount}`
        ));
      }

      const hasCounts = knownCount + unknownCount > 0;
      if (!courseNumber && !courseName && !hasCounts) continue;

      if (!courseNumber) rowIssues.push(issue(sheetName, rowIndex + 1, 'missing_course_number', 'Missing course number'));
      if (!courseName) rowIssues.push(issue(sheetName, rowIndex + 1, 'missing_course_name', 'Missing course name'));
      if (!fiscalYear) rowIssues.push(issue(sheetName, rowIndex + 1, 'missing_fiscal_year', 'Missing fiscal year'));
      if (!department) rowIssues.push(issue(sheetName, rowIndex + 1, 'missing_department', 'Missing department'));

      issues.push(...rowIssues);
      if (!courseNumber || !courseName) continue;

      const gpaCount = CANONICAL_GRADES
        .filter(grade => GPA_GRADES.has(grade))
        .reduce((sum, grade) => sum + counts[gradeKey(grade)], 0);
      const nonGpaCount = CANONICAL_GRADES
        .filter(grade => !GPA_GRADES.has(grade))
        .reduce((sum, grade) => sum + counts[gradeKey(grade)], 0);

      const output = {
        fiscal_year: fiscalYear,
        department,
        course_number: courseNumber,
        course_name: courseName,
      };
      CANONICAL_GRADES.forEach(grade => {
        output[gradeKey(grade)] = counts[gradeKey(grade)] || 0;
      });
      Object.keys(counts)
        .filter(key => key.startsWith('unlabeled_'))
        .sort()
        .forEach(key => {
          output[key] = counts[key] || 0;
        });
      output.gpa_count = gpaCount;
      output.non_gpa_count = nonGpaCount;
      output.unknown_count = unknownCount;
      output.total_count = gpaCount + nonGpaCount + unknownCount;
      output.source_sheet = sheetName;
      output.source_row = rowIndex + 1;
      output.notes = unknownCount ? 'Includes counts in an unlabeled workbook column; excluded from GPA charts.' : '';
      rows.push(output);
      dataRows++;
    }

    sheetSummaries.push({
      sheet: sheetName,
      header_row: headerIndex + 1,
      rows: dataRows,
      columns: headers,
      merges: (sheet['!merges'] || []).map(range => xlsx.utils.encode_range(range)),
    });
  });

  return { rows, issues, sheetSummaries, unknownHeaders: Array.from(unknownHeaders).sort(), aPlusCount };
}

function findHeaderRow(matrix) {
  return matrix.findIndex(row => {
    const normalized = row.map((value, index) => normalizeHeader(value, index));
    return normalized.includes('fiscal_year')
      && normalized.includes('department')
      && normalized.includes('course_number')
      && normalized.includes('course_name');
  });
}

function normalizeHeader(value, index) {
  const text = clean(value);
  if (!text) return `unlabeled_${index + 1}`;
  if (/^fiscal\s*year$/i.test(text)) return 'fiscal_year';
  if (/^department$/i.test(text)) return 'department';
  if (/^course\s*number$/i.test(text)) return 'course_number';
  if (/^course\s*name$/i.test(text)) return 'course_name';
  return text;
}

function gradeColumnIndexes(headers) {
  return headers.map((header, index) => ({ grade: header, index }))
    .filter(column => {
      if (['fiscal_year', 'department', 'course_number', 'course_name'].includes(column.grade)) return false;
      if (TOTAL_RE.test(column.grade)) return false;
      return CANONICAL_GRADES.includes(column.grade) || column.grade.startsWith('unlabeled_');
    });
}

function numberOrIssue(value, sheet, row, column, issues) {
  const cell = clean(value);
  if (!cell) return 0;
  const parsed = Number(cell);
  if (!Number.isFinite(parsed)) {
    issues.push(issue(sheet, row, 'nonnumeric_total', `Nonnumeric total "${cell}" in ${column}`));
    return 0;
  }
  return parsed;
}

function clean(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

function issue(sheet, row, type, message) {
  return { sheet, row, type, message };
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set()));
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n') + '\n';
}

function csvCell(value) {
  const text = String(value === null || value === undefined ? '' : value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function renderReport(workbookPath, result) {
  const lines = [];
  lines.push('# FY22-FY25 Grade Distribution Import Report');
  lines.push('');
  lines.push(`Workbook: \`${path.basename(workbookPath)}\``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Imported rows: ${result.rows.length}`);
  lines.push('');
  lines.push('## Sheet Structure');
  lines.push('');
  result.sheetSummaries.forEach(summary => {
    lines.push(`- ${summary.sheet}: header row ${summary.header_row}, ${summary.rows} data rows, range includes merged fiscal-year/department cells.`);
  });
  lines.push('');
  lines.push('## Normalization Rules');
  lines.push('');
  lines.push('- Fiscal year and department cells are forward-filled from the previous nonblank row.');
  lines.push('- Empty grade-count cells are written as zero.');
  lines.push('- GPA charts use A, A-, B+, B, B-, C+, C, C-, and D counts on the existing IMSA Grades scale.');
  lines.push('- A+ is preserved in the normalized data and mapped into A/4.0 only for website GPA/statistical charts.');
  lines.push('- P+, P, F, W, WF, I, and unlabeled columns are preserved as counts but excluded from GPA calculations.');
  lines.push('- No derivable total/grand-total columns were present in the FY22-FY25 sheets; row totals are generated from count columns.');
  lines.push('');
  lines.push('## Nonstandard Columns');
  lines.push('');
  lines.push(`- A+ count: ${result.aPlusCount}`);
  if (result.unknownHeaders.length) {
    result.unknownHeaders.forEach(header => lines.push(`- ${header}: workbook column had no header; counts are preserved as unknown_count/unlabeled_* and excluded from GPA charts.`));
  } else {
    lines.push('- None.');
  }
  lines.push('');
  lines.push('## Issues');
  lines.push('');
  if (!result.issues.length) {
    lines.push('No malformed rows, missing course names, missing course numbers, nonnumeric counts, or total mismatches were detected.');
  } else {
    result.issues.forEach(item => {
      lines.push(`- ${item.sheet}${item.row ? ` row ${item.row}` : ''}: ${item.type} - ${item.message}`);
    });
  }
  lines.push('');
  return lines.join('\n');
}

if (require.main === module) {
  main();
}

module.exports = { importWorkbook };
