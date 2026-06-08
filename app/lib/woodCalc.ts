// ★ 계산 로직 — spec 공식 그대로. 임의 변경 금지.

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface WoodZone {
  id: string
  siteId: string
  company_id?: string
  zone_name: string
  part: '천장' | '벽'
  dim1: number               // mm
  dim2: number               // mm
  gypsum: 'none' | '1P' | '2P'
  gypsum_type: 'sitrack' | 'waterproof'
  insul_thickness: 0 | 10 | 30 | 50
  insul_layer: '1P' | '2P' | null
  mdf: boolean
  mdf_thickness: number | null
  plywood_thickness: number | null
  daruki_gap: 0 | 300 | 450   // 0 = 없음
  daruki_len: 2400 | 3600
  daruki_manual: number | null   // null = 자동값 사용
  half_sheet: boolean            // 쪽 발주 (엘리베이터 제한)
  created_at?: string
}

export interface MaterialLine {
  name: string       // 자재명 (단가표 name+spec)
  qty: number        // 수량
  unit: string       // 단위
  price: number      // 단가
  amount: number     // 금액
}

export interface ZoneResult {
  zone: WoodZone
  areaSqm: number            // 계산된 면적 (㎡)
  darukiAuto: DarukiCalc     // 다루끼 자동계산 상세
  materials: MaterialLine[]  // 이 구역의 자재 목록
}

export interface DarukiCalc {
  perimeterCount: number  // 둘레틀 [본]
  ribs: number           // 살줄수
  ribCount: number       // 살본수
  totalCount: number     // 총본수
  orderUnit: number      // 발주단수 [단]
}

export interface WoodMaterialPrice {
  id: string
  name: string
  spec: string
  category: string
  calc_type: string
  cover_m2: number | null
  unit: string
  price: number
  note: string
}

export interface ManualItem {
  priceId: string    // wood_materials_price.id
  name: string
  spec: string
  unit: string
  price: number
  qty: number
}

// ─── 핵심 계산 함수 (순수 함수) ───────────────────────────────────────────────

export const DEFAULT_LOSS_RATE = 0.10

export function calcArea(dim1: number, dim2: number): number {
  return (dim1 * dim2) / 1_000_000
}

export function calcGypsum(areaSqm: number, layer: '1P' | '2P', lossRate: number = DEFAULT_LOSS_RATE): number {
  const layers = layer === '2P' ? 2 : 1
  return Math.ceil((areaSqm / 1.62) * layers * (1 + lossRate))
}

export function calcInsulation(areaSqm: number, layer: '1P' | '2P', lossRate: number = DEFAULT_LOSS_RATE): number {
  const layers = layer === '2P' ? 2 : 1
  return Math.ceil((areaSqm / 1.62) * layers * (1 + lossRate))
}

export function calcBoard(areaSqm: number, lossRate: number = DEFAULT_LOSS_RATE, halfSheet: boolean = false): number {
  const cover = halfSheet ? 1.49 : 2.98
  return Math.ceil((areaSqm / cover) * (1 + lossRate))
}

export function calcDaruki(
  dim1: number,
  dim2: number,
  gap: 300 | 450,
  len: 2400 | 3600,
  lossRate: number = DEFAULT_LOSS_RATE,
): DarukiCalc {
  const perimeterCount = Math.ceil((2 * (dim1 + dim2)) / len)
  const shortSide = Math.min(dim1, dim2)
  const longSide  = Math.max(dim1, dim2)
  const ribs      = Math.max(Math.floor(shortSide / gap) - 1, 0)
  const ribCount  = ribs * Math.ceil(longSide / len)
  const totalCount = perimeterCount + ribCount
  const orderUnit  = Math.ceil((totalCount * (1 + lossRate)) / 12)
  return { perimeterCount, ribs, ribCount, totalCount, orderUnit }
}

// ─── 구역별 자재 산출 ─────────────────────────────────────────────────────────

export function calcZone(
  zone: WoodZone,
  prices: WoodMaterialPrice[],
  lossRate: number = DEFAULT_LOSS_RATE,
): ZoneResult {
  const areaSqm = calcArea(zone.dim1, zone.dim2)
  const darukiAuto = zone.daruki_gap > 0
    ? calcDaruki(zone.dim1, zone.dim2, zone.daruki_gap as 300 | 450, zone.daruki_len, lossRate)
    : { perimeterCount: 0, ribs: 0, ribCount: 0, totalCount: 0, orderUnit: 0 }
  const materials: MaterialLine[] = []

  const find = (category: string, matchFn?: (p: WoodMaterialPrice) => boolean) =>
    prices.find(p => p.category === category && (matchFn ? matchFn(p) : true))

  const push = (p: WoodMaterialPrice | undefined, qty: number) => {
    if (!p || qty <= 0) return
    materials.push({
      name: p.spec ? `${p.name} ${p.spec}` : p.name,
      qty,
      unit: p.unit,
      price: p.price,
      amount: p.price * qty,
    })
  }

  // 석고보드 (gypsum_type으로 시트락/방수 구분)
  if (zone.gypsum !== 'none') {
    const keyword = zone.gypsum_type === 'waterproof' ? '방수' : '시트락'
    const p = find('석고보드', p => p.name.includes(keyword))
    push(p, calcGypsum(areaSqm, zone.gypsum, lossRate))
  }

  // 단열재 (두께로 spec 매칭)
  if (zone.insul_thickness > 0 && zone.insul_layer) {
    const thickness = zone.insul_thickness
    const p = find('단열재', p => p.spec.startsWith(`${thickness}T`))
    push(p, calcInsulation(areaSqm, zone.insul_layer, lossRate))
  }

  // MDF (mdf_thickness로 spec 매칭)
  if (zone.mdf && zone.mdf_thickness) {
    const thickness = zone.mdf_thickness
    const p = find('MDF', p => p.spec.startsWith(`${thickness}T`))
    push(p, calcBoard(areaSqm, lossRate, zone.half_sheet))
  }

  // 합판 (두께로 spec 매칭)
  if (zone.plywood_thickness) {
    const thickness = zone.plywood_thickness
    const p = find('합판', p => p.spec.startsWith(`${thickness}T`))
    push(p, calcBoard(areaSqm, lossRate, zone.half_sheet))
  }

  // 다루끼 (수동값 우선, 없으면 자동값)
  const darukiOrderUnit = zone.daruki_manual ?? darukiAuto.orderUnit
  if (darukiOrderUnit > 0) {
    const lenLabel = zone.daruki_len === 2400 ? '8자' : '12자'
    const p = find('다루끼', p => p.spec.includes(lenLabel))
    push(p, darukiOrderUnit)
  }

  return { zone, areaSqm, darukiAuto, materials }
}

// ─── 현장 전체 합산 ───────────────────────────────────────────────────────────

export interface SummaryLine {
  name: string
  totalQty: number
  unit: string
  price: number
  totalAmount: number
}

export function aggregateZones(
  zoneResults: ZoneResult[],
  manualItems: ManualItem[],
): { lines: SummaryLine[]; grandTotal: number } {
  const map = new Map<string, SummaryLine>()

  for (const { materials } of zoneResults) {
    for (const m of materials) {
      const key = m.name
      const existing = map.get(key)
      if (existing) {
        existing.totalQty += m.qty
        existing.totalAmount += m.amount
      } else {
        map.set(key, { name: m.name, totalQty: m.qty, unit: m.unit, price: m.price, totalAmount: m.amount })
      }
    }
  }

  for (const item of manualItems) {
    const key = item.spec ? `${item.name} ${item.spec}` : item.name
    const existing = map.get(key)
    const amount = item.price * item.qty
    if (existing) {
      existing.totalQty += item.qty
      existing.totalAmount += amount
    } else {
      map.set(key, { name: key, totalQty: item.qty, unit: item.unit, price: item.price, totalAmount: amount })
    }
  }

  const lines = Array.from(map.values())
  const grandTotal = lines.reduce((sum, l) => sum + l.totalAmount, 0)
  return { lines, grandTotal }
}
