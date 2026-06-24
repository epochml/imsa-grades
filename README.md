# IMSA Grades

IMSA Grades is a static site for exploring historical grade distributions at the Illinois Mathematics and Science Academy. It is not an official IMSA site.

Maintainer: Cinna Davis (`cdavis@imsa.edu`)

## Data

The repository keeps the existing historical data intact:

- `grades.csv`: student-level historical data from the original FOIA dataset.
- `grades-recent.csv`: aggregate AY/term/instructor data through AY21-22.
- `data/grade-distributions-fy22-fy25.csv`: normalized annual aggregate data imported from the FY22-FY25 workbook.
- `data/grade-distributions-fy22-fy25-report.md`: import report with sheet structure, normalization rules, and validation findings.

The static build uses `grades-recent.csv` through AY20-21 and uses the FY22-FY25 workbook for FY22 onward. AY21-22 is skipped from `grades-recent.csv` to avoid double-counting the overlapping FY22 workbook data.

## Install

Use Node.js 18 or newer.

```sh
npm install
```

## Updating The Excel Workbook

Place the workbook at the repository root. The default importer looks for a filename like:

```text
Lee - 20260319 - Grade distribution FY22-25.xlsx
```

The workbook must contain sheets named `FY22`, `FY23`, `FY24`, and `FY25`.

Run:

```sh
npm run import:data
```

To import a differently named workbook:

```sh
WORKBOOK="./path/to/workbook.xlsx" npm run import:data
```

The importer identifies the real header row in each FY sheet, forward-fills merged/blank fiscal year and department cells, treats empty grade-count cells as zero, and writes normalized CSV/JSON plus an import report under `data/`.

In the generated charts, annual workbook sheets are displayed by full fiscal year, such as `2022`, `2023`, `2024`, and `2025`, to match the existing year labels.

## Build

Generate the static site in `docs/`:

```sh
npm run build
```

Validate the generated output:

```sh
npm run validate:static
```

Preview locally:

```sh
npm run serve:static
```

Then open `http://localhost:8080/`.

## BASE_PATH

By default, generated links assume the site is hosted at the domain root or on a custom domain:

```sh
BASE_PATH="" npm run build
```

For a GitHub Pages project site such as `https://ORG.github.io/imsa-grades/`, build with:

```sh
BASE_PATH="/imsa-grades" npm run build
```

`BASE_PATH` is applied to generated asset paths, navigation links, class links, and raw data downloads.

## GitHub Pages Deployment

1. Run `npm run import:data` after updating the workbook.
2. Run `npm run build`.
3. Commit the generated `docs/` directory.
4. Go to repository Settings -> Pages.
5. Set Source to "Deploy from a branch."
6. Select the main/master branch and `/docs`.
7. Save.
8. Wait for the Pages deployment.
9. Use the GitHub Pages URL shown in Settings -> Pages.
10. Optionally configure a custom domain.

Use empty `BASE_PATH` for a custom domain. Use `BASE_PATH="/imsa-grades"` for a project page at `https://ORG.github.io/imsa-grades/`.

## Grade Bucket Rules

The site preserves the existing GPA scale:

```text
A = 4.0, A- = 3.67, B+ = 3.33, B = 3.0, B- = 2.67,
C+ = 2.33, C = 2.0, C- = 1.67, D = 1.0
```

Non-GPA grades such as `P+`, `P`, `F`, `W`, `WF`, `I`, and unlabeled workbook columns are preserved in the normalized data but excluded from GPA/statistical charts. `A+` is preserved as its own normalized column and mapped into `A`/`4.0` only for website GPA charts, because the existing frontend has no separate A+ bucket.

## Development Notes

The old Express server remains available with:

```sh
npm start
```

Deployment no longer requires Express, Vercel, Firebase, Cloud Functions, or serverless functions. Node is used only at build/import time.

### License

MIT License
