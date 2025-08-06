# Mr. MoneyBags v1.x – PDF Documentation Set  

_Release date: 06 Aug 2025_  

---

## 1  What Was Accomplished  

• Converted the most-important v1.x guides to **print-ready PDFs** using an automated Chrome headless workflow.  
• Updated the application’s **Documentation** page to expose the new PDFs.  
• Ensured every guide reflects the **single-file, error-free schema deployment** (`database/db-init.sql + insert-complete-nacha-data.sql`).  

---

## 2  PDFs Generated  

| # | File (in `docs/guides/`) | Size (KB) | Description | In-App Link |
|:-:|--------------------------|:---------:|-------------|-------------|
| 1 | **INSTALLATION_GUIDE_VirtualBox_Ubuntu24_v1.x.pdf** | 404 | Step-by-step installation of Mr. MoneyBags v1.x in an Ubuntu 24.04 VirtualBox VM | Documentation → “Installation Guides → Ubuntu 24 VirtualBox (PDF)” |
| 2 | **Ubuntu_Deployment_Guide_v1.x.pdf** | 330 | Full production deployment playbook for Ubuntu 22.04 LTS servers | Documentation → “Deployment Guides → Ubuntu Deployment Guide (PDF)” |
| 3 | **Ubuntu_Deployment_Quick_Reference_v1.x.pdf** | 223 | Single-page cheat-sheet of common admin commands & rollback steps | Documentation → “Deployment Guides → Ubuntu Quick Reference (PDF)” |

*File sizes are approximate and may differ by a few bytes on other systems.*

---

## 3  Where to Find Them in the UI  

1. **Open the application** → top navigation **Documentation**.  
2. Under **Installation Guides** or **Deployment Guides**, click the desired PDF (opens in a new tab).  

All links use relative paths (e.g. `docs/guides/Ubuntu_Deployment_Guide_v1.x.pdf`) so they work in development, test and production.

---

## 4  PDF Generation Method  

All PDFs were produced with **Google Chrome headless** to guarantee CSS fidelity and reliable page-breaks:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu \
  --print-to-pdf="OUTPUT.pdf" \
  "file://$(pwd)/PATH/TO/INPUT_PDF_Ready.html"
```

* Why Chrome? ✓ full modern CSS support, ✓ built-in PDF engine, ✓ no external LaTeX/GTK dependencies.  
* Each HTML source (`*_PDF_Ready.html`) includes print-optimized CSS (`@page`, color-safe tables, code blocks).  

---

## 5  Notes on Updated Content & Error-Free Deployment  

• All guides now reference the **consolidated schema** (`db-init.sql`) and the **sample-data loader** (`insert-complete-nacha-data.sql`).  
• Migration-based instructions were removed; schema refresh is a single idempotent command.  
• Screenshots, commands, and titles were updated from “v9.x” to **“Mr. MoneyBags v1.x”**.  
• Legacy v9.x PDFs remain available but are clearly labelled *(legacy)* for historical context.  

---

_Questions or suggestions? Open an issue in the repository or email the docs team._  
