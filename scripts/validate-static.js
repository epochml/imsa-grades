const fs = require('fs');
const path = require('path');
const {
  aggregateCourseData,
  parseCsv,
  readFyGrades,
  readRecentGrades,
} = require('./data-utils');

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const SAMPLE_COURSES = [
  'Computer Science Inquiry',
  'Object Oriented Programming',
  'Advanced Programming',
  'Molecular and Cellular Biology',
  'Multi-Variable Calculus',
];
const COUNT_CHECKS = [
  { fiscal_year: '2025', course_name: 'Computer Science Inquiry', a: '129', a_minus: '31' },
  { fiscal_year: '2025', course_name: 'Object Oriented Programming', a: '30', b: '8' },
  { fiscal_year: '2025', course_name: 'Advanced Programming', a: '26', total_count: '26' },
];

function main() {
  assertFile(path.join(DOCS, 'index.html'));
  assertFile(path.join(DOCS, 'about', 'index.html'));
  assertFile(path.join(DOCS, '404.html'));
  assertFile(path.join(DOCS, '.nojekyll'));
  assertFile(path.join(DOCS, 'style.css'));
  assertFile(path.join(DOCS, 'classStyle.css'));
  assertFile(path.join(DOCS, 'grades.csv'));
  assertFile(path.join(DOCS, 'grades'));
  assertFile(path.join(DOCS, 'grades-recent.csv'));
  assertFile(path.join(DOCS, 'grades-new'));
  assertFile(path.join(DOCS, 'data', 'grade-distributions-fy22-fy25.csv'));

  const existingSamples = SAMPLE_COURSES.filter(course => {
    const file = path.join(DOCS, 'class', courseFileSegment(course), 'index.html');
    return fs.existsSync(file);
  });
  if (existingSamples.length < 3) throw new Error(`Expected at least 3 sample course pages, found ${existingSamples.length}`);

  const fy25Courses = new Set(csvObjects(path.join(DOCS, 'data', 'grade-distributions-fy22-fy25.csv'))
    .filter(row => row.fiscal_year === '2025')
    .map(row => row.course_name));

  existingSamples.forEach(course => {
    const file = path.join(DOCS, 'class', courseFileSegment(course), 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes(course)) throw new Error(`Generated page for ${course} does not include its title`);
    if (!html.includes('new FluidGraph')) throw new Error(`Generated page for ${course} is missing the chart payload`);
    if (fy25Courses.has(course) && !html.includes('2025')) throw new Error(`Generated page for ${course} does not include 2025`);
  });

  validateWorkbookCounts();
  validateLocalLinks();
  validateNoTemplatePlaceholders();
  validateNonGpaOnlyYears();
  console.log(`Validated static output for ${existingSamples.length} sample course pages.`);
}

function validateWorkbookCounts() {
  const rows = csvObjects(path.join(DOCS, 'data', 'grade-distributions-fy22-fy25.csv'));
  COUNT_CHECKS.forEach(check => {
    const row = rows.find(item => item.fiscal_year === check.fiscal_year && item.course_name === check.course_name);
    if (!row) throw new Error(`Missing normalized row for ${check.course_name} ${check.fiscal_year}`);
    Object.entries(check).forEach(([key, expected]) => {
      if (['fiscal_year', 'course_name'].includes(key)) return;
      if (row[key] !== expected) throw new Error(`Expected ${check.course_name} ${key}=${expected}, found ${row[key]}`);
    });
  });
}

function validateLocalLinks() {
  const htmlFiles = walk(DOCS).filter(file => file.endsWith('.html'));
  const broken = [];
  htmlFiles.forEach(file => {
    const html = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const matches = html.matchAll(/\b(?:href|src)=['"]([^'"]+)['"]/g);
    for (const match of matches) {
      const link = match[1];
      if (isExternal(link) || link.startsWith('mailto:') || link.startsWith('javascript:') || link.startsWith('#')) continue;
      const pathname = link.split('#')[0].split('?')[0];
      if (!pathname || pathname.includes('{{')) broken.push(`${path.relative(ROOT, file)} -> ${link}`);
      if (!localTargetExists(file, pathname)) broken.push(`${path.relative(ROOT, file)} -> ${link}`);
    }
  });
  if (broken.length) throw new Error(`Broken/template links found:\n${broken.join('\n')}`);
}

function localTargetExists(fromFile, pathname) {
  let target;
  if (pathname.startsWith('/')) {
    target = path.join(DOCS, decodeURIComponent(pathname.slice(1)));
  } else {
    target = path.join(path.dirname(fromFile), decodeURIComponent(pathname));
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return fs.existsSync(path.join(target, 'index.html'));
  }
  if (fs.existsSync(target)) return true;
  return fs.existsSync(`${target}.html`);
}

function validateNoTemplatePlaceholders() {
  const htmlFiles = walk(DOCS).filter(file => file.endsWith('.html'));
  const leftovers = htmlFiles.filter(file => fs.readFileSync(file, 'utf8').includes('{{'));
  if (leftovers.length) {
    throw new Error(`Unexpanded template placeholders found:\n${leftovers.map(file => path.relative(ROOT, file)).join('\n')}`);
  }
}

function validateNonGpaOnlyYears() {
  const records = readRecentGrades(path.join(ROOT, 'grades-recent.csv'))
    .concat(readFyGrades(path.join(ROOT, 'data', 'grade-distributions-fy22-fy25.csv')));
  const abCalc = aggregateCourseData(records, 'AB Calculus II');
  const year2020 = abCalc.years.find(year => year.name === '2020');
  if (!year2020 || year2020.num !== 0 || year2020.totalNum !== 36 || year2020.mean !== null || year2020.median !== null) {
    throw new Error('AB Calculus II 2020 should be treated as non-GPA-only aggregate data');
  }
  const html = fs.readFileSync(path.join(DOCS, 'class', 'AB Calculus II', 'index.html'), 'utf8');
  const meanMatch = html.match(/lineGraph\('timegraph', (\{.*?\})\)/);
  const enrollmentMatch = html.match(/lineGraph\('enrollmentgraphs', (\{.*?\})\)/);
  const meanPayload = meanMatch && JSON.parse(meanMatch[1]);
  const enrollmentPayload = enrollmentMatch && JSON.parse(enrollmentMatch[1]);
  const yearIndex = meanPayload.labels.indexOf('2020');
  if (yearIndex === -1 || meanPayload.sets[0].data[yearIndex] !== null || meanPayload.sets[1].data[yearIndex] !== null) {
    throw new Error('AB Calculus II time-series should use null, not 0, for the non-GPA-only 2020 mean');
  }
  if (enrollmentPayload.sets[0].data[yearIndex] !== 36) {
    throw new Error('AB Calculus II enrollment should use aggregate total count for the non-GPA-only 2020 row');
  }
}

function csvObjects(filename) {
  const rows = parseCsv(fs.readFileSync(filename, 'utf8'));
  const header = rows.shift();
  return rows.filter(row => row.length && row.some(Boolean)).map(row => {
    const object = {};
    header.forEach((key, index) => {
      object[key] = row[index] || '';
    });
    return object;
  });
}

function walk(dirname) {
  return fs.readdirSync(dirname, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dirname, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function assertFile(filename) {
  if (!fs.existsSync(filename)) throw new Error(`Missing ${path.relative(ROOT, filename)}`);
}

function isExternal(link) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(link) || link.startsWith('//');
}

function courseFileSegment(name) {
  return name.replace(/\//g, '_slash_');
}

if (require.main === module) {
  main();
}
