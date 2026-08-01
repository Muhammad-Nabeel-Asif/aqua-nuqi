import fs from 'node:fs'
import path from 'node:path'
import { nativeImage, shell } from 'electron'
import { z } from 'zod'
import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import {
  copyExpenseReceipt,
  MAX_IMAGE_EDGE,
  resolveAttachmentAbsolute,
  type PreparedReceipt,
} from '@main/lib/expense-attachments'
import {
  attachExpenseReceiptInput,
  attachExpenseReceiptOutput,
  cashBookInput,
  cashBookOutput,
  createExpenseCategoryInput,
  createExpenseCategoryOutput,
  createExpenseInput,
  createExpenseOutput,
  createRecurringExpenseInput,
  createRecurringExpenseOutput,
  dueRecurringExpensesInput,
  dueRecurringExpensesOutput,
  expenseAttributionOptionsInput,
  expenseAttributionOptionsOutput,
  expenseInsightsOutput,
  expenseSummaryInput,
  getExpenseInput,
  getExpenseOutput,
  listExpenseCategoriesInput,
  listExpenseCategoriesOutput,
  listExpensesInput,
  listExpensesOutput,
  listRecurringExpensesInput,
  listRecurringExpensesOutput,
  mergeExpenseCategoriesInput,
  mergeExpenseCategoriesOutput,
  reorderExpenseCategoriesInput,
  reorderExpenseCategoriesOutput,
  resolveExpenseAttachmentInput,
  resolveExpenseAttachmentOutput,
  summaryByCategoryOutput,
  summaryByMonthOutput,
  updateExpenseCategoryInput,
  updateExpenseCategoryOutput,
  updateExpenseInput,
  updateExpenseOutput,
  updateRecurringExpenseInput,
  updateRecurringExpenseOutput,
  voidExpenseInput,
  voidExpenseOutput,
} from '@shared/contracts'
import { AppError } from '@shared/errors'

function prepareReceiptImage(sourcePath: string): PreparedReceipt | undefined {
  const ext = path.extname(sourcePath).toLowerCase()
  if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return undefined
  try {
    const img = nativeImage.createFromPath(sourcePath)
    if (img.isEmpty()) return undefined
    const size = img.getSize()
    if (size.width <= MAX_IMAGE_EDGE && size.height <= MAX_IMAGE_EDGE) return undefined
    const scale = Math.min(MAX_IMAGE_EDGE / size.width, MAX_IMAGE_EDGE / size.height)
    const resized = img.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
      quality: 'best',
    })
    if (ext === '.jpg' || ext === '.jpeg') {
      return { buffer: resized.toJPEG(85), destExt: '.jpg', downscaled: true }
    }
    return { buffer: resized.toPNG(), destExt: '.png', downscaled: true }
  } catch {
    return undefined
  }
}

export function registerExpenseHandlers(): void {
  const expenses = () => getAppContext().expenses

  // ── Categories ──────────────────────────────────────────────────────

  defineHandler({
    channel: 'expenseCategories:list',
    input: listExpenseCategoriesInput,
    output: listExpenseCategoriesOutput,
    roles: ['owner'],
    handler: (input) => ({
      items: expenses().listCategories(input.includeInactive ?? false),
    }),
  })

  defineHandler({
    channel: 'expenseCategories:create',
    input: createExpenseCategoryInput,
    output: createExpenseCategoryOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: expenses().createCategory(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'expenseCategories:update',
    input: updateExpenseCategoryInput,
    output: updateExpenseCategoryOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: expenses().updateCategory(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'expenseCategories:reorder',
    input: reorderExpenseCategoriesInput,
    output: reorderExpenseCategoriesOutput,
    roles: ['owner'],
    handler: (input, ctx) => {
      expenses().reorderCategories(input.orderedIds, ctx.userId!)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'expenseCategories:merge',
    input: mergeExpenseCategoriesInput,
    output: mergeExpenseCategoriesOutput,
    roles: ['owner'],
    handler: (input, ctx) => expenses().mergeCategories(input.fromId, input.intoId, ctx.userId!),
  })

  // ── Expenses ────────────────────────────────────────────────────────

  defineHandler({
    channel: 'expenses:create',
    input: createExpenseInput,
    output: createExpenseOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: expenses().createExpense(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'expenses:update',
    input: updateExpenseInput,
    output: updateExpenseOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: expenses().updateExpense(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'expenses:void',
    input: voidExpenseInput,
    output: voidExpenseOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: expenses().voidExpense(input.id, input.reason, ctx.userId!, {
        forceClosedPeriod: input.forceClosedPeriod,
      }),
    }),
  })

  defineHandler({
    channel: 'expenses:list',
    input: listExpensesInput,
    output: listExpensesOutput,
    roles: ['owner'],
    handler: (input) => expenses().listExpenses(input),
  })

  defineHandler({
    channel: 'expenses:get',
    input: getExpenseInput,
    output: getExpenseOutput,
    roles: ['owner'],
    handler: (input) => ({ item: expenses().getById(input.id) }),
  })

  defineHandler({
    channel: 'expenses:summaryByCategory',
    input: expenseSummaryInput,
    output: summaryByCategoryOutput,
    roles: ['owner'],
    handler: (input) => expenses().summaryByCategory(input.from, input.to),
  })

  defineHandler({
    channel: 'expenses:summaryByMonth',
    input: expenseSummaryInput,
    output: summaryByMonthOutput,
    roles: ['owner'],
    handler: (input) => expenses().summaryByMonth(input.from, input.to),
  })

  defineHandler({
    channel: 'expenses:insights',
    input: expenseSummaryInput,
    output: expenseInsightsOutput,
    roles: ['owner'],
    handler: (input) => expenses().insights(input.from, input.to),
  })

  defineHandler({
    channel: 'expenses:attributionOptions',
    input: expenseAttributionOptionsInput,
    output: expenseAttributionOptionsOutput,
    roles: ['owner'],
    handler: () => expenses().attributionOptions(),
  })

  defineHandler({
    channel: 'expenses:cashBook',
    input: cashBookInput,
    output: cashBookOutput,
    roles: ['owner'],
    handler: (input) => expenses().cashBook(input),
  })

  // ── Attachments ─────────────────────────────────────────────────────

  defineHandler({
    channel: 'expenses:attachReceipt',
    input: attachExpenseReceiptInput,
    output: attachExpenseReceiptOutput,
    roles: ['owner'],
    handler: (input) => {
      const { paths } = getAppContext()
      return copyExpenseReceipt({
        userData: paths.userData,
        sourcePath: input.sourcePath,
        expenseDate: input.expenseDate,
        prepared: prepareReceiptImage(input.sourcePath),
      })
    },
  })

  defineHandler({
    channel: 'expenses:resolveAttachment',
    input: resolveExpenseAttachmentInput,
    output: resolveExpenseAttachmentOutput,
    roles: ['owner'],
    handler: (input) => {
      const abs = resolveAttachmentAbsolute(getAppContext().paths.userData, input.relativePath)
      return { absolutePath: fs.existsSync(abs) ? abs : null, exists: fs.existsSync(abs) }
    },
  })

  defineHandler({
    channel: 'expenses:openAttachment',
    input: z.object({ relativePath: z.string().min(1) }),
    output: z.object({ ok: z.literal(true) }),
    roles: ['owner'],
    handler: async (input) => {
      const abs = resolveAttachmentAbsolute(getAppContext().paths.userData, input.relativePath)
      if (!fs.existsSync(abs)) {
        throw new AppError('NOT_FOUND', 'Attachment file not found')
      }
      await shell.openPath(abs)
      return { ok: true as const }
    },
  })

  defineHandler({
    channel: 'expenses:attachmentPreview',
    input: z.object({ relativePath: z.string().min(1) }),
    output: z.object({ dataUrl: z.string().nullable() }),
    roles: ['owner'],
    handler: (input) => {
      const abs = resolveAttachmentAbsolute(getAppContext().paths.userData, input.relativePath)
      if (!fs.existsSync(abs)) return { dataUrl: null }
      const lower = abs.toLowerCase()
      if (!/\.(jpg|jpeg|png|webp|gif)$/.test(lower)) return { dataUrl: null }
      const buf = fs.readFileSync(abs)
      const mime = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : lower.endsWith('.gif')
            ? 'image/gif'
            : 'image/jpeg'
      return { dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
    },
  })

  // ── Recurring ───────────────────────────────────────────────────────

  defineHandler({
    channel: 'recurringExpenses:list',
    input: listRecurringExpensesInput,
    output: listRecurringExpensesOutput,
    roles: ['owner'],
    handler: (input) => ({
      items: expenses().listRecurring(input.includeInactive ?? false),
    }),
  })

  defineHandler({
    channel: 'recurringExpenses:create',
    input: createRecurringExpenseInput,
    output: createRecurringExpenseOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: expenses().createRecurring(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'recurringExpenses:update',
    input: updateRecurringExpenseInput,
    output: updateRecurringExpenseOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: expenses().updateRecurring(input, ctx.userId!),
    }),
  })

  defineHandler({
    channel: 'recurringExpenses:due',
    input: dueRecurringExpensesInput,
    output: dueRecurringExpensesOutput,
    roles: ['owner'],
    handler: (input) => ({ items: expenses().dueRecurring(input.asOf) }),
  })
}
