# CLAUDE.md — AIDetect.pro

> Arquivo de configuração do agente Claude Code para o projeto AIDetect.pro.
> Agent configuration file for the AIDetect.pro project.

---

## IDENTIDADE DO PROJETO / PROJECT IDENTITY

**Nome:** AIDetect.pro  
**Descrição:** Aplicação web bilíngue (PT-BR / EN) para detectar mídia gerada por IA  
**Stack:** React + Vite (frontend) + Node.js + Express (backend)  
**Deploy:** Netlify (frontend) + Railway (backend + PostgreSQL)  
**Monetização:** Google AdSense (free tier com anúncios)

---

## REGRAS GERAIS DO AGENTE / AGENT GENERAL RULES

1. **Implementar em fases** — Sempre seguir a ordem das fases definidas no PROMPT.md. Ao finalizar cada fase, listar o que foi feito e perguntar: "Posso prosseguir para a Fase X? / Shall I proceed to Phase X?"

2. **Bilíngue obrigatório** — Todos os textos visíveis da UI devem usar i18next. Nunca usar strings hardcoded na interface. Comentários no código podem ser em PT ou EN.

3. **Nunca quebrar o que funciona** — Antes de refatorar qualquer arquivo existente, verificar dependências. Nunca deletar código funcional sem confirmar.

4. **Variáveis de ambiente** — Nunca hardcodar chaves de API ou URLs. Sempre usar `import.meta.env.VITE_*` no frontend e `process.env.*` no backend. Se uma variável não estiver definida, usar fallback seguro ou lançar erro descritivo.

5. **TypeScript estrito** — Usar `strict: true` no tsconfig. Sem `any` implícito. Interfaces para todos os tipos de dados da API.

6. **Confirmar antes de instalar pacotes pesados** — Para dependências > 5MB (Puppeteer, FFmpeg, etc.), perguntar antes de adicionar ao package.json.

---

## ARQUITETURA / ARCHITECTURE

```
/
├── frontend/          # Netlify deploy
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/         # Zustand
│   │   ├── i18n/          # pt.json + en.json
│   │   └── App.tsx
│   ├── .env.example
│   └── netlify.toml
│
└── backend/           # Railway deploy
    ├── src/
    │   ├── routes/
    │   ├── analyzers/
    │   ├── social/
    │   └── middleware/
    ├── prisma/
    │   └── schema.prisma
    └── railway.toml
```

---

## CONVENÇÕES DE CÓDIGO / CODE CONVENTIONS

### Frontend (React + Vite)
```typescript
// Componentes: PascalCase, arquivo = nome do componente
// Hooks: camelCase com prefixo "use"
// Store: camelCase, sufixo "Store"
// i18n keys: kebab-case hierárquico (ex: result.verdict.ai)

// Padrão de componente
interface Props {
  // sempre tipar props
}

export function ComponentName({ prop }: Props) {
  const { t } = useTranslation()
  return <div>{t('chave.i18n')}</div>
}
```

### Backend (Express)
```typescript
// Rotas: kebab-case (ex: /api/analyze, /api/social/extract)
// Arquivos de analisador: camelCase (ex: ela.ts, fftAnalyzer.ts)
// Sempre retornar JSON com shape consistente:

// Sucesso:
{ success: true, data: { ... } }

// Erro:
{ success: false, error: string, code?: string }
```

---

## SHAPES DE DADOS / DATA SHAPES

### Request — POST /api/analyze
```typescript
// multipart/form-data
{
  file?: File          // imagem ou vídeo
  url?: string         // URL de rede social (alternativo ao file)
  lang?: 'pt' | 'en'  // idioma da resposta (default: 'pt')
}
```

### Response — AnalysisResult
```typescript
interface AnalysisResult {
  id: string
  verdict: 'AI_GENERATED' | 'SUSPICIOUS' | 'AUTHENTIC'
  score: number           // 0-100
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  breakdown: {
    rotation:   DetectorResult
    stats:      DetectorResult
    fft:        DetectorResult
    texture:    DetectorResult
    shadow:     DetectorResult
    ela:        DetectorResult
    hive:       DetectorResult
  }
  visualizations: {
    elaMap:      string   // base64 PNG
    gradientMap: string   // base64 PNG
    fftSpectrum: string   // base64 PNG
  }
  meta: {
    processedAt: string   // ISO date
    mediaType: 'image' | 'video'
    sourceUrl?: string    // se veio de link social
    platform?: string     // 'instagram' | 'tiktok' | etc
  }
}

interface DetectorResult {
  score: number           // 0-100 (100 = certeza de IA)
  label: string           // descrição localizada
  passed: boolean         // true = passou no teste (não é IA)
}
```

---

## SISTEMA DE SCORE / SCORING SYSTEM

```typescript
// Pesos de cada detector (devem somar 100)
const WEIGHTS = {
  rotation: 15,   // Rotação / Assimetria
  stats:    10,   // Estatística de pixels
  fft:      15,   // Sinal dominante (FFT)
  texture:  15,   // Textura vs pele
  shadow:   15,   // Consistência de sombras
  ela:      10,   // Error Level Analysis
  hive:     20,   // API externa (Hive Moderation)
}

// Score final = soma ponderada
// Veredicto:
//   score >= 70  → AI_GENERATED  (confiança HIGH se >= 85, MEDIUM se < 85)
//   score 40-69  → SUSPICIOUS    (confiança MEDIUM)
//   score < 40   → AUTHENTIC     (confiança HIGH se < 20, MEDIUM se >= 20)
```

---

## RATE LIMITING / CONTROLE DE USO

```typescript
// Usuários free (sem autenticação):
// - 3 análises por IP por dia (TTL 24h no Redis ou memory-cache)
// - Resetar à meia-noite UTC
// - Header de resposta: X-RateLimit-Remaining, X-RateLimit-Reset

// Quando atingir o limite:
// - HTTP 429
// - Body: { success: false, error: 'RATE_LIMIT_EXCEEDED', resetAt: ISO_DATE }
// - Frontend mostra contador regressivo + slot de anúncio adicional
```

---

## ADSENSE — REGRAS DE EXIBIÇÃO / DISPLAY RULES

```typescript
// Slots configurados via env:
// VITE_ADSENSE_CLIENT      = ca-pub-XXXXXXXXXXXXXXXX
// VITE_ADSENSE_SLOT_RESULT = slot após resultado (728x90 desktop, 320x50 mobile)
// VITE_ADSENSE_SLOT_MODAL  = slot no modal de limite (300x250)
// VITE_ADSENSE_SLOT_BANNER = slot no footer (728x90)

// Exibição condicional:
// - Após cada análise bem-sucedida de usuário free: mostrar SLOT_RESULT
// - Ao atingir rate limit: mostrar SLOT_MODAL
// - Footer da página: sempre mostrar SLOT_BANNER

// Em desenvolvimento (sem cliente AdSense real):
// Renderizar <div class="ad-placeholder"> com dimensões corretas
// Nunca renderizar ins.adsbygoogle sem VITE_ADSENSE_CLIENT definido
```

---

## INTERNACIONALIZAÇÃO / I18N

```json
// Estrutura de chaves — pt.json e en.json devem ter exatamente as mesmas chaves

{
  "app": {
    "name": "AIDetect.pro",
    "tagline": "..."
  },
  "nav": { "howItWorks": "...", "api": "..." },
  "hero": { "title": "...", "subtitle": "...", "badge": "..." },
  "tabs": { "upload": "...", "link": "...", "video": "..." },
  "upload": { "title": "...", "subtitle": "...", "btn": "...", "formats": "..." },
  "link": { "placeholder": "...", "btn": "..." },
  "result": {
    "title": "...",
    "verdict": {
      "ai": "IA DETECTADA",
      "suspicious": "SUSPEITO",
      "authentic": "AUTÊNTICO"
    },
    "confidence": "...",
    "detectors": "...",
    "export": "...",
    "share": "..."
  },
  "detectors": {
    "rotation": "...", "stats": "...", "fft": "...",
    "texture": "...", "shadow": "...", "ela": "...", "hive": "..."
  },
  "viz": { "ela": "...", "fft": "...", "gradient": "..." },
  "limit": { "reached": "...", "resetAt": "...", "countdown": "..." },
  "pricing": { "title": "...", "subtitle": "...", "free": "...", "starter": "...", "pro": "..." },
  "errors": {
    "fileTooBig": "...", "unsupportedFormat": "...",
    "invalidUrl": "...", "platformNotSupported": "...",
    "analysisError": "...", "networkError": "..."
  }
}
```

---

## VARIÁVEIS DE AMBIENTE / ENVIRONMENT VARIABLES

### frontend/.env.example
```env
VITE_API_URL=http://localhost:3001
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_ADSENSE_SLOT_RESULT=1234567890
VITE_ADSENSE_SLOT_MODAL=0987654321
VITE_ADSENSE_SLOT_BANNER=1122334455
```

### backend/.env.example
```env
# Servidor
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Banco de dados
DATABASE_URL=postgresql://user:pass@localhost:5432/aidetect

# APIs de detecção
HIVE_API_KEY=
SIGHTENGINE_API_USER=
SIGHTENGINE_API_SECRET=

# Redes sociais
TWITTER_BEARER_TOKEN=

# Storage (escolha um)
CLOUDINARY_URL=
# ou
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_REGION=

# Cache / Rate limiting
REDIS_URL=                    # opcional, usa memory-cache se vazio
RATE_LIMIT_MAX=3              # análises por IP por dia
RATE_LIMIT_WINDOW=86400       # 24h em segundos
```

---

## DEPLOY / DEPLOYMENT

### Railway (backend)
```toml
# backend/railway.toml
[build]
builder = "nixpacks"
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on-failure"
restartPolicyMaxRetries = 3
```

### Netlify (frontend)
```toml
# frontend/netlify.toml
[build]
  base = "frontend"
  command = "npm run build"
  publish = "dist"

[build.environment]
  NODE_VERSION = "20"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

---

## ROTAS DA API / API ROUTES

| Método | Rota                    | Descrição                        | Rate limit |
|--------|-------------------------|----------------------------------|------------|
| GET    | /health                 | Healthcheck Railway              | Nenhum     |
| POST   | /api/analyze            | Analisar imagem/vídeo (upload)   | 3/dia/IP   |
| POST   | /api/social/extract     | Extrair mídia de URL social      | 3/dia/IP   |
| GET    | /api/share/:slug        | Buscar resultado compartilhado   | Nenhum     |
| POST   | /api/share              | Criar link de compartilhamento   | 3/dia/IP   |

---

## ORDEM DE TAREFAS / TASK ORDER

### FASE 1 — MVP Core
- [ ] 1. Setup Vite + React + TS + Tailwind (tema dark)
- [ ] 2. Header + toggle PT/EN (i18next)
- [ ] 3. InputTabs: Upload, Link Social, Vídeo
- [ ] 4. Backend Express: rota POST /api/analyze + /health
- [ ] 5. Analisadores: ela.ts, gradient.ts, texture.ts (Sharp)
- [ ] 6. Integração Hive API
- [ ] 7. ScoreGauge SVG animado
- [ ] 8. DetectorCards com progress bars
- [ ] 9. Rate limiting por IP
- [ ] 10. Slots AdSense (componente + .env)

### FASE 2 — Visualizações
- [ ] 11. VisualizationPanel: ELA map, gradient map como imagens
- [ ] 12. fft.ts: análise de frequência com Sharp + canvas
- [ ] 13. shadow.ts: consistência direcional de luz
- [ ] 14. rotation.ts: detecção de silhueta por análise de borda
- [ ] 15. Integração Sightengine (deepfake)

### FASE 3 — Links Sociais
- [ ] 16. tiktok.ts: tikwm.com API
- [ ] 17. twitter.ts: twitter-api-v2 bearer token
- [ ] 18. youtube.ts: yt-dlp via child_process
- [ ] 19. instagram.ts: Puppeteer headless
- [ ] 20. Frontend: detecção de plataforma por regex

### FASE 4 — Extras
- [ ] 21. Export PDF (jsPDF)
- [ ] 22. Share link: slug único + página pública /result/:slug
- [ ] 23. Landing page (hero, como funciona, pricing)
- [ ] 24. SEO: react-helmet-async, meta tags

---

## NOTAS FINAIS / FINAL NOTES

- Este projeto NÃO usa autenticação de usuários (sem login, sem JWT)
- Monetização exclusivamente via AdSense nesta versão
- Manter o bundle do frontend < 500KB gzipped
- Analisadores locais (Sharp) são executados ANTES das APIs externas para economizar créditos
- Se HIVE_API_KEY não estiver definido, retornar score 0 no detector "hive" com label "API não configurada"
- Logs de produção devem omitir dados de usuário (IPs hasheados com SHA256)
