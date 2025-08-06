# PDF Generation Guide  
*Project: Mr. MoneyBags v1.x*  
*Location: `docs/development/PDF_GENERATION_GUIDE.md`*  

This guide records the **ONLY method that works reliably on the project Mac** for converting our HTML/Markdown docs to PDF, plus a log of what **doesn’t** work.  
Keep it handy so we don’t repeat the same experiments.

---

## 1 Environment Assumptions
• macOS (Monterey/Ventura/Sonoma tested)  
• Google Chrome installed in the default path:  
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`  
• Repository root: `~/factory/mr-moneybags`

---

## 2 The One Method That Works (Chrome Headless)

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless \
  --disable-gpu \
  --print-to-pdf="OUTPUT.pdf" \
  "file:///ABS/PATH/TO/INPUT.html"
```

### Why it works
Chrome’s rendering engine fully supports our modern CSS (print styles, `@page` rules, flex-box, etc.) and bundles its own PDF engine—no external LaTeX or GTK libraries needed.

---

## 3 Methods That **Failed** (and why)

| Method | Command Tried | Failure Reason |
|--------|---------------|----------------|
| **Pandoc + pdflatex / wkhtmltopdf** | `pandoc … --pdf-engine=wkhtmltopdf` | macOS lacks `pdflatex` and `wkhtmltopdf`; installing them is heavy and still produced layout glitches. |
| **WeasyPrint (PyPI)** | `python -c "from weasyprint import HTML; …"` | Missing GTK / Pango / GObject libs (`gobject-2.0-0`), complex to compile on Mac. |
| **cupsfilter** | `cupsfilter input.html > out.pdf` | Fails silently on HTML; designed for PostScript. |
| **Browser “Print” manually** | UI clicks | Works, but not scriptable/repeatable in CI. |

---

## 4 Step-by-Step Workflow

1. **Prepare HTML**  
   • Store in `docs/guides/…_PDF_Ready.html`  
   • Include print CSS and optional “Print to PDF” button (ignored in headless).  

2. **Generate the PDF**  
   ```bash
   cd ~/factory/mr-moneybags

   HTML="docs/guides/Zoho_Books_Comparison_v1.x_PDF_Ready.html"
   PDF="docs/guides/Zoho_Books_Comparison_v1.x.pdf"

   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless --disable-gpu \
     --print-to-pdf="$PDF" \
     "file://$(pwd)/$HTML"
   ```

3. **Verify**  
   ```bash
   open "$PDF"           # Preview on macOS
   du -h "$PDF"          # File size sanity-check (>100 KB typical)
   ```

4. **Commit**  
   ```bash
   git add "$PDF"
   git commit -m "Add refreshed $PDF"
   ```

---

## 5 Example Commands Cheat-Sheet

| Use-Case | Command |
|----------|---------|
| Installation Guide | `HTML=docs/guides/INSTALLATION_GUIDE_VirtualBox_Ubuntu24_v1.x_PDF_Ready.html`<br>`PDF=docs/guides/INSTALLATION_GUIDE_VirtualBox_Ubuntu24_v1.x.pdf`<br>`chrome --headless …` |
| Any HTML in /tmp | `chrome --headless --print-to-pdf=/tmp/out.pdf file:///tmp/in.html` |

*(`chrome` = full path to Chrome executable)*

---

## 6 Troubleshooting

| Symptom | Fix |
|---------|-----|
| **“chrome: command not found”** | Use full path `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` or add to `$PATH`. |
| **Output PDF size extremely small (<20 KB)** | Probably empty/blank—check HTML path (`file://` URL must be absolute). |
| **Fonts/CSS missing** | Ensure CSS is inline or uses absolute `file://` URLs. Remote links blocked in headless mode without internet. |
| **Images not rendered** | Same as above—use absolute paths. |
| **Permission denied** | Make sure destination directory is writable (`git` checkout not read-only). |

---

## 7 Project File-Naming Conventions

| Artifact | Pattern | Notes |
|----------|---------|-------|
| **Markdown source** | `..._v1.x.md` | Usually in `docs/guides/` or `docs/development/`. |
| **HTML (human-readable)** | `..._PDF_Ready.html` | Print CSS, no external assets. |
| **Final PDF** | `..._v1.x.pdf` | Same basename as HTML, version suffix matches product version. |
| **Backups / Old** | `..._OLD.pdf` or `..._BACKUP.pdf` | Never linked from UI—only for reference. |

---

## 8 Quick Reference

```bash
# 3-line wrapper function (add to ~/.zshrc)
pdfit () {
  local html="$1"; local pdf="${2:-${html/_PDF_Ready.html/.pdf}}"
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless --disable-gpu --print-to-pdf="$pdf" "file://$(pwd)/$html"
}
# Usage:
pdfit docs/guides/Zoho_Books_Comparison_v9.0_PDF_Ready.html
```

Print this cheat-sheet (`PDF_GENERATION_GUIDE.md`) and stick it next to your monitor—**no more trial-and-error!**  
