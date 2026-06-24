const fs = require('fs');
const path = require('path');
const {
  GPA_LABELS,
  GPA_LABEL_TEXT,
  aggregateCourseData,
  allCourseNames,
  ensureDir,
  legacyCourseData,
  median,
  readFyGrades,
  readLegacyGrades,
  readRecentGrades,
  writeFile,
} = require('./data-utils');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DOCS_DIR = path.join(ROOT, 'docs');
const BASE_PATH = normalizeBasePath(process.env.BASE_PATH || '');

function main() {
  const legacyClasses = readLegacyGrades(path.join(ROOT, 'grades.csv'));
  const aggregateRecords = readRecentGrades(path.join(ROOT, 'grades-recent.csv'))
    .concat(readFyGrades(path.join(ROOT, 'data', 'grade-distributions-fy22-fy25.csv')));
  const courseNames = allCourseNames(legacyClasses, aggregateRecords, path.join(ROOT, 'courses.txt'))
    .filter(name => legacyClasses.has(name) || aggregateRecords.some(record => record.course === name));

  fs.rmSync(DOCS_DIR, { recursive: true, force: true });
  ensureDir(DOCS_DIR);
  copyPublicAssets();
  copyDataFiles();
  writeFile(path.join(DOCS_DIR, '.nojekyll'), '');

  writeFile(path.join(DOCS_DIR, 'index.html'), renderHome(legacyClasses, aggregateRecords, courseNames));
  writeFile(path.join(DOCS_DIR, 'about', 'index.html'), renderAbout(courseNames));
  writeFile(path.join(DOCS_DIR, '404.html'), render404());

  courseNames.forEach(courseName => {
    const output = path.join(DOCS_DIR, 'class', courseFileSegment(courseName), 'index.html');
    writeFile(output, renderClass(courseName, legacyClasses, aggregateRecords, courseNames));
  });

  writeFile(path.join(DOCS_DIR, 'data', 'courses.json'), `${JSON.stringify(courseNames, null, 2)}\n`);
  console.log(`Built ${courseNames.length} course pages in docs/`);
  console.log(`BASE_PATH=${BASE_PATH || '(empty)'}`);
}

function renderHome(legacyClasses, aggregateRecords, courseNames) {
  let template = fs.readFileSync(path.join(PUBLIC_DIR, 'home.html'), 'utf8');
  const classes = courseNames.map(name => `<option value='/${courseUrlSegment(name)}/'>${escapeHtml(name)}</option>`).join('');
  const countsMap = GPA_LABELS.map(label => [label, 0]);

  courseNames.forEach(courseName => {
    const combined = combinedCourseSummary(courseName, legacyClasses, aggregateRecords);
    if (!combined || !combined.stats.n) return;
    const index = countsMap.findIndex(c => Number(c[0]) === Number(combined.stats.median));
    if (index !== -1) countsMap[index][1]++;
  });

  const hardest = combinedCourseSummary('Survey of Organic Chemistry', legacyClasses, aggregateRecords);
  const easiest = combinedCourseSummary('String Orchestra', legacyClasses, aggregateRecords);

  return applyCommon(template, courseNames)
    .replace('{{classes}}', classes)
    .replace('{{navbar}}', getNavbar(true, courseNames))
    .replace('{{medianGraph}}', `graph("overallgraph", [${countsMap.map(x => x[1]).join(',')}], ${JSON.stringify(GPA_LABEL_TEXT)}, ${JSON.stringify({ x: 'Number of Classes', y: 'Class Grade Point Median' })})`)
    .replace('{{hardestClass}}', hardest ? `
      $('#hardestclasstitle').html("Hardest Class: <a href='${BASE_PATH}/class/${courseUrlSegment('Survey of Organic Chemistry')}/'>Survey of Organic Chemistry</a>")
      graph('hardestclassgraph', [${hardest.counts.map(x => x[1]).join(',')}], ${JSON.stringify(GPA_LABEL_TEXT)}, ${JSON.stringify({ x: 'Number of Students', y: 'Student Grade' })})
    ` : '')
    .replace('{{easiestClass}}', easiest ? `
      $('#easiestclasstitle').html("Easiest Class: <a href='${BASE_PATH}/class/${courseUrlSegment('String Orchestra')}/'>String Orchestra</a>")
      graph("easiestclassgraph", [${easiest.counts.map(x => x[1]).join(',')}], ${JSON.stringify(GPA_LABEL_TEXT)}, ${JSON.stringify({ x: 'Number of Students', y: 'Student Grade' })})
    ` : '');
}

function renderAbout(courseNames) {
  return applyCommon(fs.readFileSync(path.join(PUBLIC_DIR, 'about.html'), 'utf8'), courseNames)
    .replace('{{navbar}}', getNavbar(true, courseNames));
}

function render404() {
  return applyCommon(fs.readFileSync(path.join(PUBLIC_DIR, '404.html'), 'utf8'), []);
}

function renderClass(courseName, legacyClasses, aggregateRecords, courseNames) {
  let template = fs.readFileSync(path.join(PUBLIC_DIR, 'class.html'), 'utf8');
  const results = legacyCourseData(legacyClasses, courseName);
  const aggregateData = aggregateCourseData(aggregateRecords, courseName) || { exists: false, years: [] };
  let classData = results;
  let showBreakdowns = true;

  if (results.error) {
    classData = { byYear: [], byGroup: [], exists: false };
    showBreakdowns = false;
  }

  const aggregateYears = aggregateData.years || [];
  const lgDatasets = {
    labels: classData.byYear.map(y => y.groupName).concat(aggregateYears.map(y => y.name)),
    xlabel: 'Grade Year',
    ylabel: 'Grade Point',
    sets: [{
      label: 'Mean',
      backgroundColor: '#19a512',
      borderColor: '#19a512',
      data: classData.byYear.map(y => y.stats.mean).concat(aggregateYears.map(y => y.mean)),
      fill: false,
    }, {
      label: 'Median',
      backgroundColor: '#db6e82',
      borderColor: '#db6e82',
      data: classData.byYear.map(y => y.stats.median).concat(aggregateYears.map(y => y.median)),
      fill: false,
    }],
  };

  const enrollmentOverTime = {
    labels: classData.byYear.map(y => y.groupName).concat(aggregateYears.map(y => y.name)),
    xlabel: 'Grade Year',
    ylabel: 'Number of Students',
    sets: [{
      label: 'Count',
      backgroundColor: '#fcba03',
      borderColor: '#fcba03',
      data: classData.byYear.map(y => y.stats.n).concat(aggregateYears.map(y => y.totalNum || y.num)),
      fill: false,
    }],
  };

  const countDatasets = {
    labels: classData.byYear.map(y => y.groupName),
    xlabel: 'Grade Year',
    ylabel: 'Number of Students',
    sets: [{
      label: 'All',
      backgroundColor: 'purple',
      borderColor: 'purple',
      data: classData.byYear.map(y => y.stats.n),
      fill: false,
    }, {
      label: 'Male',
      backgroundColor: '#35c1eb',
      borderColor: '#35c1eb',
      data: classData.byYear.map(y => y.students.filter(s => s.gender === 'Male').length),
      fill: false,
    }, {
      label: 'Female',
      backgroundColor: '#ff6385',
      borderColor: '#ff6385',
      data: classData.byYear.map(y => y.students.filter(s => s.gender === 'Female').length),
      fill: false,
    }, {
      label: 'Sophomores',
      backgroundColor: 'orange',
      borderColor: 'orange',
      data: classData.byYear.map(y => y.students.filter(s => s.studentGrade === 10).length),
      fill: false,
    }, {
      label: 'Juniors',
      backgroundColor: 'rgba(53,162,235, 1)',
      borderColor: 'rgba(53,162,235, 1)',
      data: classData.byYear.map(y => y.students.filter(s => s.studentGrade === 11).length),
      fill: false,
    }, {
      label: 'Seniors',
      backgroundColor: '#b19cd9',
      borderColor: '#b19cd9',
      data: classData.byYear.map(y => y.students.filter(s => s.studentGrade === 12).length),
      fill: false,
    }],
  };

  const gpBreakdown = {
    labels: classData.byYear.map(y => y.groupName),
    xlabel: 'Grade Year',
    ylabel: 'Grade Point Average',
    sets: [{
      label: 'All',
      backgroundColor: '#19a512',
      borderColor: '#19a512',
      data: classData.byYear.map(y => y.stats.mean),
      fill: false,
    }, {
      label: 'Male',
      backgroundColor: '#35c1eb',
      borderColor: '#35c1eb',
      data: classData.byYear.map(y => gpa(y.students.filter(s => s.gender === 'Male'))),
      fill: false,
    }, {
      label: 'Female',
      backgroundColor: '#ff6385',
      borderColor: '#ff6385',
      data: classData.byYear.map(y => gpa(y.students.filter(s => s.gender === 'Female'))),
      fill: false,
    }, {
      label: 'Sophomores',
      backgroundColor: 'orange',
      borderColor: 'orange',
      data: classData.byYear.map(y => gpa(y.students.filter(s => s.studentGrade === 10))),
      fill: false,
    }, {
      label: 'Juniors',
      backgroundColor: 'rgba(53,162,235, 1)',
      borderColor: 'rgba(53,162,235, 1)',
      data: classData.byYear.map(y => gpa(y.students.filter(s => s.studentGrade === 11))),
      fill: false,
    }, {
      label: 'Seniors',
      backgroundColor: '#b19cd9',
      borderColor: '#b19cd9',
      data: classData.byYear.map(y => gpa(y.students.filter(s => s.studentGrade === 12))),
      fill: false,
    }],
  };

  const extraTab = classData.byGroup.length === 0 ? [{ name: 'All Years' }] : [];
  const tabs = classData.byGroup.map(x => `<button class="tablinks">${escapeHtml(x.displayName)}</button>`)
    .concat(extraTab.map(x => `<button class="tablinks">${x.name}</button>`))
    .concat(aggregateYears.map(x => `<button class="tablinks">${escapeHtml(x.name)}</button>`));

  const fluidSets = makeFluidSets(classData, aggregateData);
  if (!classData.exists) showBreakdowns = false;

  return applyCommon(template, courseNames)
    .replace(/{{classname}}/g, escapeHtml(classData.className || aggregateData.name || courseName))
    .replace(/{{description}}/g, 'Data may be incomplete. Use this only for reference.')
    .replace(/{{tabs}}/g, tabs.join(''))
    .replace(/{{fluidGraph}}/g, `overallGraph = new FluidGraph('bargraphs', ${JSON.stringify(fluidSets)}, ${JSON.stringify(GPA_LABEL_TEXT)})`)
    .replace(/{{navbar}}/g, getNavbar(true, courseNames))
    .replace(/{{lineGraph}}/g, `lineGraph('timegraph', ${JSON.stringify(lgDatasets)})`)
    .replace(/{{enrollmentOverTime}}/g, `lineGraph('enrollmentgraphs', ${JSON.stringify(enrollmentOverTime)})`)
    .replace(/{{countGraph}}/g, `lineGraph('countgraph', ${JSON.stringify(countDatasets)}, ${showBreakdowns})`)
    .replace(/{{gpBreakdown}}/g, `lineGraph('gpBreakdown', ${JSON.stringify(gpBreakdown)}, ${showBreakdowns})`);
}

function makeFluidSets(classData, aggregateData) {
  let sets = classData.byGroup.map(x => ({
    name: x.displayName,
    data: x.counts.map(c => c[1]),
    stats: x.stats,
    lastUpdated: x.latest,
  }));

  if (aggregateData.exists) {
    const old = sets[0];
    if (old) {
      const data = old.data.map((d, i) => Number(d) + Number(aggregateData.counts[i][1]));
      const n = data.reduce((sum, count) => sum + count, 0);
      const mean = (data.reduce((sum, count, i) => sum + count * Number(GPA_LABELS[i]), 0) / n).toFixed(2);
      const list = [];
      data.forEach((count, index) => {
        for (let i = 0; i < count; i++) list.push(Number(GPA_LABELS[index]));
      });
      sets[0] = {
        name: old.name,
        data,
        stats: { n, mean, median: median(list) },
        lastUpdated: aggregateData.years[aggregateData.years.length - 1].name,
      };
    } else {
      sets = [{
        name: 'All Years',
        data: aggregateData.counts.map(c => c[1]),
        stats: { n: aggregateData.num, mean: formatStat(aggregateData.mean), median: formatStat(aggregateData.median) },
        lastUpdated: aggregateData.years[aggregateData.years.length - 1].name,
      }];
    }

    return sets.concat(aggregateData.years.map(y => ({
      name: y.name,
      data: y.counts.map(c => c[1]),
      stats: { n: y.num, mean: formatStat(y.mean), median: formatStat(y.median) },
      lastUpdated: y.name,
    })));
  }

  return sets;
}

function combinedCourseSummary(courseName, legacyClasses, aggregateRecords) {
  const legacy = legacyClasses.has(courseName) ? legacyClasses.get(courseName) : null;
  const aggregate = aggregateCourseData(aggregateRecords, courseName);
  const counts = GPA_LABELS.map(label => [label, 0]);
  if (legacy) {
    legacy.counts.forEach((count, index) => {
      counts[index][1] += count[1];
    });
  }
  if (aggregate) {
    aggregate.counts.forEach((count, index) => {
      counts[index][1] += count[1];
    });
  }
  const n = counts.reduce((sum, count) => sum + count[1], 0);
  if (!n) return null;
  const values = [];
  counts.forEach((count, index) => {
    for (let i = 0; i < count[1]; i++) values.push(Number(GPA_LABELS[index]));
  });
  return {
    counts,
    stats: {
      n,
      mean: Math.round((counts.reduce((sum, count, index) => sum + count[1] * Number(GPA_LABELS[index]), 0) / n) * 100) / 100,
      median: median(values),
    },
  };
}

function formatStat(value) {
  return value === null || value === undefined || Number.isNaN(Number(value))
    ? 'N/A'
    : Number(value).toFixed(2);
}

function gpa(students) {
  let total = 0;
  let counted = 0;
  students.forEach(student => {
    if (!Number.isNaN(Number(student.gradePoint))) {
      total += Number(student.gradePoint);
      counted++;
    }
  });
  return counted ? total / counted : 0;
}

function getNavbar(showSearch, courseNames) {
  let navbar = fs.readFileSync(path.join(PUBLIC_DIR, 'navbar.html'), 'utf8');
  if (!showSearch) navbar = navbar.replace('{{searchdisplay}}', 'nodisplay');
  const options = showSearch ? courseNames.map(name => {
    return `<option description="something" value='/${courseUrlSegment(name)}/'>${escapeHtml(name)}</option>`;
  }).join('') : '';
  return applyCommon(navbar, courseNames)
    .replace('{{searchdisplay}}', '')
    .replace('{{classes}}', options);
}

function applyCommon(html) {
  return html
    .replace(/{{headboilerplate}}/g, headBoilerplate())
    .replace(/{{basePath}}/g, BASE_PATH);
}

function headBoilerplate() {
  return `
<meta charset="utf-8">
<script>
  (function () {
    try {
      var theme = localStorage.getItem('imsa-grades-theme');
      if (!theme && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
      document.documentElement.setAttribute('data-theme', theme || 'light');
    } catch (err) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
</script>
<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css"
    integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous">
  <link rel="icon" href="${BASE_PATH}/assets/icon.png">
  <link rel="stylesheet" type="text/css"
    href="https://cdnjs.cloudflare.com/ajax/libs/selectize.js/0.12.1/css/selectize.default.css">
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/selectize.js/0.12.1/js/standalone/selectize.min.js"></script>
  <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.1.3/css/bootstrap.min.css"
    integrity="sha384-MCw98/SFnGE8fJT3GXwEOngsV7Zt27NXFoaoApmYm81iuXoPkFOJwJ8ERdknLPMO" crossorigin="anonymous">
  <link rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/bootstrap-select@1.13.9/dist/css/bootstrap-select.min.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@2.9.3/dist/Chart.min.js"></script>
  <script src="${BASE_PATH}/theme.js"></script>
  <meta property="og:url" content="https://imsagrades.com">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta property="og:image" content="${BASE_PATH}/assets/preview.png">
  <meta property="og:type" content="website">
  <script async src="https://www.googletagmanager.com/gtag/js?id=UA-154027590-5"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', 'UA-154027590-5');
  </script>
`;
}

function copyPublicAssets() {
  fs.readdirSync(PUBLIC_DIR, { withFileTypes: true }).forEach(entry => {
    const source = path.join(PUBLIC_DIR, entry.name);
    const target = path.join(DOCS_DIR, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(source, target, { recursive: true });
    } else if (!entry.name.endsWith('.html')) {
      fs.copyFileSync(source, target);
    }
  });
}

function copyDataFiles() {
  fs.copyFileSync(path.join(ROOT, 'grades.csv'), path.join(DOCS_DIR, 'grades.csv'));
  fs.copyFileSync(path.join(ROOT, 'grades.csv'), path.join(DOCS_DIR, 'grades'));
  fs.copyFileSync(path.join(ROOT, 'grades-recent.csv'), path.join(DOCS_DIR, 'grades-recent.csv'));
  fs.copyFileSync(path.join(ROOT, 'grades-recent.csv'), path.join(DOCS_DIR, 'grades-new'));
  const sourceData = path.join(ROOT, 'data');
  if (fs.existsSync(sourceData)) {
    fs.cpSync(sourceData, path.join(DOCS_DIR, 'data'), { recursive: true });
  }
}

function courseFileSegment(name) {
  return name.replace(/\//g, '_slash_');
}

function courseUrlSegment(name) {
  return encodeURI(courseFileSegment(name));
}

function normalizeBasePath(value) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '/') return '';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (require.main === module) {
  main();
}
