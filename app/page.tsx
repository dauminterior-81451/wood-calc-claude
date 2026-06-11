'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabase'
import ZoneForm from '@/app/components/wood-calc/ZoneForm'
import PriceManager from '@/app/components/wood-calc/PriceManager'
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

// ─── 자재 테이블 ──────────────────────────────────────────────────────────────

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
  const [siteId, setSiteId] = useState('')
  const [headerMode, setHeaderMode] = useState<null | 'new' | 'load'>(null)
  const [newSiteInput, setNewSiteInput] = useState('')
  const [existingSites, setExistingSites] = useState<{ id: string; name: string }[]>([])
  const [loadingSites, setLoadingSites] = useState(false)
  const [zones, setZones] = useState<WoodZone[]>([])
  const [prices, setPrices] = useState<WoodMaterialPrice[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [lossRateMap, setLossRateMap] = useState<Record<string, number>>({})
  const [formMode, setFormMode] = useState<null | 'new' | 'edit'>(null)
  const [editingZone, setEditingZone] = useState<WoodZone | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [loadingZones, setLoadingZones] = useState(false)
  const [savingZone, setSavingZone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

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

  const fetchZones = useCallback(async (id: string) => {
    setLoadingZones(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('wood_zones')
        .select('*')
        .eq('siteId', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      setZones((data ?? []) as WoodZone[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '구역 로드 실패')
    } finally {
      setLoadingZones(false)
    }
  }, [])

  function openNewForm() {
    if (!siteId) { alert('현장을 먼저 선택하세요'); return }
    setEditingZone(null)
    setFormKey((k) => k + 1)
    setFormMode('new')
  }

  function openEditForm(zone: WoodZone) {
    setEditingZone(zone)
    setFormKey((k) => k + 1)
    setFormMode('edit')
  }

  function closeForm() {
    setFormMode(null)
    setEditingZone(null)
  }

  async function handleOpenLoad() {
    setHeaderMode('load')
    setLoadingSites(true)
    try {
      const { data, error } = await supabase
        .from('wood_sites')
        .select('id, name')
        .order('created_at', { ascending: false })
      if (error) throw error
      setExistingSites((data ?? []) as { id: string; name: string }[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '현장 목록 로드 실패')
    } finally {
      setLoadingSites(false)
    }
  }

  async function handleConfirmNewSite() {
    const name = newSiteInput.trim()
    if (!name) return
    setError(null)
    try {
      const { data, error } = await supabase
        .from('wood_sites')
        .insert([{ name }])
        .select('id, name')
        .single()
      if (error) throw error
      const site = data as { id: string; name: string }
      setSiteName(site.name)
      setSiteId(site.id)
      setZones([])
      setExpandedId(null)
      closeForm()
      setHeaderMode(null)
      setNewSiteInput('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '현장 저장 실패')
    }
  }

  function handleSelectSite(id: string, name: string) {
    setSiteName(name)
    setSiteId(id)
    setZones([])
    setExpandedId(null)
    closeForm()
    setHeaderMode(null)
    fetchZones(id)
  }

  async function handleSaveZone(
    data: Omit<WoodZone, 'id' | 'created_at'>,
    lossRate: number,
  ) {
    setSavingZone(true)
    setError(null)
    try {
      if (editingZone) {
        const { data: updated, error } = await supabase
          .from('wood_zones')
          .update(data)
          .eq('id', editingZone.id)
          .select()
          .single()
        if (error) throw error
        const zone = updated as WoodZone
        setZones((prev) => prev.map((z) => (z.id === zone.id ? zone : z)))
        setLossRateMap((prev) => ({ ...prev, [zone.id]: lossRate }))
      } else {
        const { data: inserted, error } = await supabase
          .from('wood_zones')
          .insert([data])
          .select()
          .single()
        if (error) {
          console.error('[wood_zones] insert 에러:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          })
          throw error
        }
        const zone = inserted as WoodZone
        setZones((prev) => [...prev, zone])
        setLossRateMap((prev) => ({ ...prev, [zone.id]: lossRate }))
      }
      closeForm()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '구역 저장 실패')
    } finally {
      setSavingZone(false)
    }
  }

  async function handleDeleteSite() {
    if (!confirm('현장과 모든 구역 데이터가 삭제됩니다. 계속하시겠습니까?')) return
    setError(null)
    try {
      const { error: zonesErr } = await supabase
        .from('wood_zones')
        .delete()
        .eq('siteId', siteId)
      if (zonesErr) throw zonesErr
      const { error: siteErr } = await supabase
        .from('wood_sites')
        .delete()
        .eq('id', siteId)
      if (siteErr) throw siteErr
      setSiteName('')
      setSiteId('')
      setZones([])
      setExpandedId(null)
      setLossRateMap({})
      closeForm()
      setHeaderMode(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '현장 삭제 실패')
    }
  }

  async function handleDeleteZone(id: string) {
    const { error } = await supabase.from('wood_zones').delete().eq('id', id)
    if (!error) {
      setZones((prev) => prev.filter((z) => z.id !== id))
      if (expandedId === id) setExpandedId(null)
    }
  }

  function handleCopy() {
    const sep = '─────────────────'
    const dw = (s: string) => Array.from(s).reduce((w, ch) => w + (ch.charCodeAt(0) > 0xFF ? 2 : 1), 0)
    const pad = (s: string, width: number) => s + ' '.repeat(Math.max(0, width - dw(s)))
    const nameWidth = summaryRows.length > 0 ? Math.max(...summaryRows.map(r => dw(r.name))) + 2 : 20
    const lines = [
      `[${siteName}] 목공 자재 발주`,
      sep,
      ...summaryRows.map(r => `${pad(r.name, nameWidth)}${r.qty}${r.unit}`),
      sep,
      `합계: ${grandTotal.toLocaleString()}원`,
    ]
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const zoneResults: ZoneResult[] = zones.map((z) =>
    calcZone(z, prices, lossRateMap[z.id] ?? DEFAULT_LOSS_RATE),
  )
  const { lines: summaryLines, grandTotal } = aggregateZones(zoneResults, [])
  const summaryRows = summaryLines.map((l: SummaryLine) => ({
    name: l.name,
    qty: l.totalQty,
    unit: l.unit,
    price: l.price,
    amount: l.totalAmount,
  }))

  return (
    <>
      <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-3">목공 산출</h1>

          {!siteName && headerMode === null && (
            <div className="flex gap-2">
              <button
                onClick={() => setHeaderMode('new')}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                + 새 현장 만들기
              </button>
              <button
                onClick={handleOpenLoad}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                기존 현장 불러오기
              </button>
            </div>
          )}

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

          {headerMode === 'load' && (
            <div className="flex gap-2">
              {loadingSites ? (
                <p className="text-sm text-gray-400 py-2">불러오는 중…</p>
              ) : existingSites.length === 0 ? (
                <div className="flex items-center gap-3">
                  <p className="text-sm text-gray-400">저장된 현장이 없습니다</p>
                  <button onClick={() => setHeaderMode(null)} className="text-sm text-gray-500 hover:text-gray-700">
                    닫기
                  </button>
                </div>
              ) : (
                <>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const site = existingSites.find((s) => s.id === e.target.value)
                      if (site) handleSelectSite(site.id, site.name)
                    }}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="" disabled>현장 선택…</option>
                    {existingSites.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
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

          {siteName && (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-700">
                현장: <span className="font-semibold">{siteName}</span>
              </p>
              <button
                onClick={() => {
                  setSiteName(''); setSiteId(''); setZones([])
                  setExpandedId(null); closeForm(); setHeaderMode(null)
                }}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                현장 변경
              </button>
              <button
                onClick={handleDeleteSite}
                className="text-xs text-red-400 hover:text-red-600 underline underline-offset-2"
              >
                현장 삭제
              </button>
            </div>
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
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">×</button>
          </div>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
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
                  onClick={openNewForm}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  + 구역 추가
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
                    const isExpanded = expandedId === zone.id
                    const result = zoneResults.find((r) => r.zone.id === zone.id)
                    return (
                      <li key={zone.id}>
                        {/* 구역 행 */}
                        <div
                          onClick={() => setExpandedId(isExpanded ? null : zone.id)}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                            isExpanded ? 'bg-blue-50' : 'hover:bg-gray-50'
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
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-sm text-gray-500 mr-1">{area.toFixed(2)} ㎡</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditForm(zone) }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-md hover:bg-blue-50"
                              title="수정"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (confirm(`"${zone.zone_name}" 구역을 삭제할까요?`)) {
                                  handleDeleteZone(zone.id)
                                }
                              }}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-md hover:bg-red-50 text-xl leading-none"
                              title="삭제"
                            >
                              ×
                            </button>
                            <span className={`ml-1 text-gray-400 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                              ▼
                            </span>
                          </div>
                        </div>

                        {/* 아코디언 산출결과 */}
                        {isExpanded && result && (
                          <div className="border-t border-blue-100 bg-blue-50/30">
                            <div className="px-4 py-2 flex items-center justify-between">
                              <p className="text-xs font-semibold text-blue-700">
                                산출 결과
                                <span className="ml-1.5 font-normal text-blue-500">
                                  {result.areaSqm.toFixed(2)} ㎡
                                </span>
                              </p>
                              <p className="text-xs font-semibold text-blue-700">
                                {result.materials.reduce((s, m) => s + m.amount, 0).toLocaleString()}원
                              </p>
                            </div>
                            <MaterialTable rows={result.materials} />
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* 전체 합계 — 항상 구역 목록 아래 */}
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
                {summaryRows.length > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={handleCopy}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        copied
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-800 text-white hover:bg-gray-900'
                      }`}
                    >
                      {copied ? '복사됨 ✓' : '발주용 복사'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === '단가표관리' && <PriceManager />}
      </main>

    </div>

      {/* ZoneForm 모달 — Fragment 최상위에서 렌더링하여 fixed 포지셔닝 보장 */}
      {formMode !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
          className="bg-black/60 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) closeForm() }}
        >
          <div className="flex min-h-full items-start justify-center px-4 py-10">
          <div className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-sm font-semibold text-white">
                {formMode === 'edit' ? `수정 — ${editingZone?.zone_name}` : '새 구역 추가'}
              </p>
              <button
                onClick={closeForm}
                className="text-white/70 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center"
              >
                ×
              </button>
            </div>
            <ZoneForm
              key={formKey}
              siteId={siteId}
              initial={editingZone ?? undefined}
              initialLossRate={editingZone ? (lossRateMap[editingZone.id] ?? DEFAULT_LOSS_RATE) : undefined}
              onSave={handleSaveZone}
              onCancel={closeForm}
            />
            {savingZone && (
              <p className="text-xs text-white/70 mt-2 text-center">저장 중…</p>
            )}
          </div>
          </div>
        </div>
      )}
    </>
  )
}
