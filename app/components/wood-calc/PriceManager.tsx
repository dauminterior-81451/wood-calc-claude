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

  return (
    <div className="space-y-4">
      {/* 파일 업로드 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-700">견적서 업로드</p>
            <p className="text-xs text-gray-400 mt-0.5">PDF / 이미지 → AI 자동 파싱 (준비 중)</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            파일 선택
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) alert(`"${file.name}" — AI 파싱 기능 준비 중입니다.`)
              e.target.value = ''
            }}
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
        {/* 카테고리 탭 */}
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

        {/* 액션 바 */}
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

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">품목명</th>
                <th className="px-4 py-2.5 text-left">규격</th>
                <th className="px-4 py-2.5 text-left">단위</th>
                <th className="px-4 py-2.5 text-right">단가</th>
                <th className="px-4 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* 새 행 추가 인라인 폼 */}
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
                      <button
                        onClick={handleAddRow}
                        className="text-blue-600 hover:text-blue-800 font-bold text-base leading-none"
                        title="저장"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => setAdding(false)}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                        title="취소"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && rows.length === 0 && !adding && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    품목이 없습니다.
                  </td>
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
                        className={`tabular-nums font-medium hover:text-blue-600 transition-colors ${
                          saving === row.id ? 'text-gray-400' : 'text-gray-900'
                        }`}
                        title="클릭하여 단가 수정"
                      >
                        {row.price.toLocaleString()}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleDeleteRow(row.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors text-xl leading-none"
                      title="삭제"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
