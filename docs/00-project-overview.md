# Aqua Nuqi — Project Overview

> Read this first. It gives you the business context. Every other document assumes you know
> what is written here.

## 1. What we are building

An **offline-first desktop application** (Windows-first, Electron + SQLite) for the owner of a
**water purification plant / water delivery business**. The app replaces the paper registers and
per-customer cards he currently uses.

It is **not** a web app. There is **no server**. All data lives in a local SQLite file on the
owner's laptop, with automatic local backups.

## 2. The business, in plain language

- The client owns a water plant that fills **19-litre returnable bottles** ("cans").
- He has **customers spread across the city** — homes, offices, shops.
- He employs **delivery staff** who load bottles into a vehicle and deliver them along a route.
- The unit of sale is **1 bottle = 1 unit = 19 litres**. If a customer takes 3 bottles, that is
  "3 units" on that date.
- Bottles are **returnable assets**. The delivery man normally picks up the customer's empty
  bottles when dropping filled ones. Bottles that are never returned are a real cash loss.
- **Billing is monthly.** Today each customer has a paper card with the days of the month printed
  on it. On each delivery day someone writes the number of units taken. At month end the owner
  adds up the units by hand, multiplies by the customer's rate, and sends a bill.
- The owner also pays **expenses** (electricity, fuel, vehicle repair, bottle purchase, RO filter
  replacement, rent, etc.) and **salaries** to employees, and wants to know his real profit.

## 3. Problems we are solving

| # | Problem today | What the app must do |
|---|---|---|
| 1 | Delivery units are tracked on paper cards, easy to lose and impossible to search | Digital, searchable, per-customer monthly delivery card |
| 2 | Month-end totals are calculated by hand | Automatic totals, automatic invoice amount |
| 3 | Bills are hand-written | One-click professional PDF invoice, ready to share |
| 4 | No idea how many bottles are sitting with which customer | Live "bottles with customer" balance per customer and overall |
| 5 | No record of who paid, who still owes | Customer ledger with running outstanding balance and ageing |
| 6 | Expenses are not recorded anywhere | Categorised expense tracking |
| 7 | Salaries, advances and attendance are informal | Employee records, attendance, advances, monthly payroll |
| 8 | Owner does not know his actual profit | Profit & Loss report: revenue − expenses (incl. salaries) |
| 9 | Everything is on paper, one accident away from being gone | Automatic scheduled backups + restore |

## 4. Who uses the app

| Persona | Description | Needs |
|---|---|---|
| **Owner** (the only real user) | Non-technical, moderate computer literacy, may prefer Urdu/English mix. **Confirmed: he personally enters every day's deliveries in the evening from the drivers' paper slips.** | Fast keyboard-driven data entry above all else, clear money numbers, printable bills, profit view |
| **Operator / munshi** (secondary, may never be used) | A clerk who could take over data entry on the same laptop under a separate login | Same entry screens, no access to profit, expenses, payroll or settings |
| **Delivery staff** | Not app users in v1 (they still carry a paper slip). Their deliveries are entered by the owner. | — |

> Because one non-technical person types the entire day's data himself, **the daily entry screen
> decides whether this product succeeds**. Target: 100 customers entered in under 4 minutes,
> keyboard only, no mouse. Everything else is secondary.

> A future mobile app for delivery staff is **out of scope**, but the data model must not make it
> impossible (see `02-architecture-and-stack.md` §Future-proofing).

## 5. Glossary — use these exact terms in code and UI

| Term | Meaning |
|---|---|
| **Unit / Bottle / Can** | One returnable 19 L bottle. Quantity is always in whole units. |
| **Filled bottle** | A bottle containing purified water, ready to deliver. |
| **Empty** | A bottle returned by a customer, to be washed and refilled. |
| **Delivery** | A record: on date D, customer C received Q filled bottles and returned E empties. |
| **Bottles with customer** | Running count of bottles physically held by a customer. `opening + Σdelivered − Σempties_collected`. |
| **Security deposit** | Refundable amount taken from a customer against the bottles they hold. |
| **Rate** | Price of one bottle for a specific customer. Differs per customer and changes over time. |
| **Ledger** | Per-customer running account. Invoices are debits, payments are credits. |
| **Outstanding / Balance due** | Ledger balance. Positive = customer owes the business. |
| **Advance** | Money paid by a customer beyond what is due (negative outstanding), **or** money given to an employee before payday. Context disambiguates; in code use `customer_credit` vs `salary_advance`. |
| **Trip** | One vehicle run: bottles loaded out, bottles/empties/cash brought back. |
| **Route** | A named group of customers served together (e.g. "Gulberg Morning"). |
| **Area / Zone** | Geographic grouping (e.g. "Model Town"). |
| **Period** | A billing month, e.g. `2026-07`. |
| **Closed period** | A month locked after billing so historical data cannot be silently edited. |

## 6. Non-negotiable product principles

1. **Works with zero internet.** Every core feature must function offline.
2. **Data is sacred.** Nothing is hard-deleted. Voids and soft-deletes only, with an audit trail.
3. **Money is never a floating-point number.** All amounts are integers in **paisa** (1 PKR = 100
   paisa). See `03-data-model.md` §Money.
4. **Historical accuracy.** An invoice printed in July must still print identically in December,
   even if the customer's rate changed. Rates and amounts are snapshotted onto transactions.
5. **Speed of entry beats beauty.** The daily delivery screen must be usable entirely from the
   keyboard. The owner will enter 100+ rows a day.
6. **The screen should look like the paper card** the owner already understands.

## 7. Locale defaults

- Currency: **PKR**, displayed as `Rs 1,250` (configurable symbol, thousands separator, 0 decimals
  by default but 2 supported).
- Dates: stored as ISO `YYYY-MM-DD` (text), displayed as `DD-MM-YYYY`.
- Timestamps: stored as ISO-8601 UTC text, displayed in local time.
- Week starts: **Monday** (configurable).
- Language: English UI in v1. All strings must go through an i18n helper so Urdu can be added
  later. Customer/employee names must accept Urdu characters (UTF-8 everywhere).

## 8. Deliverable

A signed, installable Windows application (`.exe`, NSIS installer) plus a portable build, that the
owner installs on his laptop and uses without any setup steps beyond choosing a data folder.
