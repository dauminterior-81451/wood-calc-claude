'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import {
  WoodZone,
  WoodMaterialPrice,
  calcArea,
  calcDaruki,
  calcZone,
  DEFAULT_LOSS_RATE,
} from '@/app/lib/woodCalc'

interface Props {
  siteId: string
  initial?: Partial<WoodZone>
  onSave: (data: Omit<WoodZone, 'id' | 'created_at'>, lossRate: number) => void
  onCancel?: () => void
}

function OptionBtn({
  active,
  onClick,
  children,
  color = 'blue',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  color?: 'blue' | 'orange' | 'green'
}) {
  const activeClass =
    color === 'orange'
      ? 'bg-orange-500 text-white border-orange-500'
      : color === 'green'
        ? 'bg-green-600 text-white border-green-600'
        : 'bg-blue-600 text-white border-blue-600'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
        active ? activeClass : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

function SegBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-500 mb-1.5">{children}</p>
}

function Section({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>
}

export default function ZoneForm({ siteId, initial, onSave, onCancel }: Props) {
  const [zoneName, setZoneName] = useState(initial?.zone_name ?? '')
  const [part, setPart] = useState<'천장' | '벽'>(initial?.part ?? '천장')
  const [dim1, setDim1] = useState(initial?.dim1?.toString() ?? '')
  const [dim2, setDim2] = useState(initial?.dim2?.toString() ?? '')

  const [gypsum, setGypsum] = useState<'none' | '1P' | '2P'>(initial?.gypsum ?? 'none')
  const [gypsumType, setGypsumType] = useState<'sitrack' | 'waterproof'>(
    initial?.gypsum_type ?? 'sitrack',
  )

  const [insulThickness, setInsulThickness] = useState<0 | 10 | 30 | 50>(
    initial?.insul_thickness ?? 0,
  )
  const [insulLayer, setInsulLayer] = useState<'1P' | '2P'>(initial?.insul_layer ?? '1P')

  const [mdf, setMdf] = useState(initial?.mdf ?? false)
  const [mdfThickness, setMdfThickness] = useState<number>(initial?.mdf_thickness ?? 9)

  const [plywoodThickness, setPlywoodThickness] = useState<number | null>(
    initial?.plywood_thickness ?? null,
  )

  const [halfSheet, setHalfSheet] = useState(initial?.half_sheet ?? false)

  const [darukiGap, setDarukiGap] = useState<0 | 300 | 450>(initial?.daruki_gap ?? 300)
  const [darukiLen, setDarukiLen] = useState<2400 | 3600>(initial?.daruki_len ?? 2400)
  const [darukiManual, setDarukiManual] = useState(initial?.daruki_manual?.toString() ?? '')

  const [lossRate, setLossRate] = useState(Math.round(DEFAULT_LOSS_RATE * 100).toString())

  const [prices, setPrices] = useState<WoodMaterialPrice[]>([])

  useEffect(() => {
    supabase
      .from('wood_materials_price')
      .select('*')
      .then(({ data }) => { if (data) setPrices(data as WoodMaterialPrice[]) })
  }, [])

  const dim1Num = parseFloat(dim1) || 0
  const dim2Num = parseFloat(dim2) || 0
  const lossNum = parseFloat(lossRate) / 100 || DEFAULT_LOSS_RATE
  const area = calcArea(dim1Num, dim2Num)

  const darukiAuto =
    darukiGap > 0 && dim1Num && dim2Num
      ? calcDaruki(dim1Num, dim2Num, darukiGap as 300 | 450, darukiLen, lossNum)
      : null

  // 미리보기용 임시 zone 객체
  const previewMaterials = (() => {
    if (!dim1Num || !dim2Num) return []
    const zone: WoodZone = {
      id: '__preview__',
      siteId,
      zone_name: zoneName || '미리보기',
      part,
      dim1: dim1Num,
      dim2: dim2Num,
      gypsum,
      gypsum_type: gypsumType,
      insul_thickness: insulThickness,
      insul_layer: insulThickness > 0 ? insulLayer : null,
      mdf,
      mdf_thickness: mdf ? mdfThickness : null,
      plywood_thickness: plywoodThickness,
      daruki_gap: darukiGap,
      daruki_len: darukiLen,
      daruki_manual: darukiManual !== '' ? parseFloat(darukiManual) : null,
      half_sheet: halfSheet,
    }
    return calcZone(zone, prices, lossNum).materials
  })()

  function handleSave() {
    if (!zoneName.trim()) {
      alert('구역명을 입력하세요')
      return
    }
    if (!dim1Num || !dim2Num) {
      alert('치수(가로/세로)를 입력하세요')
      return
    }

    onSave(
      {
        siteId,
        zone_name: zoneName.trim(),
        part,
        dim1: dim1Num,
        dim2: dim2Num,
        gypsum,
        gypsum_type: gypsumType,
        insul_thickness: insulThickness,
        insul_layer: insulThickness > 0 ? insulLayer : null,
        mdf,
        mdf_thickness: mdf ? mdfThickness : null,
        plywood_thickness: plywoodThickness,
        daruki_gap: darukiGap,
        daruki_len: darukiLen,
        daruki_manual: darukiManual !== '' ? parseFloat(darukiManual) : null,
        half_sheet: halfSheet,
      },
      lossNum,
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-5 w-full max-w-lg">
      {/* 구역명 + 부위 */}
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <Label>구역명</Label>
          <input
            type="text"
            value={zoneName}
            onChange={(e) => setZoneName(e.target.value)}
            placeholder="예: 거실 천장"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <Label>부위</Label>
          <div className="inline-flex rounded-lg overflow-hidden border border-gray-300">
            <SegBtn active={part === '천장'} onClick={() => setPart('천장')}>천장</SegBtn>
            <SegBtn active={part === '벽'} onClick={() => setPart('벽')}>벽</SegBtn>
          </div>
        </div>
      </div>

      {/* 치수 + 면적 */}
      <Section>
        <Label>치수 (mm) — {part === '천장' ? '가로 × 세로' : '폭 × 높이'}</Label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={dim1}
            onChange={(e) => setDim1(e.target.value)}
            placeholder={part === '천장' ? '가로' : '폭'}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 font-bold text-lg">×</span>
          <input
            type="number"
            value={dim2}
            onChange={(e) => setDim2(e.target.value)}
            placeholder={part === '천장' ? '세로' : '높이'}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="shrink-0 bg-blue-50 text-blue-700 font-semibold text-sm px-3 py-2 rounded-lg min-w-[72px] text-center">
            {area > 0 ? `${area.toFixed(2)} ㎡` : '— ㎡'}
          </div>
        </div>
      </Section>

      {/* 석고보드 */}
      <Section>
        <Label>석고보드</Label>
        <div className="flex gap-2 flex-wrap items-center">
          {(['none', '1P', '2P'] as const).map((g) => (
            <OptionBtn key={g} active={gypsum === g} onClick={() => setGypsum(g)}>
              {g === 'none' ? '없음' : g}
            </OptionBtn>
          ))}
          {gypsum !== 'none' && (
            <>
              <span className="text-gray-300 text-sm">|</span>
              {(['sitrack', 'waterproof'] as const).map((t) => (
                <OptionBtn
                  key={t}
                  active={gypsumType === t}
                  onClick={() => setGypsumType(t)}
                  color="orange"
                >
                  {t === 'sitrack' ? '시트락' : '방수'}
                </OptionBtn>
              ))}
            </>
          )}
        </div>
      </Section>

      {/* 단열재 */}
      <Section>
        <Label>단열재</Label>
        <div className="flex gap-2 flex-wrap items-center">
          {([0, 10, 30, 50] as const).map((t) => (
            <OptionBtn
              key={t}
              active={insulThickness === t}
              onClick={() => setInsulThickness(t)}
            >
              {t === 0 ? '없음' : `${t}T`}
            </OptionBtn>
          ))}
          {insulThickness > 0 && (
            <>
              <span className="text-gray-300 text-sm">|</span>
              <span className="text-xs text-gray-500">겹수</span>
              {(['1P', '2P'] as const).map((l) => (
                <OptionBtn
                  key={l}
                  active={insulLayer === l}
                  onClick={() => setInsulLayer(l)}
                  color="green"
                >
                  {l}
                </OptionBtn>
              ))}
            </>
          )}
        </div>
      </Section>

      {/* MDF */}
      <Section>
        <Label>MDF</Label>
        <div className="flex gap-3 items-center flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mdf}
              onChange={(e) => setMdf(e.target.checked)}
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
            <span className="text-sm text-gray-700">사용</span>
          </label>
          {mdf && (
            <>
              <span className="text-gray-300 text-sm">|</span>
              {[5, 6, 9, 12].map((t) => (
                <OptionBtn key={t} active={mdfThickness === t} onClick={() => setMdfThickness(t)}>
                  {t}T
                </OptionBtn>
              ))}
            </>
          )}
        </div>
      </Section>

      {/* 합판 */}
      <Section>
        <Label>합판</Label>
        <div className="flex gap-2 flex-wrap">
          <OptionBtn
            active={plywoodThickness === null}
            onClick={() => setPlywoodThickness(null)}
          >
            없음
          </OptionBtn>
          {[5, 9, 12, 18].map((t) => (
            <OptionBtn
              key={t}
              active={plywoodThickness === t}
              onClick={() => setPlywoodThickness(t)}
            >
              {t}T
            </OptionBtn>
          ))}
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none mt-2">
          <input
            type="checkbox"
            checked={halfSheet}
            onChange={(e) => setHalfSheet(e.target.checked)}
            className="w-4 h-4 accent-blue-600 cursor-pointer"
          />
          <span className="text-sm text-gray-700">엘리베이터 제한 — 쪽 발주</span>
          <span className="text-xs text-gray-400">(커버면적 1.49㎡, 온장 절반)</span>
        </label>
      </Section>

      {/* 다루끼 */}
      <Section>
        <Label>다루끼</Label>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-500 shrink-0">간격</span>
          {([0, 300, 450] as const).map((g) => (
            <OptionBtn key={g} active={darukiGap === g} onClick={() => setDarukiGap(g)}>
              {g === 0 ? '없음' : String(g)}
            </OptionBtn>
          ))}
          {darukiGap > 0 && (
            <>
              <span className="text-gray-300 text-sm">|</span>
              <span className="text-xs text-gray-500 shrink-0">길이</span>
              <div className="inline-flex rounded-lg overflow-hidden border border-gray-300">
                {([2400, 3600] as const).map((l) => (
                  <SegBtn key={l} active={darukiLen === l} onClick={() => setDarukiLen(l)}>
                    {l === 2400 ? '8자' : '12자'}
                  </SegBtn>
                ))}
              </div>
            </>
          )}
        </div>

        {darukiGap > 0 && (
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">자동계산</p>
              <p className="text-sm font-semibold text-gray-800">
                {darukiAuto ? (
                  <>
                    {darukiAuto.totalCount}본 →{' '}
                    <span className="text-blue-700">{darukiAuto.orderUnit}단</span>
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      (둘레 {darukiAuto.perimeterCount} + 살 {darukiAuto.ribCount})
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400">치수 입력 후 표시</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-gray-500">수동</span>
              <input
                type="number"
                value={darukiManual}
                onChange={(e) => setDarukiManual(e.target.value)}
                placeholder="단"
                className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </Section>

      {/* 로스율 */}
      <Section>
        <Label>로스율</Label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={lossRate}
            onChange={(e) => setLossRate(e.target.value)}
            min={0}
            max={50}
            className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">% (기본 10%)</span>
        </div>
      </Section>

      {/* 예상 자재 수량 미리보기 */}
      {previewMaterials.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500">예상 자재 수량</p>
          <div className="space-y-1">
            {previewMaterials.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{m.name}</span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {m.qty} <span className="text-gray-400 font-normal">{m.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 저장/취소 */}
      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          저장
        </button>
      </div>
    </div>
  )
}
