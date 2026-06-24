# FY22-FY25 Grade Distribution Import Report

Workbook: `Lee - 20260319 - Grade distribution FY22-25.xlsx`
Generated: 2026-06-24T05:24:38.791Z
Imported rows: 481

## Sheet Structure

- FY22: header row 2, 119 data rows, range includes merged fiscal-year/department cells.
- FY23: header row 2, 120 data rows, range includes merged fiscal-year/department cells.
- FY24: header row 2, 117 data rows, range includes merged fiscal-year/department cells.
- FY25: header row 2, 125 data rows, range includes merged fiscal-year/department cells.

## Normalization Rules

- Fiscal year and department cells are forward-filled from the previous nonblank row.
- Empty grade-count cells are written as zero.
- GPA charts use A, A-, B+, B, B-, C+, C, C-, and D counts on the existing IMSA Grades scale.
- A+ is preserved in the normalized data and mapped into A/4.0 only for website GPA/statistical charts.
- P+, P, F, W, WF, I, and unlabeled columns are preserved as counts but excluded from GPA calculations.
- No derivable total/grand-total columns were present in the FY22-FY25 sheets; row totals are generated from count columns.

## Nonstandard Columns

- A+ count: 1
- FY22:unlabeled_18: workbook column had no header; counts are preserved as unknown_count/unlabeled_* and excluded from GPA charts.
- FY25:unlabeled_18: workbook column had no header; counts are preserved as unknown_count/unlabeled_* and excluded from GPA charts.

## Issues

No malformed rows, missing course names, missing course numbers, nonnumeric counts, or total mismatches were detected.
