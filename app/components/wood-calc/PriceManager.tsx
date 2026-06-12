'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/app/lib/supabase'

const CATEGORIES = ['목자재', '타일', '욕실', '도배', '마루', '가구'] as const
type Category = (typeof CATEGORIES)[number]

interface MaterialsPrice {
  id: string
  category: string
  vendor: string
  name: string
  spec: string
  calc_type: string
  cover_m2: number | null
  unit: string
  price: number
  note: string
  updated_at: string
}

interface NewRow {
  name: string
  spec: string
  unit: string
  price: string
}

interface ComparisonItem {
  name: string
  spec: string
  qty: number
  unit_price: number
  amount: number
  status: 'same' | 'changed' | 'new'
  old_price?: number
  selected: boolean
}

interface HistoryItem {
  id: string
  old_price: number
  new_price: number
  source: string
  created_at: string
}

export default function PriceManager() {
  const [activeCategory, setActiveCategory] = useState<Category>('목자재')
  const [rows, setRows] = useState<MaterialsPrice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPrice, setEditingPrice] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState<NewRow>({ name: '', spec: '', unit: '', price: '' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [comparisonItems, setComparisonItems] = useState<ComparisonItem[]>([])
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  const [applying, setApplying] = useState(false)
  const [historyPopup, setHistoryPopup] = useState<{ row: MaterialsPrice; items: HistoryItem[] } | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    fetchRows(activeCategory)
  }, [activeCategory])

  async function fetchRows(category: string) {
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase
        .from('materials_price')
        .select('*')
        .eq('category', category)
        .order('name')
      if (error) throw error
      setRows((data ?? []) as MaterialsPrice[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally {
      setLoading(false)
    }
  }

  async function handlePriceCommit(row: MaterialsPrice) {
    const newPrice = parseInt(editingPrice)
    setEditingId(null)
    if (isNaN(newPrice) || newPrice === row.price) return
    setSaving(row.id)
    try {
      const { error: updateErr } = await supabase
        .from('materials_price')
        .update({ price: newPrice, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (updateErr) throw updateErr
      const { error: histErr } = await supabase
        .from('materials_price_history')
        .insert([{ price_id: row.id, old_price: row.price, new_price: newPrice, source: 'manual' }])
      if (histErr) throw histErr
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, price: newPrice } : r)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(null)
    }
  }

  async function handleAddRow() {
    if (!newRow.name.trim()) return
    try {
      const { data, error } = await supabase
        .from('materials_price')
        .insert([{
          category: activeCategory,
          vendor: '',
          name: newRow.name.trim(),
          spec: newRow.spec.trim(),
          calc_type: 'ea',
          unit: newRow.unit.trim() || '개',
          price: parseInt(newRow.price) || 0,
          note: '',
        }])
        .select()
        .single()
      if (error) throw error
      setRows((prev) => [...prev, data as MaterialsPrice])
      setNewRow({ name: '', spec: '', unit: '', price: '' })
      setAdding(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '추가 실패')
    }
  }

  async function handleDeleteRow(id: string) {
    if (!confirm('이 품목을 삭제할까요?')) return
    try {
      const { error } = await supabase.from('materials_price').delete().eq('id', id)
      if (error) throw error
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setParsing(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', activeCategory)

      const res = await fetch('/api/parse-invoice', { method: 'POST', body: formData })
      const data = await res.json() as { comparison?: ComparisonItem[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? '파싱 실패')

      const items = data.comparison ?? []
      setComparisonItems(items)

      const defaultSelected = new Set<number>()
      items.forEach((item, i) => { if (item.selected) defaultSelected.add(i) })
      setSelectedIndexes(defaultSelected)
      setShowModal(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '파싱 실패')
    } finally {
      setParsing(false)
    }
  }

  function toggleSelect(index: number) {
    setSelectedIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function handleApply() {
    setApplying(true)
    setError(null)
    try {
      const toApply = comparisonItems.filter((_, i) => selectedIndexes.has(i))

      for (const item of toApply) {
        if (item.status === 'changed') {
          const match = rows.find(
            r => r.name === item.name && (r.spec ?? '') === (item.spec ?? '')
          )
          if (!match) continue
          const { error: updateErr } = await supabase
            .from('materials_price')
            .update({ price: item.unit_price, updated_at: new Date().toISOString() })
            .eq('id', match.id)
          if (updateErr) throw updateErr
          const { error: histErr } = await supabase
            .from('materials_price_history')
            .insert([{ price_id: match.id, old_price: match.price, new_price: item.unit_price, source: 'invoice' }])
          if (histErr) throw histErr
        }
      }

      setShowModal(false)
      fetchRows(activeCategory)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '적용 실패')
    } finally {
      setApplying(false)
    }
  }

  async function handleShowHistory(row: MaterialsPrice) {
    setHistoryLoading(true)
    setHistoryPopup({ row, items: [] })
    try {
      const { data, error } = await supabase
        .from('materials_price_history')
        .select('id, old_price, new_price, source, created_at')
        .eq('price_id', row.id)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      setHistoryPopup({ row, items: (data ?? []) as HistoryItem[] })
    } catch {
      setHistoryPopup({ row, items: [] })
    } finally {
      setHistoryLoading(false)
    }
  }

  const applyCount = comparisonItems.filter((_, i) => selectedIndexes.has(i)).length

  return (
    <div className="space-y-4">
      {/* 파일 업로드 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-700">견적서 업로드</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {parsing ? '분석 중...' : 'PDF / 이미지 → AI 자동 파싱'}
            </p>
          </div>
          <button
            onClick={() => !parsing && fileInputRef.current?.click()}
            disabled={parsing}
            className={`shrink-0 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              parsing
                ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {parsing ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                분석 중...
              </span>
            ) : '파일 선택'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-3">×</button>
        </div>
      )}

      {/* 카테고리 탭 + 테이블 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setAdding(false) }}
              className={`px-4 py-3 text-sm font-medium shrink-0 border-b-2 transition-colors ${
                activeCategory === cat
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm text-gray-500">
            {loading ? '불러오는 중…' : `${rows.length}개 품목`}
          </p>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + 추가
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">품목명</th>
                <th className="px-4 py-2.5 text-left">규격</th>
                <th className="px-4 py-2.5 text-left">단위</th>
                <th className="px-4 py-2.5 text-right">단가</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {adding && (
                <tr className="bg-blue-50/40">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={newRow.name}
                      onChange={(e) => setNewRow((p) => ({ ...p, name: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddRow(); if (e.key === 'Escape') setAdding(false) }}
                      placeholder="품목명 *"
                      autoFocus
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={newRow.spec}
                      onChange={(e) => setNewRow((p) => ({ ...p, spec: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddRow(); if (e.key === 'Escape') setAdding(false) }}
                      placeholder="규격"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={newRow.unit}
                      onChange={(e) => setNewRow((p) => ({ ...p, unit: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddRow(); if (e.key === 'Escape') setAdding(false) }}
                      placeholder="단위"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={newRow.price}
                      onChange={(e) => setNewRow((p) => ({ ...p, price: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddRow(); if (e.key === 'Escape') setAdding(false) }}
                      placeholder="0"
                      className="w-full text-right border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1 items-center">
                      <button onClick={handleAddRow} className="text-blue-600 hover:text-blue-800 font-bold text-base leading-none" title="저장">✓</button>
                      <button onClick={() => setAdding(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none" title="취소">×</button>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && !adding && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">품목이 없습니다.</td>
                </tr>
              )}

              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{row.name}</td>
                  <td className="px-4 py-2.5 text-gray-500">{row.spec}</td>
                  <td className="px-4 py-2.5 text-gray-500">{row.unit}</td>
                  <td className="px-4 py-2.5 text-right">
                    {editingId === row.id ? (
                      <input
                        type="number"
                        value={editingPrice}
                        onChange={(e) => setEditingPrice(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handlePriceCommit(row)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => handlePriceCommit(row)}
                        autoFocus
                        className="w-28 text-right border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingId(row.id); setEditingPrice(row.price.toString()) }}
                        className={`tabular-nums font-medium hover:text-blue-600 transition-colors ${saving === row.id ? 'text-gray-400' : 'text-gray-900'}`}
                        title="클릭하여 단가 수정"
                      >
                        {row.price.toLocaleString()}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleShowHistory(row)}
                        className="text-gray-300 hover:text-blue-500 transition-colors text-base leading-none"
                        title="가격 이력"
                      >
                        📋
                      </button>
                      <button
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleDeleteRow(row.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none"
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 가격 이력 팝업 */}
      {historyPopup && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-800">{historyPopup.row.name} 가격 이력</p>
                {historyPopup.row.spec && (
                  <p className="text-xs text-gray-400 mt-0.5">{historyPopup.row.spec}</p>
                )}
              </div>
              <button
                onClick={() => setHistoryPopup(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                  불러오는 중...
                </div>
              ) : historyPopup.items.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">이력이 없습니다.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left">변경일</th>
                      <th className="px-4 py-2.5 text-right">이전</th>
                      <th className="px-4 py-2.5 text-right">변경 후</th>
                      <th className="px-4 py-2.5 text-center">출처</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyPopup.items.map((h) => (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-500 tabular-nums whitespace-nowrap">
                          {new Date(h.created_at).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-gray-400 line-through">
                          {h.old_price.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">
                          {h.new_price.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            h.source === 'invoice'
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {h.source === 'invoice' ? '견적서' : '수동'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 비교 결과 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <p className="font-semibold text-gray-800">단가 변경 확인</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {comparisonItems.filter(i => i.status === 'changed').length}개 변경 ·{' '}
                  {comparisonItems.filter(i => i.status === 'same').length}개 동일
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 안내 문구 */}
            <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100">
              <p className="text-xs text-blue-600">
                단가가 변경된 항목만 표시됩니다. 새 자재는 <strong>+ 추가</strong> 버튼으로 직접 등록하세요.
              </p>
            </div>

            {/* 목록: changed만 표시 */}
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {comparisonItems.filter(item => item.status === 'changed').length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                  <span className="text-2xl">✓</span>
                  <p className="text-sm">단가 변경 없음</p>
                </div>
              ) : (
                comparisonItems.map((item, i) => {
                  if (item.status !== 'changed') return null
                  const isSelected = selectedIndexes.has(i)
                  return (
                    <label key={i} className="flex items-start gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(i)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800 text-sm">{item.name}</span>
                          {item.spec && <span className="text-xs text-gray-400">{item.spec}</span>}
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">변경</span>
                        </div>
                        <div className="mt-1 text-sm text-orange-600 tabular-nums">
                          <span className="line-through text-gray-400 mr-1">
                            {(item.old_price ?? 0).toLocaleString()}원
                          </span>
                          → {item.unit_price.toLocaleString()}원
                        </div>
                      </div>
                    </label>
                  )
                })
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {applyCount > 0 ? `${applyCount}개 항목 선택됨` : '적용할 항목 없음'}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleApply}
                  disabled={applyCount === 0 || applying}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    applyCount === 0 || applying
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {applying ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      적용 중...
                    </span>
                  ) : `선택 항목 적용 (${applyCount})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
