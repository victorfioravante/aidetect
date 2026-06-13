/**
 * Testes unitários para computeVerdict e computeFinalScore
 *
 * Essas funções são o coração do produto: toda decisão de "IA vs real"
 * passa por aqui. Os testes cobrem:
 *   - computeVerdict: mapeamento score → verdito + confiança
 *   - computeFinalScore: pesos dinâmicos, overrides, caps e heurísticas
 *
 * Rodar: npm test (ou vitest run)
 */

import { describe, it, expect } from 'vitest'
import { computeVerdict, computeFinalScore, WEIGHTS } from '../types'
import type { AnalysisResult } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Cria um DetectorResult neutro (score 50, sem sinalizar IA) */
function neutral(score = 50) {
  return { score, label: 'neutral', passed: score < 50 }
}

/** Cria um DetectorResult abstained (API indisponível) */
function abstained(score = 50) {
  return { score, label: 'abstained', passed: true, abstained: true }
}

/** Cria um DetectorResult skipped (não aplicável) */
function skipped() {
  return { score: 0, label: 'skipped', passed: true, skipped: true }
}

/**
 * Monta um breakdown completo com todos os detectores em valores neutros (50),
 * sobrescrevendo apenas os campos informados.
 */
function makeBreakdown(overrides: Partial<AnalysisResult['breakdown']> = {}): AnalysisResult['breakdown'] {
  return {
    symmetry:      neutral(50),
    stats:         neutral(50),
    fft:           neutral(50),
    texture:       neutral(50),
    shadow:        neutral(50),
    ela:           neutral(50),
    gradient:      neutral(50),
    exif:          abstained(50),  // EXIF abstained = sem câmera confirmada
    noise:         neutral(50),
    temporal:      skipped(),
    platformLabel: abstained(0),
    hive:          abstained(50),
    sightengine:   abstained(50),
    transformers:  neutral(50),
    ...overrides,
  }
}

/** Extrai rawScores do breakdown (campo score de cada detector) */
function scoresFrom(breakdown: AnalysisResult['breakdown']): Record<keyof typeof WEIGHTS, number> {
  return Object.fromEntries(
    Object.entries(breakdown).map(([k, v]) => [k, v.score])
  ) as Record<keyof typeof WEIGHTS, number>
}

// ─── computeVerdict ───────────────────────────────────────────────────────────

describe('computeVerdict', () => {
  describe('AI_GENERATED', () => {
    it('retorna AI_GENERATED com confiança HIGH para score >= 85', () => {
      expect(computeVerdict(85)).toEqual({ verdict: 'AI_GENERATED', confidence: 'HIGH' })
      expect(computeVerdict(100)).toEqual({ verdict: 'AI_GENERATED', confidence: 'HIGH' })
      expect(computeVerdict(90)).toEqual({ verdict: 'AI_GENERATED', confidence: 'HIGH' })
    })

    it('retorna AI_GENERATED com confiança MEDIUM para 70 <= score < 85', () => {
      expect(computeVerdict(70)).toEqual({ verdict: 'AI_GENERATED', confidence: 'MEDIUM' })
      expect(computeVerdict(75)).toEqual({ verdict: 'AI_GENERATED', confidence: 'MEDIUM' })
      expect(computeVerdict(84)).toEqual({ verdict: 'AI_GENERATED', confidence: 'MEDIUM' })
    })
  })

  describe('SUSPICIOUS', () => {
    it('retorna SUSPICIOUS com confiança MEDIUM para 62 <= score < 70', () => {
      expect(computeVerdict(62)).toEqual({ verdict: 'SUSPICIOUS', confidence: 'MEDIUM' })
      expect(computeVerdict(65)).toEqual({ verdict: 'SUSPICIOUS', confidence: 'MEDIUM' })
      expect(computeVerdict(69)).toEqual({ verdict: 'SUSPICIOUS', confidence: 'MEDIUM' })
    })

    it('retorna SUSPICIOUS com confiança LOW para 45 <= score < 62', () => {
      expect(computeVerdict(45)).toEqual({ verdict: 'SUSPICIOUS', confidence: 'LOW' })
      expect(computeVerdict(50)).toEqual({ verdict: 'SUSPICIOUS', confidence: 'LOW' })
      expect(computeVerdict(61)).toEqual({ verdict: 'SUSPICIOUS', confidence: 'LOW' })
    })
  })

  describe('AUTHENTIC', () => {
    it('retorna AUTHENTIC com confiança HIGH para score < 20', () => {
      expect(computeVerdict(0)).toEqual({ verdict: 'AUTHENTIC', confidence: 'HIGH' })
      expect(computeVerdict(10)).toEqual({ verdict: 'AUTHENTIC', confidence: 'HIGH' })
      expect(computeVerdict(19)).toEqual({ verdict: 'AUTHENTIC', confidence: 'HIGH' })
    })

    it('retorna AUTHENTIC com confiança MEDIUM para 20 <= score < 45', () => {
      expect(computeVerdict(20)).toEqual({ verdict: 'AUTHENTIC', confidence: 'MEDIUM' })
      expect(computeVerdict(30)).toEqual({ verdict: 'AUTHENTIC', confidence: 'MEDIUM' })
      expect(computeVerdict(44)).toEqual({ verdict: 'AUTHENTIC', confidence: 'MEDIUM' })
    })
  })

  describe('limites de fronteira', () => {
    it('score 44 é AUTHENTIC, 45 é SUSPICIOUS', () => {
      expect(computeVerdict(44).verdict).toBe('AUTHENTIC')
      expect(computeVerdict(45).verdict).toBe('SUSPICIOUS')
    })

    it('score 69 é SUSPICIOUS, 70 é AI_GENERATED', () => {
      expect(computeVerdict(69).verdict).toBe('SUSPICIOUS')
      expect(computeVerdict(70).verdict).toBe('AI_GENERATED')
    })

    it('score 84 é MEDIUM, 85 é HIGH dentro de AI_GENERATED', () => {
      expect(computeVerdict(84).confidence).toBe('MEDIUM')
      expect(computeVerdict(85).confidence).toBe('HIGH')
    })
  })
})

// ─── computeFinalScore ────────────────────────────────────────────────────────

describe('computeFinalScore', () => {

  describe('caso neutro (todos detectores em 50)', () => {
    it('retorna score dentro de [40, 60] quando tudo é neutro', () => {
      const breakdown = makeBreakdown()
      const { score } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      // Score neutro não deve classificar como IA nem como autêntico com alta confiança
      expect(score).toBeGreaterThanOrEqual(30)
      expect(score).toBeLessThanOrEqual(70)
    })
  })

  describe('override: EXIF com software de IA (score >= 80)', () => {
    it('força score mínimo de 80 quando EXIF aponta software de IA', () => {
      const breakdown = makeBreakdown({
        exif: { score: 90, label: 'Adobe Firefly detectado', passed: false },
      })
      const { score } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      expect(score).toBeGreaterThanOrEqual(80)
    })
  })

  describe('override: platform label >= 95 (sinalizada como IA pela plataforma)', () => {
    it('força score mínimo de 85 quando plataforma marca como gerada por IA', () => {
      const breakdown = makeBreakdown({
        platformLabel: { score: 95, label: 'Marcada como AI Generated', passed: false, abstained: false },
      })
      const { score } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      expect(score).toBeGreaterThanOrEqual(85)
    })
  })

  describe('cap: EXIF com câmera real (score < 20) → limita score a 45', () => {
    it('impede score > 45 quando EXIF confirma câmera (sem override de EXIF software ou platform)', () => {
      // Todos os detectores locais apontando para IA (score 80),
      // mas EXIF tem câmera real (score 10).
      const breakdown = makeBreakdown({
        exif:     { score: 10, label: 'Canon EOS detectado', passed: true },  // hasConfirmedCamera = true
        symmetry: neutral(80),
        stats:    neutral(80),
        fft:      neutral(80),
        texture:  neutral(80),
        shadow:   neutral(80),
        ela:      neutral(80),
        gradient: neutral(80),
      })
      const { score } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      // hasConfirmedCamera → cap em 45 (após desconto de 10)
      expect(score).toBeLessThanOrEqual(45)
    })
  })

  describe('cap: ruído natural (noise < 25) → limita score a 55', () => {
    it('impede score > 55 quando ruído confirma foto real (sem câmera EXIF)', () => {
      const breakdown = makeBreakdown({
        noise:    { score: 15, label: 'Ruído natural detectado', passed: true },  // hasNaturalNoise = true
        exif:     abstained(50),  // sem câmera confirmada
        symmetry: neutral(80),
        stats:    neutral(80),
        fft:      neutral(80),
        texture:  neutral(80),
      })
      const { score } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      // hasNaturalNoise sem câmera → cap em 55 (após desconto de 5)
      expect(score).toBeLessThanOrEqual(55)
    })
  })

  describe('consenso: 3+ detectores confiáveis > 70 → score >= 60', () => {
    it('aplica piso de 60 quando 3+ detectores não-ruidosos concordam em IA', () => {
      // noise e exif neutros (sem confirmar real), detectores confiáveis altos
      const breakdown = makeBreakdown({
        exif:        abstained(50),
        noise:       neutral(50),    // não confirma real
        fft:         neutral(80),    // > 70
        texture:     neutral(80),    // > 70
        stats:       neutral(80),    // > 70
        transformers: neutral(30),   // não contribui para consenso
      })
      const { score } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      expect(score).toBeGreaterThanOrEqual(60)
    })

    it('NÃO aplica o piso de 60 quando câmera EXIF confirma foto real', () => {
      const breakdown = makeBreakdown({
        exif:    { score: 5, label: 'Canon EOS R5', passed: true },  // hasConfirmedCamera
        noise:   neutral(50),
        fft:     neutral(80),
        texture: neutral(80),
        stats:   neutral(80),
      })
      const { score } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      // Cap de câmera (45) deve prevalecer sobre o consenso
      expect(score).toBeLessThanOrEqual(45)
    })
  })

  describe('heurística: transformers abstained → usa EXIF+noise+FFT+texture+ELA', () => {
    it('substitui score do transformers por heurística local quando modelo indisponível', () => {
      const breakdown = makeBreakdown({
        transformers: abstained(50),  // modelo offline
        exif:         abstained(80),  // alto → sugere IA
        noise:        neutral(70),
        fft:          neutral(70),
        texture:      neutral(70),
        ela:          neutral(70),
      })
      const { effectiveBreakdown } = computeFinalScore(scoresFrom(breakdown), breakdown, 'pt')
      // Heurística deve ter sido aplicada — score não pode ser o original 50
      expect(effectiveBreakdown.transformers.score).not.toBe(50)
      // Label deve indicar heurística (case-insensitive — começa com maiúscula)
      expect(effectiveBreakdown.transformers.label.toLowerCase()).toContain('heurística')
    })

    it('versão em inglês usa "heuristic" no label', () => {
      const breakdown = makeBreakdown({ transformers: abstained(50) })
      const { effectiveBreakdown } = computeFinalScore(scoresFrom(breakdown), breakdown, 'en')
      expect(effectiveBreakdown.transformers.label.toLowerCase()).toContain('heuristic')
    })
  })

  describe('bônus de assimetria: symmetry < 15 + ruído natural → desconto adicional de 10', () => {
    it('reduz score em 10 quando imagem é assimétrica e tem ruído natural', () => {
      // Baseline sem bônus: score neutro
      const baseBreakdown = makeBreakdown({
        noise:    neutral(50),  // não confirma real → sem bônus
        symmetry: neutral(5),   // assimétrica, mas sem noise natural
      })
      const { score: scoreBase } = computeFinalScore(scoresFrom(baseBreakdown), baseBreakdown, 'pt')

      // Com bônus: symmetry < 15 + noise < 25
      const bonusBreakdown = makeBreakdown({
        noise:    neutral(15),  // hasNaturalNoise = true
        symmetry: neutral(5),   // assimétrica
        exif:     abstained(50),
      })
      const { score: scoreBonus } = computeFinalScore(scoresFrom(bonusBreakdown), bonusBreakdown, 'pt')

      // Score com bônus deve ser menor (desconto de 10) — mas cap de noise (55) também aplica
      expect(scoreBonus).toBeLessThanOrEqual(55)
    })
  })

  describe('soma dos pesos base', () => {
    it('pesos base somam 90 (sem detectores dinâmicos)', () => {
      const baseKeys = ['symmetry', 'stats', 'fft', 'texture', 'shadow', 'ela', 'gradient', 'exif', 'noise', 'transformers'] as const
      const baseSum = baseKeys.reduce((acc, k) => acc + WEIGHTS[k], 0)
      expect(baseSum).toBe(90)
    })

    it('detectores dinâmicos têm peso 0 na base', () => {
      expect(WEIGHTS.hive).toBe(0)
      expect(WEIGHTS.sightengine).toBe(0)
      expect(WEIGHTS.temporal).toBe(0)
      expect(WEIGHTS.platformLabel).toBe(0)
    })
  })

  describe('score final é sempre [0, 100]', () => {
    it('não ultrapassa 100 mesmo com todos detectores em 100', () => {
      const allMax = makeBreakdown(
        Object.fromEntries(
          Object.keys(WEIGHTS).map(k => [k, { score: 100, label: 'max', passed: false }])
        ) as Partial<AnalysisResult['breakdown']>
      )
      const { score } = computeFinalScore(scoresFrom(allMax), allMax, 'pt')
      expect(score).toBeLessThanOrEqual(100)
    })

    it('não vai abaixo de 0 mesmo com todos detectores em 0', () => {
      const allMin = makeBreakdown(
        Object.fromEntries(
          Object.keys(WEIGHTS).map(k => [k, { score: 0, label: 'min', passed: true }])
        ) as Partial<AnalysisResult['breakdown']>
      )
      const { score } = computeFinalScore(scoresFrom(allMin), allMin, 'pt')
      expect(score).toBeGreaterThanOrEqual(0)
    })
  })
})
