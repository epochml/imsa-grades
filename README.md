# IMSA Grades

IMSA Grades is a site for exploring historical grade distributions at the Illinois Mathematics and Science Academy. It is not an official IMSA site.

## Install

Use Node.js 18 or newer.

```sh
npm install
```

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

Runs at `http://localhost:8080/`.

## BASE_PATH

By default, generated links assume the site is hosted at the domain root or on a custom domain:

```sh
BASE_PATH="" npm run build
```

For a GitHub Pages project site such as `https://epochml.github.io/imsa-grades/`, build with:

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

## Grade Bucket Rules

```text
A = 4.0, A- = 3.67, B+ = 3.33, B = 3.0, B- = 2.67,
C+ = 2.33, C = 2.0, C- = 1.67, D = 1.0
```

Non-GPA grades such as `P+`, `P`, `F`, `W`, `WF`, `I`, and unlabeled workbook columns are preserved in the normalized data but excluded from GPA/statistical charts. `A+` is preserved as its own normalized column and mapped into `A`/`4.0` only for website GPA charts.

## Development Notes

The old Express server remains available with:

```sh
npm start
```

Deployment no longer requires Express, Vercel, Firebase, Cloud Functions, or serverless functions. Node is used only at build/import time.

### License

MIT License



Maintainer: Cinna Davis (`cdavis@imsa.edu`)
