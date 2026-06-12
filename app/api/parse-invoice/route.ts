import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

interface ParsedItem {
  name: string
  spec: string
  qty: number
  unit_price: number
  amount: number
}

interface ComparisonItem extends ParsedItem {
  status: 'same' | 'changed' | 'new'
  old_price?: number
}

interface MaterialsPrice {
  id: string
  name: string
  spec: string
  price: number
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    }

    const mimeType = file.type || 'application/octet-stream'
    const isPdf =
      mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    const isImage =
      mimeType.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)

    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: 'PDF 또는 이미지 파일만 지원합니다.' },
        { status: 400 },
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const userText =
      '위 견적서에서 품목명, 규격, 수량, 단가, 금액을 추출해 JSON 배열로만 반환하세요.'

    type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    const SUPPORTED_IMAGE_TYPES: ImageMediaType[] = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]
    const safeImageType: ImageMediaType = SUPPORTED_IMAGE_TYPES.includes(
      mimeType as ImageMediaType,
    )
      ? (mimeType as ImageMediaType)
      : 'image/jpeg'

    const userContent: Anthropic.MessageParam['content'] = isPdf
      ? [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: userText },
        ]
      : [
          {
            type: 'image',
            source: { type: 'base64', media_type: safeImageType, data: base64 },
          },
          { type: 'text', text: userText },
        ]

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system:
        '자재 견적서에서 품목명, 규격, 수량, 단가, 금액을 추출해서 JSON 배열로만 반환. 다른 텍스트 없이 JSON만: [{name, spec, qty, unit_price, amount}]',
      messages: [{ role: 'user', content: userContent }],
    })

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    let parsed: ParsedItem[] = []
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]) as ParsedItem[]
      }
    } catch {
      return NextResponse.json(
        { error: 'Claude 응답 파싱 실패', raw: rawText },
        { status: 500 },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const { data: existing } = await supabase
      .from('materials_price')
      .select('id, name, spec, price')
      .eq('category', category)

    const existingRows = (existing ?? []) as MaterialsPrice[]

    // 괄호/특수문자 제거, 공백 정리, 소문자 변환
    // 예: "E보드(페인트용)" → "e보드페인트용", "9T 4×8" ≈ "9T 4*8"
    function normalize(s: string): string {
      return (s ?? '')
        .toLowerCase()
        .replace(/[()（）[\]【】{}「」『』<>《》]/g, '')  // 괄호류
        .replace(/[×xX*]/g, '')                          // 곱셈 기호 통일 → 제거
        .replace(/[^\w가-힣\d]/g, '')                    // 그 외 특수문자 제거
        .replace(/\s+/g, '')                             // 공백 제거
    }

    const comparison: ComparisonItem[] = parsed.map(item => {
      const normName = normalize(item.name)
      const normSpec = normalize(item.spec)
      const match = existingRows.find(
        r => normalize(r.name) === normName && normalize(r.spec) === normSpec,
      )
      if (!match) return { ...item, status: 'new' as const }
      if (match.price !== item.unit_price)
        return { ...item, status: 'changed' as const, old_price: match.price }
      return { ...item, status: 'same' as const }
    })

    return NextResponse.json({ parsed, comparison })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
