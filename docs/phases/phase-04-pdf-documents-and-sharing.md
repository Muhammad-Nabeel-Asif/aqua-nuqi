# Phase 4 — PDF Documents, Printing & Sharing

**Goal:** the owner can produce a professional bill for any customer at any time, print it, save
it, and send it to the customer on WhatsApp with minimal clicks.

**Depends on:** Phase 3. **Blocks:** nothing (Phase 8 reuses the PDF engine for reports).

Read `AGENT-BRIEF.md` first.

---

## Scope

Requirements: FR-PD-01…09.

### 4.1 PDF engine
- `pdf.service.ts` in the main process:
  1. Create a hidden `BrowserWindow` (offscreen, `show: false`).
  2. Load a dedicated renderer route `#/print/:template` with the document payload passed via a
     query param id and fetched over IPC (avoid giant URLs).
  3. Wait for a `document-ready` signal from the page (fonts loaded, images decoded).
  4. Call `webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins })`.
  5. Write the buffer to disk and return the path.
- Keep one reusable hidden window pooled for batch jobs; destroy it when idle.
- Templates are React components under `src/renderer/src/print/templates/` using Tailwind with a
  print stylesheet (`@page` size/margins, no shadows, exact colours).
- Bundle a font that renders PKR text and Urdu customer names correctly (e.g. Noto Sans +
  Noto Nastaliq Urdu) locally — no Google Fonts CDN at runtime.
- The same components render an on-screen preview, so what the owner sees is what prints.

### 4.2 Invoice template (FR-PD-02)
Layout, top to bottom:
- Header: logo (left), business name, address, phone(s), email (right).
- Title band: "INVOICE" / "BILL", invoice number, issue date, due date, billing period.
- Two columns: **Bill to** (customer name, code, address, phone) and **Summary** (previous
  balance, this month's charges, total payable, prominently boxed).
- Line-item table: `#`, Date, Description, Units, Rate, Amount. Delivery lines are grouped by date
  in ascending order. Package / rent / charge / discount / deposit lines follow.
- Totals block: total units this period, water charges, other charges, discount, tax (if enabled),
  **this period total**, previous balance, **TOTAL PAYABLE** (largest text on the page).
- Bottle summary box (toggle `invoice.showBottleBalance`): bottles delivered this month, empties
  returned, **bottles currently with you**, security deposit held.
- Payment section: bank/JazzCash/Easypaisa details from settings, due date, a note about late
  payment.
- Footer: `invoice.footerNote`, page x of y, generated timestamp, "This is a computer-generated
  invoice".
- Must fit a typical month on one page; paginate cleanly with a repeated table header when longer.

### 4.3 Other documents
- **Payment receipt** (A5 and 80 mm thermal variants): receipt no, date, customer, amount in
  figures and words, method, reference, balance after payment, received by, signature line.
- **Delivery slip** (80 mm thermal): date, customer, units delivered, empties taken, rate, amount,
  running balance — for the driver to leave with the customer.
- **Customer statement**: ledger for a date range with opening balance, all entries and closing
  balance. Very useful for disputes; make it easy to reach from the customer page.
- **Monthly delivery card**: a printable version of the paper card (the month grid) so the owner
  can keep the familiar artefact if he wants.
- **Bottles-out report** and **Receivables report** print layouts (reused by Phase 8).

### 4.4 Amount in words
`numberToWords(paisa)` producing e.g. "Rupees Three Thousand Seven Hundred Only", with the
Pakistani numbering system (lakh / crore) as a setting, defaulting to lakh/crore. Unit-test it,
including zero, paisa remainders and large values.

### 4.5 Generation, storage & naming
- Generated PDFs are saved under `<documentsFolder>/AquaNuqi/Invoices/<YYYY-MM>/` with the name
  `INV-<number>-<customerCode>-<customerNameSlug>.pdf`. Folder is configurable.
- The path is stored on `invoices.pdf_path`; regenerating overwrites and updates the timestamp.
- **Batch export** (FR-PD-03): for a period and filter, generate all PDFs with a progress dialog
  (`42 / 300`), a cancel button, and a final summary; then offer "Open folder".
- Batch of 300 invoices must complete in a reasonable time (target < 3 minutes) — generate
  sequentially in the pooled window; do not spawn 300 windows.

### 4.6 Printing (FR-PD-04)
- "Print" opens the system print dialog via `webContents.print()` on the same hidden window.
- Printer selection and a "default printer" setting; a separate default for thermal receipts.
- Print preview shows the actual template.

### 4.7 Sharing (FR-PD-05)
Implement these, in this order of prominence:
1. **WhatsApp**: build a message from a configurable template with placeholders
   (`{customerName}`, `{period}`, `{units}`, `{amount}`, `{previousBalance}`, `{totalPayable}`,
   `{dueDate}`, `{businessName}`). Open `https://wa.me/<intlNumber>?text=<encoded>` with
   `shell.openExternal`, which launches WhatsApp Desktop if installed, otherwise WhatsApp Web.
   Simultaneously call `shell.showItemInFolder(pdfPath)` so the file is one drag away, and copy
   the path to the clipboard. Show a short "Attach the PDF that is now highlighted in Explorer"
   hint (dismissible).
   Normalise phone numbers to international format (`+92…`) with a validation warning.
2. **Email**: `mailto:` link with subject and body prefilled (attachment still manual), plus
   "Copy PDF path".
3. **Save as / Open**: standard save dialog and open-with-default-viewer.
4. Record `invoices.last_shared_at` and an audit entry each time a share action is used, and show
   a "Shared" badge in the invoice list.

> Fully automated WhatsApp sending with an attachment is **not** possible offline without a paid
> WhatsApp Business API or an unofficial automation library that risks the client's number being
> banned. See `05-open-questions-and-recommendations.md` §WhatsApp. Do not implement one without
> explicit written approval.

### 4.8 Template customisation (FR-PD-09)
Settings → Invoice tab: logo upload (stored in userData, referenced by path), accent colour,
show/hide bottle box, show/hide rate column, footer note, terms text, thermal vs A4 default,
message templates for WhatsApp. Live preview beside the form.

### 4.9 Report export plumbing (FR-PD-07/08)
- A generic `exportTable({ title, columns, rows, filters, orientation })` used by any list screen
  to produce a branded PDF, and `exportExcel(...)` using a light library (`exceljs` or a CSV
  fallback — record which you used). Wire the export buttons that Phases 1–3 left in place.

---

## Out of scope
Reports content (Phase 8), SMS, cloud upload.

## Acceptance criteria

1. Generating a PDF for an invoice with 26 delivery lines produces a clean one-page A4 document
   with correct totals matching the on-screen invoice exactly.
2. An invoice with 60 lines paginates with a repeated table header and correct "Page 1 of 2".
3. A customer name in Urdu script renders correctly in the PDF (no boxes or missing glyphs).
4. Amount in words is correct for Rs 0, Rs 1,250, Rs 3,700, Rs 1,25,000 and Rs 1,20,00,000.
5. Batch export of 100 invoices completes with a progress indicator, produces 100 files with the
   correct names, and can be cancelled midway without corrupting anything.
6. Regenerating an invoice PDF after a rate change still shows the original rate and totals.
7. The WhatsApp action opens a chat with the right number and a correctly filled message, and the
   PDF is highlighted in the file explorer.
8. Printing to a PDF printer produces the same output as the saved PDF.
9. Changing the logo and accent colour in settings is reflected in the next generated PDF.
10. A payment receipt prints correctly on an 80 mm thermal printer layout (verify at 80 mm page
    size even if hardware is unavailable).
11. `typecheck`, `lint`, `test`, `build` pass; `PROGRESS.md` and `CHANGELOG.md` updated.

## Notes for the next phase
Record in `PROGRESS.md`: the `pdf.service` API, the template registry, the `exportTable` signature,
and the Excel library chosen.
