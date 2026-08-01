import { z } from 'zod'

const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const bottleStateSchema = z.enum(['filled', 'empty'])
export const stockLocationFromSchema = z.enum(['none', 'plant', 'van', 'customer', 'supplier'])
export const stockLocationToSchema = z.enum(['none', 'plant', 'van', 'customer', 'scrap'])
export const stockReasonSchema = z.enum([
  'purchase',
  'production',
  'load_to_van',
  'unload_from_van',
  'delivery',
  'empty_pickup',
  'damaged',
  'lost',
  'scrapped',
  'adjustment',
  'opening_stock',
])

export const vehicleTypeSchema = z.enum(['loader', 'rickshaw', 'bike', 'van', 'truck', 'other'])

export const vehicleDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  name: z.string(),
  registrationNo: z.string().nullable(),
  vehicleType: vehicleTypeSchema.nullable(),
  capacityBottles: z.number().int().nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type VehicleDto = z.infer<typeof vehicleDto>

export const listVehiclesInput = z.object({
  includeInactive: z.boolean().optional(),
})
export const listVehiclesOutput = z.object({ items: z.array(vehicleDto) })

export const createVehicleInput = z.object({
  name: z.string().min(1),
  registrationNo: z.string().nullable().optional(),
  vehicleType: vehicleTypeSchema.nullable().optional(),
  capacityBottles: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})
export type CreateVehicleInput = z.infer<typeof createVehicleInput>
export const createVehicleOutput = z.object({ item: vehicleDto })

export const updateVehicleInput = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).optional(),
  registrationNo: z.string().nullable().optional(),
  vehicleType: vehicleTypeSchema.nullable().optional(),
  capacityBottles: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})
export type UpdateVehicleInput = z.infer<typeof updateVehicleInput>
export const updateVehicleOutput = z.object({ item: vehicleDto })

export const getVehicleInput = z.object({
  id: z.number().int().positive(),
  from: businessDate.optional(),
  to: businessDate.optional(),
})
export const getVehicleOutput = z.object({
  item: vehicleDto,
  tripsCount: z.number().int(),
  bottlesCarried: z.number().int(),
  fuelAndMaintenanceTotal: z.number().int(),
  costPerBottleCarried: z.number().nullable(),
  expenses: z.array(
    z.object({
      id: z.number().int(),
      expenseDate: businessDate,
      categoryName: z.string(),
      amount: z.number().int(),
      description: z.string().nullable(),
    }),
  ),
  trips: z.array(
    z.object({
      id: z.number().int(),
      tripDate: businessDate,
      status: z.enum(['open', 'closed', 'void']),
      filledLoaded: z.number().int(),
      bottlesDeliveredCalc: z.number().int(),
      cashVariance: z.number().int(),
      bottleVariance: z.number().int(),
    }),
  ),
})

export const stockBalanceDto = z.object({
  productId: z.number().int(),
  productName: z.string(),
  filledAtPlant: z.number().int(),
  emptyAtPlant: z.number().int(),
  filledInVans: z.number().int(),
  emptyInVans: z.number().int(),
  withCustomers: z.number().int(),
  scrapped: z.number().int(),
  totalOwned: z.number().int(),
})
export type StockBalanceDto = z.infer<typeof stockBalanceDto>

export const getStockBalancesInput = z.object({
  asOf: businessDate.optional(),
  productId: z.number().int().positive().optional(),
})
export const getStockBalancesOutput = z.object({
  items: z.array(stockBalanceDto),
  /** Aggregate across all (or filtered) products. */
  totals: stockBalanceDto.omit({ productId: true, productName: true }),
  lowStock: z.object({
    threshold: z.number().int(),
    filledAtPlant: z.number().int(),
    isLow: z.boolean(),
    avgDailyConsumption14d: z.number(),
    daysOfStockLeft: z.number().nullable(),
  }),
})
export type GetStockBalancesOutput = z.infer<typeof getStockBalancesOutput>

export const stockMovementDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  movementDate: businessDate,
  productId: z.number().int(),
  productName: z.string().optional(),
  bottleState: bottleStateSchema,
  quantity: z.number().int().positive(),
  fromLocation: stockLocationFromSchema,
  toLocation: stockLocationToSchema,
  vehicleId: z.number().int().nullable(),
  vehicleName: z.string().nullable().optional(),
  customerId: z.number().int().nullable(),
  customerName: z.string().nullable().optional(),
  reason: stockReasonSchema,
  refTable: z.string().nullable(),
  refId: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.number().int().nullable(),
  /** Running totalOwned after this movement (optional, list view). */
  balanceAfterOwned: z.number().int().optional(),
})
export type StockMovementDto = z.infer<typeof stockMovementDto>

export const listStockMovementsInput = z.object({
  from: businessDate.optional(),
  to: businessDate.optional(),
  productId: z.number().int().positive().optional(),
  reason: stockReasonSchema.optional(),
  location: z.enum(['plant', 'van', 'customer', 'scrap', 'supplier', 'none']).optional(),
  vehicleId: z.number().int().positive().optional(),
  customerId: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(5000).optional(),
})
export const listStockMovementsOutput = z.object({
  items: z.array(stockMovementDto),
})

export const recordOpeningStockInput = z.object({
  date: businessDate,
  productId: z.number().int().positive().optional(),
  bottleState: bottleStateSchema,
  quantity: z.number().int().positive(),
  notes: z.string().nullable().optional(),
  /** Force via adjustment path when other movements already exist. */
  forceAdjustment: z.boolean().optional(),
})
export type RecordOpeningStockInput = z.infer<typeof recordOpeningStockInput>
export const recordOpeningStockOutput = z.object({ item: stockMovementDto })

export const purchaseBottlesInput = z.object({
  date: businessDate,
  productId: z.number().int().positive().optional(),
  quantity: z.number().int().positive(),
  /** Paisa per bottle. */
  unitCost: z.number().int().nonnegative(),
  vendorName: z.string().nullable().optional(),
  paymentMethod: z
    .enum(['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'cheque', 'credit', 'other'])
    .optional(),
  notes: z.string().nullable().optional(),
})
export type PurchaseBottlesInput = z.infer<typeof purchaseBottlesInput>
export const purchaseBottlesOutput = z.object({
  movement: stockMovementDto,
  expenseId: z.number().int(),
  expenseAmount: z.number().int(),
})

export const recordProductionInput = z.object({
  date: businessDate,
  productId: z.number().int().positive().optional(),
  quantity: z.number().int().positive(),
  operatorEmployeeId: z.number().int().positive().nullable().optional(),
  shift: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})
export type RecordProductionInput = z.infer<typeof recordProductionInput>
export const recordProductionOutput = z.object({
  emptyOut: stockMovementDto,
  filledIn: stockMovementDto,
})

export const recordDamageInput = z.object({
  date: businessDate,
  productId: z.number().int().positive().optional(),
  quantity: z.number().int().positive(),
  bottleState: bottleStateSchema,
  /** Where the bottle was when damaged/lost. */
  fromLocation: z.enum(['plant', 'van', 'customer']),
  reason: z.enum(['damaged', 'lost', 'scrapped']),
  vehicleId: z.number().int().positive().nullable().optional(),
  customerId: z.number().int().positive().nullable().optional(),
  notes: z.string().min(1),
  /** When lost/damaged at a customer, also create a lost_bottle / damaged_bottle adjustment. */
  chargeCustomer: z.boolean().optional(),
  chargeAmount: z.number().int().nonnegative().optional(),
})
export type RecordDamageInput = z.infer<typeof recordDamageInput>
export const recordDamageOutput = z.object({
  movement: stockMovementDto,
  adjustmentId: z.number().int().nullable(),
})

export const recordAdjustmentInput = z.object({
  date: businessDate,
  productId: z.number().int().positive().optional(),
  bottleState: bottleStateSchema,
  location: z.enum(['plant', 'van']),
  /** Positive = add stock at location; negative = remove (to scrap/none). */
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, 'delta must be non-zero'),
  vehicleId: z.number().int().positive().nullable().optional(),
  notes: z.string().min(1),
})
export type RecordAdjustmentInput = z.infer<typeof recordAdjustmentInput>
export const recordAdjustmentOutput = z.object({ item: stockMovementDto })

export const tripStatusSchema = z.enum(['open', 'closed', 'void'])

export const tripDto = z.object({
  id: z.number().int(),
  uuid: z.string(),
  tripDate: businessDate,
  employeeId: z.number().int().nullable(),
  employeeName: z.string().nullable().optional(),
  vehicleId: z.number().int().nullable(),
  vehicleName: z.string().nullable().optional(),
  routeId: z.number().int().nullable(),
  routeName: z.string().nullable().optional(),
  filledLoaded: z.number().int(),
  filledReturned: z.number().int(),
  emptiesReturned: z.number().int(),
  bottlesDeliveredCalc: z.number().int(),
  cashExpected: z.number().int(),
  cashSubmitted: z.number().int(),
  cashVariance: z.number().int(),
  bottleVariance: z.number().int(),
  /** Empties expected = Σ empties on linked deliveries. */
  emptiesExpected: z.number().int().optional(),
  status: tripStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.number().int().nullable(),
})
export type TripDto = z.infer<typeof tripDto>

export const listTripsInput = z.object({
  from: businessDate.optional(),
  to: businessDate.optional(),
  employeeId: z.number().int().positive().optional(),
  vehicleId: z.number().int().positive().optional(),
  status: tripStatusSchema.optional(),
})
export const listTripsOutput = z.object({ items: z.array(tripDto) })

export const startTripInput = z.object({
  tripDate: businessDate,
  employeeId: z.number().int().positive().nullable().optional(),
  vehicleId: z.number().int().positive(),
  routeId: z.number().int().positive().nullable().optional(),
  filledLoaded: z.number().int().positive(),
  emptiesLoaded: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  productId: z.number().int().positive().optional(),
})
export type StartTripInput = z.infer<typeof startTripInput>
export const startTripOutput = z.object({ item: tripDto })

export const getTripInput = z.object({ id: z.number().int().positive() })
export const getTripOutput = z.object({
  item: tripDto,
  reconciliation: z.object({
    filledExpected: z.number().int(),
    filledActual: z.number().int().nullable(),
    filledVariance: z.number().int().nullable(),
    emptiesExpected: z.number().int(),
    emptiesActual: z.number().int().nullable(),
    emptiesVariance: z.number().int().nullable(),
    cashExpected: z.number().int(),
    cashActual: z.number().int().nullable(),
    cashVariance: z.number().int().nullable(),
  }),
})

export const closeTripInput = z.object({
  id: z.number().int().positive(),
  filledReturned: z.number().int().nonnegative(),
  emptiesReturned: z.number().int().nonnegative(),
  cashSubmitted: z.number().int().nonnegative(),
  notes: z.string().nullable().optional(),
  productId: z.number().int().positive().optional(),
})
export type CloseTripInput = z.infer<typeof closeTripInput>
export const closeTripOutput = z.object({ item: tripDto })

export const voidTripInput = z.object({
  id: z.number().int().positive(),
  reason: z.string().min(1),
})
export const voidTripOutput = z.object({ item: tripDto })

export const employeeVarianceSummaryInput = z.object({
  from: businessDate,
  to: businessDate,
})
export const employeeVarianceSummaryOutput = z.object({
  items: z.array(
    z.object({
      employeeId: z.number().int(),
      employeeName: z.string(),
      tripsClosed: z.number().int(),
      totalCashVariance: z.number().int(),
      totalBottleVariance: z.number().int(),
    }),
  ),
})

export const inventoryBottlesOutInput = z.object({
  search: z.string().optional(),
  routeId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
  minBottles: z.number().int().nonnegative().optional(),
  shortfallOnly: z.boolean().optional(),
  noReturnDays: z.number().int().positive().optional(),
})
export const inventoryBottlesOutOutput = z.object({
  items: z.array(
    z.object({
      customerId: z.number().int(),
      code: z.string(),
      name: z.string(),
      phonePrimary: z.string().nullable(),
      whatsappNumber: z.string().nullable(),
      areaName: z.string().nullable(),
      routeName: z.string().nullable(),
      bottlesWithCustomer: z.number().int(),
      securityDepositHeld: z.number().int(),
      defaultDeposit: z.number().int(),
      /** bottles × default_deposit − deposit_held (paisa); 0 if covered. */
      depositShortfallAmount: z.number().int(),
      lastDeliveryDate: z.string().nullable(),
      lastEmptyReturnDate: z.string().nullable(),
      daysSinceLastReturn: z.number().int().nullable(),
    }),
  ),
  summary: z.object({
    totalBottlesWithCustomers: z.number().int(),
    totalValueAtDepositRate: z.number().int(),
    totalDepositShortfall: z.number().int(),
  }),
})
export type InventoryBottlesOutOutput = z.infer<typeof inventoryBottlesOutOutput>

export const recordBottleReturnInput = z.object({
  customerId: z.number().int().positive(),
  date: businessDate,
  empties: z.number().int().positive(),
  productId: z.number().int().positive().optional(),
  notes: z.string().nullable().optional(),
})
export type RecordBottleReturnInput = z.infer<typeof recordBottleReturnInput>
export const recordBottleReturnOutput = z.object({
  deliveryId: z.number().int(),
  bottlesWithCustomer: z.number().int(),
})
