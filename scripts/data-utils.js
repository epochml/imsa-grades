const fs = require('fs');
const path = require('path');

const GPA_LABELS = ['4.0', '3.67', '3.33', '3.0', '2.67', '2.33', '2.0', '1.67', '1.0'];
const GPA_LABEL_TEXT = ['A (4.0)', 'A- (3.67)', 'B+ (3.33)', 'B (3.0)', 'B- (2.67)', 'C+ (2.33)', 'C (2.0)', 'C- (1.67)', 'D (1.0)'];
const GRADE_TO_GPA = {
  'A+': '4.0',
  A: '4.0',
  'A-': '3.67',
  'B+': '3.33',
  B: '3.0',
  'B-': '2.67',
  'C+': '2.33',
  C: '2.0',
  'C-': '1.67',
  D: '1.0',
};
const RECENT_OVERLAP_AY = new Set(['21-22']);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        value += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        value += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(value);
      value = '';
    } else if (ch === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (ch !== '\r') {
      value += ch;
    }
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function median(values) {
  const nums = values.filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
  if (nums.length === 0) return 0;
  nums.sort((a, b) => a - b);
  const half = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[half] : (nums[half - 1] + nums[half]) / 2;
}

function countsTemplate() {
  return GPA_LABELS.map(label => [label, 0]);
}

function statsFromCounts(counts) {
  const n = counts.reduce((sum, c) => sum + c[1], 0);
  if (!n) return { n: 0, mean: null, median: null };
  const mean = counts.reduce((sum, c) => sum + Number(c[0]) * c[1], 0) / n;
  const values = [];
  counts.forEach(c => {
    for (let i = 0; i < c[1]; i++) values.push(Number(c[0]));
  });
  return { n, mean: Math.round(mean * 100) / 100, median: median(values) };
}

function addCounts(target, source) {
  source.forEach((count, i) => {
    target[i][1] += count[1];
  });
  return target;
}

function gradeCountsFromRecord(record) {
  const counts = countsTemplate();
  Object.entries(GRADE_TO_GPA).forEach(([grade, gpa]) => {
    const count = toNumber(record[gradeKey(grade)]);
    const index = counts.findIndex(c => c[0] === gpa);
    if (index !== -1) counts[index][1] += count;
  });
  return counts;
}

function gradeKey(grade) {
  return grade
    .replace('+', '_plus')
    .replace('-', '_minus')
    .replace(/^([A-Z])$/, '$1')
    .toLowerCase();
}

function readLegacyGrades(filename) {
  const rows = parseCsv(fs.readFileSync(filename, 'utf8'));
  const header = rows.shift();
  const ind = name => header.indexOf(name);
  const classes = new Map();

  rows.forEach(row => {
    if (!row.length) return;
    const courseName = row[ind('Course_Name')];
    if (!courseName) return;
    if (!classes.has(courseName)) classes.set(courseName, new StudentGroup(courseName));
    classes.get(courseName).student(row, header);
  });

  return classes;
}

class StudentGroup {
  constructor(name) {
    this.name = name;
    this.groupName = name;
    this.students = [];
  }

  student(row, header) {
    const ind = name => header.indexOf(name);
    const sem = row[ind('Grade_StoreCode')] === 'S1' ? 'F' : 'S';
    const gradeYear = toNumber(row[ind('Grade_Year')]);
    const gradeYearText = parseInt(gradeYear, 10);
    let schoolYearText = `${gradeYearText - 1}/${gradeYearText}`;
    if (sem === 'F') schoolYearText = `${gradeYearText}/${gradeYearText + 1}`;

    this.students.push({
      gender: row[ind('Gender')],
      gradYear: row[ind('IMSA_SchedYearofGraduation')],
      gradeTermId: row[ind('Grade_TermID')],
      gradeYear,
      semester: row[ind('Grade_StoreCode')],
      gradePointSolid: row[ind('Grade_Point_Solid')],
      gradePoint: row[ind('Grade_Point')],
      grade: row[ind('Grade')],
      courseNumber: row[ind('Course_Number')],
      courseName: row[ind('Course_Name')],
      creditType: row[ind('Credit_Type')],
      studentGrade: toNumber(row[ind('Student_GradeLevel')]),
      composite: sem + gradeYear,
      schoolYearText,
    });
  }

  fromStudents(students) {
    this.students = students;
    return this;
  }

  get gpa() {
    return getGpa(this.students);
  }

  get stats() {
    return {
      n: this.students.length,
      mean: Math.round(this.gpa * 100) / 100,
      median: median(this.students.map(s => (s.gradePoint === 'P' || s.gradePoint === 'F') ? null : s.gradePoint)),
    };
  }

  get latest() {
    return this.students.sort((a, b) => b.gradeYear - a.gradeYear)[0].gradeYear;
  }

  get counts() {
    const counts = countsTemplate();
    this.students.forEach(s => {
      const index = counts.findIndex(c => c[0] === String(s.gradePoint));
      if (index !== -1) counts[index][1]++;
    });
    return counts;
  }

  get displayName() {
    return this.students[0].courseName === this.name ? 'All Years' : this.name;
  }
}

function getGpa(students) {
  let total = 0;
  let counted = 0;
  students.forEach(s => {
    if (!Number.isNaN(Number(s.gradePoint))) {
      total += Number(s.gradePoint);
      counted++;
    }
  });
  return counted ? total / counted : 0;
}

function sortByYear(group) {
  const years = new Map();
  group.students.forEach(student => {
    const key = student.gradeYear;
    if (!years.has(key)) years.set(key, new StudentGroup(String(key)));
    years.get(key).students.push(student);
  });
  return Array.from(years.values()).sort((a, b) => a.name - b.name);
}

function legacyCourseData(classes, className) {
  const group = classes.get(className);
  if (!group) {
    return { error: true, byYear: [], byGroup: [], exists: false };
  }
  const byYear = sortByYear(group);
  return {
    className: group.name,
    byGroup: [group].concat(byYear),
    byYear,
    exists: true,
  };
}

function readRecentGrades(filename, options = {}) {
  const rows = parseCsv(fs.readFileSync(filename, 'utf8'));
  const header = rows.shift();
  const ind = name => header.indexOf(name);
  const skipOverlap = options.skipOverlap !== false;
  let ay = '';
  let term = '';
  let department = '';
  let courseId = '';
  let course = '';
  const records = [];

  rows.forEach((row, rowIndex) => {
    if (!row.length) return;
    if (row[ind('AY')]) ay = row[ind('AY')];
    if (row[ind('Term')]) term = row[ind('Term')];
    if (row[ind('Dept')]) department = row[ind('Dept')];
    if (row[ind('CourseID')]) courseId = row[ind('CourseID')];
    if (row[ind('Course')]) course = row[ind('Course')];
    if (!course || !term || !ay) return;
    if (skipOverlap && RECENT_OVERLAP_AY.has(ay)) return;

    const yearParts = ay.split('-');
    const year = Number(`20${yearParts[term === 'S1' ? 0 : 1]}`);
    if (year < 2018) return;

    const counts = countsTemplate();
    [
      ['A', '4.0'],
      ['A-', '3.67'],
      ['B+', '3.33'],
      ['B', '3.0'],
      ['B-', '2.67'],
      ['C+', '2.33'],
      ['C', '2.0'],
      ['C-', '1.67'],
      ['D', '1.0'],
    ].forEach(([grade, gpa]) => {
      const count = toNumber(row[ind(grade)]);
      const index = counts.findIndex(c => c[0] === gpa);
      if (index !== -1) counts[index][1] += count;
    });

    const gpaCount = counts.reduce((sum, c) => sum + c[1], 0);
    const grandTotal = toNumber(row[ind('Grand Total')]);
    records.push({
      source: 'grades-recent.csv',
      row: rowIndex + 2,
      ay,
      term,
      year,
      name: String(year),
      department,
      courseNumber: courseId,
      course,
      counts,
      num: gpaCount,
      totalCount: grandTotal || gpaCount,
      nonGpaCount: Math.max(0, (grandTotal || gpaCount) - gpaCount),
    });
  });

  return records;
}

function readFyGrades(filename) {
  if (!fs.existsSync(filename)) return [];
  const rows = parseCsv(fs.readFileSync(filename, 'utf8'));
  const header = rows.shift();
  return rows.map(row => {
    const record = {};
    header.forEach((column, i) => {
      record[column] = row[i] || '';
    });
    const fiscalYear = Number(record.fiscal_year);
    const counts = gradeCountsFromRecord(record);
    return {
      source: 'grade-distributions-fy22-fy25.csv',
      row: toNumber(record.source_row),
      fiscalYear,
      year: fiscalYear,
      name: String(fiscalYear),
      department: record.department,
      courseNumber: record.course_number,
      course: record.course_name,
      counts,
      num: counts.reduce((sum, c) => sum + c[1], 0),
      totalCount: toNumber(record.total_count),
      nonGpaCount: toNumber(record.non_gpa_count),
    };
  }).filter(record => record.course);
}

function aggregateCourseData(records, className) {
  const courseRecords = records.filter(record => record.course === className);
  if (!courseRecords.length) return null;

  const grouped = new Map();
  courseRecords.forEach(record => {
    if (!grouped.has(record.name)) grouped.set(record.name, []);
    grouped.get(record.name).push(record);
  });

  const years = Array.from(grouped.entries()).map(([name, items]) => {
    const counts = countsTemplate();
    items.forEach(item => addCounts(counts, item.counts));
    const stats = statsFromCounts(counts);
    const totalNum = items.reduce((sum, item) => sum + (item.totalCount || item.num || 0), 0);
    return {
      name,
      counts,
      num: stats.n,
      totalNum,
      mean: stats.mean,
      median: stats.median,
      sortYear: Math.min(...items.map(item => item.year)),
    };
  }).sort((a, b) => a.sortYear - b.sortYear || a.name.localeCompare(b.name));

  const counts = countsTemplate();
  years.forEach(year => addCounts(counts, year.counts));
  const stats = statsFromCounts(counts);
  const totalNum = years.reduce((sum, year) => sum + (year.totalNum || year.num || 0), 0);

  return {
    exists: true,
    name: className,
    counts,
    num: stats.n,
    totalNum,
    mean: stats.mean,
    median: stats.median,
    years,
  };
}

function allCourseNames(legacyClasses, aggregateRecords, coursesFilename) {
  const names = new Set();
  if (coursesFilename && fs.existsSync(coursesFilename)) {
    fs.readFileSync(coursesFilename, 'utf8').split(/\r?\n/).forEach(line => {
      const name = line.trim();
      if (name && !name.startsWith('#')) names.add(name);
    });
  }
  legacyClasses.forEach((_value, key) => names.add(key));
  aggregateRecords.forEach(record => {
    if (record.course) names.add(record.course);
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function ensureDir(dirname) {
  fs.mkdirSync(dirname, { recursive: true });
}

function writeFile(filename, text) {
  ensureDir(path.dirname(filename));
  fs.writeFileSync(filename, text);
}

module.exports = {
  GPA_LABELS,
  GPA_LABEL_TEXT,
  RECENT_OVERLAP_AY,
  aggregateCourseData,
  allCourseNames,
  ensureDir,
  gradeKey,
  legacyCourseData,
  median,
  parseCsv,
  readFyGrades,
  readLegacyGrades,
  readRecentGrades,
  statsFromCounts,
  writeFile,
};
