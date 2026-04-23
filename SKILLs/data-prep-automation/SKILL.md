---
name: Data Preparation & Excel Automation
description: Automates the extraction of security data from Fortinet reports and populates analysis Excel files (2025/2026), generating charts for the final report.
---

# Data Preparation Module ("Alista Datos")

This skill encapsulates the logic for preparing data for the Security Report. It bridges the gap between raw evidence (Fortinet logs/images) and the structured Excel analysis files.

## 1. Context & Resources

- **Target Files**: `Analisis 2025.xlsx` or `Analisis 2026.xlsx` located in the root of the respective year folder (e.g., `.../informes_seguridad/data/2026/`).
- **Sheets**:
  - `Bloqueos`: Tracks "Top 20 Categorías con accesos más Bloqueados".
  - `correos`: Tracks "Volumen de Correos" and "Top Virus".
- **Source**: Fortinet folders containing monthly reports (Images or PDFs).

## 2. Workflow Steps

### Step A: Verify & locate
1.  Identify the requested **Year** and **Month**.
2.  Locate the `Analisis {Year}.xlsx` file.
3.  Check if data for the requested {Month} already exists in the `Bloqueos` and `correos` sheets.
    - *If exists*: Skip extraction, proceed to chart generation.
    - *If missing*: Initiate Extraction Protocol.

### Step B: Extraction Protocol (PDF Automation)
1.  **Locate Source Files**:
    - Automatically search in `.../Fortinet/{Year}/{Month}/` (or similar structure) for PDF reports.
    - *FortiAnalyzer*: Look for keywords like "Reporte", "Monitor", "Web Usage".
    - *FortiMail*: Look for keywords like "Mail", "History", "Secure".
2.  **Processing (PDF -> Analysis)**:
    - Since extraction needs chart/table visual recognition, convert relevant PDF pages to images.
    - **FortiAnalyzer (Bloqueos)**:
        - Scan pages for header "Top 20 Categorías con accesos más Bloqueados".
        - Crop/Select that region.
        - Send to `llm_engine.analyze_image` to extract the table data.
    - **FortiMail (Correos)**:
        - Scan pages for headers "Top Histórico Total de Enviados y Recibidos" and "Top Histórico de Virus".
        - Extract table data via LLM.


### Step C: Excel Update
1.  Load workbook (using `openpyxl` or `pandas`).
2.  **Bloqueos**:
    - Locate the table/range for the specific Month.
    - Overwrite/Insert the extracted Top 20 data.
    - **Validation**: Ensure `Total` and `%` formulas trigger/calculate correctly.
3.  **Correos**:
    - Update "Enviados", "Recibidos", and "Virus" columns for the specific Month row.
4.  Save the Excel file.

### Step D: Visuals Generation
Since the backend is headless, we cannot rely on Excel to render charts to images.
1.  **Recreate Charts**: Use `matplotlib` or `seaborn` to replicate the look & feel of the Excel charts.
    - *Chart 1*: Top Blocked Categories (Bar Chart).
    - *Chart 2*: Mail Volume Trend (Line/Area Chart).
2.  **Save Images**: Save these generated charts as PNGs in the year/month folder (e.g., `.../data/2026/Enero/chart_bloqueos.png`).
3.  **Integration**: These images will be pulled by the Report Canvas "Análisis de Vulnerabilidades" item.

## 3. Implementation Details

- **Language**: Python
- **Libraries**: `pandas`, `openpyxl`, `matplotlib`, `pywry` (if needed for rendering), `llm_engine` (for OCR/Extraction).
- **Entry Point**: A new script `src/data_prep.py` or module in `simple_server.py`.

