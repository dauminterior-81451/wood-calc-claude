'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import ZoneForm from '@/app/components/wood-calc/ZoneForm'
import {
  WoodZone,
  WoodMaterialPrice,
  ZoneResult,
  SummaryLine,
  calcArea,
  calcZone,
  aggregateZones,
  DEFAULT_LOSS_RATE,
} from '@/app/lib/woodCalc'

// ─── 단가표관리 탭 ────────────────────────────────────────────────────────────

function PriceTable({
  prices,
  onRefresh,
}: {
  prices: WoodMaterialPrice[]
  onRefresh: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{prices.length}개 자재</p>
        <button onClick={onRefresh} className="text-sm text-blue-600 hover:underline">
          새로고침
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3 text-left">자재명</th>
              <th className="px-4 py-3 text-left">규격</th>
              <th className="px-4 py-3 text-left">카테고리</th>
              <th className="px-4 py-3 text-right">단가</th>
              <th className="px-4 py-3 text-left">단위</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {prices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  단가 데이터가 없습니다
                </td>
              </tr>
            ) : (
              prices.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.spec}</td>
                  <td className="px-4 py-2.5 text-gray-500">{p.category}</td>
                  <td className="px-4 py-2.5 text-right text-gray-800">
                    {p.price.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{p.unit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 자재 테이블 (구역별/합계 공용) ──────────────────────────────────────────

function MaterialTable({
  rows,
  footer,
}: {
  rows: { name: string; qty: number; unit: string; price: number; amount: number }[]
  footer?: React.ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-4 py-2.5 text-left">자재명</th>
            <th className="px-4 py-2.5 text-right">수량</th>
            <th className="px-4 py-2.5 text-left">단위</th>
            <th className="px-4 py-2.5 text-right">단가</th>
            <th className="px-4 py-2.5 text-right">금액</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                산출 자재 없음
              </td>
            </tr>
          ) : (
            rows.map((m, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-800">{m.name}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{m.qty}</td>
                <td className="px-4 py-2.5 text-gray-500">{m.unit}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">
                  {m.price.toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                  {m.amount.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
        {footer}
      </table>
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<'자재산출' | '단가표관리'>('자재산출')
  const [siteName, setSiteName] = useState('')
  const [headerMode, setHeaderMode] = useState<null | 'new' | 'load'>(null)
  const [newSiteInput, setNewSiteInput] = useState('')
  const [existingSites, setExistingSites] = useState<string[]>([])
  const [loadingSites, setLoadingSites] = useState(false)
  const [zones, setZones] = useState<WoodZone[]>([])
  const [prices, setPrices] = useState<WoodMaterialPrice[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lossRateMap, setLossRateMap] = useState<Record<string, number>>({})
  const [showForm, setShowForm] = useState(false)
  const [loadingZones, setLoadingZones] = useState(false)
  const [savingZone, setSavingZone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPrices = useCallback(async () => {
    const { data } = await supabase
      .from('wood_materials_price')
      .select('*')
      .order('category')
    if (data) setPrices(data as WoodMaterialPrice[])
  }, [])

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  const fetchZones = useCallback(async (siteId: string) => {
    setLoadingZones(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('wood_zones')
        .select('*')
        .eq('siteId', siteId)
        .order('created_at', { ascending: true })
      if (error) throw error
      setZones((data ?? []) as WoodZone[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '구역 로드 실패')
    } finally {
      setLoadingZones(false)
    }
  }, [])

  async function handleOpenLoad() {
    setHeaderMode('load')
    setLoadingSites(true)
    try {
      const { data } = await supabase.from('wood_zones').select('siteId')
      if (data) {
        const unique = [...new Set((data as { siteId: string }[]).map((r) => r.siteId))].sort()
        setExistingSites(unique)
      }
    } finally {
      setLoadingSites(false)
    }
  }

  function handleConfirmNewSite() {
    const name = newSiteInput.trim()
    if (!name) return
    setSiteName(name)
    setZones([])
    setSelectedId(null)
    setShowForm(false)
    setHeaderMode(null)
    setNewSiteInput('')
  }

  function handleSelectSite(name: string) {
    setSiteName(name)
    setZones([])
    setSelectedId(null)
    setShowForm(false)
    setHeaderMode(null)
    fetchZones(name)
  }

  async function handleSaveZone(
    data: Omit<WoodZone, 'id' | 'created_at'>,
    lossRate: number,
  ) {
    setSavingZone(true)
    setError(null)
    try {
      const { data: inserted, error } = await supabase
        .from('wood_zones')
        .insert([data])
        .select()
        .single()
      if (error) throw error
      const zone = inserted as WoodZone
      setZones((prev) => [...prev, zone])
      setLossRateMap((prev) => ({ ...prev, [zone.id]: lossRate }))
      setShowForm(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '구역 저장 실패')
    } finally {
      setSavingZone(false)
    }
  }

  async function handleDeleteZone(id: string) {
    const { error } = await supabase.from('wood_zones').delete().eq('id', id)
    if (!error) {
      setZones((prev) => prev.filter((z) => z.id !== id))
      if (selectedId === id) setSelectedId(null)
    }
  }

  const zoneResults: ZoneResult[] = zones.map((z) =>
    calcZone(z, prices, lossRateMap[z.id] ?? DEFAULT_LOSS_RATE),
  )
  const selectedResult = zoneResults.find((r) => r.zone.id === selectedId) ?? null
  const { lines: summaryLines, grandTotal } = aggregateZones(zoneResults, [])

  const summaryRows = summaryLines.map((l: SummaryLine) => ({
    name: l.name,
    qty: l.totalQty,
    unit: l.unit,
    price: l.price,
    amount: l.totalAmount,
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-900">목공 산출</h1>
            {siteName && (
              <button
                onClick={() => { setSiteName(''); setZones([]); setSelectedId(null); setShowForm(false); setHeaderMode(null) }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                현장 변경
              </button>
            )}
          </div>

          {/* 현장 미선택: 버튼 2개 */}
          {!siteName && headerMode === null && (
            <div className="flex gap-2">
              <button
                onClick={() => setHeaderMode('new')}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                + 새 현장
              </button>
              <button
                onClick={handleOpenLoad}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                현장 불러오기
              </button>
            </div>
          )}

          {/* 새 현장 입력 */}
          {headerMode === 'new' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={newSiteInput}
                onChange={(e) => setNewSiteInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmNewSite()}
                placeholder="현장명 입력"
                autoFocus
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleConfirmNewSite}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                저장
              </button>
              <button
                onClick={() => { setHeaderMode(null); setNewSiteInput('') }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
            </div>
          )}

          {/* 현장 불러오기 드롭다운 */}
          {headerMode === 'load' && (
            <div className="flex gap-2">
              {loadingSites ? (
                <p className="text-sm text-gray-400 py-2">불러오는 중…</p>
              ) : existingSites.length === 0 ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-gray-400">저장된 현장이 없습니다</p>
                  <button
                    onClick={() => setHeaderMode(null)}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    닫기
                  </button>
                </div>
              ) : (
                <>
                  <select
                    defaultValue=""
                    onChange={(e) => e.target.value && handleSelectSite(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="" disabled>현장 선택…</option>
                    {existingSites.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setHeaderMode(null)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                </>
              )}
            </div>
          )}

          {/* 현장 선택 완료 */}
          {siteName && (
            <p className="text-xs text-gray-500 mt-1">
              현장: <span className="font-semibold text-gray-800">{siteName}</span>
            </p>
          )}
        </div>
      </header>

      {/* 탭 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto flex">
          {(['자재산출', '단가표관리'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* 에러 배너 */}
      {error && (
        <div className="max-w-3xl mx-auto px-4 mt-3">
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              ×
            </button>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* ── 자재산출 탭 ── */}
        {tab === '자재산출' && (
          <>
            {/* 구역 목록 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-semibold text-gray-700">
                  구역 목록
                  {zones.length > 0 && (
                    <span className="ml-1.5 text-gray-400 font-normal">{zones.length}개</span>
                  )}
                </h2>
                <button
                  onClick={() => {
                    if (!siteName) {
                      alert('현장명을 먼저 입력하세요')
                      return
                    }
                    setShowForm((v) => !v)
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  {showForm ? '닫기' : '+ 구역 추가'}
                </button>
              </div>

              {loadingZones ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">불러오는 중…</p>
              ) : zones.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-gray-400">
                  {siteName
                    ? '구역이 없습니다. 구역을 추가해 주세요.'
                    : '현장명을 입력하고 불러오기를 눌러주세요.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {zones.map((zone) => {
                    const area = calcArea(zone.dim1, zone.dim2)
                    const isSelected = selectedId === zone.id
                    return (
                      <li
                        key={zone.id}
                        onClick={() => setSelectedId(isSelected ? null : zone.id)}
                        className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${
                              zone.part === '천장'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {zone.part}
                          </span>
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {zone.zone_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm text-gray-500">{area.toFixed(2)} ㎡</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`"${zone.zone_name}" 구역을 삭제할까요?`)) {
                                handleDeleteZone(zone.id)
                              }
                            }}
                            className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* ZoneForm 인라인 */}
            {showForm && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 px-1">새 구역 추가</p>
                <ZoneForm
                  siteId={siteName}
                  companyId="default"
                  onSave={handleSaveZone}
                  onCancel={() => setShowForm(false)}
                />
                {savingZone && (
                  <p className="text-xs text-gray-400 mt-2 text-center">저장 중…</p>
                )}
              </div>
            )}

            {/* 선택 구역 산출 결과 */}
            {selectedResult && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">
                    산출 결과 —{' '}
                    <span className="text-blue-700">{selectedResult.zone.zone_name}</span>
                    <span className="ml-2 text-gray-400 font-normal">
                      {selectedResult.areaSqm.toFixed(2)} ㎡
                    </span>
                  </p>
                </div>
                <MaterialTable rows={selectedResult.materials} />
              </div>
            )}

            {/* 전체 합계 */}
            {zones.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">전체 합계</p>
                </div>
                <MaterialTable
                  rows={summaryRows}
                  footer={
                    summaryLines.length > 0 ? (
                      <tfoot>
                        <tr className="bg-gray-50 font-semibold">
                          <td colSpan={4} className="px-4 py-3 text-right text-gray-700">
                            합계
                          </td>
                          <td className="px-4 py-3 text-right text-blue-700">
                            {grandTotal.toLocaleString()}원
                          </td>
                        </tr>
                      </tfoot>
                    ) : undefined
                  }
                />
              </div>
            )}
          </>
        )}

        {/* ── 단가표관리 탭 ── */}
        {tab === '단가표관리' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <PriceTable prices={prices} onRefresh={fetchPrices} />
          </div>
        )}
      </main>
    </div>
  )
}
