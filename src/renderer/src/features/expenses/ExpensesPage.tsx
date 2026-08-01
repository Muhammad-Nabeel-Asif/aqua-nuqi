import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Paperclip } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DateText } from '@renderer/components/DateText'
import { Money } from '@renderer/components/Money'
import { PageHeader } from '@renderer/components/PageHeader'
import { toast } from '@renderer/components/Toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import type {
  ExpenseDto,
  ExpensePaymentMethod,
  ExpenseSource,
  RecurringExpenseDto,
} from '@shared/contracts'
import { todayBusinessDate } from '@shared/date'
import { AppError } from '@shared/errors'
import { formatMoney, paisaToDecimalString, toPaisa, type Paisa } from '@shared/money'
import { type DatePreset, PAYMENT_METHODS, SOURCE_LABELS, rangeForPreset } from './date-presets'
import { ExpenseInsights } from './ExpenseInsights'
import { ExpenseSidePanel, type ExpensePrefill } from './ExpenseSidePanel'
import { RecurringExpensesPanel } from './RecurringExpensesPanel'

type SortBy = 'date' | 'amount' | 'category' | 'vendor'

export function ExpensesPage() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const amountRef = useRef<HTMLInputElement>(null)
  const listParentRef = useRef<HTMLDivElement>(null)
  const deepLinkHandled = useRef(false)

  const [preset, setPreset] = useState<DatePreset>('this_month')
  const initial = rangeForPreset('this_month')
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [categoryIds, setCategoryIds] = useState<number[]>([])
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod | ''>('')
  const [vendor, setVendor] = useState('')
  const [source, setSource] = useState<ExpenseSource | ''>('')
  const [search, setSearch] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Quick add
  const [qaDate, setQaDate] = useState(todayBusinessDate())
  const [qaCategoryId, setQaCategoryId] = useState<number | ''>('')
  const [qaAmount, setQaAmount] = useState('')
  const [qaDescription, setQaDescription] = useState('')
  const [qaMethod, setQaMethod] = useState<ExpensePaymentMethod>('cash')
  const [qaVendor, setQaVendor] = useState('')
  const [qaBusy, setQaBusy] = useState(false)

  const [panelExpense, setPanelExpense] = useState<ExpenseDto | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [prefill, setPrefill] = useState<ExpensePrefill | undefined>()
  const [showCashBook, setShowCashBook] = useState(false)
  const [cashDate, setCashDate] = useState(todayBusinessDate())
  const [openingCash, setOpeningCash] = useState('0')
  const [countedCash, setCountedCash] = useState('')

  const categoriesQ = useQuery({
    queryKey: ['expenseCategories'],
    queryFn: () => api.expenseCategories.list(true),
  })
  const dueQ = useQuery({
    queryKey: ['recurringExpenses', 'due'],
    queryFn: () => api.recurringExpenses.due(),
  })

  const listInput = useMemo(() => {
    let min: number | undefined
    let max: number | undefined
    try {
      if (amountMin.trim()) min = Number(toPaisa(amountMin))
    } catch {
      min = undefined
    }
    try {
      if (amountMax.trim()) max = Number(toPaisa(amountMax))
    } catch {
      max = undefined
    }
    return {
      from,
      to,
      categoryIds: categoryIds.length ? categoryIds : undefined,
      paymentMethod: paymentMethod || undefined,
      vendor: vendor.trim() || undefined,
      source: source || undefined,
      search: search.trim() || undefined,
      amountMin: min,
      amountMax: max,
      sortBy,
      sortDir,
      limit: 5000,
    }
  }, [
    from,
    to,
    categoryIds,
    paymentMethod,
    vendor,
    source,
    search,
    amountMin,
    amountMax,
    sortBy,
    sortDir,
  ])

  const listQ = useQuery({
    queryKey: ['expenses', listInput],
    queryFn: () => api.expenses.list(listInput),
  })

  const insightsQ = useQuery({
    queryKey: ['expenses', 'insights', from, to],
    queryFn: () => api.expenses.insights(from, to),
  })

  const cashQ = useQuery({
    queryKey: ['expenses', 'cashBook', cashDate, openingCash, countedCash],
    queryFn: () =>
      api.expenses.cashBook({
        date: cashDate,
        openingCash: Number(toPaisa(openingCash || '0')),
        countedCash: countedCash.trim() ? Number(toPaisa(countedCash)) : null,
      }),
    enabled: showCashBook,
  })

  const items = listQ.data?.items ?? []
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  })

  useEffect(() => {
    amountRef.current?.focus()
  }, [])

  function applyPreset(p: DatePreset) {
    setPreset(p)
    if (p === 'custom') return
    const r = rangeForPreset(p)
    setFrom(r.from)
    setTo(r.to)
  }

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ['expenses'] })
    await qc.invalidateQueries({ queryKey: ['recurringExpenses'] })
    await qc.invalidateQueries({ queryKey: ['expenseCategories'] })
  }

  function toggleSort(col: SortBy) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir(col === 'date' || col === 'amount' ? 'desc' : 'asc')
    }
  }

  function sortIndicator(col: SortBy) {
    if (sortBy !== col) return ''
    return sortDir === 'asc' ? ' ↑' : ' ↓'
  }

  async function quickAdd() {
    if (qaCategoryId === '' || !qaAmount.trim()) {
      toast({ title: 'Category and amount are required', variant: 'error' })
      return
    }
    let amount: number
    try {
      amount = Number(toPaisa(qaAmount))
    } catch {
      toast({ title: 'Invalid amount', variant: 'error' })
      return
    }
    if (amount <= 0) {
      toast({ title: 'Amount must be positive', variant: 'error' })
      return
    }
    setQaBusy(true)
    try {
      await api.expenses.create({
        expenseDate: qaDate,
        categoryId: Number(qaCategoryId),
        amount,
        paymentMethod: qaMethod,
        description: qaDescription || null,
        vendorName: qaVendor || null,
      })
      setQaAmount('')
      setQaDescription('')
      setQaVendor('')
      toast({ title: 'Expense recorded', variant: 'success' })
      await invalidate()
      requestAnimationFrame(() => amountRef.current?.focus())
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Could not record expense',
        variant: 'error',
        code: e instanceof AppError ? e.code : undefined,
      })
    } finally {
      setQaBusy(false)
    }
  }

  function openNew(p?: ExpensePrefill) {
    setPanelExpense(null)
    setPrefill(p)
    setPanelOpen(true)
  }

  function openEdit(e: ExpenseDto) {
    setPanelExpense(e)
    setPrefill(undefined)
    setPanelOpen(true)
  }

  function duplicate(e: ExpenseDto) {
    openNew({
      expenseDate: todayBusinessDate(),
      categoryId: e.categoryId,
      amountRupees: paisaToDecimalString(e.amount),
      description: e.description ?? '',
      paymentMethod: e.paymentMethod,
      vendorName: e.vendorName ?? '',
    })
  }

  async function voidRow(e: ExpenseDto) {
    if (e.readOnly) {
      toast({ title: 'System-generated expenses cannot be voided here', variant: 'error' })
      return
    }
    const reason = window.prompt('Reason for voiding this expense?')
    if (!reason?.trim()) return
    try {
      await api.expenses.void(e.id, reason.trim())
      toast({ title: 'Expense voided', variant: 'success' })
      await invalidate()
    } catch (err) {
      toast({
        title: err instanceof AppError ? err.message : 'Void failed',
        variant: 'error',
        code: err instanceof AppError ? err.code : undefined,
      })
    }
  }

  async function exportRows(kind: 'pdf' | 'excel') {
    const rows = items.map((e) => ({
      date: e.expenseDate,
      category: e.categoryName,
      description: e.description ?? '',
      vendor: e.vendorName ?? '',
      method: e.paymentMethod,
      source: e.source,
      amount: paisaToDecimalString(e.amount),
    }))
    const columns = [
      { key: 'date', header: 'Date' },
      { key: 'category', header: 'Category' },
      { key: 'description', header: 'Description' },
      { key: 'vendor', header: 'Vendor' },
      { key: 'method', header: 'Method' },
      { key: 'source', header: 'Source' },
      { key: 'amount', header: 'Amount (Rs)', align: 'right' as const },
    ]
    const filters = [
      { label: 'From', value: from },
      { label: 'To', value: to },
      { label: 'Total', value: formatMoney((listQ.data?.totalAmount ?? 0) as Paisa) },
    ]
    try {
      if (kind === 'pdf') {
        await api.pdf.exportTable({
          title: 'Expenses',
          fileName: `expenses-${from}-${to}.pdf`,
          openAfter: true,
          orientation: 'landscape',
          filters,
          columns,
          rows,
        })
      } else {
        await api.pdf.exportExcel({
          title: 'Expenses',
          fileName: `expenses-${from}-${to}.xlsx`,
          openAfter: true,
          columns,
          rows,
        })
      }
      toast({ title: `Exported ${kind.toUpperCase()}`, variant: 'success' })
    } catch (e) {
      toast({
        title: e instanceof AppError ? e.message : 'Export failed',
        variant: 'error',
      })
    }
  }

  function recordDue(r: RecurringExpenseDto) {
    openNew({
      expenseDate: todayBusinessDate(),
      categoryId: r.categoryId,
      amountRupees: paisaToDecimalString(r.amount),
      description: r.name,
      vendorName: r.vendorName ?? '',
      paymentMethod: 'cash',
      recurringExpenseId: r.id,
    })
  }

  // Dashboard deep-link: /expenses?recurring=<id> opens quick-add prefilled.
  useEffect(() => {
    if (deepLinkHandled.current) return
    const raw = searchParams.get('recurring')
    if (!raw) return
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0) return
    deepLinkHandled.current = true
    void api.recurringExpenses.list(true).then((res) => {
      const item = res.items.find((r) => r.id === id)
      if (item) recordDue(item)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('recurring')
          return next
        },
        { replace: true },
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link on mount
  }, [searchParams])

  const prev = listQ.data?.previousTotalAmount ?? 0
  const cur = listQ.data?.totalAmount ?? 0
  const delta = cur - prev
  const deltaPct = prev > 0 ? Math.round((delta / prev) * 1000) / 10 : null

  const activeCategories = (categoriesQ.data?.items ?? []).filter((c) => c.isActive)
  const employeeAdvanceId = (categoriesQ.data?.items ?? []).find(
    (c) => c.name === 'Employee Advance',
  )?.id

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Every rupee leaving the business — categorised for a truthful profit figure"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/expenses/categories">Categories</Link>
            </Button>
            <Button variant="outline" onClick={() => setShowCashBook((v) => !v)}>
              {showCashBook ? 'Hide cash book' : 'Cash book'}
            </Button>
            <Button variant="outline" onClick={() => void exportRows('excel')}>
              Excel
            </Button>
            <Button variant="outline" onClick={() => void exportRows('pdf')}>
              PDF
            </Button>
            <Button onClick={() => openNew({ expenseDate: todayBusinessDate() })}>Full form</Button>
          </>
        }
      />

      {(dueQ.data?.items.length ?? 0) > 0 && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="mb-2 text-sm font-medium text-sky-950">Recurring expenses due this month</p>
          <ul className="flex flex-wrap gap-2">
            {dueQ.data!.items.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-sm hover:bg-sky-100"
                  onClick={() => recordDue(r)}
                >
                  {r.name} (<Money value={r.amount} />)
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <RecurringExpensesPanel categories={categoriesQ.data?.items ?? []} onRecordDue={recordDue} />

      {/* Quick add */}
      <form
        className="mb-4 grid grid-cols-2 items-end gap-2 rounded-lg border bg-slate-50 p-3 md:grid-cols-7"
        onSubmit={(e) => {
          e.preventDefault()
          void quickAdd()
        }}
      >
        <div>
          <label className="mb-1 block text-xs text-slate-600">Date</label>
          <Input type="date" value={qaDate} onChange={(e) => setQaDate(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Category</label>
          <select
            className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
            value={qaCategoryId}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : ''
              setQaCategoryId(id)
              if (id !== '' && id === employeeAdvanceId) {
                toast({
                  title: 'Employee Advance',
                  description:
                    'Advances should be netted by payroll (Phase 6). Booking here inflates expenses until then.',
                })
              }
            }}
          >
            <option value="">Select…</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Amount (Rs)</label>
          <Input
            ref={amountRef}
            inputMode="decimal"
            value={qaAmount}
            onChange={(e) => setQaAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Description</label>
          <Input value={qaDescription} onChange={(e) => setQaDescription(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Method</label>
          <select
            className="flex h-10 w-full rounded-md border bg-white px-2 text-sm"
            value={qaMethod}
            onChange={(e) => setQaMethod(e.target.value as ExpensePaymentMethod)}
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-600">Vendor</label>
          <Input value={qaVendor} onChange={(e) => setQaVendor(e.target.value)} />
        </div>
        <Button type="submit" disabled={qaBusy} className="h-10">
          {qaBusy ? '…' : 'Add'}
        </Button>
      </form>

      {/* Range + totals */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['today', 'Today'],
              ['this_month', 'This month'],
              ['last_month', 'Last month'],
              ['this_year', 'This year'],
              ['custom', 'Custom'],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={preset === key ? 'default' : 'outline'}
              onClick={() => applyPreset(key)}
            >
              {label}
            </Button>
          ))}
        </div>
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => {
            setPreset('custom')
            setFrom(e.target.value)
          }}
        />
        <Input
          type="date"
          className="w-40"
          value={to}
          onChange={(e) => {
            setPreset('custom')
            setTo(e.target.value)
          }}
        />
        <div className="ml-auto text-right">
          <p className="text-3xl font-bold tabular-nums text-slate-900">
            <Money value={cur} />
          </p>
          <p className="text-xs text-muted-foreground">
            vs prior period <Money value={prev} />
            {deltaPct != null && (
              <span className={delta > 0 ? ' text-red-600' : ' text-emerald-700'}>
                {' '}
                ({delta >= 0 ? '+' : ''}
                {deltaPct}%)
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value=""
          onChange={(e) => {
            const id = Number(e.target.value)
            if (!id) return
            setCategoryIds((prevIds) =>
              prevIds.includes(id) ? prevIds.filter((x) => x !== id) : [...prevIds, id],
            )
          }}
        >
          <option value="">+ Category filter</option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {categoryIds.includes(c.id) ? ' ✓' : ''}
            </option>
          ))}
        </select>
        {categoryIds.map((id) => {
          const name = activeCategories.find((c) => c.id === id)?.name ?? String(id)
          return (
            <button
              key={id}
              type="button"
              className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-900"
              onClick={() => setCategoryIds((p) => p.filter((x) => x !== id))}
            >
              {name} ×
            </button>
          )
        })}
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as ExpensePaymentMethod | '')}
        >
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value={source}
          onChange={(e) => setSource(e.target.value as ExpenseSource | '')}
        >
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Input
          className="w-36"
          placeholder="Vendor"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
        />
        <Input
          className="w-28"
          placeholder="Min Rs"
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
        />
        <Input
          className="w-28"
          placeholder="Max Rs"
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
        />
        <Input
          className="w-48"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showCashBook && (
        <div className="mb-4 rounded-lg border bg-white p-4">
          <h3 className="mb-3 font-semibold">Daily cash book</h3>
          <div className="mb-3 flex flex-wrap gap-3">
            <Input
              type="date"
              className="w-40"
              value={cashDate}
              onChange={(e) => setCashDate(e.target.value)}
            />
            <Input
              className="w-36"
              placeholder="Opening cash"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
            />
            <Input
              className="w-36"
              placeholder="Counted cash"
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
            />
          </div>
          {cashQ.data && (
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
              <CashStat label="Opening" value={cashQ.data.openingCash} />
              <CashStat
                label={`Cash in (${cashQ.data.cashInCount})`}
                value={cashQ.data.cashIn}
                tone="green"
              />
              <CashStat
                label={`Cash out (${cashQ.data.cashOutCount})`}
                value={cashQ.data.cashOut}
                tone="red"
              />
              <CashStat label="Closing (calc)" value={cashQ.data.closingCash} />
              <CashStat
                label="Variance"
                value={cashQ.data.variance ?? 0}
                tone={
                  cashQ.data.variance == null
                    ? undefined
                    : cashQ.data.variance === 0
                      ? 'green'
                      : 'red'
                }
                empty={cashQ.data.variance == null}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Informational only — cash in from payments (method cash, deposits excluded), cash out
            from expenses (method cash). No accounting entries are written.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border bg-white">
        <div className="grid grid-cols-[100px_1fr_1.2fr_1fr_90px_100px_40px_120px] gap-2 border-b bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
          <button
            type="button"
            className="text-left hover:text-slate-900"
            onClick={() => toggleSort('date')}
          >
            Date{sortIndicator('date')}
          </button>
          <button
            type="button"
            className="text-left hover:text-slate-900"
            onClick={() => toggleSort('category')}
          >
            Category{sortIndicator('category')}
          </button>
          <span>Description</span>
          <button
            type="button"
            className="text-left hover:text-slate-900"
            onClick={() => toggleSort('vendor')}
          >
            Vendor{sortIndicator('vendor')}
          </button>
          <span>Method</span>
          <button
            type="button"
            className="text-right hover:text-slate-900"
            onClick={() => toggleSort('amount')}
          >
            Amount{sortIndicator('amount')}
          </button>
          <span />
          <span />
        </div>
        <div ref={listParentRef} className="max-h-[420px] overflow-auto">
          {listQ.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No expenses in this range. Use the quick-add form above to record one.
            </div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((vr) => {
                const e = items[vr.index]!
                return (
                  <div
                    key={e.id}
                    className="absolute left-0 grid w-full grid-cols-[100px_1fr_1.2fr_1fr_90px_100px_40px_120px] items-center gap-2 border-b px-3 text-sm"
                    style={{ height: vr.size, transform: `translateY(${vr.start}px)` }}
                  >
                    <span>
                      <DateText value={e.expenseDate} />
                    </span>
                    <span className="truncate">{e.categoryName}</span>
                    <span className="truncate text-slate-600">{e.description ?? '—'}</span>
                    <span className="truncate">{e.vendorName ?? '—'}</span>
                    <span className="text-xs text-slate-500">
                      {e.paymentMethod}
                      {e.source !== 'manual' && (
                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900">
                          {SOURCE_LABELS[e.source]}
                        </span>
                      )}
                    </span>
                    <span className="text-right tabular-nums font-medium">
                      <Money value={e.amount} />
                    </span>
                    <span className="text-center">
                      {e.attachmentPath ? (
                        <button
                          type="button"
                          title="View attachment"
                          onClick={() => void api.expenses.openAttachment(e.attachmentPath!)}
                        >
                          <Paperclip className="inline h-4 w-4 text-sky-700" />
                        </button>
                      ) : null}
                    </span>
                    <span className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="text-xs text-sky-700 underline"
                        onClick={() => openEdit(e)}
                      >
                        {e.readOnly ? 'View' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        className="text-xs text-slate-600 underline"
                        onClick={() => duplicate(e)}
                      >
                        Dup
                      </button>
                      {!e.readOnly && (
                        <button
                          type="button"
                          className="text-xs text-red-600 underline"
                          onClick={() => void voidRow(e)}
                        >
                          Void
                        </button>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex justify-between border-t bg-slate-50 px-3 py-2 text-sm font-semibold">
          <span>{listQ.data?.total ?? 0} expenses</span>
          <span className="tabular-nums">
            Total <Money value={cur} />
          </span>
        </div>
      </div>

      {insightsQ.data && (
        <ExpenseInsights
          byMonth={insightsQ.data.byMonth}
          byCategory={insightsQ.data.byCategory}
          topVendors={insightsQ.data.topVendors}
        />
      )}

      <ExpenseSidePanel
        open={panelOpen}
        expense={panelExpense}
        categories={categoriesQ.data?.items ?? []}
        prefill={prefill}
        onClose={() => setPanelOpen(false)}
        onSaved={() => void invalidate()}
      />
    </div>
  )
}

function CashStat({
  label,
  value,
  tone,
  empty,
}: {
  label: string
  value: number
  tone?: 'green' | 'red'
  empty?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          tone === 'green'
            ? 'font-semibold text-emerald-700'
            : tone === 'red'
              ? 'font-semibold text-red-600'
              : 'font-semibold'
        }
      >
        {empty ? '—' : <Money value={value} />}
      </p>
    </div>
  )
}
