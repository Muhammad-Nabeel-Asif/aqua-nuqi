import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { getAppContext } from '@main/app-context'
import { defineHandler } from '@main/ipc/router'
import { newUuid } from '@main/lib/ids'
import {
  changeSalaryInput,
  changeSalaryOutput,
  comparePerformanceInput,
  comparePerformanceOutput,
  createAdvanceInput,
  createAdvanceOutput,
  createEmployeeInput,
  createEmployeeOutput,
  employeePerformanceInput,
  employeePerformanceOutput,
  finalizePayrollInput,
  finalizePayrollOutput,
  generatePayrollInput,
  generatePayrollOutput,
  getAttendanceMonthInput,
  getAttendanceMonthOutput,
  getEmployeeInput,
  getEmployeeOutput,
  getPayrollRunInput,
  getPayrollRunOutput,
  listActiveEmployeesOutput,
  listAdvancesInput,
  listAdvancesOutput,
  listEmployeesInput,
  listEmployeesOutput,
  listPayrollRunsOutput,
  markAllPresentInput,
  markAllPresentOutput,
  markHolidayInput,
  markHolidayOutput,
  nextEmployeeCodeOutput,
  payAllPayrollInput,
  payAllPayrollOutput,
  recordPayrollPaymentInput,
  recordPayrollPaymentOutput,
  setAttendanceInput,
  setAttendanceOutput,
  setAttendanceRangeInput,
  setAttendanceRangeOutput,
  setEmployeeStatusInput,
  setEmployeeStatusOutput,
  todayAttendanceInput,
  todayAttendanceOutput,
  updateEmployeeInput,
  updateEmployeeOutput,
  updatePayrollItemInput,
  updatePayrollItemOutput,
  uploadEmployeePhotoInput,
  uploadEmployeePhotoOutput,
  voidAdvanceInput,
  voidAdvanceOutput,
  voidPayrollInput,
  voidPayrollOutput,
  waiveAdvanceInput,
  waiveAdvanceOutput,
} from '@shared/contracts'

function employees() {
  return getAppContext().employees
}
function attendance() {
  return getAppContext().attendance
}
function payroll() {
  return getAppContext().payroll
}

export function registerEmployeeHandlers(): void {
  defineHandler({
    channel: 'employees:list',
    input: listEmployeesInput,
    output: listEmployeesOutput,
    roles: ['owner'],
    handler: (input) => employees().list(input),
  })

  defineHandler({
    channel: 'employees:listActive',
    input: z.object({}),
    output: listActiveEmployeesOutput,
    roles: ['owner', 'operator'],
    handler: () => ({ items: employees().listActiveOptions() }),
  })

  defineHandler({
    channel: 'employees:get',
    input: getEmployeeInput,
    output: getEmployeeOutput,
    roles: ['owner'],
    handler: (input) => employees().getById(input.id),
  })

  defineHandler({
    channel: 'employees:nextCode',
    input: z.object({}),
    output: nextEmployeeCodeOutput,
    roles: ['owner'],
    handler: () => ({ code: employees().peekNextCode() }),
  })

  defineHandler({
    channel: 'employees:create',
    input: createEmployeeInput,
    output: createEmployeeOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ item: employees().create(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'employees:update',
    input: updateEmployeeInput,
    output: updateEmployeeOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ item: employees().update(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'employees:setStatus',
    input: setEmployeeStatusInput,
    output: setEmployeeStatusOutput,
    roles: ['owner'],
    handler: (input, ctx) => employees().setStatus(input, ctx.userId!),
  })

  defineHandler({
    channel: 'employees:changeSalary',
    input: changeSalaryInput,
    output: changeSalaryOutput,
    roles: ['owner'],
    handler: (input, ctx) => employees().changeSalary({ ...input, userId: ctx.userId }),
  })

  defineHandler({
    channel: 'employees:uploadPhoto',
    input: uploadEmployeePhotoInput,
    output: uploadEmployeePhotoOutput,
    roles: ['owner'],
    handler: (input, ctx) => {
      const { paths } = getAppContext()
      if (!fs.existsSync(input.sourcePath)) {
        throw new Error('Source photo not found')
      }
      const ext = path.extname(input.sourcePath).toLowerCase() || '.jpg'
      const dir = path.join(paths.userData, 'attachments', 'employees')
      fs.mkdirSync(dir, { recursive: true })
      const relative = `employees/${newUuid()}${ext}`
      const dest = path.join(paths.userData, 'attachments', relative)
      fs.copyFileSync(input.sourcePath, dest)
      if (input.employeeId) {
        employees().update({ id: input.employeeId, photoPath: relative }, ctx.userId!)
      }
      return { photoPath: relative }
    },
  })

  defineHandler({
    channel: 'employees:payrollHistory',
    input: z.object({ employeeId: z.number().int().positive() }),
    output: z.object({
      items: z.array(
        z.object({
          period: z.string(),
          status: z.string(),
          netPayable: z.number().int(),
          paidAmount: z.number().int(),
        }),
      ),
    }),
    roles: ['owner'],
    handler: (input) => ({ items: employees().listPayrollHistory(input.employeeId) }),
  })

  // Attendance
  defineHandler({
    channel: 'attendance:getMonth',
    input: getAttendanceMonthInput,
    output: getAttendanceMonthOutput,
    roles: ['owner'],
    handler: (input) => attendance().getMonth(input.period),
  })

  defineHandler({
    channel: 'attendance:set',
    input: setAttendanceInput,
    output: setAttendanceOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ cell: attendance().setOne(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'attendance:setRange',
    input: setAttendanceRangeInput,
    output: setAttendanceRangeOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ updated: attendance().setRange(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'attendance:markAllPresent',
    input: markAllPresentInput,
    output: markAllPresentOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ updated: attendance().markAllPresent(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'attendance:markHoliday',
    input: markHolidayInput,
    output: markHolidayOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ updated: attendance().markHoliday(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'attendance:today',
    input: todayAttendanceInput,
    output: todayAttendanceOutput,
    roles: ['owner'],
    handler: (input) => attendance().todayPanel(input.date),
  })

  // Advances
  defineHandler({
    channel: 'advances:list',
    input: listAdvancesInput,
    output: listAdvancesOutput,
    roles: ['owner'],
    handler: (input) => payroll().listAdvances(input),
  })

  defineHandler({
    channel: 'advances:create',
    input: createAdvanceInput,
    output: createAdvanceOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ item: payroll().createAdvance(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'advances:void',
    input: voidAdvanceInput,
    output: voidAdvanceOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: payroll().voidAdvance(input.id, input.reason, ctx.userId!, {
        forceClosedPeriod: input.forceClosedPeriod,
      }),
    }),
  })

  defineHandler({
    channel: 'advances:waive',
    input: waiveAdvanceInput,
    output: waiveAdvanceOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      item: payroll().waiveAdvance(input.id, input.reason, ctx.userId!),
    }),
  })

  // Payroll
  defineHandler({
    channel: 'payroll:list',
    input: z.object({}),
    output: listPayrollRunsOutput,
    roles: ['owner'],
    handler: () => payroll().listRuns(),
  })

  defineHandler({
    channel: 'payroll:get',
    input: getPayrollRunInput,
    output: getPayrollRunOutput,
    roles: ['owner'],
    handler: (input) => payroll().getRun(input.id),
  })

  defineHandler({
    channel: 'payroll:generate',
    input: generatePayrollInput,
    output: generatePayrollOutput,
    roles: ['owner'],
    handler: (input, ctx) => payroll().generate(input, ctx.userId!),
  })

  defineHandler({
    channel: 'payroll:updateItem',
    input: updatePayrollItemInput,
    output: updatePayrollItemOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ item: payroll().updateItem(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'payroll:finalize',
    input: finalizePayrollInput,
    output: finalizePayrollOutput,
    roles: ['owner'],
    handler: (input, ctx) => payroll().finalize(input, ctx.userId!),
  })

  defineHandler({
    channel: 'payroll:void',
    input: voidPayrollInput,
    output: voidPayrollOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({
      run: payroll().voidRun(input.id, input.reason, ctx.userId!, {
        forceClosedPeriod: input.forceClosedPeriod,
      }),
    }),
  })

  defineHandler({
    channel: 'payroll:recordPayment',
    input: recordPayrollPaymentInput,
    output: recordPayrollPaymentOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ item: payroll().recordPayment(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'payroll:payAll',
    input: payAllPayrollInput,
    output: payAllPayrollOutput,
    roles: ['owner'],
    handler: (input, ctx) => ({ items: payroll().payAll(input, ctx.userId!) }),
  })

  defineHandler({
    channel: 'employees:performance',
    input: employeePerformanceInput,
    output: employeePerformanceOutput,
    roles: ['owner'],
    handler: (input) => payroll().employeePerformance(input.employeeId, input.period),
  })

  defineHandler({
    channel: 'employees:comparePerformance',
    input: comparePerformanceInput,
    output: comparePerformanceOutput,
    roles: ['owner'],
    handler: (input) => payroll().comparePerformance(input.period),
  })
}
