# Aqua Nuqi — Data Model (authoritative)

> This is the **single source of truth** for the database schema. Phase documents tell you _which_
> tables to create in that phase; the exact definition always comes from here.
> If a phase needs a column that is not here, add it here first (and note it in `PROGRESS.md`).

## Conventions

- Engine: SQLite, `foreign_keys = ON`, WAL.
- Primary keys: `INTEGER PRIMARY KEY` (rowid alias).
- Every business table also has `uuid TEXT NOT NULL UNIQUE` (v4, generated in the service layer)
  for future sync — see `02-architecture-and-stack.md` §10.
- Money: `INTEGER` **paisa**. Never `REAL`.
- Business dates: `TEXT` `YYYY-MM-DD`. Periods: `TEXT` `YYYY-MM`.
- System timestamps: `TEXT` ISO-8601 UTC. Columns `created_at`, `updated_at`.
- Booleans: `INTEGER` 0/1 with a `CHECK`.
- Soft delete: `deleted_at TEXT NULL` on master data; `status`/`void` flags on transactions.
- The DDL below is written as plain SQL for clarity. Implement it as Drizzle schema files and let
  `drizzle-kit` generate the migration; the resulting SQL must be equivalent.

---

## A. System & settings

```sql
CREATE TABLE app_meta (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
); -- schema_version, app_version, installed_at, db_uuid

CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,          -- JSON-encoded
  updated_at  TEXT NOT NULL
);
```

Known setting keys (typed accessors in `settingsService`):

| Key                                                | Type             | Default                        |
| -------------------------------------------------- | ---------------- | ------------------------------ |
| `business.name`                                    | string           | ""                             |
| `business.logoPath`                                | string           | ""                             |
| `business.address`                                 | string           | ""                             |
| `business.phone` / `business.phone2`               | string           | ""                             |
| `business.email`                                   | string           | ""                             |
| `business.bankDetails`                             | string           | ""                             |
| `business.taxNumber`                               | string           | ""                             |
| `locale.currencyCode` / `currencySymbol`           | string           | `PKR` / `Rs`                   |
| `locale.decimalPlaces`                             | number           | 0                              |
| `locale.dateFormat`                                | string           | `dd-MM-yyyy`                   |
| `invoice.numberPrefix`                             | string           | `INV`                          |
| `invoice.numberFormat`                             | string           | `{prefix}-{YYYY}-{MM}-{seq:4}` |
| `invoice.dueDays`                                  | number           | 10                             |
| `invoice.footerNote`                               | string           | ""                             |
| `invoice.showBottleBalance`                        | boolean          | true                           |
| `billing.defaultBillingDay`                        | number           | 1                              |
| `tax.enabled` / `tax.rate`                         | boolean / number | false / 0                      |
| `backup.folder`                                    | string           | `<userData>/backups`           |
| `backup.onExit` / `backup.daily` / `backup.weekly` | boolean          | true                           |
| `backup.keepDaily` / `keepWeekly`                  | number           | 14 / 8                         |
| `backup.secondaryFolder`                           | string           | ""                             |
| `security.autoLockMinutes`                         | number           | 15                             |
| `inventory.lowStockThreshold`                      | number           | 0                              |

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  uuid          TEXT NOT NULL UNIQUE,
  username      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,                -- argon2id (or bcrypt cost>=12)
  pin_hash      TEXT,
  role          TEXT NOT NULL CHECK (role IN ('owner','operator','viewer')),
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  last_login_at TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY,
  occurred_at  TEXT NOT NULL,
  user_id      INTEGER REFERENCES users(id),
  action       TEXT NOT NULL CHECK (action IN
                 ('create','update','delete','void','login','logout',
                  'settings_change','backup','restore','period_close','period_reopen','export',
                  'app_upgrade')),
  entity_table TEXT,
  entity_id    INTEGER,
  summary      TEXT NOT NULL,       -- human readable, shown in the UI
  before_json  TEXT,
  after_json   TEXT
);
CREATE INDEX idx_audit_occurred ON audit_log(occurred_at);
CREATE INDEX idx_audit_entity   ON audit_log(entity_table, entity_id);

CREATE TABLE closed_periods (
  id         INTEGER PRIMARY KEY,
  period     TEXT NOT NULL UNIQUE,   -- 'YYYY-MM'
  closed_at  TEXT NOT NULL,
  closed_by  INTEGER REFERENCES users(id),
  reopened_at TEXT,
  reopened_by INTEGER REFERENCES users(id),
  notes      TEXT
);

CREATE TABLE backup_log (
  id          INTEGER PRIMARY KEY,
  created_at  TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('manual','on_exit','daily','weekly','pre_migration','pre_restore')),
  file_path   TEXT NOT NULL,
  size_bytes  INTEGER,
  checksum    TEXT,
  status      TEXT NOT NULL CHECK (status IN ('success','failed')),
  message     TEXT
);

CREATE TABLE sequences (          -- gapless document numbering
  name        TEXT PRIMARY KEY,   -- e.g. 'invoice:2026-07', 'customer_code'
  next_value  INTEGER NOT NULL
);
```

---

## B. Master data

```sql
CREATE TABLE areas (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE routes (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  area_id INTEGER REFERENCES areas(id),
  default_employee_id INTEGER REFERENCES employees(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,                       -- '19 L Bottle'
  sku TEXT UNIQUE,
  size_liters REAL,                         -- 19
  kind TEXT NOT NULL CHECK (kind IN ('returnable_bottle','packaged_water','equipment','rental','service')),
  is_returnable INTEGER NOT NULL DEFAULT 1 CHECK (is_returnable IN (0,1)),
  default_rate INTEGER NOT NULL DEFAULT 0,  -- paisa
  default_deposit INTEGER NOT NULL DEFAULT 0,
  track_stock INTEGER NOT NULL DEFAULT 1 CHECK (track_stock IN (0,1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
-- Seed: ('19 L Bottle', 19, 'returnable_bottle', returnable=1, is_default=1)
```

---

## C. Customers

```sql
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,                -- 'C-0001'
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'residential'
      CHECK (customer_type IN ('residential','commercial','walk_in')),
  phone_primary TEXT,
  phone_secondary TEXT,
  whatsapp_number TEXT,
  email TEXT,
  address_line TEXT,
  landmark TEXT,
  area_id INTEGER REFERENCES areas(id),
  route_id INTEGER REFERENCES routes(id),
  delivery_notes TEXT,                      -- 'ring bell twice, 2nd floor'

  billing_mode TEXT NOT NULL DEFAULT 'per_bottle'
      CHECK (billing_mode IN ('per_bottle','monthly_package')),
  package_amount INTEGER,                   -- paisa, when monthly_package
  package_included_qty INTEGER,             -- bottles included in the package
  package_excess_rate INTEGER,              -- paisa per bottle beyond included

  billing_day INTEGER,                      -- day of month the bill is raised; null = global default
  credit_limit INTEGER,                     -- paisa; warn when exceeded (nullable = no limit)

  security_deposit_held INTEGER NOT NULL DEFAULT 0,   -- paisa currently held
  opening_bottles INTEGER NOT NULL DEFAULT 0,         -- bottles with customer at go-live
  opening_balance INTEGER NOT NULL DEFAULT 0,         -- paisa owed at go-live (+ = owes us)
  opening_as_of TEXT,                                 -- date the openings refer to

  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','inactive')),
  paused_from TEXT, paused_to TEXT, status_reason TEXT,
  joined_on TEXT,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  created_by INTEGER REFERENCES users(id), updated_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_customers_name   ON customers(name);
CREATE INDEX idx_customers_route  ON customers(route_id);
CREATE INDEX idx_customers_area   ON customers(area_id);
CREATE INDEX idx_customers_status ON customers(status);

-- Dated price list. Never UPDATE a rate: close the old row and insert a new one.
CREATE TABLE customer_rates (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  rate INTEGER NOT NULL,                    -- paisa
  effective_from TEXT NOT NULL,             -- YYYY-MM-DD
  effective_to   TEXT,                      -- NULL = currently active
  reason TEXT,
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_customer_rates_lookup ON customer_rates(customer_id, product_id, effective_from);

-- Optional fixed schedule (FR-CU-10)
CREATE TABLE customer_schedules (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  mode TEXT NOT NULL CHECK (mode IN ('weekdays','interval_days','on_call')),
  weekdays TEXT,                            -- CSV of 1..7 when mode='weekdays'
  interval_days INTEGER,                    -- when mode='interval_days'
  default_qty INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- Materialised summary; rebuildable. Updated inside the same transaction as its sources.
CREATE TABLE customer_balances (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
  balance INTEGER NOT NULL DEFAULT 0,               -- paisa, + = customer owes us
  bottles_with_customer INTEGER NOT NULL DEFAULT 0,
  last_delivery_date TEXT,
  last_payment_date TEXT,
  last_invoice_id INTEGER,
  updated_at TEXT NOT NULL
);
```

---

## D. Deliveries

```sql
CREATE TABLE deliveries (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  product_id    INTEGER NOT NULL REFERENCES products(id),
  delivery_date TEXT NOT NULL,                       -- YYYY-MM-DD
  quantity          INTEGER NOT NULL CHECK (quantity >= 0),
  empties_collected INTEGER NOT NULL DEFAULT 0 CHECK (empties_collected >= 0),
  rate   INTEGER NOT NULL,                           -- paisa, snapshot at entry time
  amount INTEGER NOT NULL,                           -- paisa, = quantity*rate unless free/package
  is_free INTEGER NOT NULL DEFAULT 0 CHECK (is_free IN (0,1)),
  free_reason TEXT,
  employee_id INTEGER REFERENCES employees(id),
  trip_id     INTEGER REFERENCES trips(id),
  cash_collected INTEGER NOT NULL DEFAULT 0,         -- paisa paid on the spot
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','void')),
  void_reason TEXT,
  invoice_id  INTEGER REFERENCES invoices(id),       -- set when billed; blocks editing
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id), updated_by INTEGER REFERENCES users(id)
);
CREATE UNIQUE INDEX uq_delivery_slot
  ON deliveries(customer_id, delivery_date, product_id) WHERE status = 'recorded';
CREATE INDEX idx_deliveries_date      ON deliveries(delivery_date);
CREATE INDEX idx_deliveries_cust_date ON deliveries(customer_id, delivery_date);
CREATE INDEX idx_deliveries_invoice   ON deliveries(invoice_id);
CREATE INDEX idx_deliveries_employee  ON deliveries(employee_id, delivery_date);
```

**Rules**

- Exactly one _recorded_ row per customer/date/product (FR-DL-05).
- `amount = quantity * rate` for `per_bottle` customers; `0` when `is_free = 1`; `0` for
  `monthly_package` customers (the package charge is added at invoice time), but `rate` is still
  snapshotted for reporting.
- Setting quantity to 0 ⇒ set `status = 'void'` rather than deleting.
- Writing requires `guardPeriodOpen(delivery_date)` and `invoice_id IS NULL`.

---

## E. Billing, ledger, payments

```sql
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  invoice_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  period       TEXT,                        -- 'YYYY-MM' (null for ad-hoc invoices)
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  issue_date   TEXT NOT NULL,
  due_date     TEXT,

  opening_balance    INTEGER NOT NULL DEFAULT 0,  -- carried forward, paisa
  deliveries_qty     INTEGER NOT NULL DEFAULT 0,
  deliveries_total   INTEGER NOT NULL DEFAULT 0,
  charges_total      INTEGER NOT NULL DEFAULT 0,  -- package, rent, damaged bottles
  discount_total     INTEGER NOT NULL DEFAULT 0,
  tax_total          INTEGER NOT NULL DEFAULT 0,
  invoice_total      INTEGER NOT NULL DEFAULT 0,  -- this period only
  total_payable      INTEGER NOT NULL DEFAULT 0,  -- opening_balance + invoice_total
  paid_total         INTEGER NOT NULL DEFAULT 0,
  closing_balance    INTEGER NOT NULL DEFAULT 0,
  bottles_with_customer_at_issue INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft','issued','partially_paid','paid','void')),
  void_reason TEXT,
  pdf_path TEXT,
  last_shared_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_invoices_customer ON invoices(customer_id, period);
CREATE INDEX idx_invoices_status   ON invoices(status);

CREATE TABLE invoice_lines (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  line_type TEXT NOT NULL CHECK (line_type IN
      ('delivery','package','rental','charge','discount','deposit','tax','carry_forward')),
  line_date TEXT,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  rate     INTEGER NOT NULL DEFAULT 0,
  amount   INTEGER NOT NULL DEFAULT 0,
  delivery_id INTEGER REFERENCES deliveries(id),
  adjustment_id INTEGER REFERENCES customer_adjustments(id)
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- One-off charges/credits that will appear on the next invoice, or stand alone.
CREATE TABLE customer_adjustments (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  adjustment_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN
      ('damaged_bottle','lost_bottle','dispenser_rent','delivery_charge','other_charge',
       'discount','write_off','deposit_received','deposit_refunded')),
  amount INTEGER NOT NULL,                 -- paisa, always positive; `kind` decides debit/credit
  quantity INTEGER,                        -- e.g. number of bottles lost
  description TEXT,
  invoice_id INTEGER REFERENCES invoices(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  receipt_no TEXT UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  payment_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN
      ('cash','bank_transfer','jazzcash','easypaisa','cheque','online','other')),
  reference_no TEXT,
  received_by_employee_id INTEGER REFERENCES employees(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  void_reason TEXT,
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_payments_customer ON payments(customer_id, payment_date);
CREATE INDEX idx_payments_date     ON payments(payment_date);

CREATE TABLE payment_allocations (
  id INTEGER PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id),
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','void'))
);
CREATE INDEX idx_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX idx_alloc_invoice ON payment_allocations(invoice_id);

-- APPEND-ONLY. The truth about what a customer owes.
CREATE TABLE ledger_entries (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  entry_date TEXT NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN
      ('opening_balance','invoice','payment','adjustment_debit','adjustment_credit',
       'deposit_received','deposit_refunded','write_off','void_reversal')),
  debit  INTEGER NOT NULL DEFAULT 0,     -- increases what the customer owes
  credit INTEGER NOT NULL DEFAULT 0,     -- decreases it
  balance_after INTEGER NOT NULL,        -- running balance snapshot
  description TEXT NOT NULL,
  ref_table TEXT, ref_id INTEGER,
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_ledger_customer ON ledger_entries(customer_id, entry_date, id);
```

**Rules**

- Deposits are recorded in the ledger **and** in `customers.security_deposit_held`, but are
  excluded from all revenue/profit calculations (FR-BL-14).
- Voiding an invoice or payment does **not** delete ledger rows; it appends a `void_reversal`
  entry with the opposite amounts.
- `balance_after` is recomputed for all later rows of that customer inside the same transaction
  when a back-dated entry is inserted.

---

## F. Expenses

```sql
CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES expense_categories(id),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)), -- 'Salaries' cannot be deleted
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  expense_date TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN
      ('cash','bank_transfer','jazzcash','easypaisa','cheque','credit','other')),
  vendor_name TEXT,
  description TEXT,
  reference_no TEXT,
  attachment_path TEXT,
  employee_id INTEGER REFERENCES employees(id),
  vehicle_id  INTEGER REFERENCES vehicles(id),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','payroll','purchase','recurring')),
  source_ref_table TEXT, source_ref_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id), updated_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_expenses_date     ON expenses(expense_date);
CREATE INDEX idx_expenses_category ON expenses(category_id, expense_date);

CREATE TABLE recurring_expenses (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  amount INTEGER NOT NULL,                  -- expected amount (editable when recorded)
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','yearly')),
  day_of_month INTEGER,
  vendor_name TEXT,
  next_due_date TEXT NOT NULL,
  last_recorded_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
```

Seed categories (`is_system = 1` for **Salaries** and **Employee Advance**): Electricity,
Raw water, Fuel, Vehicle maintenance, Bottle purchase, Caps & seals, Filter / RO membrane,
Plant maintenance & repairs, Rent, **Salaries**, **Employee Advance**, Licence & government fees,
Mobile & internet, Marketing, Miscellaneous.

---

## G. Employees & payroll

```sql
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,                -- 'E-001'
  name TEXT NOT NULL,
  phone TEXT, cnic TEXT, address TEXT, photo_path TEXT,
  emergency_contact_name TEXT, emergency_contact_phone TEXT,
  role TEXT NOT NULL DEFAULT 'delivery' CHECK (role IN ('delivery','plant','admin','other')),
  joining_date TEXT,
  leaving_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

-- Dated salary structure; never overwrite, close and insert.
CREATE TABLE employee_salaries (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  salary_type TEXT NOT NULL CHECK (salary_type IN ('monthly','daily','monthly_plus_commission','commission_only')),
  base_amount INTEGER NOT NULL DEFAULT 0,       -- paisa per month or per day
  commission_per_bottle INTEGER NOT NULL DEFAULT 0,
  overtime_hourly_rate INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  reason TEXT,
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);

CREATE TABLE attendance (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','half_day','paid_leave','unpaid_leave','holiday')),
  overtime_hours REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (employee_id, attendance_date)
);
CREATE INDEX idx_attendance_date ON attendance(attendance_date);

CREATE TABLE salary_advances (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  advance_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  settled_amount INTEGER NOT NULL DEFAULT 0,  -- cumulative paisa settled via payroll; outstanding = amount - settled_amount
  reason TEXT,
  settled_in_payroll_item_id INTEGER REFERENCES payroll_items(id),  -- latest active settlement (denorm)
  status TEXT NOT NULL DEFAULT 'outstanding' CHECK (status IN ('outstanding','settled','waived','void')),
  expense_id INTEGER REFERENCES expenses(id),
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);

-- Per payroll-item slices; void undoes rows for that item only (multi-month caps).
CREATE TABLE salary_advance_settlements (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  salary_advance_id INTEGER NOT NULL REFERENCES salary_advances(id),
  payroll_item_id INTEGER NOT NULL REFERENCES payroll_items(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TEXT NOT NULL,
  voided_at TEXT
);

CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  period TEXT NOT NULL UNIQUE,              -- 'YYYY-MM'
  generated_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalized','void')),
  total_net INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id)
);

CREATE TABLE payroll_items (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  salary_type TEXT NOT NULL,
  base_amount INTEGER NOT NULL DEFAULT 0,
  working_days INTEGER NOT NULL DEFAULT 0,
  days_present REAL NOT NULL DEFAULT 0,
  days_absent  REAL NOT NULL DEFAULT 0,
  absence_deduction INTEGER NOT NULL DEFAULT 0,
  bottles_delivered INTEGER NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0,
  overtime_hours REAL NOT NULL DEFAULT 0,
  overtime_amount INTEGER NOT NULL DEFAULT 0,
  bonus_amount INTEGER NOT NULL DEFAULT 0,
  advances_deducted INTEGER NOT NULL DEFAULT 0,
  other_deductions INTEGER NOT NULL DEFAULT 0,
  deduction_notes TEXT,
  net_payable INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  payment_date TEXT,
  payment_method TEXT,
  expense_id INTEGER REFERENCES expenses(id),
  notes TEXT,
  superseded_at TEXT,                      -- set when voided run is regenerated (no hard-delete)
  UNIQUE (payroll_run_id, employee_id) WHERE superseded_at IS NULL
);
```

---

## H. Inventory, vehicles, trips

```sql
CREATE TABLE vehicles (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  registration_no TEXT UNIQUE,
  vehicle_type TEXT CHECK (vehicle_type IN ('loader','rickshaw','bike','van','truck','other')),
  capacity_bottles INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE trips (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  trip_date TEXT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  vehicle_id  INTEGER REFERENCES vehicles(id),
  route_id    INTEGER REFERENCES routes(id),
  filled_loaded    INTEGER NOT NULL DEFAULT 0,
  filled_returned  INTEGER NOT NULL DEFAULT 0,
  empties_returned INTEGER NOT NULL DEFAULT 0,
  bottles_delivered_calc INTEGER NOT NULL DEFAULT 0,   -- from deliveries linked to this trip
  cash_expected  INTEGER NOT NULL DEFAULT 0,           -- Σ cash_collected on linked deliveries
  cash_submitted INTEGER NOT NULL DEFAULT 0,
  cash_variance  INTEGER NOT NULL DEFAULT 0,           -- submitted − expected
  bottle_variance INTEGER NOT NULL DEFAULT 0,          -- loaded − returned − delivered
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','void')),
  notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_trips_date ON trips(trip_date);

-- Append-only movement ledger. Stock levels are always derived from this.
CREATE TABLE stock_movements (
  id INTEGER PRIMARY KEY,
  uuid TEXT NOT NULL UNIQUE,
  movement_date TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  bottle_state TEXT NOT NULL CHECK (bottle_state IN ('filled','empty')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  from_location TEXT NOT NULL CHECK (from_location IN ('none','plant','van','customer','supplier')),
  to_location   TEXT NOT NULL CHECK (to_location   IN ('none','plant','van','customer','scrap')),
  vehicle_id INTEGER REFERENCES vehicles(id),
  customer_id INTEGER REFERENCES customers(id),
  reason TEXT NOT NULL CHECK (reason IN
      ('purchase','production','load_to_van','unload_from_van','delivery','empty_pickup',
       'damaged','lost','scrapped','adjustment','opening_stock')),
  ref_table TEXT, ref_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL, created_by INTEGER REFERENCES users(id)
);
CREATE INDEX idx_stock_date    ON stock_movements(movement_date);
CREATE INDEX idx_stock_product ON stock_movements(product_id, bottle_state);
```

**Movement recipes**

| Event                   | Movements created                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Buy 50 new bottles      | `supplier → plant`, state `empty`, reason `purchase` (+ an expense)                                                                     |
| Fill 40 bottles         | `plant → plant`, `empty` out / `filled` in — record as two rows: `empty: plant→none (production)` and `filled: none→plant (production)` |
| Load van with 60 filled | `filled: plant → van`, reason `load_to_van`                                                                                             |
| Deliver 3 to customer   | `filled: van → customer` (or `plant → customer` if trips are not used), reason `delivery`                                               |
| Collect 3 empties       | `empty: customer → van`, reason `empty_pickup`                                                                                          |
| Van returns             | `filled: van → plant` (unload), `empty: van → plant`                                                                                    |
| Bottle broken           | `empty                                                                                                                                  | filled: plant → scrap`, reason `damaged` |

Derived stock = Σ(in) − Σ(out) per `(product, state, location)`.

---

## I. Entity relationship summary

```
areas ─┬─< routes ─┬─< customers ─┬─< customer_rates
       │           │              ├─< customer_schedules
       │           │              ├─── customer_balances (1:1)
       │           │              ├─< deliveries >─── products
       │           │              ├─< customer_adjustments
       │           │              ├─< invoices ─< invoice_lines
       │           │              ├─< payments ─< payment_allocations >─ invoices
       │           │              └─< ledger_entries
       │           └─< trips >─ employees, vehicles
employees ─┬─< employee_salaries
           ├─< attendance
           ├─< salary_advances
           └─< payroll_items >─ payroll_runs
expense_categories ─< expenses
products ─< stock_movements
users ─< audit_log
```

## J. Derived values — canonical formulas

```
bottles_with_customer(c)
  = c.opening_bottles
  + Σ deliveries.quantity           where customer=c and status='recorded'
  − Σ deliveries.empties_collected  where customer=c and status='recorded'
  − Σ customer_adjustments.quantity where kind in ('damaged_bottle','lost_bottle') and status='active'

customer_balance(c)
  = c.opening_balance
  + Σ ledger_entries.debit − Σ ledger_entries.credit      (for customer c)

invoice.total_payable = opening_balance + invoice_total
invoice.invoice_total = deliveries_total + charges_total − discount_total + tax_total

revenue_accrual(period)  = Σ invoices.invoice_total  where status IN ('issued','partially_paid','paid')
                           (drafts excluded; deposits excluded by construction — not in invoice_total)
revenue_cash(period)     = Σ payments.amount where status='active' and payment_date in period
                           (excluding deposit receipts)
expenses_total(period)   = Σ expenses.amount where status='active' and expense_date in period
                           (includes payroll-generated salary expenses)
net_profit(period)       = revenue(period) − expenses_total(period)
cost_per_bottle(period)  = expenses_total(period) / Σ deliveries.quantity in period
```

> **Accounting note that must be honoured:** security deposits are a _liability_, not revenue.
> Employee advances are _not_ an expense at the time they are given — they become an expense when
> the salary is charged. If an advance is recorded as an expense when paid out, it must be reversed
> in the payroll month to avoid double counting. Implement it as: advance payout creates an
> `Employee Advance` expense; the payroll run then books salary expense **net of** advances already
> expensed. Document whichever approach is implemented in `PROGRESS.md`.
