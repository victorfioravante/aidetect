# AIDetect

> 🇧🇷 Português (abaixo) · 🇺🇸 [English summary](#-english-summary)

[![Demo](https://img.shields.io/badge/Demo-aidetectpro.netlify.app-brightgreen)](https://aidetectpro.netlify.app)
[![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-blue)](#arquitetura)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%2B%20Express-green)](#arquitetura)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](#stack)

**Detector de imagens e vídeos gerados por IA, bilíngue (PT/EN) — demo em [aidetectpro.netlify.app](https://aidetectpro.netlify.app).**

O usuário envia uma imagem, vídeo ou link de rede social e recebe um veredicto (`IA DETECTADA`, `SUSPEITO` ou `AUTÊNTICO`) com score 0–100, nível de confiança e visualizações forenses (mapa ELA, espectro FFT, mapa de gradiente).

> **Status:** projeto experimental. O frontend está no ar; o backend (Railway) é ativado sob demanda para controlar custos de infraestrutura. Para avaliar a aplicação completa, [rode localmente](#rodando-localmente) — funciona sem nenhuma chave de API externa, usando apenas os analisadores forenses locais.

<!-- TODO: screenshot/GIF da análise aqui -->

---

## Como funciona

O veredicto não vem de um modelo único: é um **ensemble ponderado de 7 detectores**, combinando análise forense local com uma API externa de verificação.

| Detector | Técnica | Peso |
|---|---|---|
| Rotação/Assimetria | Detecção de silhueta por análise de borda | 15 |
| FFT | Sinais dominantes no espectro de frequência | 15 |
| Textura | Padrões de textura vs. pele natural | 15 |
| Sombras | Consistência direcional de luz | 15 |
| ELA | Error Level Analysis (níveis de recompressão) | 10 |
| Estatística | Distribuição estatística de pixels | 10 |
| Hive API | Modelo externo de detecção | 20 |

Score final = soma ponderada → `≥70` IA · `40–69` suspeito · `<40` autêntico, com confiança graduada por faixa.

## Decisões de arquitetura

- **Analisadores locais (Sharp) executam antes das APIs externas** — o custo por análise das APIs pagas é a maior despesa do produto; rodar a forense local primeiro economiza créditos e mantém o free tier viável.
- **Ensemble ponderado em vez de modelo único** — geradores de imagem evoluem rápido; técnicas forenses clássicas (ELA, FFT, sombras) degradam mais devagar que um classificador treinado e dão explicabilidade (o usuário vê *por que* foi sinalizado).
- **Rate limiting por IP com fallback** — Redis quando disponível, memory-cache quando não; o serviço nunca depende de infraestrutura opcional para funcionar.
- **Sem autenticação na v1** — fricção zero para o caso de uso ("isso é fake?"). Auth/planos ficam para quando houver demanda comprovada.
- **Custo de infraestrutura tratado como requisito** — rate limit de 3 análises/dia/IP limita o gasto com APIs externas; o backend é hibernado quando o projeto não está em avaliação ativa. Projeto experimental não justifica custo fixo permanente.
- **Privacidade** — logs de produção com IPs hasheados (SHA-256); nenhum dado de usuário em texto claro.
- **Bilíngue por construção** — i18next com paridade de chaves PT/EN obrigatória; nenhuma string hardcoded na UI.

## Arquitetura

```
frontend/   React 18 + Vite + TypeScript (strict) + Tailwind + Zustand + i18next
            └── deploy: Netlify
backend/    Node.js + Express + TypeScript + Prisma + Sharp
            ├── analyzers/  (ela, fft, texture, shadow, rotation, stats)
            ├── social/     (extração TikTok, Twitter/X, YouTube, Instagram)
            └── deploy: Railway + PostgreSQL
```

### Rotas da API

| Método | Rota | Função | Rate limit |
|---|---|---|---|
| `POST` | `/api/analyze` | Analisa imagem/vídeo (upload) | 3/dia/IP |
| `POST` | `/api/social/extract` | Extrai mídia de URL social | 3/dia/IP |
| `POST` | `/api/share` | Cria link público de resultado | 3/dia/IP |
| `GET` | `/api/share/:slug` | Resultado compartilhado | — |
| `GET` | `/health` | Healthcheck | — |

## Rodando localmente

```bash
git clone https://github.com/victorfioravante/aidetect.git
cd aidetect
npm run install:all

# configure os .env (veja .env.example em frontend/ e backend/)
# detectores externos (Hive/Sightengine) são opcionais — sem as chaves,
# o sistema roda apenas com os analisadores locais

npm run dev:backend    # porta 3001
npm run dev:frontend   # porta 5173
```

## Stack

React, Vite, TypeScript (strict), Tailwind CSS, Zustand, i18next · Node.js, Express, Prisma, PostgreSQL, Sharp · Netlify, Railway

## Roadmap

- [ ] Detecção de deepfake em vídeo (Sightengine)
- [ ] Export de laudo em PDF
- [ ] API pública com chaves

## Desenvolvimento

Desenvolvido de ponta a ponta por [Victor Fioravante](https://www.linkedin.com/in/vfioravante/) — produto, arquitetura, frontend, backend, calibração dos detectores, identidade visual e deploy — com Claude Code como ferramenta de aceleração, sob especificação, revisão e testes próprios (veja [CLAUDE.md](CLAUDE.md) para o processo de engenharia guiada).

## Licença

MIT © Victor Fioravante

---

## 🇺🇸 English summary

**AIDetect** is a bilingual (PT/EN) web app that detects AI-generated images and videos — demo at [aidetectpro.netlify.app](https://aidetectpro.netlify.app). Users upload media or paste a social media link and get a verdict (AI / suspicious / authentic) with a 0–100 score and forensic visualizations (ELA map, FFT spectrum, gradient map). *Experimental project: the frontend is live; the backend is spun up on demand to control infrastructure costs — run it locally for full evaluation (works with local analyzers only, no external API keys required).*

The verdict comes from a **weighted ensemble of 7 detectors** — local forensic analyzers (ELA, FFT, texture, shadow consistency, edge rotation, pixel statistics, via Sharp) plus an external detection API. Local analyzers run first to keep external API costs down. Per-IP rate limiting with Redis→memory fallback, SHA-256-hashed IPs in logs, strict TypeScript throughout.

**Stack:** React + Vite + Tailwind + Zustand + i18next (Netlify) · Node.js + Express + Prisma + PostgreSQL (Railway).

Built end-to-end by [Victor Fioravante](https://www.linkedin.com/in/vfioravante/) — product, architecture, detector calibration, and deployment — using Claude Code as an acceleration tool under his own specification, review, and testing.
